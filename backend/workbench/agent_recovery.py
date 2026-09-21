"""Reconcile accepted effects under the current scheduler fence.

Job and external-operation ledgers are authoritative. A checkpoint never supplies
an outcome, clears a reservation, or changes the arguments of an accepted action.
"""
from sqlalchemy import select

from .agent_db import ActionRow, RunJobRow, AssignmentRow, ReservationRow
from .db import JobRow, ExternalOperationRow
from .projections import safe_job_fields


def reconcile_effects(session, runs, project_id, run_id):
    run = runs.get(session, project_id, run_id, lock=True)
    runs.assert_dispatch(session, run)
    # Called only after acquiring the parent lease. No previous owner's provider
    # response can be published through this fence, and no call is replayed.
    from .budgets import BudgetService
    for assignment in session.scalars(select(AssignmentRow).where(
            AssignmentRow.run_id == run_id, AssignmentRow.state.in_(['running', 'waiting']))):
        children = list(session.scalars(select(ReservationRow).where(
            ReservationRow.run_id == run_id, ReservationRow.assignment_id == assignment.id)))
        unsettled = any(r.payload['intent']['kind'] == 'operation'
                        and r.payload['state'] == 'unknown' for r in children)
        assignment.state = 'waiting' if unsettled else 'failed'
        assignment.payload = {**assignment.payload, 'state': assignment.state}
        if not unsettled:
            budgets = BudgetService(runs)
            for child in children:
                if child.payload['intent']['kind'] == 'operation' and child.payload['state'] == 'reserved':
                    budgets.release(session, project_id, run_id, child.request_id)
            budgets.release(session, project_id, run_id, assignment.payload['budget_allocation_id'])
    links = {link.action_id: link for link in session.scalars(select(RunJobRow).where(
        RunJobRow.run_id == run_id, RunJobRow.ownership != 'detached'))}
    for action in session.scalars(select(ActionRow).where(ActionRow.run_id == run_id,
            ActionRow.state.in_(['prepared', 'submitted', 'unknown']))):
        link = links.get(action.id)
        if link is None:
            # A prepared intent has not dispatched; never replay it under a new
            # revision/claim. Unknown unlinked effects require operator recovery.
            if action.state == 'prepared':
                action.state = 'cancelled'
                action.outcome = {'reason': 'Undispatched intent superseded during recovery'}
                runs.event(session, run, 'action_changed', action_id=action.id)
            continue
        job = session.get(JobRow, link.job_id)
        external = session.get(ExternalOperationRow, link.job_id)
        if external and external.state == 'unknown':
            state = 'unknown'
        elif job.state in {'queued', 'running'}:
            continue
        else:
            state = 'completed' if job.state == 'succeeded' else 'failed'
        outcome = {**(action.outcome or {}), 'job_id': job.id,
                   'job_state': job.state, 'error_code': safe_job_fields(job)['error_code'],
                   'artifact_ids': [job.result_id] if job.result_id else [],
                   'external_state': external.state if external else None}
        if action.state != state or action.outcome != outcome:
            action.state, action.outcome = state, outcome
            runs.event(session, run, 'action_changed', action_id=action.id)
    session.flush()
    return runs.reconcile(session, project_id, run_id)

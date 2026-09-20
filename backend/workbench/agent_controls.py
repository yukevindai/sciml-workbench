"""D12 control transaction: detach consumers, fence solely owned work.

Pause drains accepted jobs under their existing fixed deadlines. Cancel fences
eligible jobs before acknowledgment; the worker observes lost claims and kills
its own process group. External receipts and budget reservations are retained.
"""
from sqlalchemy import select, update
from .agent_db import ActionRow, RunJobRow
from .db import JobRow, ExternalOperationRow
from .job_metadata import database_now


def cancel_jobs(s, run):
    # Caller holds the project barrier, as do submission and publication.
    links = s.scalars(select(RunJobRow).where(RunJobRow.run_id == run.id,
        RunJobRow.ownership != 'detached').order_by(RunJobRow.job_id)).all()
    for link in links:
        other = s.scalar(select(RunJobRow.run_id).where(RunJobRow.job_id == link.job_id,
            RunJobRow.run_id != run.id, RunJobRow.ownership != 'detached').limit(1))
        if link.ownership == 'owned' and other is None:
            job = s.scalar(select(JobRow).where(JobRow.id == link.job_id).with_for_update())
            if job and job.state in {'queued', 'running'}:
                s.execute(update(JobRow).where(JobRow.id == job.id,
                    JobRow.state.in_(['queued', 'running'])).values(
                    state='failed', claim_token=job.claim_token + int(job.state == 'running'),
                    error_code='RUN_CANCELLED', error='Execution cancelled by its authorized controller.',
                    finished_at=database_now(s)))
        link.ownership = 'detached'
    for action in s.scalars(select(ActionRow).where(ActionRow.run_id == run.id,
            ActionRow.state.in_(['prepared', 'submitted']))):
        # Unknown external effects stay unknown. Retain job identity for recovery.
        jid = (action.outcome or {}).get('job_id')
        external = s.get(ExternalOperationRow, jid) if jid else None
        action.state = 'unknown' if external and external.state == 'unknown' else 'cancelled'
        action.outcome = {**(action.outcome or {}), 'control': 'cancelled',
                          'accepted_effect_may_have_settled': bool(action.outcome)}

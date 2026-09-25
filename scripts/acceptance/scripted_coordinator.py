"""A10 acceptance only: a scripted stand-in for the model-driven coordinator. No provider is called.

It claims runs through the real D11 scheduler and acts only through the fenced
trusted services the coordinator uses: plan publication, one consolidated
question, `run_audit` through the E03 tool registry (executed by the real
scientific worker), reconciliation and finalization. Each step then yields the
lease like `Scheduler.advance`, without a graph checkpoint. Decisions come from
the objective text, not from a model:

- every run publishes a two-step plan (inspect, audit);
- an objective containing "units" asks one question and waits for its answer;
- a run finishes `completed` with its audit artifact once the audit job settles.

Run inside the backend container for a bounded time:

    docker compose exec -T api python - 600 < scripts/acceptance/scripted_coordinator.py
"""
import sys
import time
from datetime import timedelta

from sqlalchemy import select

from workbench.agent_db import ActionRow, LeaseRow, QuestionRow
from workbench.agent_recovery import reconcile_effects
from workbench.agent_runs import RunService
from workbench.agent_scheduler import Scheduler, assert_authority
from workbench.config import Settings, load_settings
from workbench.contracts import now, uid
from workbench.db import ArtifactRow, Database, JobRow
from workbench.research_contracts import ResearchPlan, ResearchQuestion
from workbench.storage import LocalStore
from workbench.tool_registry import DispatchContext, ToolRegistry

SUMMARY = 'Scripted acceptance coordinator: inspect the selected dataset, then audit it with the default checks.'


def plan(pid, rid, dataset):
    return ResearchPlan(id=uid(), project_id=pid, created_at=now(), run_id=rid, revision=1, rationale_summary=SUMMARY, steps=[
        dict(id='inspect', objective='Inspect the selected dataset', depends_on=[], allowed_input_ids=[dataset],
             expected_artifact_kinds=[], completion_criteria=['Columns and row count known'], status='completed'),
        dict(id='audit', objective='Audit the selected dataset', depends_on=['inspect'], allowed_input_ids=[dataset],
             expected_artifact_kinds=['audit'], completion_criteria=['Audit artifact published'], status='ready')])


def question(pid, rid, revision):
    return ResearchQuestion(id=uid(), project_id=pid, created_at=now(), run_id=rid, revision=1, run_revision=revision,
        status='open', expires_at=now() + timedelta(days=1), questions=[dict(
            id='units', field='target_unit', prompt='Is conductivity recorded in mS/cm or S/m?', blocked_step_ids=['audit'],
            options=[dict(id='ms_cm', label='mS/cm', consequence='Values are reported as recorded.'),
                     dict(id='s_m', label='S/m', consequence='Values are converted before reporting.')], evidence=[])])


def release(db, runs, claim, status):
    """The tail of Scheduler.advance: clear the lease and publish the next state, unless controls intervened."""
    with db.session.begin() as s:
        row = runs.get(s, claim.project_id, claim.run_id, lock=True)
        if row.state != 'running':
            return row.state
        assert_authority(s, row, claim, states={'running'})
        lease = s.get(LeaseRow, row.id)
        lease.worker_id, lease.expires_at = None, None
        runs.save(row, {**row.payload, 'state': status})
        runs.event(s, row, 'state_changed')
        return status


def step(db, store, settings, claim):
    runs = RunService(claim=claim)
    pid, rid = claim.project_id, claim.run_id
    with db.session.begin() as s:
        row = runs.get(s, pid, rid, lock=True)
        reconcile_effects(s, runs, pid, rid)
        row = runs.get(s, pid, rid)
        run = row.payload
        datasets = [a for a in run['inputs']['artifact_ids'] if (x := s.get(ArtifactRow, a)) and x.kind == 'dataset']
        actions = list(s.scalars(select(ActionRow).where(ActionRow.run_id == rid)))
        asked = s.scalar(select(QuestionRow.id).where(QuestionRow.run_id == rid).limit(1))
        if not datasets:
            runs.finish(s, pid, rid, row.control_revision, state='failed', artifact_ids=[],
                        stop_reason='No dataset was selected; the scripted coordinator only audits datasets.')
            return 'failed'
        if row.plan_revision == 0:
            runs.publish_plan(s, pid, rid, plan(pid, rid, datasets[0]), row.control_revision)
            if run['mode'] == 'review_plan':
                return 'waiting_for_input'
            row = runs.get(s, pid, rid)
        if 'units' in run['objective'].lower() and not asked:
            runs.ask(s, pid, rid, question(pid, rid, row.control_revision), row.control_revision)
            return 'waiting_for_input'
        done = [a for a in actions if a.state == 'completed']
        if done:
            runs.finish(s, pid, rid, row.control_revision, state='completed', artifact_ids=done[0].outcome['artifact_ids'])
            return 'completed'
        if any(a.state == 'failed' for a in actions):
            runs.finish(s, pid, rid, row.control_revision, state='failed', artifact_ids=[],
                        stop_reason='The audit job failed; see its job record.')
            return 'failed'
        revision, token = row.control_revision, row.claim_token
    if not actions:
        result = ToolRegistry(db, store, settings, runs=runs).dispatch(
            DispatchContext(pid, rid, revision, token, 'audit'), 'run_audit', {'dataset_id': datasets[0]})
        if not result.job_id:
            raise RuntimeError(f'audit dispatch did not submit: {result.status} {result.error_code} {result.message}')
    return release(db, runs, claim, 'waiting_for_job')


def main(seconds):
    settings = load_settings(Settings)
    db, store = Database(settings.database_url), LocalStore(settings.storage_root)
    scheduler = Scheduler(db, lease_seconds=5)
    deadline = time.monotonic() + seconds
    print('scripted coordinator ready', flush=True)
    while time.monotonic() < deadline:
        claim = scheduler.claim('a10-scripted')
        if claim is None:
            time.sleep(0.5)
            continue
        try:
            print(claim.run_id, step(db, store, settings, claim), flush=True)
        except Exception as exc:  # A stale lease after a control is expected; anything else is reported.
            print(claim.run_id, 'step stopped:', type(exc).__name__, str(exc)[:400], flush=True)
            time.sleep(0.5)


if __name__ == '__main__':
    main(float(sys.argv[1]) if len(sys.argv) > 1 else 600)

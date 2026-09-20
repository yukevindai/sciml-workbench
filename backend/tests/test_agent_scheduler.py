"""D11/D12 committed-state acceptance; same cases run on PostgreSQL in CI."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import pytest
from sqlalchemy import select
from langgraph.checkpoint.memory import InMemorySaver

from test_metadata import old_db, db
from test_agent_runs import service, create, mutate
from workbench.agent_db import LeaseRow, RunRow, RunJobRow, ActionRow, ReservationRow
from workbench.agent_runs import RunService
from workbench.agent_scheduler import Scheduler
from workbench.db import JobRow
from workbench.errors import DomainError
from workbench.job_metadata import submit_job, claim_next, finish_claim, database_now, StaleClaim


def expire(db, rid):
    with db.session.begin() as s:
        s.get(LeaseRow, rid).expires_at = database_now(s) - timedelta(seconds=1)


def linked_job(db, runs, rid, revision=1, key='job', ownership='owned'):
    with db.session.begin() as s:
        action = runs.prepare_action(s, 'p', rid, key, {'tool': 'run_audit'}, revision)
        job = submit_job(s, 'p', 'report', {}, key)
        runs.bind_job(s, 'p', rid, action.id, job.id, ownership=ownership)
        return job.id


def test_only_one_claim_and_expiry_fences_all_writers(db, service):
    run = create(db, service)
    scheduler = Scheduler(db)
    with ThreadPoolExecutor(max_workers=4) as pool:
        claims = list(pool.map(scheduler.claim, ['one', 'two', 'three', 'four']))
    claim, = [c for c in claims if c]
    runs = RunService(claim=claim)
    expire(db, run['id'])
    # Expiry is sufficient; no replacement worker is needed to fence dispatch.
    with pytest.raises(DomainError, match='lease'), db.session.begin() as s:
        runs.prepare_action(s, 'p', run['id'], 'stale', {'tool': 'inspect_project'}, 1)
    replacement = scheduler.claim('replacement')
    assert replacement.token > claim.token
    with pytest.raises(DomainError, match='lease'), db.session.begin() as s:
        runs.finish(s, 'p', run['id'], 1, state='completed', artifact_ids=[])
    with pytest.raises(DomainError, match='lease'), db.session.begin() as s:
        service.prepare_action(s, 'p', run['id'], 'unbound', {'tool': 'inspect_project'}, 1)
    with db.session() as s:
        assert s.get(LeaseRow, run['id']).recoveries == 1


def test_wait_releases_capacity_and_crash_after_submission_keeps_identity(db, service):
    first = create(db, service)
    scheduler = Scheduler(db)
    claim = scheduler.claim('one')
    jid = linked_job(db, RunService(claim=claim), first['id'])
    # Simulate death after commit, before graph checkpoint/yield.
    expire(db, first['id'])
    second = create(db, service, key='second')
    assert scheduler.claim('two').run_id == second['id']
    with db.session() as s:
        assert s.get(RunRow, first['id']).state == 'waiting_for_job'
        assert s.scalar(select(RunJobRow.job_id).where(RunJobRow.run_id == first['id'])) == jid
        assert len(s.scalars(select(ReservationRow).where(ReservationRow.run_id == first['id'])).all()) == 1
    science = claim_next(db, 60, 'science')
    with db.session.begin() as s:
        finish_claim(s, science, state='failed', error='fixture failure', error_code='INTERNAL_ERROR')
    assert scheduler.claim('three').run_id == first['id']


def test_checkpoint_pointer_published_only_by_live_claim(db, service):
    run = create(db, service)
    scheduler = Scheduler(db)
    store = InMemorySaver()
    claim = scheduler.claim('one')
    assert scheduler.advance(claim, store, lambda snapshot, previous, runs: ({'iteration': 1}, 'queued')) == 'queued'
    with db.session() as s:
        pointer = s.get(LeaseRow, run['id']).checkpoint
    claim = scheduler.claim('two')
    def stale(snapshot, previous, runs):
        assert previous == {'iteration': 1}
        expire(db, run['id'])
        assert scheduler.claim('three')
        return {'iteration': 999}, 'queued'
    with pytest.raises(DomainError, match='lease'):
        scheduler.advance(claim, store, stale)
    with db.session() as s:
        assert s.get(LeaseRow, run['id']).checkpoint == pointer


def test_yield_is_fair_and_finalization_uses_the_ledger(db, service):
    first = create(db, service)
    second = create(db, service, key='second')
    scheduler = Scheduler(db)
    store = InMemorySaver()
    claim = scheduler.claim('one')
    assert claim.run_id == first['id']
    scheduler.advance(claim, store, lambda *args: ({}, 'queued'))
    claim = scheduler.claim('two')
    assert claim.run_id == second['id']
    def finish(snapshot, previous, runs):
        with db.session.begin() as s:
            runs.finish(s, 'p', claim.run_id, 1, state='completed', artifact_ids=[])
        return {}, 'completed'
    assert scheduler.advance(claim, store, finish) == 'completed'
    assert scheduler.claim('three').run_id == first['id']


def test_pause_fences_active_coordinator_and_retains_lease_history(db, service):
    from test_metadata import migrate
    run = create(db, service)
    scheduler = Scheduler(db)
    claim = scheduler.claim('one')
    mutate(db, service, run, 'pause')
    with pytest.raises(DomainError, match='lease'):
        scheduler.advance(claim, InMemorySaver(), lambda *args: pytest.fail('Paused step must not execute'))
    with pytest.raises(RuntimeError, match='scheduler recovery history'):
        migrate(db, '0009', downgrade=True)


@pytest.mark.parametrize('running', [False, True])
def test_cancel_fences_owned_jobs_and_preserves_budget(db, service, running):
    run = create(db, service)
    jid = linked_job(db, service, run['id'])
    claim = claim_next(db, 60, 'science') if running else None
    mutate(db, service, run, 'cancel')
    with db.session() as s:
        job = s.get(JobRow, jid)
        assert job.state == 'failed' and job.error_code == 'RUN_CANCELLED'
        assert s.scalar(select(RunJobRow.ownership)) == 'detached'
        assert s.scalar(select(ActionRow.state)) == 'cancelled'
        assert len(s.scalars(select(ReservationRow)).all()) == 1
    if claim:
        with pytest.raises(StaleClaim), db.session.begin() as s:
            finish_claim(s, claim, state='failed', error='late', error_code='INTERNAL_ERROR')


def test_shared_consumers_survive_cancel_and_pause_drains(db, service):
    owner = create(db, service)
    consumer = create(db, service, key='consumer')
    jid = linked_job(db, service, owner['id'])
    assert linked_job(db, service, consumer['id'], ownership='shared') == jid
    paused = mutate(db, service, consumer, 'pause')
    mutate(db, service, owner, 'cancel')
    with db.session() as s:
        assert s.get(JobRow, jid).state == 'queued'
    mutate(db, service, paused, 'cancel')
    with db.session() as s:
        assert s.get(JobRow, jid).state == 'queued'  # Shared consumer has no cancellation authority.


def test_postgres_checkpoint_survives_connection_restart(db, service):
    if db.engine.dialect.name != 'postgresql':
        pytest.skip('PostgresSaver requires PostgreSQL')
    from sqlalchemy import text
    from workbench.checkpoints import saver, setup
    run = create(db, service)
    with db.session() as s:
        schema = s.scalar(text('select current_schema()'))
    url = db.engine.url.update_query_dict({'options': '-csearch_path=' + schema}).render_as_string(hide_password=False)
    setup(url)
    scheduler = Scheduler(db)
    with saver(url) as store:
        scheduler.advance(scheduler.claim('one'), store, lambda *args: ({'iteration': 1}, 'queued'))
    with saver(url) as store:
        def step(snapshot, previous, runs):
            assert previous == {'iteration': 1}
            assert snapshot['run']['id'] == run['id']
            return {'iteration': 2}, 'queued'
        scheduler.advance(scheduler.claim('two'), store, step)

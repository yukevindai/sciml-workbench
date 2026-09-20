"""E05 persisted-state budget races and uncertain usage, SQLite/PostgreSQL."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select, func, update
from sqlalchemy.exc import IntegrityError

from workbench.agent_db import ReservationRow, UsageRow, AssignmentRow, RunRow, ProjectPolicyRow
from workbench.agent_policy import AuthorityPolicy
from workbench.budgets import BudgetService, Resources, Pricing, totals, records
from workbench.contracts import uid, now
from workbench.errors import DomainError
from workbench.research_contracts import SpecialistAssignment
from test_metadata import old_db, db
from test_agent_runs import service, create, mutate


def reserve(db, service, run, key, resources=None, **kw):
    with db.session.begin() as s:
        return BudgetService(service).reserve(s, 'p', run['id'], key, resources or Resources(model_tokens=100, model_requests=1),
            request_sha256='a' * 64, expected_revision=run['control_revision'], claim_token=kw.pop('claim_token', 0),
            model=kw.pop('model', 'model'), **kw)


def dispatch(db, service, run, key):
    with db.session.begin() as s:
        return BudgetService(service).dispatch(s, 'p', run['id'], key)


def snapshot(db, service, run):
    with db.session() as s:
        return BudgetService(service).snapshot(s, 'p', run['id'])


def price(rate='0.001'):
    return Pricing(revision='fixture-v1', model='model', effective_at=now() - timedelta(days=1),
        rates={k: Decimal(rate) for k in ('input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens')})


def test_concurrent_reservations_share_one_allowance(db, service):
    run = create(db, service)
    def attempt(i):
        try:
            return reserve(db, service, run, str(i), Resources(model_tokens=16000, model_requests=1)).id
        except DomainError:
            return None
    with ThreadPoolExecutor(max_workers=4) as pool:
        assert len([v for v in pool.map(attempt, range(4)) if v]) == 1
    assert snapshot(db, service, run).reserved_tokens == 16000


def test_project_allowance_survives_new_run_and_resume(db, service):
    one, two = create(db, service, 'one'), create(db, service, 'two')
    reserve(db, service, one, 'request', Resources(model_tokens=25000, model_requests=1))
    paused = mutate(db, service, one, 'pause')
    resumed = mutate(db, service, paused, 'resume')
    assert resumed['usage']['reserved_tokens'] == 25000
    with pytest.raises(DomainError):
        reserve(db, service, two, 'new', Resources(model_tokens=6000, model_requests=1))


def test_replay_conflict_dispatch_unknown_and_restart(db, service):
    run = create(db, service)
    old = reserve(db, service, run, 'request')
    assert reserve(db, service, run, 'request').id == old.id
    with pytest.raises(DomainError, match='different reservation'):
        reserve(db, service, run, 'request', Resources(model_tokens=101, model_requests=1))
    assert dispatch(db, service, run, 'request')
    assert not dispatch(db, service, run, 'request')
    db.engine.dispose()
    assert snapshot(db, service, run).unknown_request_ids == ['request']
    with pytest.raises(DomainError), db.session.begin() as s:
        BudgetService(service).release(s, 'p', run['id'], 'request')
    reserve(db, service, run, 'retry', Resources(model_tokens=100, model_requests=1, transient_retries=1))
    assert snapshot(db, service, run).reserved_tokens == 200


def test_settlement_releases_unused_and_preserves_billed_categories(db, service):
    run = create(db, service)
    reserve(db, service, run, 'request', pricing=price())
    dispatch(db, service, run, 'request')
    tokens = {'input_tokens': 10, 'output_tokens': 5, 'cache_creation_input_tokens': 3, 'cache_read_input_tokens': 2}
    def settle():
        with db.session.begin() as s:
            return BudgetService(service).settle(s, 'p', run['id'], 'request', Resources(model_tokens=20, model_requests=1), tokens=tokens).id
    assert settle() == settle()
    usage = snapshot(db, service, run)
    assert usage.reserved_tokens == 0 and usage.billed_token_categories == tokens
    assert usage.cost.status == 'estimated' and usage.cost.amount == 0.02
    with pytest.raises(DomainError, match='Conflicting'), db.session.begin() as s:
        BudgetService(service).settle(s, 'p', run['id'], 'request', Resources(model_tokens=21, model_requests=1), tokens={'input_tokens':21})


def test_unknown_prices_are_not_zero_and_strict_ceiling_refuses(db, service):
    run = create(db, service)
    reserve(db, service, run, 'unpriced')
    dispatch(db, service, run, 'unpriced')
    with db.session.begin() as s:
        BudgetService(service).settle(s, 'p', run['id'], 'unpriced', Resources(model_tokens=10, model_requests=1), tokens={'input_tokens':10})
    assert snapshot(db, service, run).cost.status == 'unknown'
    with db.session.begin() as s:
        original = s.get(ProjectPolicyRow, ('p', 1))
        policy = AuthorityPolicy.model_validate(original.payload).model_copy(update={'revision':2, 'spend_ceiling_usd':1.0})
        s.add(ProjectPolicyRow(project_id='p', revision=2, payload=policy.model_dump(mode='json')))
    with pytest.raises(DomainError, match='monetary ceiling'):
        reserve(db, service, run, 'priced-after-unknown', pricing=price())


def test_strict_price_bound_and_finalization_inside_total(db, service):
    run = create(db, service)
    reserve(db, service, run, 'ordinary', Resources(model_tokens=30000, model_requests=1))
    with pytest.raises(DomainError):
        reserve(db, service, run, 'ordinary-extra', Resources(model_tokens=1, model_requests=1))
    reserve(db, service, run, 'final', Resources(model_tokens=2000, model_requests=1), finalization=True)
    with pytest.raises(DomainError):
        reserve(db, service, run, 'final-extra', Resources(model_tokens=1, model_requests=1), finalization=True)


def assignment(db, run, aid, capacity):
    value = SpecialistAssignment(id=aid, project_id='p', run_id=run['id'], created_at=now(), plan_revision=1,
        role='data_evaluation', objective='Inspect', allowed_artifact_ids=[], allowed_material_ids=[],
        allowed_tools=['inspect_project'], budget_allocation_id='allocation-' + aid,
        deadline_at=now() + timedelta(hours=1), completion_criteria=['Return summary'], state='queued')
    with db.session.begin() as s:
        s.add(AssignmentRow(id=aid, project_id='p', run_id=run['id'], payload=value.model_dump(mode='json'), state='queued', result=None))


def test_assignment_slices_do_not_multiply_parent_budget(db, service):
    run = create(db, service)
    assignment(db, run, 'one', 15000)
    assignment(db, run, 'two', 15000)
    for aid in ('one','two'):
        reserve(db, service, run, 'allocation-' + aid,
            Resources(model_tokens=15000, model_requests=4, specialist_assignments=1), assignment_id=aid, allocation=True)
    with pytest.raises(DomainError):
        reserve(db, service, run, 'coordinator')
    reserve(db, service, run, 'child', Resources(model_tokens=14000, model_requests=1), assignment_id='one')
    with pytest.raises(DomainError):
        reserve(db, service, run, 'child-over', Resources(model_tokens=2000, model_requests=1), assignment_id='one')
    dispatch(db, service, run, 'child')
    with db.session.begin() as s:
        budgets = BudgetService(service)
        budgets.settle(s, 'p', run['id'], 'child', Resources(model_tokens=100, model_requests=1), tokens={'input_tokens':100})
        budgets.release(s, 'p', run['id'], 'allocation-one')
    reserve(db, service, run, 'returned', Resources(model_tokens=14000, model_requests=1))
    with db.session() as s:
        used, _ = totals(*records(s, 'p'), rid=run['id'])
        assert used['model_tokens'] == 29100 and used['specialist_assignments'] == 2


def test_cancel_fences_dispatch_but_allows_late_usage_projection(db, service):
    run = create(db, service)
    reserve(db, service, run, 'sent')
    reserve(db, service, run, 'unissued')
    dispatch(db, service, run, 'sent')
    cancelled = mutate(db, service, run, 'cancel')
    with pytest.raises(DomainError):
        dispatch(db, service, run, 'unissued')
    with db.session.begin() as s:
        BudgetService(service).settle(s, 'p', run['id'], 'sent', Resources(model_tokens=10, model_requests=1), tokens={'input_tokens':10})
    with db.session() as s:
        row = service.get(s, 'p', run['id'])
        assert row.payload == cancelled
        assert service.projected_payload(s, row)['usage']['billed_token_categories'] == {'input_tokens':10}


def test_overrun_is_recorded_and_fences_new_spend(db, service):
    run = create(db, service)
    reserve(db, service, run, 'bad-bound')
    dispatch(db, service, run, 'bad-bound')
    with db.session.begin() as s:
        entry = BudgetService(service).settle(s, 'p', run['id'], 'bad-bound', Resources(model_tokens=101, model_requests=1), tokens={'input_tokens':101})
        assert entry.payload['overrun']
    with pytest.raises(DomainError, match='trusted bound'):
        reserve(db, service, run, 'next')


def test_database_guards_and_cross_run_scope(db, service):
    run, other = create(db, service), create(db, service, 'other')
    reservation = reserve(db, service, run, 'request')
    with pytest.raises(IntegrityError), db.session.begin() as s:
        s.execute(update(ReservationRow).where(ReservationRow.id == reservation.id).values(request_id='changed'))
    with pytest.raises(DomainError), db.session.begin() as s:
        BudgetService(service).dispatch(s, 'p', other['id'], 'request')
    dispatch(db, service, run, 'request')
    with pytest.raises(IntegrityError), db.session.begin() as s:
        s.execute(update(ReservationRow).where(ReservationRow.id == reservation.id).values(payload={**reservation.payload,'state':'released'}))


def test_known_money_bound_is_shared_and_settlement_returns_remainder(db, service):
    with db.session.begin() as s:
        original = s.get(ProjectPolicyRow, ('p', 1))
        policy = AuthorityPolicy.model_validate(original.payload).model_copy(update={'revision':2, 'spend_ceiling_usd':0.15})
        s.add(ProjectPolicyRow(project_id='p', revision=2, payload=policy.model_dump(mode='json')))
    from test_agent_runs import body
    with db.session.begin() as s:
        run = service.create(s, 'p', body().model_copy(update={'policy_revision':2}), 'priced')
    reserve(db, service, run, 'one', pricing=price())
    with pytest.raises(DomainError):
        reserve(db, service, run, 'two', pricing=price())
    dispatch(db, service, run, 'one')
    with db.session.begin() as s:
        BudgetService(service).settle(s, 'p', run['id'], 'one', Resources(model_tokens=20, model_requests=1), tokens={'input_tokens':20})
    reserve(db, service, run, 'two', pricing=price())
    with pytest.raises(DomainError):
        reserve(db, service, run, 'unpriced')


def test_model_request_limit_and_finalization_subcap(db, service):
    run = create(db, service)
    with pytest.raises(DomainError, match='Finalization'):
        reserve(db, service, run, 'too-large-final', Resources(model_tokens=2001, model_requests=1), finalization=True)
    for i in range(24):
        reserve(db, service, run, str(i), Resources(model_tokens=1, model_requests=1))
    with pytest.raises(DomainError):
        reserve(db, service, run, 'extra', Resources(model_tokens=1, model_requests=1))


def test_exhausted_scientific_budget_rolls_back_job_and_action_link(db, service):
    from workbench.job_metadata import submit_job
    from workbench.db import JobRow
    from workbench.agent_db import RunJobRow
    run = create(db, service)
    reserve(db, service, run, 'full-science', Resources(scientific_attempts=8), model=None)
    with db.session.begin() as s:
        action = service.prepare_action(s, 'p', run['id'], 'report', {'tool':'build_report'}, 1)
    with pytest.raises(DomainError), db.session.begin() as s:
        # Match B04 admission: establish the project transaction before its savepoint.
        service.get(s, 'p', run['id'], lock=True)
        job = submit_job(s, 'p', 'report', {}, 'budgeted-report')
        service.bind_job(s, 'p', run['id'], action.id, job.id)
    with db.session() as s:
        assert s.scalar(select(JobRow).where(JobRow.request_key == 'budgeted-report')) is None
        assert s.scalar(select(RunJobRow).where(RunJobRow.action_id == action.id)) is None


def test_populated_migration_retains_reservation_and_refuses_downgrade(db, service):
    from test_metadata import migrate
    run = create(db, service)
    # Downgrade only the new empty guard revision, retaining B11 tables and runs.
    migrate(db, '0007', downgrade=True)
    held = reserve(db, service, run, 'unknown')
    dispatch(db, service, run, 'unknown')
    migrate(db)
    assert snapshot(db, service, run).unknown_request_ids == ['unknown']
    with pytest.raises(RuntimeError, match='budget reservations'):
        migrate(db, '0007', downgrade=True)
    with pytest.raises(IntegrityError), db.session.begin() as s:
        s.execute(update(ReservationRow).where(ReservationRow.id == held.id).values(request_id='rewrite'))

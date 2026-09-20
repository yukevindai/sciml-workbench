"""Real HTTPX provider serialization with a durable accounting boundary."""
import httpx
import pytest
from sqlalchemy import select

from workbench.agent_db import ProjectPolicyRow, ReservationRow
from workbench.agent_policy import AuthorityPolicy
from workbench.budgeted_provider import BudgetedProvider, ModelBound
from workbench.model_provider import ProviderError
from workbench.contracts import now
from test_metadata import old_db, db
from test_agent_runs import service, create
from test_model_provider import setup_provider, arguments, response


def wrapper(db, handler=None):
    provider, seen = setup_provider(handler)
    bound = ModelBound(model='model-1', revision='fixture-bound-v1', source_reference='synthetic-test-only',
                       max_request_bytes=64000, input_tokens=1000, max_output_tokens=100, max_active_seconds=60)
    return BudgetedProvider(db, provider, bounds={'model-1':bound}), seen


def prepare(db, service):
    # Fixture model names, no real model availability or rate is asserted.
    from workbench.agent_db import ServerPolicyRow
    with db.session.begin() as s:
        policy = AuthorityPolicy(policy_id='trusted-v2', revision=2, project_ids={'p'}, provider_models={'model-1'})
        s.add(ServerPolicyRow(revision=2, payload=policy.model_dump(mode='json')))
        s.add(ProjectPolicyRow(project_id='p', revision=2, payload=policy.model_dump(mode='json')))
    from test_agent_runs import body
    with db.session.begin() as s:
        return service.create(s, 'p', body().model_copy(update={'policy_revision':2}), 'provider-run')


def call(client, run, key='request'):
    args = arguments()
    args.pop('policy')
    return client.complete(project_id='p', run_id=run['id'], request_id=key,
        expected_revision=1, claim_token=0, **args)


def test_provider_observes_committed_reservation_without_metadata_lock(db, service):
    run = prepare(db, service)
    def handler(request):
        assert db.engine.pool.checkedout() == 0
        with db.session() as s:
            row = s.scalar(select(ReservationRow).where(ReservationRow.request_id == 'request'))
            assert row.payload['state'] == 'unknown'
            assert row.payload['intent']['resources']['model_tokens'] == 1100
        return httpx.Response(200, json=response())
    client, seen = wrapper(db, handler)
    try:
        result = call(client, run)
        assert result.usage['input_tokens'] == 15
        with pytest.raises(ProviderError, match='already_dispatched'):
            call(client, run)
        assert sum(r.method == 'POST' for r in seen) == 1
        with db.session() as s:
            usage = client.budgets.snapshot(s, 'p', run['id'])
            assert usage.model_requests == 1 and usage.reserved_tokens == 0
            assert usage.cost.status == 'unknown'
    finally:
        client.provider.close()


def test_response_loss_retains_reservation_and_no_automatic_replay(db, service):
    run = prepare(db, service)
    def lost(request):
        raise httpx.ReadError('Synthetic transport loss')
    client, seen = wrapper(db, lost)
    try:
        with pytest.raises(ProviderError):
            call(client, run)
        with pytest.raises(ProviderError, match='already_dispatched'):
            call(client, run)
        assert sum(r.method == 'POST' for r in seen) == 1
        with db.session() as s:
            usage = client.budgets.snapshot(s, 'p', run['id'])
            assert usage.reserved_tokens == 1100 and usage.unknown_request_ids == ['request']
    finally:
        client.provider.close()


def test_missing_bound_denies_before_io(db, service):
    run = prepare(db, service)
    client, seen = wrapper(db)
    client.bounds.clear()
    try:
        with pytest.raises(ProviderError, match='token_bound_unavailable'):
            call(client, run)
        assert not any(r.method == 'POST' for r in seen)
    finally:
        client.provider.close()

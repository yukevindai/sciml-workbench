"""D04 durable recovery and exact external effects."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select

from workbench.contracts import now
from workbench.db import ArtifactRow, JobRow, RecoveryRow
from workbench.execution import TaskFailure
from workbench.external_operations import run_import
from workbench.job_metadata import claim_next, fail_claim
from workbench.recovery import acquire, discover, execute, recover_once
from test_worker import runtime, queue
from test_external_operations import operation, public_runner, row
from test_outcomes import outcome, HUMAN


def get_recovery(db, jid):
    with db.session() as session:
        return session.get(RecoveryRow, jid)


def due(db, jid):
    with db.session.begin() as session:
        session.get(RecoveryRow, jid).due_at = now() - timedelta(seconds=1)


def test_scientific_retry_once_and_retained_history(runtime):
    db, settings, _ = runtime
    original = queue(runtime)
    claim = claim_next(db, 30, "original")
    fail_claim(db, claim, error="Interrupted", error_code="WORKER_INTERRUPTED")
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda _: recover_once(db, settings), range(2)))
    recovery = get_recovery(db, original)
    assert recovery.state == "completed" and recovery.policy["scientific_retries"] == 1
    with db.session() as session:
        jobs = session.scalars(select(JobRow)).all()
        assert len(jobs) == 2
        old, retry = session.get(JobRow, original), session.get(JobRow, recovery.retry_job_id)
        assert old.state == "failed" and old.error == "Interrupted" and old.result_id is None
        assert retry.payload == old.payload and retry.retry_of_job_id == old.id
    retry_claim = claim_next(db, 30, "retry")
    fail_claim(db, retry_claim, error="Interrupted again", error_code="WORKER_INTERRUPTED")
    assert not recover_once(db, settings)
    assert get_recovery(db, retry_claim.job_id).state == "exhausted"


@pytest.mark.parametrize("code", ["ADMISSION_REJECTED", "VALIDATION_FAILED", "RUN_CANCELLED", "INTEGRITY_FAILED"])
def test_deterministic_and_cancelled_never_retry(runtime, code):
    db, settings, _ = runtime
    jid = queue(runtime)
    fail_claim(db, claim_next(db, 30, "test"), error="Stop", error_code=code)
    assert not recover_once(db, settings)
    assert get_recovery(db, jid).attempts == 0


def test_lost_response_automatic_recovery_publishes_same_record(operation, monkeypatch):
    db, settings, claimed, work, deadline = operation
    original = httpx.AsyncClient.post
    ids = []
    async def loss(client, url, **kwargs):
        response = await original(client, url, **kwargs)
        if url.endswith("/import"):
            ids.append(response.json()["record"]["id"])
            if len(ids) == 1:
                raise httpx.ReadError("Lost after upstream commit")
        return response
    monkeypatch.setattr(httpx.AsyncClient, "post", loss)
    with pytest.raises(httpx.ReadError):
        run_import(db, settings, work, deadline, lambda: False, public_runner)
    fail_claim(db, claimed, error="Response lost", error_code="INTERNAL_ERROR")
    assert recover_once(db, settings, runner=public_runner)
    assert ids[0] == ids[1]
    receipt = row(db, work.job_id)
    assert receipt.state == "confirmed" and receipt.artifact_id
    with db.session() as session:
        old = session.get(JobRow, work.job_id)
        assert old.state == "failed" and old.result_id is None and old.error == "Response lost"
        assert session.get(ArtifactRow, receipt.artifact_id).payload["external_record_id"] == ids[0]
    assert not recover_once(db, settings, runner=lambda *a: pytest.fail("duplicate import"))


def test_confirmed_receipt_recovers_without_io(operation):
    db, settings, claimed, work, deadline = operation
    run_import(db, settings, work, deadline, lambda: False, public_runner)
    fail_claim(db, claimed, error="Publication lost", error_code="WORKER_INTERRUPTED")
    assert recover_once(db, settings, runner=lambda *a: pytest.fail("confirmed import replayed"))
    assert row(db, work.job_id).artifact_id


def test_unknown_stays_unknown_after_bounded_failures(operation):
    db, settings, claimed, work, deadline = operation
    def unavailable(settings, work, deadline, stopped):
        if work.external_project_id is None:
            return public_runner(settings, work, deadline, stopped)
        raise TimeoutError()
    with pytest.raises(TimeoutError):
        run_import(db, settings, work, deadline, lambda: False, unavailable)
    fail_claim(db, claimed, error="Timeout", error_code="JOB_TIMED_OUT")
    for attempt in range(3):
        assert recover_once(db, settings, runner=unavailable)
        recovery = get_recovery(db, work.job_id)
        assert recovery.attempts == attempt + 1
        if attempt < 2:
            assert not recover_once(db, settings, runner=unavailable)
            due(db, work.job_id)
    assert recovery.state == "exhausted"
    assert not recover_once(db, settings, runner=unavailable)
    receipt = row(db, work.job_id)
    assert receipt.state == "unknown" and receipt.receipt is None and receipt.artifact_id is None


def test_expired_recovery_lease_cannot_publish(operation):
    db, settings, claimed, work, deadline = operation
    run_import(db, settings, work, deadline, lambda: False, public_runner)
    fail_claim(db, claimed, error="Interrupted", error_code="WORKER_INTERRUPTED")
    discover(db)
    old = acquire(db, 30)
    with db.session.begin() as session:
        session.get(RecoveryRow, work.job_id).lease_until = now() - timedelta(seconds=1)
    replacement = acquire(db, 30)
    assert replacement[2] != old[2]
    execute(db, settings, old, runner=public_runner)
    assert row(db, work.job_id).artifact_id is None
    execute(db, settings, replacement, runner=public_runner)
    assert row(db, work.job_id).artifact_id
    assert get_recovery(db, work.job_id).attempts == 2


def test_deterministic_import_failure_stops_recovery(operation):
    db, settings, claimed, work, _ = operation
    fail_claim(db, claimed, error="Interrupted", error_code="WORKER_INTERRUPTED")
    def rejected(*args):
        raise TaskFailure("Rejected", "ADMISSION_REJECTED")
    recover_once(db, settings, runner=rejected)
    assert get_recovery(db, work.job_id).state == "exhausted"
    assert row(db, work.job_id).artifact_id is None


def test_failure_v2_recovery_preserves_actor_observation_and_receipt(outcome):
    from workbench.bootstrap import main as provision
    from workbench.outcomes import submit_outcome
    from workbench.worker import prepare_claim
    service, scope, payload, _ = outcome
    provision(service.settings)
    job = submit_outcome(service, scope, payload, actor=HUMAN, request_key="assessment")
    claim = claim_next(service.db, 120, "assessment")
    work, deadline = prepare_claim(service.db, claim)
    run_import(service.db, service.settings, work, deadline, lambda: False, public_runner)
    fail_claim(service.db, claim, error="Interrupted", error_code="WORKER_INTERRUPTED")
    recover_once(service.db, service.settings, runner=public_runner)
    receipt = row(service.db, job.id)
    with service.db.session() as session:
        artifact = session.get(ArtifactRow, receipt.artifact_id).payload
        assert artifact["schema_version"] == "2.0"
        assert artifact["actor"] == HUMAN
        assert artifact["observation"] == work.payload["observation"]
        assert artifact["receipt"] == receipt.receipt


def test_recovery_publication_rolls_back_then_reuses_confirmation(operation, monkeypatch):
    from workbench import services
    db, settings, claimed, work, deadline = operation
    run_import(db, settings, work, deadline, lambda: False, public_runner)
    fail_claim(db, claimed, error="Interrupted", error_code="WORKER_INTERRUPTED")
    original = services.save
    def broken(session, value):
        if value.kind == "provenance":
            raise RuntimeError("Injected database publication failure")
        return original(session, value)
    monkeypatch.setattr(services, "save", broken)
    recover_once(db, settings, runner=public_runner)
    assert row(db, work.job_id).artifact_id is None
    with db.session() as session:
        assert not session.scalars(select(ArtifactRow).where(ArtifactRow.kind == "failure")).all()
    monkeypatch.setattr(services, "save", original)
    due(db, work.job_id)
    recover_once(db, settings, runner=lambda *a: pytest.fail("Confirmed receipt replayed"))
    assert row(db, work.job_id).artifact_id


def test_stale_scientific_claim_becomes_recoverable(runtime):
    import time
    from workbench.job_metadata import claim_is_current
    db, settings, _ = runtime
    jid = queue(runtime)
    claim = claim_next(db, 1, "dead-worker")
    time.sleep(1.05)
    assert claim_next(db, 30, "replacement") is None
    assert recover_once(db, settings)
    with db.session() as session:
        assert not claim_is_current(session, claim)
        assert session.get(JobRow, jid).error_code == "JOB_TIMED_OUT"
    assert get_recovery(db, jid).retry_job_id


def test_restart_retains_recovery_budget(runtime):
    from workbench.db import Database
    db, settings, _ = runtime
    jid = queue(runtime)
    fail_claim(db, claim_next(db, 30, "dead-worker"), error="Interrupted", error_code="WORKER_INTERRUPTED")
    discover(db)
    for _ in range(3):
        replacement = Database(settings.database_url)
        try:
            assert acquire(replacement, 30)
        finally:
            replacement.engine.dispose()
        with db.session.begin() as session:
            session.get(RecoveryRow, jid).lease_until = now() - timedelta(seconds=1)
    assert acquire(db, 30) is None
    assert get_recovery(db, jid).state == "exhausted"
    assert get_recovery(db, jid).attempts == 3


def test_populated_recovery_migration_and_downgrade_guard(runtime):
    from alembic import command
    from alembic.config import Config
    from test_metadata import ROOT, migrate
    db, settings, _ = runtime
    config = Config(str(ROOT / "alembic.ini"))
    with db.engine.connect() as connection:
        config.attributes["connection"] = connection
        command.stamp(config, "head")
    migrate(db, "0006", downgrade=True)
    jid = queue(runtime)
    fail_claim(db, claim_next(db, 30, "test"), error="Interrupted", error_code="WORKER_INTERRUPTED")
    migrate(db)
    recover_once(db, settings)
    assert get_recovery(db, jid).retry_job_id
    with pytest.raises(RuntimeError, match="recovery history"):
        migrate(db, "0006", downgrade=True)


def test_receipt_after_lease_expiry_does_not_publish(operation):
    db, settings, claimed, work, _ = operation
    fail_claim(db, claimed, error="Interrupted", error_code="WORKER_INTERRUPTED")
    def delayed(settings, detached, deadline, stopped):
        result = public_runner(settings, detached, deadline, stopped)
        if result.receipt is not None:
            with db.session.begin() as session:
                session.get(RecoveryRow, work.job_id).lease_until = now() - timedelta(seconds=1)
        return result
    recover_once(db, settings, runner=delayed)
    receipt = row(db, work.job_id)
    assert receipt.state == "confirmed" and receipt.artifact_id is None
    recover_once(db, settings, runner=lambda *a: pytest.fail("Confirmed receipt replayed"))
    assert row(db, work.job_id).artifact_id


def test_agent_identity_is_not_retried_by_manual_policy(runtime):
    db, settings, _ = runtime
    jid = queue(runtime, "action:v1:" + "a" * 64)
    fail_claim(db, claim_next(db, 30, "agent"), error="Interrupted", error_code="WORKER_INTERRUPTED")
    assert not recover_once(db, settings)
    assert get_recovery(db, jid).state == "exhausted"


def test_explicit_retry_suppresses_automatic_retry(runtime):
    from workbench.job_metadata import submit_job
    db, settings, _ = runtime
    jid = queue(runtime)
    fail_claim(db, claim_next(db, 30, "test"), error="Interrupted", error_code="WORKER_INTERRUPTED")
    with db.session.begin() as session:
        job = session.get(JobRow, jid)
        submit_job(session, job.project_id, job.kind, job.payload, "explicit-retry", retry_of_job_id=jid)
    assert not recover_once(db, settings)
    assert get_recovery(db, jid).retry_job_id is None

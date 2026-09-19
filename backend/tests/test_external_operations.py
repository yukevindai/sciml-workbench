"""B07 real public imports, response loss, durable identity and receipt fencing."""
from types import SimpleNamespace
from concurrent.futures import ThreadPoolExecutor
import json

import httpx
import pytest
from sqlalchemy import update, delete
from sqlalchemy.exc import IntegrityError

from workbench.bootstrap import main as provision
from workbench.contracts import Audit, Split, Benchmark
from workbench.db import ExternalOperationRow, ExternalProjectRow, JobRow
from workbench.errors import DomainError
from workbench.execution import TaskResult
from workbench.external_operations import bind_and_submit, confirm, reconcile, run_import
from workbench.failure_memory import FailureMemory
from workbench.job_metadata import claim_next, fail_claim, submit_job
from workbench.services import save
from workbench.worker import prepare_claim, publish_result, process_job
from workbench.submission import SubmissionScope, SubmissionService
from workbench.storage import LocalStore
from test_worker import runtime
from test_metadata import migrate


@pytest.fixture
def operation(runtime):
    db, settings, data = runtime
    provision(settings)
    with db.session.begin() as session:
        audit = save(session, Audit(project_id="p", dataset_id=data.id, config={}, result={}))
        split = save(session, Split(project_id="p", dataset_id=data.id, audit_id=audit.id,
                                    config={}, assignments=["train", "validation", "test"], result={}))
        run = save(session, Benchmark(project_id="p", dataset_id=data.id, split_id=split.id,
                                     model="mean", seed=0, status="failed", config={}))
        job = submit_job(session, "p", "failure", {"benchmark_id": run.id, "reason": "Synthetic assessment",
                         "uncertainty_notes": "Not an experiment"}, "original")
    claimed = claim_next(db, 120, "b07-test")
    work, deadline = prepare_claim(db, claimed)
    return db, settings, claimed, work, deadline


def public_runner(settings, work, deadline, stopped):
    memory = FailureMemory(settings)
    if work.external_project_id is None:
        return TaskResult(external_project_id=memory.resolve(SimpleNamespace(**work.project)))
    receipt = memory.import_exact(work.project_id, work.external_project_id, work.external_import)
    # Parent constructs publication exclusively from the checked receipt.
    return TaskResult(artifact={}, receipt=receipt.model_dump(mode="json"))


def row(db, job_id):
    with db.session() as session:
        return session.get(ExternalOperationRow, job_id)


def test_lost_response_reconciles_exact_original_import(operation, monkeypatch):
    db, settings, claimed, work, deadline = operation
    bodies, ids = [], []
    original = httpx.AsyncClient.post
    lose_response = True
    async def lost(client, url, **kwargs):
        nonlocal lose_response
        response = await original(client, url, **kwargs)
        if url.endswith("/import"):
            persisted = row(db, work.job_id)
            assert persisted.state == "unknown" and persisted.attempts == len(bodies) + 1
            assert kwargs["content"] == persisted.body.encode("utf-8")
            bodies.append(kwargs["content"])
            ids.append(response.json()["record"]["id"])
            if lose_response:
                lose_response = False
                raise httpx.ReadError("Synthetic response loss after commit")
        return response
    monkeypatch.setattr(httpx.AsyncClient, "post", lost)
    with pytest.raises(httpx.ReadError):
        run_import(db, settings, work, deadline, lambda: False, public_runner)
    persisted = row(db, work.job_id)
    assert persisted.state == "unknown" and persisted.receipt is None and persisted.artifact_id is None
    assert json.loads(persisted.body)["external_id"] == claimed.job_id
    fail_claim(db, claimed, error="Lost response", error_code="WORKER_INTERRUPTED")
    with pytest.raises(DomainError, match="body conflict"):
        reconcile(db, settings, "p", work.job_id, expected_body=persisted.body + " ", runner=public_runner)
    with pytest.raises(DomainError, match="not found"):
        reconcile(db, settings, "foreign", work.job_id, runner=public_runner)
    receipt = reconcile(db, settings, "p", work.job_id, expected_body=persisted.body, runner=public_runner)
    assert bodies[0] == bodies[1] and ids[0] == ids[1] == receipt.external_record_id
    assert row(db, work.job_id).state == "confirmed" and row(db, work.job_id).attempts == 2
    assert reconcile(db, settings, "p", work.job_id, runner=lambda *a: pytest.fail("No replay after confirmation")) == receipt
    with db.session() as session:
        job = session.get(JobRow, work.job_id)
        assert job.state == "failed" and job.result_id is None and job.error == "Lost response"
    service = SubmissionService(db, LocalStore(settings.storage_root), settings)
    with pytest.raises(DomainError, match="Reconcile"):
        service.submit(SubmissionScope(project_id="p"), "failure", work.payload,
                       request_key="retry", retry_of_job_id=work.job_id)


def test_confirmed_receipt_survives_publication_loss_and_links_atomically(operation):
    db, settings, claimed, work, deadline = operation
    result = run_import(db, settings, work, deadline, lambda: False, public_runner)
    persisted = row(db, work.job_id)
    assert persisted.state == "confirmed" and persisted.artifact_id is None
    corrupt = result.model_copy(deep=True)
    corrupt.artifact["external_record_id"] = "different"
    with pytest.raises(DomainError):
        publish_result(db, claimed, work, corrupt)
    assert row(db, work.job_id).artifact_id is None
    publish_result(db, claimed, work, result)
    with db.session() as session:
        job = session.get(JobRow, work.job_id)
        assert job.state == "succeeded" and job.result_id == row(db, work.job_id).artifact_id


@pytest.mark.parametrize("change", [{"body": "{}"}, {"body_sha256": "0" * 64},
    {"request_sha256": "0" * 64}, {"connector": "other"}, {"project_id": "other"}])
def test_database_rejects_identity_mutation(operation, change):
    db, _, _, work, _ = operation
    with pytest.raises(IntegrityError), db.session.begin() as session:
        session.execute(update(ExternalOperationRow).where(ExternalOperationRow.job_id == work.job_id).values(**change))
    with pytest.raises(IntegrityError), db.session.begin() as session:
        session.execute(delete(ExternalOperationRow).where(ExternalOperationRow.job_id == work.job_id))


def test_invalid_receipt_and_bound_destination_cannot_change(operation):
    db, settings, _, work, deadline = operation
    result = run_import(db, settings, work, deadline, lambda: False, public_runner)
    receipt = dict(result.receipt, external_id="another-job")
    with pytest.raises(DomainError, match="Receipt"):
        confirm(db, work, receipt)
    with pytest.raises(DomainError, match="destination changed"):
        bind_and_submit(db, work, "another-project")
    with pytest.raises(IntegrityError), db.session.begin() as session:
        session.execute(update(ExternalOperationRow).values(state="unknown", receipt=None))
    with pytest.raises(IntegrityError), db.session.begin() as session:
        session.execute(update(ExternalProjectRow).values(external_project_id="other"))


def test_real_worker_subprocess_journals_and_publishes(operation):
    db, settings, claimed, work, _ = operation
    process_job(settings, claimed, db=db)
    persisted = row(db, work.job_id)
    assert persisted.state == "confirmed" and persisted.attempts == 1 and persisted.artifact_id
    assert settings.efm_password.get_secret_value() not in json.dumps(persisted.receipt)


def test_timeout_leaves_unknown_without_success(operation):
    db, settings, _, work, deadline = operation
    def interrupted(settings, work, deadline, stopped):
        if work.external_project_id is None:
            return public_runner(settings, work, deadline, stopped)
        raise TimeoutError("Process killed")
    with pytest.raises(TimeoutError):
        run_import(db, settings, work, deadline, lambda: False, interrupted)
    persisted = row(db, work.job_id)
    assert persisted.state == "unknown" and persisted.attempts == 1 and persisted.receipt is None


def test_reconciliation_race_keeps_one_receipt_and_original_history(operation):
    db, settings, claimed, work, _ = operation
    memory = FailureMemory(settings)
    remote = memory.resolve(SimpleNamespace(**work.project))
    bind_and_submit(db, work, remote)
    fail_claim(db, claimed, error="Interrupted", error_code="WORKER_INTERRUPTED")
    with ThreadPoolExecutor(max_workers=2) as pool:
        receipts = list(pool.map(lambda _: reconcile(db, settings, "p", work.job_id, runner=public_runner), range(2)))
    assert receipts[0] == receipts[1]
    persisted = row(db, work.job_id)
    assert persisted.state == "confirmed" and 2 <= persisted.attempts <= 3
    found = memory.search(SimpleNamespace(**work.project))
    assert [item["id"] for item in found.records] == [receipts[0].external_record_id]


def test_destination_binding_avoids_repeating_name_resolution(operation, monkeypatch):
    db, settings, claimed, work, _ = operation
    memory = FailureMemory(settings)
    remote = memory.resolve(SimpleNamespace(**work.project))
    bind_and_submit(db, work, remote)
    fail_claim(db, claimed, error="Interrupted", error_code="WORKER_INTERRUPTED")
    monkeypatch.setattr(FailureMemory, "resolve", lambda *a: pytest.fail("Bound imports must not resolve names again"))
    receipt = reconcile(db, settings, "p", work.job_id, runner=public_runner)
    assert receipt.external_project_id == remote


def test_populated_journal_cannot_be_downgraded(operation):
    # This fixture uses create_all; stamp its equivalent revision before downgrade.
    from alembic import command
    from alembic.config import Config
    from test_metadata import ROOT
    db, _, _, _, _ = operation
    config = Config(str(ROOT / "alembic.ini"))
    with db.engine.connect() as connection:
        config.attributes["connection"] = connection
        command.stamp(config, "head")
    with pytest.raises(RuntimeError, match="external identities"):
        migrate(db, "0003", downgrade=True)

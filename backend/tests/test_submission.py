"""B04 shared submission, admission, races and lost-response acceptance."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
from threading import Barrier, Event

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select

from workbench import adapters
from workbench.api import create_app
from workbench.contracts import Audit, Split
from workbench.db import Database, JobRow, ProjectRow
from workbench.job_metadata import claim_next, fail_claim
from workbench.services import DomainError, save
from workbench.storage import LocalStore
from workbench.submission import SubmissionScope, SubmissionService, ACTION_PREFIX
from workbench.worker import process_job
from test_worker import runtime

EXAMPLES = Path(__file__).resolve().parents[2] / "examples"


@pytest.fixture
def service(runtime):
    db, settings, _ = runtime
    return SubmissionService(db, LocalStore(settings.storage_root), settings)


def assert_error(code, call, status=None):
    with pytest.raises(DomainError) as caught:
        call()
    assert caught.value.error_code == code
    if status is not None:
        assert caught.value.status == status
    return caught.value


def test_shared_canonical_payload_and_committed_return(runtime, service):
    db, _, data = runtime
    scope = SubmissionScope("p")
    first = service.submit(scope, "audit", {"dataset_id": data.id}, request_key="same")
    with db.session() as session:
        persisted = session.get(JobRow, first.id)
        assert persisted is not None and persisted.state == "queued"
        assert persisted.payload == {"dataset_id": data.id, "config": {}}
    again = service.submit(scope, "audit", {"config": {}, "dataset_id": data.id}, request_key="same")
    assert again.id == first.id
    assert_error("IDEMPOTENCY_CONFLICT", lambda: service.submit(scope, "report", {}, request_key="same"), 409)
    assert_error("IDEMPOTENCY_CONFLICT", lambda: service.submit(scope, "audit",
        {"dataset_id": data.id, "config": {"target_column": "changed"}}, request_key="same"), 409)
    # Canonical object ordering matches; array ordering remains meaningful.
    payload = {"dataset_id": data.id, "config": {"numeric_columns": ["x", "y"], "target_column": "y"}}
    original = service.submit(scope, "audit", payload, request_key="ordered")
    assert service.submit(scope, "audit", {"config": {"target_column": "y", "numeric_columns": ["x", "y"]},
        "dataset_id": data.id}, request_key="ordered").id == original.id
    payload["config"]["numeric_columns"].reverse()
    assert_error("IDEMPOTENCY_CONFLICT", lambda: service.submit(scope, "audit", payload, request_key="ordered"))


@pytest.mark.parametrize("kind,payload", [("audit", {}), ("shell", {}), ("report", {"private": "must-not-echo"}),
    ("audit", {"dataset_id": "a", "config": {"nested": [float("nan")]}}),
    ("evidence", {"pdf_key": "a" * 64, "title": "Raw storage keys are not authority"})])
def test_invalid_tool_requests_fail_without_side_effects(runtime, service, kind, payload):
    db, _, _ = runtime
    error = assert_error("UNSUPPORTED_CAPABILITY" if kind == "shell" else "VALIDATION_FAILED",
                         lambda: service.submit(SubmissionScope("p"), kind, payload, request_key="invalid"), 422)
    assert "must-not-echo" not in str(error)
    with db.session() as session:
        assert session.scalar(select(func.count()).select_from(JobRow)) == 0


def test_request_keys_and_limits(runtime, service):
    _, settings, data = runtime
    payload = {"dataset_id": data.id}
    for key in (None, "", "  ", "x" * 101, ACTION_PREFIX + "forged"):
        assert_error("VALIDATION_FAILED", lambda: service.submit(SubmissionScope("p"), "audit", payload, request_key=key))
    settings.max_upload_bytes = 10
    assert_error("UPLOAD_TOO_LARGE", lambda: service.submit(SubmissionScope("p"), "audit", payload, request_key="large"), 413)


def test_action_identity_scope_and_replay_authority(runtime, service):
    db, _, data = runtime
    payload = {"dataset_id": data.id}
    scope = SubmissionScope("p", {data.id}, set(), "run-1")
    identity = {"action_id": "action-1", "attempt_id": "attempt-1"}
    job = service.submit(scope, "audit", payload, **identity)
    assert job.request_key.startswith(ACTION_PREFIX) and len(job.request_key) <= 100
    assert service.submit(scope, "audit", payload, **identity).id == job.id
    assert_error("IDEMPOTENCY_CONFLICT", lambda: service.submit(scope, "audit",
        {**payload, "config": {"target_column": "x"}}, **identity))
    assert_error("POLICY_DENIED", lambda: service.submit(SubmissionScope("p", set(), set(), "run-1"),
        "audit", payload, **identity), 403)
    assert service.submit(SubmissionScope("p", {data.id}, set(), "run-2"), "audit", payload, **identity).id != job.id
    assert service.submit(scope, "audit", payload, action_id="action-1", attempt_id="attempt-2").id != job.id
    assert_error("VALIDATION_FAILED", lambda: service.submit(scope, "audit", payload, request_key="manual"))
    assert_error("UNSUPPORTED_CAPABILITY", lambda: service.submit(scope, "report", {}, action_id="report", attempt_id="one"))
    assert_error("UNSUPPORTED_CAPABILITY", lambda: service.submit(scope, "failure", {
        "benchmark_id": "run", "reason": "Human assessment", "uncertainty_notes": "Unclear"}, **identity))
    with db.session.begin() as session:
        session.add(ProjectRow(id="other", name="Other"))
    assert_error("ARTIFACT_NOT_FOUND", lambda: service.submit(SubmissionScope("other", {data.id}, set(), "run-1"),
        "audit", payload, **identity), 404)


def test_replay_report_before_busy_admission(runtime, service):
    _, _, data = runtime
    report = service.submit(SubmissionScope("p"), "report", {}, request_key="report")
    service.submit(SubmissionScope("p"), "audit", {"dataset_id": data.id}, request_key="new-audit")
    assert service.submit(SubmissionScope("p"), "report", {}, request_key="report").id == report.id
    assert_error("PROJECT_BUSY", lambda: service.submit(SubmissionScope("p"), "report", {}, request_key="new-report"), 409)


def test_retry_references_are_explicit_scoped_compatible_and_terminal(runtime, service):
    db, _, data = runtime
    scope, payload = SubmissionScope("p"), {"dataset_id": data.id}
    original = service.submit(scope, "audit", payload, request_key="original")
    assert_error("VALIDATION_FAILED", lambda: service.submit(scope, "audit", payload,
        request_key="early", retry_of_job_id=original.id))
    assert_error("JOB_NOT_FOUND", lambda: service.submit(scope, "audit", payload,
        request_key="missing", retry_of_job_id="missing"), 404)
    claim = claim_next(db, 60, "worker")
    assert fail_claim(db, claim, error="Interrupted", error_code="WORKER_INTERRUPTED")
    retry = service.submit(scope, "audit", payload, request_key="retry", retry_of_job_id=original.id)
    assert retry.id != original.id and retry.retry_of_job_id == original.id
    assert service.submit(scope, "audit", payload, request_key="retry", retry_of_job_id=original.id).id == retry.id
    assert_error("IDEMPOTENCY_CONFLICT", lambda: service.submit(scope, "audit", payload, request_key="retry"))
    assert_error("LINEAGE_MISMATCH", lambda: service.submit(scope, "audit", {**payload, "config": {"target_column": "x"}},
        request_key="changed", retry_of_job_id=original.id))
    assert_error("LINEAGE_MISMATCH", lambda: service.submit(scope, "report", {}, request_key="wrong-kind", retry_of_job_id=original.id))


def test_pdf_compatibility_replays_without_blob_io_and_tools_need_material(runtime, service, monkeypatch):
    db, _, _ = runtime
    raw = b"%PDF-1.4\noriginal"
    put = service.store.put
    def outside_transaction(value):
        assert db.engine.pool.checkedout() == 0
        return put(value)
    monkeypatch.setattr(service.store, "put", outside_transaction)
    accepted = service.submit_pdf(SubmissionScope("p"), raw, "Original", request_key="pdf")
    assert accepted.payload == {"pdf_key": hashlib.sha256(raw).hexdigest(), "title": "Original"}
    monkeypatch.setattr(service.store, "put", lambda _: pytest.fail("Replay/conflict must not publish bytes"))
    assert service.submit_pdf(SubmissionScope("p"), raw, "Original", request_key="pdf").id == accepted.id
    assert_error("IDEMPOTENCY_CONFLICT", lambda: service.submit_pdf(SubmissionScope("p"), raw + b"changed", "Original", request_key="pdf"))
    assert_error("POLICY_DENIED", lambda: service.submit_pdf(SubmissionScope("p", set(), set(), "run"), raw, "Title", request_key="forbidden"))
    assert_error("PROJECT_NOT_FOUND", lambda: service.submit_pdf(SubmissionScope("missing"), raw, "Title", request_key="missing"))


def test_pdf_tool_uses_scoped_material_and_preserves_payload(runtime, service):
    from workbench.intake import attach
    db, settings, _ = runtime
    raw = b"%PDF-1.4\noriginal"
    with db.session.begin() as session:
        pdf = attach(session, service.store, settings, "p", raw, "paper.pdf", "application/pdf", None, "attach")
    scope = SubmissionScope("p", set(), {pdf.id}, "run")
    job = service.submit(scope, "evidence", {"material_id": pdf.id}, action_id="ingest", attempt_id="one")
    assert job.payload == {"material_id": pdf.id, "title": "paper.pdf", "pdf_key": pdf.sha256}
    operator = SubmissionScope("p")
    service.submit(operator, "evidence", {"material_id": pdf.id}, request_key="operator-ingest")
    assert_error("IDEMPOTENCY_CONFLICT", lambda: service.submit(operator, "evidence", {"material_id": "missing"}, request_key="operator-ingest"))
    assert_error("ARTIFACT_NOT_FOUND", lambda: service.submit(operator, "evidence", {"material_id": "missing"}, request_key="new-ingest"))
    assert_error("POLICY_DENIED", lambda: service.submit(SubmissionScope("p", set(), set(), "run"), "evidence",
        {"material_id": pdf.id}, action_id="ingest", attempt_id="one"))


def test_benchmark_scope_and_source_admission(runtime, service):
    from workbench.intake import dataset
    db, settings, data = runtime
    with db.session.begin() as session:
        audit = save(session, Audit(project_id="p", dataset_id=data.id, config={}, result={}))
        part = save(session, Split(project_id="p", dataset_id=data.id, audit_id=audit.id, config={},
                                   assignments=["train", "validation", "test"], result={}))
        unknown = dataset(session, service.store, settings, "p", b"x,y\n1,2\n3,4\n5,6\n", "unknown.csv")
        unknown_audit = save(session, Audit(project_id="p", dataset_id=unknown.id, config={}, result={}))
        unknown_part = save(session, Split(project_id="p", dataset_id=unknown.id, audit_id=unknown_audit.id, config={},
                                           assignments=["train", "validation", "test"], result={}))
    payload = {**json.loads((EXAMPLES / "benchmark.json").read_text()), "dataset_id": data.id, "split_id": part.id}
    identity = {"action_id": "baseline", "attempt_id": "one"}
    # The benchmark consumes its split's parent audit, not just explicit args.
    assert_error("UNSUPPORTED_CAPABILITY", lambda: service.submit(SubmissionScope("p", {data.id, part.id}, set(), "run"),
        "benchmark", payload, **identity))
    assert_error("UNSUPPORTED_CAPABILITY", lambda: service.submit(SubmissionScope("p", {data.id, part.id, audit.id}, set(), "run"),
        "benchmark", payload, **identity))
    job = service.submit(SubmissionScope("p"), "benchmark", payload, request_key="manual-baseline")
    assert job.state == "queued"
    assert_error("ADMISSION_REJECTED", lambda: service.submit(SubmissionScope("p"), "benchmark",
        {**payload, "dataset_id": unknown.id, "split_id": unknown_part.id}, request_key="unknown"), 422)
    assert_error("LINEAGE_MISMATCH", lambda: service.submit(SubmissionScope("p"), "benchmark",
        {**payload, "dataset_id": unknown.id}, request_key="wrong-lineage"), 422)


def test_report_admission_is_behind_the_project_barrier(runtime, service):
    db, _, data = runtime
    if db.engine.dialect.name != "postgresql":
        pytest.skip("Observe row-lock barrier on PostgreSQL")
    admitted, attempted, release = Event(), Event(), Event()
    original = service._admit
    def hold(session, scope, kind, payload, retry):
        original(session, scope, kind, payload, retry)
        if kind == "audit":
            admitted.set()
            assert release.wait(timeout=15)
    service._admit = hold
    def observe(connection, cursor, statement, parameters, context, executemany):
        if admitted.is_set() and "FOR UPDATE" in statement:
            attempted.set()
    event.listen(db.engine, "before_cursor_execute", observe)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            pending = pool.submit(service.submit, SubmissionScope("p"), "audit", {"dataset_id": data.id}, request_key="first")
            try:
                assert admitted.wait(timeout=15)
                report = pool.submit(service.submit, SubmissionScope("p"), "report", {}, request_key="report")
                assert attempted.wait(timeout=15)
                assert not report.done()
            finally:
                release.set()
            assert pending.result(timeout=15).state == "queued"
            with pytest.raises(DomainError) as caught:
                report.result(timeout=15)
            assert caught.value.error_code == "PROJECT_BUSY"
    finally:
        event.remove(db.engine, "before_cursor_execute", observe)


def test_http_lost_response_after_commit_does_not_lose_work(runtime, monkeypatch):
    import workbench.api as api_module
    db, settings, data = runtime
    app = create_app(settings)
    payload = {"dataset_id": data.id, "config": {}}
    headers = {"Authorization": "Bearer " + settings.api_token.get_secret_value(), "Idempotency-Key": "lost-response"}
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            with monkeypatch.context() as patch:
                def lose_response(job):
                    # Serialization is after commit, on another DB connection.
                    with db.session() as session:
                        assert session.get(JobRow, job.id).state == "queued"
                    raise ConnectionError("Simulated lost HTTP response")
                patch.setattr(api_module, "job_json", lose_response)
                for name in ("run_audit", "run_split", "run_benchmark", "ingest_pdf"):
                    patch.setattr(adapters, name, lambda *args: pytest.fail("Submission must not execute science"))
                response = client.post("/api/v1/projects/p/audit", json=payload, headers=headers)
                assert response.status_code == 500
            accepted = client.post("/api/v1/projects/p/audit", json=payload, headers=headers)
            assert accepted.status_code == 202
            jid = accepted.json()["id"]
            with db.session() as session:
                assert session.scalar(select(func.count()).select_from(JobRow)) == 1
    finally:
        app.state.db.engine.dispose()
    db.engine.dispose()
    replacement = Database(settings.database_url)
    try:
        claim = claim_next(replacement, 60, "replacement")
        assert claim.job_id == jid
        process_job(settings, claim, db=replacement)
        with replacement.session() as session:
            assert session.get(JobRow, jid).state == "succeeded"
    finally:
        replacement.engine.dispose()


def test_commit_failure_never_returns_an_accepted_job(runtime, service):
    db, _, data = runtime
    def refuse(session):
        if not session.in_nested_transaction():
            raise RuntimeError("Injected commit failure")
    event.listen(db.session, "before_commit", refuse)
    try:
        with pytest.raises(RuntimeError, match="Injected commit"):
            service.submit(SubmissionScope("p"), "audit", {"dataset_id": data.id}, request_key="not-accepted")
    finally:
        event.remove(db.session, "before_commit", refuse)
    with db.session() as session:
        assert session.scalar(select(func.count()).select_from(JobRow)) == 0


@pytest.mark.parametrize("conflict", [False, True])
def test_concurrent_submission_has_one_durable_winner(runtime, service, conflict):
    db, _, data = runtime
    barrier = Barrier(6)
    def submit(index):
        barrier.wait(timeout=15)
        try:
            return service.submit(SubmissionScope("p"), "audit", {"dataset_id": data.id,
                "config": {"choice": index if conflict else 0}}, request_key="racing").id
        except DomainError as exc:
            assert exc.error_code == "IDEMPOTENCY_CONFLICT"
            return None
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(submit, range(6)))
    assert len({result for result in results if result}) == 1
    assert results.count(None) == (5 if conflict else 0)
    with db.session() as session:
        assert session.scalar(select(func.count()).select_from(JobRow)) == 1

"""B09 bounded additive reads, opaque cursors and fail-closed exposure."""
from datetime import datetime, timezone, timedelta
import json

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import event

from workbench.api import create_app
from workbench import capabilities as capability_module
from workbench.contracts import Audit
from workbench.db import ArtifactRow, JobRow, ProjectRow
from workbench.errors import DomainError
from workbench.projections import ReadScope, ReadService
from test_worker import runtime
from test_external_operations import operation


@pytest.fixture
def reads(runtime):
    db, settings, data = runtime
    stamp = datetime(2026, 9, 19, tzinfo=timezone.utc)
    with db.session.begin() as session:
        session.add(ProjectRow(id="q", name="Other"))
        for index in range(7):
            aid, jid = f"audit-{index}", f"job-{index}"
            value = Audit(id=aid, project_id="p", dataset_id=data.id, parents=[data.id],
                          config={}, result={"private-detail": "x" * 5000})
            session.add(ArtifactRow(id=aid, project_id="p", kind="audit", payload=value.model_dump(mode="json"), created_at=stamp))
            session.add(JobRow(id=jid, project_id="p", kind="audit", request_key=f"secret-request-{index}",
                payload={"dataset_id": data.id, "config": {"private-request": "secret-payload"}},
                created_at=stamp, state="failed", error="credential-canary", error_code="INTERNAL_ERROR"))
    return ReadService(settings.api_token.get_secret_value())


@pytest.mark.parametrize("resource", ["artifact", "job"])
def test_keyset_ties_filters_and_insert_between_pages(runtime, reads, resource):
    db, _, data = runtime
    method = getattr(reads, resource + "_index")
    with db.session() as session:
        first = method(session, ReadScope("p"), kind="audit", limit=2)
    assert [r.id for r in first.items] == [f"{resource if resource == 'job' else 'audit'}-{i}" for i in (0, 1)]
    cursor = first.next_cursor
    with db.session.begin() as session:
        # A later insertion does not shift offsets or repeat an earlier row.
        if resource == "job":
            session.add(JobRow(id="new", project_id="p", kind="audit", request_key="new",
                              payload={"dataset_id": data.id, "config": {}}))
        else:
            value = Audit(id="new", project_id="p", dataset_id=data.id, config={}, result={})
            session.add(ArtifactRow(id="new", project_id="p", kind="audit", payload=value.model_dump(mode="json")))
    ids = [r.id for r in first.items]
    while cursor:
        with db.session() as session:
            page = method(session, ReadScope("p"), kind="audit", limit=2, after=cursor)
        ids.extend(r.id for r in page.items)
        cursor = page.next_cursor
    assert len(ids) == len(set(ids)) == 8 and ids[-1] == "new"
    with db.session() as session:
        assert method(session, ReadScope("p"), kind="split").items == []


def test_cursor_tampering_cross_scope_and_resource_rejected(runtime, reads):
    db, _, _ = runtime
    with db.session() as session:
        cursor = reads.job_index(session, ReadScope("p"), limit=1, kind="audit").next_cursor
    cases = [(reads.job_index, ReadScope("q"), "audit", cursor),
             (reads.artifact_index, ReadScope("p"), "audit", cursor),
             (reads.job_index, ReadScope("p"), "split", cursor),
             (reads.job_index, ReadScope("p"), "audit", "!" + cursor),
             (reads.job_index, ReadScope("p"), "audit", "x" * 2049)]
    for method, scope, kind, after in cases:
        with db.session() as session, pytest.raises(DomainError, match="cursor"):
            method(session, scope, kind=kind, after=after)


@pytest.mark.parametrize("limit", [0, 101, True])
def test_page_limits_checked_in_service(runtime, reads, limit):
    db, _, _ = runtime
    with db.session() as session, pytest.raises(DomainError):
        reads.job_index(session, ReadScope("p"), limit=limit)


def test_summary_is_lightweight_and_detail_preserves_science(runtime, reads):
    db, _, _ = runtime
    statements = []
    def capture(conn, cursor, statement, parameters, context, many):
        statements.append(statement)
    event.listen(db.engine, "before_cursor_execute", capture)
    try:
        with db.session() as session:
            artifacts = reads.artifact_index(session, ReadScope("p"), kind="audit", limit=1)
            jobs = reads.job_index(session, ReadScope("p"), limit=1)
    finally:
        event.remove(db.engine, "before_cursor_execute", capture)
    text = artifacts.model_dump_json() + jobs.model_dump_json()
    assert not any(secret in text for secret in ("private-detail", "credential-canary", "secret-payload", "secret-request", "claim_token", "worker_id"))
    assert not any("jobs.payload" in sql for sql in statements)
    with db.session() as session:
        detail = reads.artifact(session, ReadScope("p"), "audit-0")
        assert detail.result == {"private-detail": "x" * 5000}
        assert reads.job(session, ReadScope("p"), "job-0").error_code == "INTERNAL_ERROR"
        with pytest.raises(DomainError) as missing:
            reads.job(session, ReadScope("q"), "job-0")
        assert missing.value.status == 404


@pytest.mark.parametrize("path", ["job_index", "artifact_index", "job", "artifact", "download", "material"])
def test_agent_reads_fail_before_loading_any_content(runtime, reads, path):
    db, _, _ = runtime
    scope = ReadScope("p", audience="agent")
    def forbidden(*args):
        pytest.fail("Agent denial must precede metadata/content access")
    event.listen(db.engine, "before_cursor_execute", forbidden)
    try:
        with db.session() as session, pytest.raises(DomainError) as denied:
            if path.endswith("_index"):
                getattr(reads, path)(session, scope)
            elif path == "material":
                reads.download(session, scope, "any", material=True)
            else:
                getattr(reads, path)(session, scope, "any")
        assert denied.value.error_code == "DATA_EXPOSURE_DENIED"
    finally:
        event.remove(db.engine, "before_cursor_execute", forbidden)


def test_http_auth_additive_shapes_and_safe_job_errors(runtime, reads):
    _, settings, _ = runtime
    app = create_app(settings)
    try:
        with TestClient(app) as client:
            routes = ["/api/v1/capabilities", "/api/v1/projects/p/job-index", "/api/v1/projects/p/artifact-index",
                      "/api/v1/projects/p/jobs/job-0"]
            assert all(client.get(route).status_code == 401 for route in routes)
            client.headers["Authorization"] = "Bearer " + settings.api_token.get_secret_value()
            assert all(client.get(route).status_code == 200 for route in routes)
            assert client.get(routes[1], params={"limit": 101}).status_code == 422
            assert client.get(routes[1], params={"after": "junk"}).status_code == 422
            assert client.get("/api/v1/projects/q/jobs/job-0").status_code == 404
            old = client.get("/api/v1/projects/p/jobs").json()
            assert isinstance(old, list) and "credential-canary" not in json.dumps(old)
            assert isinstance(client.get("/api/v1/projects/p/artifacts").json(), list)
    finally:
        app.state.db.engine.dispose()


def test_capabilities_match_integrated_models_and_fail_closed(runtime, monkeypatch):
    _, settings, _ = runtime
    result = capability_module.capabilities(settings)
    assert result.benchmark_models == ["mean", "ridge"]
    assert "scaffold" not in result.split_strategies and "random_forest" not in result.benchmark_models
    assert result.agent_reads_available is True and result.validation_only_execution is False
    assert result.evaluation_exposure == "tracked_with_quarantine"
    assert result.artifact_read_versions["failure"] == ["1.0", "2.0"]
    assert result.artifact_read_versions["evaluation_protocol"] == ["1.0"]
    assert result.limits.max_rows == settings.max_rows
    assert settings.api_token.get_secret_value() not in result.model_dump_json()
    class BadDistribution:
        def read_text(self, name):
            return '{"vcs_info":{"vcs":"git","commit_id":"wrong"}}'
    monkeypatch.setattr(capability_module, "distribution", lambda name: BadDistribution())
    with pytest.raises(DomainError) as mismatch:
        capability_module.capabilities(settings)
    assert mismatch.value.error_code == "DEPENDENCY_UNAVAILABLE"


def test_unknown_and_confirmed_receipts_preserve_failed_job_history(operation):
    from workbench.external_operations import bind_and_submit, confirm
    from workbench.db import ExternalOperationRow
    from workbench.job_metadata import fail_claim
    db, settings, claim, work, _ = operation
    reads = ReadService(settings.api_token.get_secret_value())
    bind_and_submit(db, work, "remote-project")
    fail_claim(db, claim, error="credential-canary", error_code="WORKER_INTERRUPTED")
    with db.session() as session:
        unknown = reads.job(session, ReadScope("p"), work.job_id)
        digest = session.get(ExternalOperationRow, work.job_id).request_sha256
    assert unknown.external_receipt.state == "unknown" and unknown.external_receipt.reconciliation_required
    confirm(db, work, dict(external_id=work.job_id, request_sha256=digest, external_project_id="remote-project",
                          external_record_id="remote-record", record={"id": "remote-record", "project_id": "remote-project", "private-snapshot": "secret"}))
    with db.session() as session:
        known = reads.job(session, ReadScope("p"), work.job_id)
        page = reads.job_index(session, ReadScope("p"))
    assert known.state == "failed" and known.result_id is None
    assert known.external_receipt.state == "confirmed" and known.external_receipt.artifact_id is None
    assert not known.external_receipt.reconciliation_required
    assert known.external_receipt.external_record_id == "remote-record"
    assert "private-snapshot" not in page.model_dump_json() and "credential-canary" not in known.model_dump_json()

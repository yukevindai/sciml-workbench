"""A08 report inspection: structural reverification and frozen identities, never replay claims."""
import io
import json
import zipfile

import pytest

from workbench.contracts import Report
from workbench.errors import DomainError
from workbench.job_metadata import claim_next
from workbench.projections import ReadScope
from workbench.report_inspection import report_summary
from workbench.services import save
from workbench.storage import LocalStore
from workbench.worker import process_job
from test_worker import runtime  # noqa: F401 - fixture
from test_metadata import db, old_db  # noqa: F401 - fixture
from test_tool_registry import registry  # noqa: F401 - fixture
from test_agent_finalization import export_ready, execute_job
from test_agent_coordinator import advance


def http(settings):
    from fastapi.testclient import TestClient
    from workbench.api import create_app
    client = TestClient(create_app(settings), raise_server_exceptions=False)
    client.headers["Authorization"] = "Bearer " + settings.api_token.get_secret_value()
    return client


@pytest.fixture
def exported(runtime):  # noqa: F811
    db, settings, data = runtime
    client = http(settings)
    job = client.post("/api/v1/projects/p/report", headers={"Idempotency-Key": "report"}).json()
    process_job(settings, claim_next(db, 300, "report"), db=db)
    [report] = [a for a in client.get("/api/v1/projects/p/artifact-previews").json() if a["kind"] == "report"]
    return db, settings, data, client, report, job


def test_project_report_reverifies_and_names_frozen_inputs(exported):
    db, settings, data, client, report, job = exported
    response = client.get(f"/api/v1/projects/p/reports/{report['id']}/summary")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["verification"]["status"] == "verified" and body["verification"]["method"] == "structural"
    assert body["scientific_replay"] == "not_run" and body["manifest_version"] == "2.0"
    assert body["scope"]["kind"] == "project" and body["scope"]["run_id"] is None
    assert body["sha256"] == report["sha256"] and body["size_bytes"] > 0
    [dataset] = [i for i in body["inputs"] if i["kind"] == "dataset"]
    assert dataset["id"] == data.id and dataset["label"] == "input.csv · 3 rows"
    assert {i["id"] for i in body["inputs"]} == set(report["artifact_ids"])
    assert body["python"] and body["upstream_commits"] and body["software"]
    assert body["agent_executions"] == [] and body["finalization"] is None
    # Identity-only projection: no scientific payloads leak through the summary.
    assert "blob_key" not in json.dumps(body["inputs"])


def test_corrupt_or_malformed_archives_fail_with_no_contents(exported):
    db, settings, data, client, report, job = exported
    store = LocalStore(settings.storage_root)
    store.path(report["blob_key"]).write_bytes(b"tampered")
    body = client.get(f"/api/v1/projects/p/reports/{report['id']}/summary").json()
    assert body["verification"] == {**body["verification"], "status": "failed", "reason": "Stored archive bytes do not match their recorded digest"}
    assert body["inputs"] == body["jobs"] == body["agent_executions"] == [] and body["scope"] is None
    assert body["scientific_replay"] == "not_run"

    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        archive.writestr("manifest.json", json.dumps({"schema_version": "2.0", "files": {}}))
    key = store.put(out.getvalue())
    with db.session.begin() as session:
        forged = save(session, Report(project_id="p", blob_key=key, sha256=key, artifact_ids=[]))
    body = client.get(f"/api/v1/projects/p/reports/{forged.id}/summary").json()
    assert body["verification"]["status"] == "failed" and body["verification"]["reason"].startswith("Structural verification failed")
    assert body["inputs"] == [] and body["manifest_version"] is None


def test_scope_kind_and_audience_are_enforced(exported):
    db, settings, data, client, report, job = exported
    assert client.get(f"/api/v1/projects/q/reports/{report['id']}/summary").status_code == 404
    assert client.get(f"/api/v1/projects/p/reports/{data.id}/summary").status_code in {404, 422}
    with db.session() as session, pytest.raises(DomainError) as caught:
        report_summary(session, LocalStore(settings.storage_root),
                       ReadScope("p", "agent", "run", frozenset({report["id"]}), frozenset()), report["id"])
    assert caught.value.error_code == "DATA_EXPOSURE_DENIED"


def test_agent_run_report_lists_execution_record_and_names_agent_versions(registry):  # noqa: F811
    tool, ctx, data, _ = registry
    step, scheduler, saver, provider = export_ready(registry)
    report = execute_job(tool)
    assert advance(scheduler, saver, step) == "completed"
    client = http(tool.settings)
    previews = client.get("/api/v1/projects/p/artifact-previews")
    assert previews.status_code == 200, previews.text
    kinds = {a["kind"] for a in previews.json()}
    assert {"agent_execution", "report"} <= kinds
    assert client.get("/api/v1/projects/p/artifacts").status_code == 200
    body = client.get(f"/api/v1/projects/p/reports/{report.id}/summary").json()
    assert body["verification"]["status"] == "verified" and body["scientific_replay"] == "not_run"
    assert body["scope"]["kind"] == "run" and body["scope"]["run_id"] == ctx.run_id
    assert body["scope"]["export_status_at_cutoff"] == "pending"
    [execution] = body["agent_executions"]
    assert execution["run_id"] == ctx.run_id and execution["versions"]["model"] == "model"
    assert execution["versions"]["prompt"] and execution["pending_finalization_action_ids"]
    assert body["finalization"]["execution_record_id"] == execution["execution_record_id"]
    assert data.id in {i["id"] for i in body["inputs"]}

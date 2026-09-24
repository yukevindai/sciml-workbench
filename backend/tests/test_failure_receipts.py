"""A07 manual failure submission and receipt reads over HTTP."""
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from sqlalchemy import func, select

from workbench.contracts import Audit, Benchmark, Split
from workbench.db import JobRow
from workbench.external_operations import run_import
from workbench.job_metadata import fail_claim
from workbench.recovery import recover_once
from workbench.services import save
from test_worker import runtime  # noqa: F401 - fixture
from test_external_operations import operation, public_runner  # noqa: F401 - fixture


def http(settings):
    from fastapi.testclient import TestClient
    from workbench.api import create_app
    client = TestClient(create_app(settings), raise_server_exceptions=False)
    client.headers["Authorization"] = "Bearer " + settings.api_token.get_secret_value()
    return client


def failure_jobs(db):
    with db.session() as session:
        return session.scalar(select(func.count()).select_from(JobRow).where(JobRow.kind == "failure"))


def test_repeated_and_concurrent_manual_submissions_create_one_job(runtime):  # noqa: F811
    db, settings, data = runtime
    with db.session.begin() as session:
        audit = save(session, Audit(project_id="p", dataset_id=data.id, config={}, result={}))
        split = save(session, Split(project_id="p", dataset_id=data.id, audit_id=audit.id,
                                    config={}, assignments=["train", "validation", "test"], result={}))
        run = save(session, Benchmark(project_id="p", dataset_id=data.id, split_id=split.id,
                                     model="mean", seed=0, status="failed", config={}))
    client = http(settings)
    body = {"benchmark_id": run.id, "reason": "Did not answer the question", "uncertainty_notes": "Synthetic"}
    post = lambda payload=body, key="draft-1": client.post("/api/v1/projects/p/failure", json=payload, headers={"Idempotency-Key": key})
    with ThreadPoolExecutor(2) as pool:
        first, second = pool.map(lambda _: post(), range(2))
    assert first.status_code == second.status_code == 202, (first.text, second.text)
    assert first.json()["id"] == second.json()["id"] == post().json()["id"]
    assert failure_jobs(db) == 1
    changed = post({**body, "reason": "Edited after submission"})
    assert changed.status_code == 409 and changed.json()["error_code"] == "IDEMPOTENCY_CONFLICT"
    assert failure_jobs(db) == 1
    assert post(key="draft-2").json()["id"] != first.json()["id"]
    assert failure_jobs(db) == 2


def test_job_index_keeps_unknown_distinct_and_reconciliation_preserves_the_failed_job(operation, monkeypatch):  # noqa: F811
    db, settings, claimed, work, deadline = operation
    original = httpx.AsyncClient.post
    lost = []

    async def lose_first(client, url, **kwargs):
        response = await original(client, url, **kwargs)
        if url.endswith("/import") and not lost:
            lost.append(response.json()["record"]["id"])
            raise httpx.ReadError("Lost after upstream commit")
        return response
    monkeypatch.setattr(httpx.AsyncClient, "post", lose_first)
    with pytest.raises(httpx.ReadError):
        run_import(db, settings, work, deadline, lambda: False, public_runner)
    fail_claim(db, claimed, error="Response lost", error_code="INTERNAL_ERROR")
    client = http(settings)

    def indexed():
        page = client.get("/api/v1/projects/p/job-index?kind=failure")
        assert page.status_code == 200, page.text
        [item] = page.json()["items"]
        return item
    unknown = indexed()
    assert unknown["id"] == work.job_id and unknown["state"] == "failed" and unknown["result_id"] is None
    receipt = unknown["external_receipt"]
    assert receipt["state"] == "unknown" and receipt["reconciliation_required"] is True
    assert receipt["external_id"] == work.job_id and receipt["attempts"] == 1
    assert receipt["external_record_id"] is None and receipt["artifact_id"] is None
    assert not [a for a in client.get("/api/v1/projects/p/artifact-previews").json() if a["kind"] == "failure"]

    assert recover_once(db, settings, runner=public_runner)
    confirmed = indexed()
    assert confirmed["state"] == "failed" and confirmed["result_id"] is None
    assert confirmed["error_code"] == unknown["error_code"] and confirmed["created_at"] == unknown["created_at"]
    receipt = confirmed["external_receipt"]
    assert receipt["state"] == "confirmed" and receipt["reconciliation_required"] is False
    assert receipt["external_id"] == work.job_id and receipt["external_record_id"] == lost[0] and receipt["attempts"] == 2
    assert receipt["request_sha256"] == unknown["external_receipt"]["request_sha256"]
    assert receipt["body_sha256"] == unknown["external_receipt"]["body_sha256"]
    published = client.get(f"/api/v1/projects/p/artifacts/{receipt['artifact_id']}").json()
    assert published["kind"] == "failure" and published["external_record_id"] == lost[0]
    assert client.get(f"/api/v1/projects/p/jobs/{work.job_id}").json() == confirmed

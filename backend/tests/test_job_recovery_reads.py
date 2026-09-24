"""A09 job reads: newest-first pages, agent-run links and D04 recovery decisions."""
from datetime import datetime, timezone

from fastapi.testclient import TestClient
import pytest

from workbench.api import create_app
from workbench.db import JobRow
from workbench.errors import DomainError
from workbench.job_metadata import claim_next, fail_claim
from workbench.projections import ReadScope, ReadService
from workbench.recovery import recover_once
from test_worker import runtime, queue
from test_tool_registry import registry
from test_metadata import old_db, db


def service(settings):
    return ReadService(settings.api_token.get_secret_value())


def test_newest_first_pages_are_stable_and_cursor_bound_to_order(runtime):
    db, settings, data = runtime
    stamp = datetime(2026, 9, 24, tzinfo=timezone.utc)
    with db.session.begin() as session:
        for index in range(5):
            session.add(JobRow(id=f"job-{index}", project_id="p", kind="audit", request_key=f"key-{index}",
                               payload={"dataset_id": data.id, "config": {}}, created_at=stamp.replace(minute=index % 3)))
    reads = service(settings)
    ids, cursor = [], None
    while True:
        with db.session() as session:
            page = reads.job_index(session, ReadScope("p"), limit=2, order="desc", after=cursor)
        ids.extend(item.id for item in page.items)
        cursor = page.next_cursor
        if not cursor:
            break
    # Minute ties break on the identifier, newest first.
    assert ids == ["job-2", "job-4", "job-1", "job-3", "job-0"]
    with db.session() as session:
        desc_cursor = reads.job_index(session, ReadScope("p"), limit=1, order="desc").next_cursor
        with pytest.raises(DomainError):
            reads.job_index(session, ReadScope("p"), limit=1, after=desc_cursor)
        with pytest.raises(DomainError):
            reads.job_index(session, ReadScope("p"), order="sideways")


def test_recovery_decisions_are_projected_without_rewriting_the_original(runtime):
    db, settings, _ = runtime
    retried = queue(runtime)
    fail_claim(db, claim_next(db, 30, "a"), error="Interrupted", error_code="WORKER_INTERRUPTED")
    rejected = queue(runtime, "rejected")
    fail_claim(db, claim_next(db, 30, "b"), error="Stop", error_code="ADMISSION_REJECTED")
    while recover_once(db, settings):
        pass
    reads = service(settings)
    with db.session() as session:
        page = {item.id: item for item in reads.job_index(session, ReadScope("p"), limit=100).items}
    original = page[retried]
    assert original.state == "failed" and original.error_code == "WORKER_INTERRUPTED"
    assert original.recovery.state == "completed" and original.recovery.eligible
    assert original.recovery.retry_job_id in page and page[original.recovery.retry_job_id].retry_of_job_id == retried
    assert original.recovery.next_attempt_at is None and original.run_links == []
    assert page[rejected].recovery.state == "exhausted" and not page[rejected].recovery.eligible
    assert page[rejected].recovery.retry_job_id is None
    assert page[original.recovery.retry_job_id].recovery is None


def test_agent_run_links_are_manual_context_only(registry):
    tool, ctx, data, _ = registry
    submitted = tool.dispatch(ctx, "run_audit", {"dataset_id": data.id})
    reads = service(tool.settings)
    with tool.db.session() as session:
        detail = reads.job(session, ReadScope("p"), submitted.job_id)
        indexed = reads.job_index(session, ReadScope("p"), order="desc").items[0]
        agent = reads.job(session, ReadScope("p", audience="agent", run_id=ctx.run_id, artifact_ids=frozenset(),
                                             job_ids=frozenset({submitted.job_id})), submitted.job_id)
    assert [(link.run_id, link.action_id, link.ownership) for link in detail.run_links] == [
        (ctx.run_id, submitted.action_id, "owned")]
    assert indexed.run_links == detail.run_links
    assert agent.run_links == [] and agent.recovery is None


def test_http_order_and_additive_fields(runtime):
    db, settings, _ = runtime
    first, second = queue(runtime, "first"), queue(runtime, "second")
    client = TestClient(create_app(settings))
    headers = {"Authorization": "Bearer " + settings.api_token.get_secret_value()}
    body = client.get("/api/v1/projects/p/job-index?order=desc&limit=1", headers=headers).json()
    assert [item["id"] for item in body["items"]] == [second]
    assert body["items"][0]["run_links"] == [] and body["items"][0]["recovery"] is None
    assert client.get("/api/v1/projects/p/job-index?order=random", headers=headers).status_code == 422
    assert client.get(f"/api/v1/projects/p/jobs/{first}", headers=headers).json()["run_links"] == []

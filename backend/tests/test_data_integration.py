"""B10 HTTP lifecycle across migrated storage, restart, ledgers and event replay."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from test_worker import runtime
from test_agent_runs import body
from workbench.agent_db import EventRow, RunRow, ReservationRow, ServerPolicyRow, ProjectPolicyRow
from workbench.agent_policy import AuthorityPolicy
from workbench.api import create_app
from workbench.budgets import BudgetService, Resources


def test_http_replay_restart_controls_and_persisted_counters(runtime):
    db, settings, _ = runtime
    policy = AuthorityPolicy(policy_id="b10", revision=1, project_ids={"p"}, provider_models={"model"})
    with db.session.begin() as s:
        s.add(ServerPolicyRow(revision=1, payload=policy.model_dump(mode="json")))
        s.add(ProjectPolicyRow(project_id="p", revision=1, payload=policy.model_dump(mode="json")))
    base = "/api/v1/projects/p/agent-runs"
    headers = {"Authorization": "Bearer " + settings.api_token.get_secret_value()}
    app = create_app(settings)
    app.state.runs.admission = lambda: None
    try:
        barrier = Barrier(4)
        def submit(_):
            with TestClient(app) as client:
                barrier.wait(timeout=15)
                response = client.post(base, headers={**headers, "Idempotency-Key": "create"},
                                       json=body().model_dump(mode="json"))
                assert response.status_code == 202, response.text
                return response.json()
        with ThreadPoolExecutor(max_workers=4) as pool:
            runs = list(pool.map(submit, range(4)))
        assert len({run["id"] for run in runs}) == 1
        rid = runs[0]["id"]
        with db.session.begin() as s:
            budgets = BudgetService(app.state.runs)
            budgets.reserve(s, "p", rid, "unknown-request", Resources(model_tokens=100, model_requests=1),
                request_sha256="a" * 64, expected_revision=1, claim_token=0, model="model")
            assert budgets.dispatch(s, "p", rid, "unknown-request")
    finally:
        app.state.db.engine.dispose()

    # Recreate the HTTP application and its connection pool; no in-memory authority survives.
    app = create_app(settings)
    app.state.runs.admission = lambda: None
    try:
        with TestClient(app, headers=headers) as client:
            replay = client.post(base, headers={"Idempotency-Key": "create"}, json=body().model_dump(mode="json"))
            assert replay.status_code == 202 and replay.json()["id"] == rid
            conflict = client.post(base, headers={"Idempotency-Key": "create"},
                json={**body().model_dump(mode="json"), "objective": "Changed"})
            assert conflict.status_code == 409
            path = base + "/" + rid
            revision = client.get(path).json()["run"]["control_revision"]
            for operation in ("pause", "resume", "cancel"):
                payload = {"expected_run_revision": revision}
                response = client.post(path + "/" + operation,
                    headers={"Idempotency-Key": operation}, json=payload)
                assert response.status_code == 200, response.text
                assert client.post(path + "/" + operation,
                    headers={"Idempotency-Key": operation}, json=payload).json() == response.json()
                revision = response.json()["control_revision"]
            assert client.post(path + "/resume", headers={"Idempotency-Key": "terminal"},
                json={"expected_run_revision": revision}).status_code == 409
            events = client.get(path + "/events").json()
            sequences = [event["sequence"] for event in events]
            assert sequences == list(range(1, len(events) + 1))
            assert client.get(path + "/events", params={"after": sequences[-2]}).json() == events[-1:]
            stream = client.get(path + "/stream", headers={"Last-Event-ID": str(sequences[-2])}).text
            assert f"id: {sequences[-1]}\n" in stream
            assert f"id: {sequences[-2]}\n" not in stream
            assert client.get(path.replace("projects/p/", "projects/foreign/") + "/events").status_code == 404
        with db.session() as s:
            run = s.get(RunRow, rid)
            assert run.state == "cancelled" and run.control_revision == revision
            assert run.event_sequence == sequences[-1] == len(events)
            assert s.scalar(select(func.count()).select_from(RunRow)) == 1
            assert s.scalar(select(func.count()).select_from(ReservationRow)) == 1
            persisted = s.scalars(select(EventRow).where(EventRow.run_id == rid).order_by(EventRow.sequence)).all()
            assert [event.payload for event in persisted] == events
            usage = BudgetService(app.state.runs).snapshot(s, "p", rid)
            assert usage.reserved_tokens == 100
            assert usage.unknown_request_ids == ["unknown-request"]
    finally:
        app.state.db.engine.dispose()

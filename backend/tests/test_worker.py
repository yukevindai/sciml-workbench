"""D03 metadata/process handoff acceptance on SQLite and PostgreSQL."""

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import json
import os
from pathlib import Path
import subprocess
import sys
from threading import Barrier, Lock
import time
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import make_url

from workbench import adapters, worker
from workbench.api import create_app
from workbench.config import Settings
from workbench.contracts import Audit, Source
from workbench.db import ArtifactRow, Base, Database, JobRow, ProjectRow
from workbench.execution import TaskResult
from workbench.job_metadata import JobClaim, StaleClaim, claim_next, database_now, fail_claim, submit_job
from workbench.services import upload_csv
from workbench.storage import LocalStore


@pytest.fixture(params=["sqlite", "postgresql"])
def runtime(request, tmp_path):
    admin = None
    if request.param == "postgresql":
        url = os.environ.get("TEST_DATABASE_URL")
        if not url:
            pytest.skip("Set TEST_DATABASE_URL for PostgreSQL runtime acceptance")
        admin = create_engine(url)
        schema = "d03_" + uuid4().hex
        with admin.begin() as connection:
            connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
        url = make_url(url).update_query_dict({"options": f"-csearch_path={schema}"}).render_as_string(hide_password=False)
    else:
        url = f"sqlite:///{tmp_path}/metadata.sqlite"
    settings = Settings(_env_file=None, database_url=url, storage_root=tmp_path / "files",
                        api_token="a" * 48, efm_password="b" * 24)
    db = Database(url)
    try:
        Base.metadata.create_all(db.engine)
        with db.session.begin() as session:
            session.add(ProjectRow(id="p", name="Runtime"))
        with db.session.begin() as session:
            data = upload_csv(session, LocalStore(settings.storage_root), settings, "p", b"x,y\n1,2\n3,4\n5,6\n", "input.csv",
                              Source(citation="Synthetic fixture", license="CC0", data_kind="synthetic", transformations="Generated"))
        yield db, settings, data
    finally:
        db.engine.dispose()
        if admin is not None:
            with admin.begin() as connection:
                connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
            admin.dispose()


def queue(runtime, key=None):
    db, _, data = runtime
    with db.session.begin() as session:
        return submit_job(session, "p", "audit", {"dataset_id": data.id, "config": {}}, key or uuid4().hex).id


def result_for(work):
    return TaskResult(artifact=Audit(id=work.result_id, project_id=work.project_id,
                                     parents=[work.payload["dataset_id"]], dataset_id=work.payload["dataset_id"],
                                     config=work.payload["config"], result={"test": "fencing fixture"}).model_dump(mode="json"))


def outcome(db, job_id):
    with db.session() as session:
        row = session.get(JobRow, job_id)
        audits = session.scalar(select(func.count()).select_from(ArtifactRow).where(ArtifactRow.kind == "audit"))
        return row, audits


def test_lost_claim_stops_supervised_process_without_publishing(runtime, monkeypatch):
    from workbench.publication import fence_cancelled
    from workbench.processes import run_bounded, ProcessInterrupted
    db, settings, _ = runtime
    jid = queue(runtime)
    claimed = claim_next(db, 30, 'worker')
    def cancelled_task(settings, work, deadline, stopped):
        assert not stopped()
        with db.session.begin() as s:
            assert fence_cancelled(s, 'p', claimed)
        started = time.monotonic()
        with pytest.raises(ProcessInterrupted):
            run_bounded([sys.executable, '-c', 'import time; time.sleep(30)'],
                        deadline, stopped=stopped, grace=0.2)
        assert time.monotonic() - started < 5
        raise ProcessInterrupted()
    monkeypatch.setattr(worker, 'run_task', cancelled_task)
    worker.process_job(settings, claimed, db=db)
    row, count = outcome(db, jid)
    assert row.state == 'failed' and row.error_code == 'RUN_CANCELLED'
    assert count == 0


def test_real_subprocess_has_no_metadata_transaction_or_credentials(runtime, monkeypatch):
    db, settings, _ = runtime
    job_id = queue(runtime)
    claimed = claim_next(db, 30, "worker")
    original = worker.run_bounded
    observed = []

    def inspect_launch(command, deadline, **kwargs):
        assert db.engine.pool.checkedout() == 0
        env = kwargs["env"]
        assert not {"WB_DATABASE_URL", "TEST_DATABASE_URL", "WB_API_TOKEN", "ANTHROPIC_API_KEY", "WB_LOGIN_PASSWORD"} & env.keys()
        request = json.loads((Path(command[3]) / "input.json").read_text())
        assert set(request["settings"]) == {"storage_root"}
        assert "claim_token" not in request["work"]
        observed.append(True)
        return original(command, deadline, **kwargs)

    monkeypatch.setattr(worker, "run_bounded", inspect_launch)
    worker.process_job(settings, claimed, db=db)
    row, audits = outcome(db, job_id)
    assert row.state == "succeeded" and audits == 1 and observed == [True]
    assert not list((settings.storage_root / "workspaces").iterdir())
    with db.session() as session:
        provenance = session.scalars(select(ArtifactRow).where(ArtifactRow.kind == "provenance")).all()
        assert sum(row.result_id in p.payload["outputs"] for p in provenance) == 1


def test_http_only_queues_and_a_new_worker_consumes_durable_work(runtime, monkeypatch):
    db, settings, data = runtime
    app = create_app(settings)
    try:
        with monkeypatch.context() as patch, TestClient(app) as client:
            def forbidden(*args, **kwargs):
                pytest.fail("HTTP handler must not run science")
            for name in ("run_audit", "run_split", "run_benchmark", "ingest_pdf"):
                patch.setattr(adapters, name, forbidden)
            patch.setattr(worker, "run_task", forbidden)
            client.headers["Authorization"] = "Bearer " + settings.api_token.get_secret_value()
            response = client.post("/api/v1/projects/p/audit", json={"dataset_id": data.id, "config": {}},
                                   headers={"Idempotency-Key": "durable-http"})
            assert response.status_code == 202
            job_id = response.json()["id"]
            assert outcome(db, job_id)[0].state == "queued"
    finally:
        app.state.db.engine.dispose()
    db.engine.dispose()  # Close the submitting worker/client's connections.
    replacement = Database(settings.database_url)
    try:
        claimed = claim_next(replacement, 30, "replacement")
        assert claimed.job_id == job_id
        worker.process_job(settings, claimed, db=replacement)
        assert outcome(replacement, job_id)[0].state == "succeeded"
    finally:
        replacement.engine.dispose()


def test_competing_workers_execute_each_queued_job_once(runtime, monkeypatch):
    db, settings, _ = runtime
    if db.engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL competing worker semantics")
    ids = [queue(runtime) for _ in range(4)]
    barrier, lock, seen = Barrier(2), Lock(), []
    original = worker.run_task

    def track(settings, work, deadline, stopped):
        with lock:
            seen.append(work.job_id)
        return original(settings, work, deadline, stopped)

    monkeypatch.setattr(worker, "run_task", track)

    def consume(index):
        local = Database(settings.database_url)
        try:
            barrier.wait(timeout=15)
            while claimed := claim_next(local, 30, f"worker-{index}"):
                worker.process_job(settings, claimed, db=local)
        finally:
            local.engine.dispose()

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(consume, range(2)))
    assert Counter(seen) == Counter(ids)
    assert all(outcome(db, job_id)[0].state == "succeeded" for job_id in ids)
    assert outcome(db, ids[0])[1] == 4


def test_remaining_deadline_is_not_replaced_by_current_config(runtime, monkeypatch):
    db, settings, _ = runtime
    job_id = queue(runtime)
    claimed = claim_next(db, 3, "worker")
    time.sleep(0.2)
    settings.job_timeout_seconds = 9000

    def finish(settings, work, deadline, stopped):
        assert 0 < deadline - time.monotonic() < 2.9
        return result_for(work)

    monkeypatch.setattr(worker, "run_task", finish)
    worker.process_job(settings, claimed, db=db)
    row, _ = outcome(db, job_id)
    assert row.state == "succeeded"
    assert (row.deadline_at - row.started_at).total_seconds() == 3


def test_expired_claim_never_launches_or_adopts_a_new_deadline(runtime, monkeypatch):
    db, settings, data = runtime
    with db.session.begin() as session:
        stamp = database_now(session)
        row = JobRow(id="expired", project_id="p", request_key="expired", kind="audit", payload={"dataset_id": data.id, "config": {}},
                     state="running", claim_token=1, worker_id="old", started_at=stamp - timedelta(seconds=10),
                     deadline_at=stamp - timedelta(seconds=1))
        session.add(row)
    monkeypatch.setattr(worker, "run_task", lambda *args: pytest.fail("Expired work must not launch"))
    worker.process_job(settings, JobClaim("expired", 1, "old"), db=db)
    row, audits = outcome(db, "expired")
    assert row.error_code == "JOB_TIMED_OUT" and audits == 0


def test_replacement_worker_preserves_live_claim_and_can_take_other_work(runtime):
    db, _, _ = runtime
    first = queue(runtime)
    original = claim_next(db, 30, "original")
    assert claim_next(db, 9000, "replacement") is None
    before, _ = outcome(db, first)
    second = queue(runtime)
    replacement = claim_next(db, 9000, "replacement")
    after, _ = outcome(db, first)
    assert replacement.job_id == second
    assert after.state == "running" and after.claim_token == original.token
    assert after.worker_id == "original" and after.deadline_at == before.deadline_at


@pytest.mark.skipif(os.name != "posix", reason="Linux/WSL worker signal runtime")
def test_main_shutdown_interrupts_current_job_without_claiming_next(runtime, tmp_path):
    db, settings, _ = runtime
    ids = [queue(runtime), queue(runtime)]
    ready = tmp_path / "compute-ready"
    # Synthetic stubborn computation exercises the real main loop, signal
    # handler, bounded process wait and metadata failure path.
    command = [sys.executable, "-c", (
        "import signal,time,pathlib; signal.signal(signal.SIGTERM,signal.SIG_IGN); "
        f"pathlib.Path({str(ready)!r}).touch(); time.sleep(60)"
    )]
    script = (
        "from workbench import worker; from workbench.config import Settings\n"
        "worker.load_settings = lambda: Settings(_env_file=None)\n"
        "def compute(settings, work, deadline, stopped):\n"
        f"    worker.run_bounded({command!r}, deadline, stopped=stopped, grace=.2)\n"
        "worker.run_task = compute\nworker.main()\n"
    )
    env = dict(os.environ, WB_DATABASE_URL=settings.database_url,
               WB_STORAGE_ROOT=str(settings.storage_root), WB_API_TOKEN="a" * 48,
               WB_EFM_PASSWORD="b" * 24, WB_JOB_TIMEOUT_SECONDS="30", WB_AGENTS_ENABLED="0")
    child = subprocess.Popen([sys.executable, "-c", script], env=env)
    try:
        end = time.monotonic() + 20
        while not ready.exists() and child.poll() is None and time.monotonic() < end:
            time.sleep(.02)
        assert ready.exists(), "Worker did not start computation"
        child.terminate()
        assert child.wait(timeout=8) == 0
        rows = [outcome(db, job_id)[0] for job_id in ids]
        assert sorted(row.state for row in rows) == ["failed", "queued"]
        assert next(row for row in rows if row.state == "failed").error_code == "WORKER_INTERRUPTED"
        assert outcome(db, ids[0])[1] == 0
    finally:
        if child.poll() is None:
            child.terminate()
            child.wait(timeout=8)


@pytest.mark.parametrize("late", ["deadline", "fence", "shutdown"])
def test_late_result_is_not_published(runtime, monkeypatch, late):
    db, settings, _ = runtime
    job_id = queue(runtime)
    claimed = claim_next(db, 1 if late == "deadline" else 30, "worker")
    stopping = []

    def late_result(settings, work, deadline, stopped):
        if late == "deadline":
            time.sleep(max(0, deadline - time.monotonic()) + 0.03)
        elif late == "fence":
            fail_claim(db, claimed, error="Already interrupted", error_code="WORKER_INTERRUPTED")
        else:
            stopping.append(True)
        return result_for(work)

    monkeypatch.setattr(worker, "run_task", late_result)
    worker.process_job(settings, claimed, db=db, stopped=lambda: bool(stopping))
    row, audits = outcome(db, job_id)
    assert row.state == "failed" and row.result_id is None and audits == 0
    assert row.error_code == ("JOB_TIMED_OUT" if late == "deadline" else "WORKER_INTERRUPTED")


def test_publication_rollback_keeps_no_result_or_provenance(runtime, monkeypatch):
    db, settings, _ = runtime
    job_id = queue(runtime)
    claimed = claim_next(db, 30, "worker")
    from workbench import publication
    original = publication.finish_claim

    def reject_after_flush(*args, **kwargs):
        original(*args, **kwargs)
        raise ValueError("Injected publication rollback")

    monkeypatch.setattr(worker, "run_task", lambda settings, work, *args: result_for(work))
    monkeypatch.setattr(publication, "finish_claim", reject_after_flush)
    worker.process_job(settings, claimed, db=db)
    row, audits = outcome(db, job_id)
    assert row.state == "failed" and row.result_id is None and audits == 0
    with db.session() as session:
        assert session.scalar(select(func.count()).select_from(ArtifactRow)) == 2  # Dataset + intake provenance only.


def test_result_waiting_for_publication_lock_cannot_pass_deadline(runtime):
    db, _, _ = runtime
    if db.engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL publication lock wait")
    job_id = queue(runtime)
    claimed = claim_next(db, 1, "worker")
    work, deadline = worker.prepare_claim(db, claimed)
    with ThreadPoolExecutor(max_workers=1) as pool:
        with db.session.begin() as session:
            session.execute(select(JobRow).where(JobRow.id == job_id).with_for_update()).scalar_one()
            pending = pool.submit(worker.publish_result, db, claimed, work, result_for(work))
            time.sleep(max(0, deadline - time.monotonic()) + 0.1)
        with pytest.raises(StaleClaim):
            pending.result(timeout=5)
    assert outcome(db, job_id)[1] == 0


@pytest.mark.parametrize("payload", [b"not-json-private-canary", b"{}", b'{"error":"secret"}', b'{"artifact":{},"error":"x","error_code":"INTERNAL_ERROR"}'])
def test_invalid_child_protocol_is_bounded_and_redacted(tmp_path, payload):
    path = tmp_path / "output.json"
    path.write_bytes(payload)
    with pytest.raises(worker.TaskFailure, match="valid bounded result") as error:
        worker.read_result(path)
    assert "secret" not in str(error.value) and "canary" not in str(error.value)


def test_oversized_child_protocol_is_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(worker, "MAX_RESULT_BYTES", 32)
    path = tmp_path / "output.json"
    path.write_bytes(b"x" * 33)
    with pytest.raises(worker.TaskFailure):
        worker.read_result(path)


def test_job_id_is_not_publication_authority():
    with pytest.raises(TypeError, match="original JobClaim"):
        worker.process_job(None, "job-id")

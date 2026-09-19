import hashlib
import io
import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from reportlab.pdfgen.canvas import Canvas
from workbench.api import create_app
from workbench.config import Settings
from workbench.contracts import Dataset
from workbench.db import Base, JobRow
from workbench.replay import replay
from workbench.storage import LocalStore
from workbench.worker import claim, process_job

EXAMPLES = Path(__file__).resolve().parents[2] / "examples"


def fixture(name):
    return json.loads((EXAMPLES / f"{name}.json").read_text())


@pytest.fixture
def env(tmp_path):
    settings = Settings(
        database_url=os.environ.get(
            "TEST_DATABASE_URL", f"sqlite:///{tmp_path}/metadata.sqlite"
        ),
        storage_root=tmp_path / "files",
        api_token="a" * 48,
        efm_password="a-strong-test-password",
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.db.engine)
    settings.storage_root.mkdir(exist_ok=True)
    base = [
        sys.executable,
        "-m",
        "failure_memory.cli",
        "--database",
        str(settings.storage_root / "failure-memory.sqlite"),
    ]
    subprocess.run(base + ["init"], check=True, capture_output=True)
    subprocess.run(
        base
        + [
            "create-user",
            "workbench",
            "--display-name",
            "Test",
            "--password-env",
            "TEST_EFM_PASS",
        ],
        env={**os.environ, "TEST_EFM_PASS": settings.efm_password.get_secret_value()},
        check=True,
        capture_output=True,
    )
    with TestClient(app) as client:
        client.headers["Authorization"] = "Bearer " + "a" * 48
        yield client, app.state.db, settings
    app.state.db.engine.dispose()


def create(client):
    r = client.post(
        "/api/v1/projects",
        json={"name": "Workflow test", "description": "Synthetic only"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def upload(client, pid):
    r = client.post(
        f"/api/v1/projects/{pid}/datasets",
        content=(EXAMPLES / "demo.csv").read_bytes(),
        headers={"X-Filename": "demo.csv", "X-Source": json.dumps(fixture("source"))},
    )
    assert r.status_code == 201, r.text
    return r.json()


def run(env, pid, kind, payload=None, key=None):
    client, db, settings = env
    r = client.post(
        f"/api/v1/projects/{pid}/{kind}",
        json=payload or {},
        headers={"Idempotency-Key": key or os.urandom(12).hex()},
    )
    assert r.status_code == 202, r.text
    claimed = claim(db, 900)
    job_id = claimed.job_id
    assert job_id == r.json()["id"]
    process_job(settings, claimed)
    with db.session() as s:
        job = s.get(JobRow, job_id)
        if job.result_id:
            a = client.get(f"/api/v1/projects/{pid}/artifacts/{job.result_id}")
            assert a.status_code == 200
            return a.json()
        pytest.fail(job.error)


def test_full_real_upstream_workflow(env, tmp_path):
    client, db, settings = env
    pid = create(client)
    data = upload(client, pid)
    audited = run(
        env, pid, "audit", {"dataset_id": data["id"], "config": fixture("audit")}
    )
    part = run(
        env,
        pid,
        "split",
        {
            "dataset_id": data["id"],
            "audit_id": audited["id"],
            "config": fixture("split"),
        },
    )
    assert set(part["assignments"]) == {"train", "validation", "test"}
    # All three rows in each synthetic family must remain together.
    for i in range(0, 60, 3):
        assert len(set(part["assignments"][i : i + 3])) == 1
    args = {**fixture("benchmark"), "dataset_id": data["id"], "split_id": part["id"]}
    baseline = run(env, pid, "benchmark", args)
    assert baseline["status"] == "succeeded", baseline["error"]
    assert baseline["result"]["metrics"]["test"]["group_mae"] >= 0
    failed = run(env, pid, "benchmark", {**args, "units": {}})
    assert failed["status"] == "failed" and failed["error"]
    memory = run(
        env,
        pid,
        "failure",
        {
            "benchmark_id": failed["id"],
            "reason": "Task units were incomplete.",
            "uncertainty_notes": "Admission failure, not a physical experiment.",
        },
    )
    assert (
        memory["external_record_id"]
        and memory["record"]["record"]["status"] == "failed"
    )
    # Also allow user-declared unsuccessful scientific outcomes for completed models.
    assessment = run(
        env,
        pid,
        "failure",
        {
            "benchmark_id": baseline["id"],
            "reason": "Toy model is not scientifically usable.",
            "uncertainty_notes": "Synthetic data only.",
        },
    )
    assert assessment["external_record_id"] != memory["external_record_id"]
    pdf = io.BytesIO()
    canvas = Canvas(pdf)
    canvas.drawString(70, 700, "Synthetic source document")
    canvas.save()
    r = client.post(
        f"/api/v1/projects/{pid}/evidence",
        content=pdf.getvalue(),
        headers={"X-Title": "Toy source", "Idempotency-Key": "paper"},
    )
    assert r.status_code == 202
    process_job(settings, claim(db, 900))
    report = run(env, pid, "report")
    download = client.get(f"/api/v1/projects/{pid}/artifacts/{report['id']}/download")
    assert download.status_code == 200
    assert hashlib.sha256(download.content).hexdigest() == report["sha256"]
    archive = tmp_path / "report.zip"
    archive.write_bytes(download.content)
    with zipfile.ZipFile(archive) as z:
        manifest = json.loads(z.read("manifest.json"))
        for name, digest in manifest["files"].items():
            assert hashlib.sha256(z.read(name)).hexdigest() == digest
        records = json.loads(z.read("artifacts.json"))
        assert {
            "dataset",
            "audit",
            "split",
            "benchmark",
            "failure",
            "evidence",
            "provenance",
        } <= {x["kind"] for x in records}
        assert b"a-strong-test-password" not in z.read("artifacts.json")
    replay(archive, tmp_path / "replayed")
    assert (tmp_path / "replayed" / f"{baseline['id']}.json").exists()


def test_auth_project_boundaries_validation_and_idempotency(env):
    client, db, settings = env
    assert (
        client.get("/api/v1/projects", headers={"Authorization": "wrong"}).status_code
        == 401
    )
    a, b = create(client), create(client)
    data = upload(client, a)
    assert client.get(f"/api/v1/projects/{b}/artifacts/{data['id']}").status_code == 404
    assert (
        client.post(
            f"/api/v1/projects/{b}/audit",
            json={"dataset_id": data["id"], "config": {}},
            headers={"Idempotency-Key": "x"},
        ).status_code
        == 404
    )
    payload = {"dataset_id": data["id"], "config": {}}
    one = client.post(
        f"/api/v1/projects/{a}/audit", json=payload, headers={"Idempotency-Key": "same"}
    )
    two = client.post(
        f"/api/v1/projects/{a}/audit", json=payload, headers={"Idempotency-Key": "same"}
    )
    assert one.json()["id"] == two.json()["id"]
    conflict = client.post(
        f"/api/v1/projects/{a}/audit",
        json={**payload, "config": {"target_column": "wrong"}},
        headers={"Idempotency-Key": "same"},
    )
    assert conflict.status_code == 409
    assert (
        client.post(
            f"/api/v1/projects/{a}/report", headers={"Idempotency-Key": "report"}
        ).status_code
        == 409
    )
    process_job(settings, claim(db, 900))
    assert claim(db, 900) is None
    bad = client.post(
        f"/api/v1/projects/{a}/datasets",
        content=b"a,a\n1,2\n3,4\n5,6",
        headers={"X-Source": json.dumps(fixture("source"))},
    )
    assert bad.status_code == 422
    # Untrusted values are not reflected by Pydantic validation errors.
    err = client.post("/api/v1/projects", json={"name": "abc", "secret": "do-not-echo"})
    assert err.status_code == 422 and "do-not-echo" not in err.text


def test_wrong_dataset_lineage_and_failed_jobs(env):
    client, db, settings = env
    pid = create(client)
    a, b = upload(client, pid), upload(client, pid)
    audited = run(env, pid, "audit", {"dataset_id": a["id"], "config": {}})
    response = client.post(
        f"/api/v1/projects/{pid}/split",
        json={
            "dataset_id": b["id"],
            "audit_id": audited["id"],
            "config": fixture("split"),
        },
        headers={"Idempotency-Key": "bad-lineage"},
    )
    assert response.status_code == 422
    response = client.post(
        f"/api/v1/projects/{pid}/split",
        json={
            "dataset_id": a["id"],
            "audit_id": audited["id"],
            "config": {"strategy": "invented"},
        },
        headers={"Idempotency-Key": "bad-config"},
    )
    assert response.status_code == 202
    process_job(settings, claim(db, 900))
    with db.session() as s:
        job = s.get(JobRow, response.json()["id"])
        assert job.state == "failed" and job.error


def test_storage_integrity_and_schema(tmp_path):
    store = LocalStore(tmp_path)
    key = store.put(b"original")
    assert store.get(key) == b"original"
    with pytest.raises(ValueError):
        store.get("../escape")
    store.path(key).write_bytes(b"tampered")
    with pytest.raises(ValueError):
        store.get(key)
    with pytest.raises(ValueError):
        Dataset(schema_version="2.0", project_id="p")


def test_crashed_worker_recovery(env):
    from datetime import timedelta
    from workbench.contracts import now

    client, db, settings = env
    pid = create(client)
    with db.session.begin() as s:
        j = JobRow(
            project_id=pid,
            request_key="crashed",
            kind="audit",
            payload={},
            state="running",
            started_at=now() - timedelta(hours=1),
            deadline_at=now() - timedelta(minutes=45),
            claim_token=1,
            worker_id="crashed-test-worker",
        )
        s.add(j)
        s.flush()
        jid = j.id
    assert claim(db, 10) is None
    with db.session() as s:
        assert s.get(JobRow, jid).state == "failed"


def test_postgres_workers_claim_distinct_jobs(env):
    from concurrent.futures import ThreadPoolExecutor

    client, db, settings = env
    if db.engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL SKIP LOCKED")
    pid = create(client)
    with db.session.begin() as s:
        for i in range(6):
            s.add(
                JobRow(
                    project_id=pid,
                    request_key=f"parallel-{i}",
                    kind="report",
                    payload={},
                )
            )
    with ThreadPoolExecutor(max_workers=6) as pool:
        claimed = list(pool.map(lambda _: claim(db, 900), range(6)))
    assert len(set(claimed)) == 6 and None not in claimed
    for entry in claimed:
        with db.session.begin() as s:
            s.get(JobRow, entry.job_id).state = "failed"

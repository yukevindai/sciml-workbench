"""B03 intake, ownership, retry, compatibility and replay acceptance."""
import hashlib
import io
import json
from pathlib import Path
import zipfile
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, func, update
from sqlalchemy.exc import IntegrityError
from workbench.api import create_app
from workbench.config import Settings
from workbench.db import ArtifactRow, MaterialRow, JobRow
from workbench import adapters, intake, services
from workbench.contracts import uid
from workbench.execution import Work
from workbench.replay import replay
from workbench.scientific_contracts import SourceDeclarations
from workbench.storage import LocalStore
from test_metadata import old_db, db, migrate, database_url

RAW = b'\xef\xbb\xbf x ,target\r\n1,2\r\n2,3\r\n3,4\r\n'
EXAMPLES = Path(__file__).resolve().parents[2] / "examples"


@pytest.fixture
def api(tmp_path, db):
    settings = Settings(_env_file=None, database_url=database_url(db), storage_root=tmp_path / "blobs",
                        api_token="a" * 48, efm_password="b" * 24)
    app = create_app(settings)
    with TestClient(app) as client:
        client.headers["Authorization"] = "Bearer " + "a" * 48
        pid = client.post("/api/v1/projects", json={"name": "Intake"}).json()["id"]
        yield client, app, settings, pid
    app.state.db.engine.dispose()


def attach(client, pid, raw=RAW, key="attachment", **headers):
    return client.post(f"/api/v1/projects/{pid}/research-materials", content=raw,
                       headers={"Content-Type": "text/csv", "X-Filename": "data.csv", "Idempotency-Key": key, **headers})


def test_unknown_csv_exact_bytes_retry_and_scoped_ownership(api):
    client, app, _, pid = api
    first = attach(client, pid)
    assert first.status_code == 201, first.text
    binding = first.json()
    assert "blob_key" not in binding and "request_key" not in binding
    assert attach(client, pid).json() == binding
    assert attach(client, pid, RAW + b"4,5\r\n").status_code == 409
    assert attach(client, pid, **{"X-Filename": "changed.csv"}).status_code == 409
    another = attach(client, pid, key="deliberate-copy").json()
    assert another["dataset_id"] != binding["dataset_id"]
    data = client.get(f"/api/v1/projects/{pid}/artifacts/{binding['dataset_id']}").json()
    assert data["schema_version"] == "2.0"
    assert data["columns"] == [" x ", "target"]
    assert data["sha256"] == hashlib.sha256(RAW).hexdigest()
    assert set(data["unresolved_fields"]) == set(SourceDeclarations.model_fields)
    assert all(v["origin"] == "unknown" and v["value"] is None for v in data["source"].values())
    assert client.get(f"/api/v1/projects/{pid}/research-materials/{binding['id']}/download").content == RAW
    other_pid = client.post("/api/v1/projects", json={"name": "Other"}).json()["id"]
    other = attach(client, other_pid).json()
    assert other["sha256"] == binding["sha256"] and other["dataset_id"] != binding["dataset_id"]
    assert client.get(f"/api/v1/projects/{other_pid}/artifacts/{binding['dataset_id']}").status_code == 404
    assert client.get(f"/api/v1/projects/{other_pid}/research-materials/{binding['id']}/download").status_code == 404
    with app.state.db.session.begin() as session:
        with pytest.raises(IntegrityError), session.begin_nested():
            session.execute(update(MaterialRow).where(MaterialRow.id == binding["id"]).values(filename="rewrite.csv"))


@pytest.mark.parametrize("raw", [b"", b"a,a\n1,2\n2,3\n3,4", b"a\n1\n2", b"a,b\n1\n2\n3", b'a\n"unterminated', b"a\n\xff\n2\n3", b"a\n\x00\n2\n3", b"a\n\n2\n3"])
def test_bad_csv_safe_and_no_metadata(api, raw):
    client, app, _, pid = api
    response = attach(client, pid, raw)
    assert response.status_code == 422, response.text
    assert response.json()["error_code"] == "VALIDATION_FAILED"
    with app.state.db.session() as session:
        assert session.scalar(select(func.count()).select_from(MaterialRow)) == 0
        assert session.scalar(select(func.count()).select_from(ArtifactRow)) == 0


def test_limits_and_declarations(api):
    client, _, settings, pid = api
    settings.max_rows = 3
    assert attach(client, pid, RAW + b"4,5\r\n").status_code == 422
    source = {"target": {"origin": "user_supplied", "value": "missing",
                         "supporting_references": [{"kind": "operator_assertion", "id": "assertion"}]}}
    assert attach(client, pid, **{"X-Source": json.dumps(source)}).status_code == 422
    source["target"]["value"] = "target"
    response = attach(client, pid, **{"X-Source": json.dumps(source)})
    assert response.status_code == 201, response.text
    data = client.get(f"/api/v1/projects/{pid}/artifacts/{response.json()['dataset_id']}").json()
    assert data["source"]["target"]["origin"] == "user_supplied" and "target" not in data["unresolved_fields"]
    settings.max_upload_bytes = 10
    assert attach(client, pid).status_code == 413


def test_legacy_route_optional_source_and_preserved_legacy_writer(api):
    client, _, _, pid = api
    url = f"/api/v1/projects/{pid}/datasets"
    assert client.post(url, content=RAW).json()["schema_version"] == "2.0"
    legacy = client.post(url, content=RAW, headers={"X-Source": (EXAMPLES / "source.json").read_text()})
    assert legacy.status_code == 201 and legacy.json()["schema_version"] == "1.0"
    assert len(client.get(f"/api/v1/projects/{pid}/artifacts").json()) == 4


def test_pdf_preserved_before_ingestion_and_report(api, tmp_path):
    client, app, _, pid = api
    assert attach(client, pid, b"invalid", **{"Content-Type": "application/pdf"}).status_code == 422
    raw = b"%PDF-1.4\ninvalid document; parsing is deferred to bounded worker"
    response = attach(client, pid, raw, **{"Content-Type": "application/pdf", "X-Filename": "source.pdf"})
    assert response.status_code == 201, response.text
    material = response.json()
    assert material["dataset_id"] is None
    assert client.get(f"/api/v1/projects/{pid}/research-materials/{material['id']}/download").content == raw
    url = f"/api/v1/projects/{pid}/research-materials/{material['id']}/ingest"
    job = client.post(url, headers={"Idempotency-Key": "ingest"})
    assert job.status_code == 202
    assert client.post(url, headers={"Idempotency-Key": "ingest"}).json() == job.json()
    from workbench.worker import claim, process_job
    process_job(api[2], claim(app.state.db, 30))
    with app.state.db.session() as session:
        failed = session.get(JobRow, job.json()["id"])
        assert failed.state == "failed" and failed.result_id is None
    with app.state.db.session() as session:
        bundle, _ = services.report_bundle(services.capture_report(session, pid), app.state.store)
    with zipfile.ZipFile(io.BytesIO(bundle)) as z:
        assert z.read(f"blobs/{material['sha256']}") == raw
        assert json.loads(z.read("materials.json"))[0]["id"] == material["id"]


@pytest.mark.parametrize("declared", [False, True])
def test_v2_real_audit_benchmark_admission_and_replay(api, tmp_path, declared):
    client, app, settings, pid = api
    raw = (EXAMPLES / "demo.csv").read_bytes()
    source = json.loads((EXAMPLES / "source.json").read_text())
    declarations = {name: {"origin": "user_supplied", "value": [value] if name == "transformations" else value,
                            "supporting_references": [{"kind": "operator_assertion", "id": "test-assertion"}]}
                    for name, value in source.items()}
    binding = attach(client, pid, raw, **({"X-Source": json.dumps(declarations)} if declared else {})).json()
    aid = binding["dataset_id"]
    with app.state.db.session() as session:
        dataset = services.artifact(session, pid, aid)
        data = dataset.model_dump(mode="json")
    config = json.loads((EXAMPLES / "audit.json").read_text())
    work = Work(job_id=uid(), result_id=uid(), project_id=pid, kind="audit",
                payload={"dataset_id": aid, "config": config}, artifacts={aid: data})
    result = services.execute(app.state.store, settings, work)
    assert isinstance(result.result["findings"], list)
    part = services.execute(app.state.store, settings, Work(job_id=uid(), result_id=uid(), project_id=pid,
        kind="split", payload={"dataset_id": aid, "audit_id": result.id, "config": json.loads((EXAMPLES / "split.json").read_text())},
        artifacts={aid: data}))
    baseline = services.execute(app.state.store, settings, Work(job_id=uid(), result_id=uid(), project_id=pid,
        kind="benchmark", payload={**json.loads((EXAMPLES / "benchmark.json").read_text()), "dataset_id": aid, "split_id": part.id},
        artifacts={aid: data, part.id: part.model_dump(mode="json"), result.id: result.model_dump(mode="json")}))
    assert baseline.status == ("succeeded" if declared else "failed"), baseline.error
    if not declared:
        with pytest.raises(ValueError, match="resolved source declarations"):
            adapters.benchmark_source(dataset)
        assert baseline.error == "Task could not complete. Inspect the job error code and retained inputs."
        assert baseline.bundle_key is None
    with app.state.db.session.begin() as session:
        services.save(session, result)
        services.save(session, part)
        services.save(session, baseline)
    with app.state.db.session() as session:
        bundle, _ = services.report_bundle(services.capture_report(session, pid), app.state.store)
    archive = tmp_path / "report.zip"
    archive.write_bytes(bundle)
    replay(archive, tmp_path / "replayed")
    assert (tmp_path / "replayed" / f"{result.id}.json").is_file()


@pytest.mark.parametrize("conflict", [False, True])
def test_concurrent_binding(db, tmp_path, conflict):
    if db.engine.dialect.name != "postgresql":
        pytest.skip("Concurrent writer arbitration requires PostgreSQL")
    settings = Settings(_env_file=None, database_url="sqlite://", api_token="a" * 48, efm_password="b" * 24)
    store = LocalStore(tmp_path / "files")
    barrier = Barrier(6)
    def write(index):
        barrier.wait()
        with db.session.begin() as session:
            try:
                return intake.attach(session, store, settings, "p", RAW, f"{index if conflict else 'data'}.csv", "text/csv", None, "same").id
            except services.DomainError as exc:
                assert exc.status == 409
                return None
    with ThreadPoolExecutor(max_workers=6) as pool:
        ids = list(pool.map(write, range(6)))
    assert len({value for value in ids if value}) == 1
    assert ids.count(None) == (5 if conflict else 0)
    with db.session() as session:
        assert session.scalar(select(func.count()).select_from(MaterialRow)) == 1
        assert session.scalar(select(func.count()).select_from(ArtifactRow)) == 2


def test_material_migration_and_downgrade_refusal(db, tmp_path):
    settings = Settings(_env_file=None, database_url="sqlite://", api_token="a" * 48, efm_password="b" * 24)
    with db.session.begin() as session:
        binding = intake.attach(session, LocalStore(tmp_path / "files"), settings, "p", RAW, "data.csv", "text/csv", None, "key")
    with pytest.raises(RuntimeError, match="Cannot discard attachment"):
        migrate(db, "0002", downgrade=True)
    with db.session() as session:
        assert session.get(MaterialRow, binding.id).sha256 == hashlib.sha256(RAW).hexdigest()

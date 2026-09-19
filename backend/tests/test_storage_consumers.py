"""Storage errors and temporary workspaces across the consuming boundaries."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import stat
from threading import Barrier
from types import SimpleNamespace
import zipfile

import pytest
from fastapi.testclient import TestClient

from workbench import adapters
from workbench.api import create_app
from workbench.config import Settings
from workbench.contracts import BenchmarkInput
from workbench.db import ArtifactRow, Base, JobRow
from workbench.storage import StorageError
from workbench.worker import claim, process_job


EXAMPLES = Path(__file__).resolve().parents[2] / "examples"


@pytest.fixture
def client_store(tmp_path):
    settings = Settings(_env_file=None, database_url=f"sqlite:///{tmp_path}/metadata.sqlite",
                        storage_root=tmp_path / "storage", api_token="a" * 48, efm_password="b" * 24)
    app = create_app(settings)
    Base.metadata.create_all(app.state.db.engine)
    try:
        with TestClient(app) as client:
            client.headers["Authorization"] = "Bearer " + "a" * 48
            pid = client.post("/api/v1/projects", json={"name": "Storage"}).json()["id"]
            response = client.post(f"/api/v1/projects/{pid}/datasets", content=(EXAMPLES / "demo.csv").read_bytes(),
                                   headers={"X-Source": (EXAMPLES / "source.json").read_text()})
            assert response.status_code == 201
            yield client, app, settings, pid, response.json()
    finally:
        app.state.db.engine.dispose()


@pytest.mark.parametrize("failure", ["missing", "corrupt", "unavailable"])
def test_download_fails_with_safe_storage_error(client_store, monkeypatch, failure):
    client, app, _, pid, dataset = client_store
    path = app.state.store.path(dataset["blob_key"])
    if failure == "missing":
        path.unlink()
    elif failure == "corrupt":
        path.write_bytes(b"private-corrupt-bytes")
    else:
        def fail():
            raise PermissionError("private-filesystem-location")
        monkeypatch.setattr(app.state.store, "_check_root", fail)
    response = client.get(f"/api/v1/projects/{pid}/artifacts/{dataset['id']}/download")
    assert response.status_code == (503 if failure == "unavailable" else 500)
    assert response.json()["error_code"] == ("STORAGE_UNAVAILABLE" if failure == "unavailable" else "INTEGRITY_FAILED")
    assert response.json()["request_id"]
    assert str(path) not in response.text and "private-" not in response.text


def test_missing_input_fails_worker_without_publishing_artifacts(client_store):
    from sqlalchemy import func, select

    client, app, settings, pid, dataset = client_store
    response = client.post(f"/api/v1/projects/{pid}/audit", json={"dataset_id": dataset["id"], "config": {}},
                           headers={"Idempotency-Key": "missing-input"})
    assert response.status_code == 202
    app.state.store.path(dataset["blob_key"]).unlink()
    claimed = claim(app.state.db, 900)
    job_id = claimed.job_id
    process_job(settings, claimed)
    with app.state.db.session() as session:
        row = session.get(JobRow, job_id)
        assert row.state == "failed" and row.error_code == "INTEGRITY_FAILED"
        assert row.result_id is None
        assert session.scalar(select(func.count()).select_from(ArtifactRow).where(ArtifactRow.kind == "audit")) == 0


def test_bundle_storage_failure_is_not_a_scientific_failure(monkeypatch):
    from workbench import services

    raw = b"input"
    data = SimpleNamespace(blob_key="a" * 64)
    part = SimpleNamespace(audit_id="audit")
    audit = SimpleNamespace(config={})
    monkeypatch.setattr(services.artifact_adapter, "validate_python", lambda value: value)
    monkeypatch.setattr(services.adapters, "run_benchmark", lambda *args: ({"metrics": {}}, b"bundle"))
    monkeypatch.setattr(services, "save", lambda *args: pytest.fail("Storage failure must not publish a scientific result"))

    class UnavailableStore:
        def get(self, key):
            return raw

        def put(self, value):
            raise StorageError("Blob publication failed.")

    request = {**json.loads((EXAMPLES / "benchmark.json").read_text()), "dataset_id": "dataset", "split_id": "split"}
    data.id = "dataset"
    part.id = "split"
    work = SimpleNamespace(project_id="project", kind="benchmark", payload=request, result_id="result",
                           artifacts={"dataset": data, "split": part, "audit": audit})
    with pytest.raises(StorageError):
        services.execute(UnavailableStore(), None, work)


@pytest.mark.parametrize("adapter", ["benchmark", "evidence"])
@pytest.mark.parametrize("fail_second", [False, True], ids=["success", "exception"])
def test_adapter_workspaces_are_private_isolated_and_cleaned(tmp_path, monkeypatch, adapter, fail_second):
    # Stub scientific entry points only to coordinate overlap and inject failure.
    # The full workflow test separately exercises all real pinned packages.
    factory = adapters.tempfile.TemporaryDirectory
    scratch = tmp_path / "scratch"
    scratch.mkdir()
    monkeypatch.setattr(adapters.tempfile, "TemporaryDirectory", lambda **kw: factory(dir=scratch, **kw))
    barrier = Barrier(2)
    roots = []

    def inspect_workspace(root):
        roots.append(root)
        assert root.parent == scratch
        if os.name == "posix":
            assert stat.S_IMODE(root.stat().st_mode) == 0o700
        barrier.wait(timeout=15)

    def result(root, identity, output):
        if fail_second and identity == 1:
            raise RuntimeError("Injected upstream failure")
        output.mkdir()
        (output / "identity.txt").write_text(str(identity))
        return {"identity": identity}

    if adapter == "evidence":
        def ingest(input_path, output, metadata):
            inspect_workspace(input_path.parent)
            identity = int(metadata["title"])
            assert input_path.read_bytes() == f"pdf-{identity}".encode()
            return result(input_path.parent, identity, output)
        monkeypatch.setattr(adapters, "ingest_paper", ingest)
        invoke = lambda i: adapters.ingest_pdf(f"pdf-{i}".encode(), str(i))
    else:
        raw = (EXAMPLES / "demo.csv").read_bytes()
        data = SimpleNamespace(id="dataset", sha256=hashlib.sha256(raw).hexdigest(), filename="demo.csv", rows=60,
                               source=SimpleNamespace(**json.loads((EXAMPLES / "source.json").read_text())),
                               created_at=datetime.now(timezone.utc))
        partition = SimpleNamespace(config=json.loads((EXAMPLES / "split.json").read_text()), assignments=["train"] * 60)
        def prepare(card, output):
            inspect_workspace(card.parent)
            assert (card.parent / "data.csv").read_bytes() == raw
            output.mkdir()
        monkeypatch.setattr(adapters, "prepare", prepare)
        monkeypatch.setattr(adapters, "run_baseline", lambda prepared, model, output, seed: result(prepared.parent, seed, output))
        def invoke(i):
            request = BenchmarkInput(**{**json.loads((EXAMPLES / "benchmark.json").read_text()),
                                        "dataset_id": "dataset", "split_id": "split", "seed": i})
            return adapters.run_benchmark(raw, data, partition, request, {})

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(invoke, i) for i in range(2)]
        for i, future in enumerate(futures):
            if i == 1 and fail_second:
                with pytest.raises(RuntimeError, match="Injected"):
                    future.result()
            else:
                value, bundle = future.result()
                assert value == {"identity": i}
                with zipfile.ZipFile(io.BytesIO(bundle)) as archive:
                    names = [n for n in archive.namelist() if n.endswith("identity.txt")]
                    assert len(names) == 1 and archive.read(names[0]) == str(i).encode()
    assert len(roots) == len(set(roots)) == 2
    assert not list(scratch.iterdir())

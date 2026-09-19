"""C01 executable inventory: real public APIs, no private scientific imports."""
import hashlib
import io
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import zipfile

from chemdata_auditor import AuditConfig, SplitConfig, audit, split
from cheme_benchmarks import run_baseline
from failure_memory.app import create_app
from fastapi.testclient import TestClient
import pandas as pd
from PIL import Image
import pytest
from reportlab.pdfgen.canvas import Canvas

from workbench.adapters import frame, ingest_pdf, run_benchmark
from workbench.evidence_integrity import EvidenceInputError
from workbench.contracts import Dataset, Source, Split

ROOT = Path(__file__).resolve().parents[2]


def example(name):
    return json.loads((ROOT / "examples" / f"{name}.json").read_text())


@pytest.mark.parametrize("provenance", [None, {"vcs_info": {"vcs": "git", "commit_id": "0" * 40}}])
def test_inventory_rejects_unverified_install(monkeypatch, provenance):
    spec = importlib.util.spec_from_file_location("check_scientific_surface", ROOT / "scripts/check_scientific_surface.py")
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    monkeypatch.setattr(checker, "distribution", lambda name: SimpleNamespace(
        read_text=lambda filename: json.dumps(provenance) if provenance is not None else None))
    with pytest.raises(ValueError, match="Pinned Git provenance mismatch"):
        checker.verify_install()


@pytest.mark.parametrize("strategy,extra", [
    ("random", {}),
    ("formulation", {"columns": ["group_id"]}),
    ("composition", {"columns": ["group_id"]}),
    ("publication", {"columns": ["group_id"]}),
    ("laboratory", {"columns": ["group_id"]}),
    ("cluster", {"columns": ["temperature"], "cluster_scales": {"temperature": 1.0}}),
    ("time", {"columns": ["date"], "cutoff": "2020-02-15"}),
    ("temporal", {"columns": ["date"], "cutoff": "2020-02-15"}),
    ("extrapolation", {"columns": ["temperature"], "threshold": 320}),
])
def test_base_install_split_options(strategy, extra):
    data = frame((ROOT / "examples/demo.csv").read_bytes())
    data["date"] = pd.date_range("2020-01-01", periods=len(data)).astype(str)
    result = split(data, SplitConfig(strategy=strategy, **extra))
    assignments = result.assignments()
    assert len(assignments) == len(data)
    assert {"train", "test"} <= set(assignments)
    assert set(assignments) <= {"train", "validation", "test", "excluded"}


def test_missing_molecular_extra_is_explicit():
    if importlib.util.find_spec("rdkit") is not None:
        pytest.skip("Optional chemistry extra installed; base-install absence probe does not apply")
    with pytest.raises(ValueError, match="chem|RDKit|rdkit"):
        split(pd.DataFrame({"smiles": ["CC", "CCC", "CCCC"]}),
              SplitConfig(strategy="scaffold", columns=["smiles"]))


def test_auditor_returns_findings_without_repair():
    data = pd.DataFrame({"x": ["1", "1", ""]})
    original = data.copy(deep=True)
    result = audit(data, AuditConfig()).to_dict()
    assert result["findings"] and result["checks_run"]
    pd.testing.assert_frame_equal(data, original)
    with pytest.raises((TypeError, ValueError)):
        AuditConfig(invented=True)


@pytest.fixture(scope="module")
def prepared(tmp_path_factory):
    raw = (ROOT / "examples/demo.csv").read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    data = frame(raw)
    dataset = Dataset(project_id="inventory", filename="demo.csv", blob_key=digest,
                      sha256=digest, rows=len(data), columns=list(data), source=Source(**example("source")))
    cfg = example("split")
    generated = split(data, SplitConfig(**cfg))
    partition = Split(project_id=dataset.project_id, dataset_id=dataset.id, audit_id="inventory-audit",
                      config=cfg, assignments=generated.assignments(), result=generated.to_dict())
    req = SimpleNamespace(**example("benchmark"), dataset_id=dataset.id, split_id=partition.id)
    result, bundle = run_benchmark(raw, dataset, partition, req, example("audit"))
    root = tmp_path_factory.mktemp("baseline")
    with zipfile.ZipFile(io.BytesIO(bundle)) as archive:
        archive.extractall(root)  # Locally generated upstream output only.
    return root, result


@pytest.mark.parametrize("model", ["mean", "ridge", "random_forest", "hist_gradient_boosting"])
def test_baseline_options_and_exposure(prepared, model):
    root, ridge = prepared
    result = ridge if model == "ridge" else run_baseline(root / "prepared", model, root / model, seed=0)
    assert set(result["metrics"]) == {"validation", "test"}
    for partition in result["metrics"].values():
        assert set(partition) == {"mae", "rmse", "r2", "group_mae", "group_rmse",
                                  "group_mae_interval95", "rows", "groups", "interval_scope"}
        assert partition["rows"] > 0 and partition["group_mae"] >= 0
    assert result["method"]["validation_search"]
    predictions = root / ("run" if model == "ridge" else model) / "predictions.csv"
    assert set(pd.read_csv(predictions)["partition"]) == {"validation", "test"}


def test_pdf_text_locator_and_image_only_limit():
    stream = io.BytesIO()
    canvas = Canvas(stream)
    canvas.drawString(70, 700, "C01 source text")
    canvas.showPage()
    canvas.drawInlineImage(Image.new("RGB", (40, 40), "black"), 40, 40)  # Image-only page.
    canvas.save()
    raw = stream.getvalue()
    record, bundle = ingest_pdf(raw, "Inventory fixture")
    assert record["metadata_status"] == "user_supplied_unverified"
    assert record["page_count"] == 2
    with zipfile.ZipFile(io.BytesIO(bundle)) as archive:
        prefix = f"papers/{record['paper_id']}/"
        assert archive.read(prefix + record["original"]) == raw
        for i, page in enumerate(record["pages"], start=1):
            text = archive.read(prefix + page["text_path"])
            assert hashlib.sha256(text).hexdigest() == page["text_sha256"]
            assert page["page"] == i and page["extraction"] == "pdfium_text_layer"
            assert page["has_text"] is (i == 1)
        assert b"C01 source text" in archive.read(prefix + record["pages"][0]["text_path"])
    with pytest.raises(EvidenceInputError):
        ingest_pdf(b"not a PDF", "Invalid fixture")


def test_failure_memory_public_import_search_and_auth(tmp_path):
    database = tmp_path / "memory.sqlite"
    cli = [sys.executable, "-m", "failure_memory.cli", "--database", str(database)]
    subprocess.run(cli + ["init"], check=True, capture_output=True)
    subprocess.run(cli + ["create-user", "inventory", "--display-name", "Inventory",
                         "--password-env", "C01_TEST_PASSWORD"],
                   env={**os.environ, "C01_TEST_PASSWORD": "inventory-test-password"}, check=True, capture_output=True)
    subprocess.run(cli + ["create-user", "outsider", "--display-name", "Outsider",
                         "--password-env", "C01_TEST_PASSWORD"],
                   env={**os.environ, "C01_TEST_PASSWORD": "inventory-test-password"}, check=True, capture_output=True)
    with TestClient(create_app(database, "http://localhost", False), base_url="http://localhost") as client:
        assert client.get("/api/search").status_code == 401
        client.headers["X-EFM-Request"] = "1"
        login = client.post("/api/login", json={"username": "inventory", "password": "inventory-test-password"})
        assert login.status_code == 200
        assert client.post("/api/labs", json={"name": "Inventory"}).status_code == 403
        client.headers["X-CSRF-Token"] = login.json()["csrf"]
        lab = client.post("/api/labs", json={"name": "Inventory"}).json()
        projects = [client.post(f"/api/labs/{lab['id']}/projects", json={"name": name}).json()
                    for name in ("Selected", "Other")]
        payload = {"schema_version": "1.0", "connector": "sciml-workbench", "external_id": "c01-import",
                   "record": {"title": "C01 outcome", "performed_at": "2026-09-19T00:00:00Z",
                              "status": "failed", "outcomes": "Software fixture failed admission",
                              "uncertainty_notes": "Not an experiment",
                              "source": {"kind": "file", "reference": "inventory"}}}
        route = f"/api/projects/{projects[0]['id']}/import"
        first = client.post(route, json=payload)
        assert first.status_code == 200, first.text
        replay = client.post(route, json=payload)
        assert replay.json()["replayed"] is True
        record_id = first.json()["record"]["id"]
        assert replay.json()["record"]["id"] == record_id
        changed = {**payload, "record": {**payload["record"], "outcomes": "Changed"}}
        assert client.post(route, json=changed).status_code == 409
        found = client.get("/api/search", params={"project_id": projects[0]["id"], "q": "C01", "status": "failed"})
        assert found.status_code == 200 and record_id in found.text
        other = client.get("/api/search", params={"project_id": projects[1]["id"], "q": "C01"})
        assert other.status_code == 200 and record_id not in other.text
        assert client.get("/api/search", params={"limit": 201}).status_code == 422
        assert client.get(f"/api/records/{record_id}").status_code == 200
        assert client.post("/api/logout").status_code == 200
        assert client.get("/api/search").status_code == 401
        login = client.post("/api/login", json={"username": "outsider", "password": "inventory-test-password"})
        assert login.status_code == 200
        assert record_id not in client.get("/api/search", params={"q": "C01"}).text
        assert client.get("/api/search", params={"project_id": projects[0]["id"]}).status_code in {403, 404}
        assert client.get(f"/api/records/{record_id}").status_code in {403, 404}

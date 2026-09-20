"""C03 public SciSplit execution and adversarial exchange/publication checks."""
from copy import deepcopy
import hashlib
import io
import json
from pathlib import Path
import zipfile

from chemdata_auditor import SplitConfig, split
import pytest

from workbench import adapters
from workbench.artifacts import validate_result
from workbench.contracts import Audit, BenchmarkInput, Dataset, Source, Split, uid
from workbench.execution import TaskSettings, Work
from workbench.split_integrity import SplitCapabilityError, SplitInputError, SplitIntegrityError, validate_exchange
from workbench.worker import claim, process_job
from workbench.db import JobRow
from workbench.replay import replay
from workbench.services import execute
from workbench.storage import LocalStore
from test_intake import api, attach

ROOT = Path(__file__).resolve().parents[2]


def example(name):
    return json.loads((ROOT / "examples" / f"{name}.json").read_text())


def inputs(boundary=False):
    raw = (Path(__file__).parent / "fixtures/split/boundary.csv" if boundary else ROOT / "examples/demo.csv").read_bytes()
    config = ({"strategy": "time", "columns": ["date"], "group_columns": ["group_id"], "target_column": "y",
               "cutoff": "2020-01-07", "validation_cutoff": "2020-01-03", "crossing_policy": "exclude"}
              if boundary else example("split"))
    digest = hashlib.sha256(raw).hexdigest()
    data = adapters.frame(raw)
    dataset = Dataset(project_id="p", filename="fixture.csv", blob_key=digest, sha256=digest,
                      rows=len(data), columns=list(data), source=Source(**example("source")))
    assignments, report = adapters.run_split(raw, config)
    partition = Split(project_id="p", parents=[dataset.id, "audit"], dataset_id=dataset.id,
                      audit_id="audit", config=config, assignments=assignments, result=report)
    return raw, dataset, partition


@pytest.mark.parametrize("strategy,extra", [
    ("random", {}), ("formulation", {"columns": ["group_id"]}),
    ("composition", {"columns": ["group_id"]}), ("publication", {"columns": ["group_id"]}),
    ("laboratory", {"columns": ["group_id"]}),
    ("cluster", {"columns": ["temperature"], "cluster_scales": {"temperature": 1.0}}),
])
def test_seeded_adapter_replay_and_full_public_diagnostics(strategy, extra):
    raw = (ROOT / "examples/demo.csv").read_bytes()
    config = {"strategy": strategy, "seed": 42, "validation_size": 0.2, **extra}
    original = deepcopy(config)
    first = adapters.run_split(raw, config)
    assert first == adapters.run_split(raw, config)
    upstream = split(adapters.frame(raw), SplitConfig(**config))
    assert first == (upstream.assignments(), upstream.to_dict())
    assert config == original
    assert len(first[0]) == 60 and set(first[0]) == {"train", "validation", "test"}


@pytest.mark.parametrize("strategy", ["time", "temporal", "extrapolation"])
def test_explicit_boundaries_preserve_excluded_rows(strategy):
    raw, dataset, partition = inputs(True)
    if strategy == "temporal":
        partition.config["strategy"] = strategy
    elif strategy == "extrapolation":
        partition.config = {"strategy": strategy, "columns": ["x"], "group_columns": ["group_id"],
                            "threshold": 5.5, "validation_threshold": 2.5, "crossing_policy": "exclude"}
    assignments, report = adapters.run_split(raw, partition.config)
    assert (assignments, report) == adapters.run_split(raw, partition.config)
    partition.assignments, partition.result = assignments, report
    assert assignments == ["train", "train", "validation", "validation", "excluded", "excluded", "test", "test"]
    assert report["excluded"] == [4, 5]
    assert any(f["code"] == "boundary_group_exclusion" for f in report["findings"])
    exchange = validate_exchange(raw, dataset, partition, adapters.frame(raw), "row_id")
    assert exchange[4:6] == [{"row_id": "005", "partition": "excluded"}, {"row_id": "006", "partition": "excluded"}]
    assert len(exchange) == dataset.rows


@pytest.mark.parametrize("fault", ["short", "long", "label", "duplicate", "missing", "range", "boolean", "misaligned", "count", "config"])
def test_corrupt_partition_cannot_be_published_or_exchanged(fault):
    raw, dataset, part = inputs(True)
    if fault == "short": part.assignments.pop()
    elif fault == "long": part.assignments.append("train")
    elif fault == "label": part.assignments[0] = "invented"
    elif fault == "duplicate": part.result["train"].append(0)
    elif fault == "missing": part.result["excluded"].pop()
    elif fault == "range": part.result["test"][0] = 100
    elif fault == "boolean": part.result["train"][0] = False
    elif fault == "misaligned": part.assignments[0] = "test"
    elif fault == "count": part.result["diagnostics"]["n_excluded"] = 0
    elif fault == "config": part.result["metadata"]["config"]["cutoff"] = "2020-01-01"
    work = Work(job_id=uid(), result_id=part.id, project_id="p", kind="split",
                payload={"dataset_id": dataset.id, "audit_id": "audit", "config": part.config},
                artifacts={dataset.id: dataset.model_dump(mode="json")})
    with pytest.raises(SplitIntegrityError):
        validate_result(part, work)
    with pytest.raises(SplitIntegrityError):
        validate_exchange(raw, dataset, part, adapters.frame(raw), "row_id")


@pytest.mark.parametrize("fault", ["digest", "rows", "columns", "dataset", "project", "row_order"])
def test_dataset_binding_rejected(fault):
    raw, dataset, part = inputs(True)
    if fault == "digest": dataset.sha256 = "0" * 64
    elif fault == "rows": dataset.rows -= 1
    elif fault == "columns": dataset.columns.reverse()
    elif fault == "dataset": part.dataset_id = "other"
    elif fault == "project": part.project_id = "other"
    elif fault == "row_order":
        lines = raw.splitlines(keepends=True)
        raw = b"".join([lines[0], *reversed(lines[1:])])
    with pytest.raises(SplitIntegrityError):
        validate_exchange(raw, dataset, part, adapters.frame(raw), "row_id")


@pytest.mark.parametrize("identity", ["absent", "blank", "duplicate"])
def test_bad_row_identity_rejected(identity):
    raw, dataset, part = inputs(True)
    if identity != "absent":
        raw = raw.replace(b"002,", b"," if identity == "blank" else b"001,")
        dataset.sha256 = dataset.blob_key = hashlib.sha256(raw).hexdigest()
    with pytest.raises(SplitInputError):
        validate_exchange(raw, dataset, part, adapters.frame(raw), "absent" if identity == "absent" else "row_id")


def test_unsupported_and_invalid_designs_fail_explicitly():
    raw, _, part = inputs(True)
    with pytest.raises(SplitCapabilityError):
        adapters.run_split(raw, {"strategy": "invented"})
    with pytest.raises(SplitCapabilityError, match="RDKit"):
        adapters.run_split(raw, {"strategy": "scaffold", "columns": ["group_id"]})
    with pytest.raises(SplitInputError):
        adapters.run_split(raw, {**part.config, "crossing_policy": "error"})


def test_real_benchmark_exchange_and_exclusion_admission():
    raw, dataset, part = inputs()
    req = BenchmarkInput(**example("benchmark"), dataset_id=dataset.id, split_id=part.id)
    _, bundle = adapters.run_benchmark(raw, dataset, part, req, example("audit"))
    with zipfile.ZipFile(io.BytesIO(bundle)) as archive:
        frozen = json.loads(archive.read("partitions.json"))
        assert frozen["dataset_sha256"] == dataset.sha256
        assert frozen["assignments"] == validate_exchange(raw, dataset, part, adapters.frame(raw), "row_id")
    raw, dataset, part = inputs(True)
    req = req.model_copy(update={"dataset_id": dataset.id, "split_id": part.id, "target": "y",
                                 "numeric_features": ["x"], "units": {"x": "dimensionless", "y": "dimensionless"}})
    with pytest.raises(ValueError, match="excluded rows"):
        adapters.run_benchmark(raw, dataset, part, req, {})


def test_full_excluded_assignments_published_through_worker(api):
    client, app, settings, pid = api
    raw, _, template = inputs(True)
    aid = attach(client, pid, raw).json()["dataset_id"]
    def run(kind, payload):
        response = client.post(f"/api/v1/projects/{pid}/{kind}", json=payload, headers={"Idempotency-Key": kind})
        assert response.status_code == 202, response.text
        process_job(settings, claim(app.state.db, 120))
        with app.state.db.session() as session:
            job = session.get(JobRow, response.json()["id"])
            assert job.state == "succeeded", job.error
            result_id = job.result_id
        return client.get(f"/api/v1/projects/{pid}/artifacts/{result_id}").json()
    audited = run("audit", {"dataset_id": aid, "config": {}})
    result = run("split", {"dataset_id": aid, "audit_id": audited["id"], "config": template.config})
    assert result["assignments"] == template.assignments
    assert result["result"] == template.result


@pytest.mark.parametrize("fault", [None, "short", "row_order"])
def test_report_replay_checks_split_cover_and_exact_input(tmp_path, fault):
    raw, dataset, part = inputs(True)
    if fault == "short":
        part.assignments.pop()
    elif fault == "row_order":
        lines = raw.splitlines(keepends=True)
        raw = b"".join([lines[0], *reversed(lines[1:])])
    from workbench.services import report_bundle, software
    from workbench.archive import environment
    audited = Audit(id=part.audit_id, project_id="p", dataset_id=dataset.id, config={},
                    result=adapters.run_audit(raw, {}).result.model_dump(mode="json"))
    audited.software = part.software = software()
    snapshot = {"project": {"id": "p", "name": "Replay", "description": "Fixture"}, "jobs": [],
                "environment": environment(), "materials": [],
                "artifacts": [a.model_dump(mode="json") for a in (dataset, audited, part)]}
    store = LocalStore(tmp_path / "blobs")
    store.put(raw)
    archive = tmp_path / "split.zip"
    if fault == "row_order":
        from workbench.storage import StorageError
        with pytest.raises(StorageError):
            report_bundle(snapshot, store)
    else:
        archive.write_bytes(report_bundle(snapshot, store)[0])
        if fault:
            with pytest.raises(SplitIntegrityError):
                replay(archive, tmp_path / "replayed")
        else:
            destination = replay(archive, tmp_path / "replayed")
            assert json.loads((destination / f"{part.id}.json").read_text()) == part.result


def test_corrupt_exchange_is_not_a_scientific_benchmark_result(tmp_path):
    raw, data, part = inputs()
    audited = Audit(id=part.audit_id, project_id="p", dataset_id=data.id, config=example("audit"), result={})
    part.assignments.pop()
    request = BenchmarkInput(**example("benchmark"), dataset_id=data.id, split_id=part.id)
    work = Work(job_id=uid(), result_id=uid(), project_id="p", kind="benchmark",
                payload=request.model_dump(mode="json"), artifacts={a.id: a.model_dump(mode="json") for a in (data, part, audited)})
    store = LocalStore(tmp_path / "files")
    store.put(raw)
    with pytest.raises(SplitIntegrityError):
        execute(store, TaskSettings(storage_root=store.root), work)

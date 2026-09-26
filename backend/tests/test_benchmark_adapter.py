"""C04 admission and complete bundle acceptance through public upstream APIs."""
from copy import deepcopy
import hashlib
import io
import json
import zipfile

from cheme_benchmarks import load_prepared, score_predictions
import pytest

from workbench import adapters
from workbench.contracts import BenchmarkInput
from workbench.db import JobRow
from workbench.worker import claim, process_job
from test_intake import api
from test_metadata import db, old_db  # noqa: F401 - transitive api fixtures
from test_split_integrity import inputs, example


def request(data, part, **changes):
    return BenchmarkInput(**{**example("benchmark"), "dataset_id": data.id, "split_id": part.id, **changes})


def changed_csv(raw, data, part, transform):
    frame = adapters.frame(raw)
    transform(frame)
    raw = frame.to_csv(index=False, lineterminator="\n").encode()
    data.sha256 = data.blob_key = hashlib.sha256(raw).hexdigest()
    data.columns = list(frame)
    part.assignments, part.result = adapters.run_split(raw, part.config)
    return raw


@pytest.mark.parametrize("model", ["mean", "ridge"])
def test_complete_bundle_and_public_score_verification(tmp_path, model):
    raw, data, part = inputs()
    req = request(data, part, model=model)
    config = example("audit")
    before = deepcopy((data, part, req, config))
    result, bundle = adapters.run_benchmark(raw, data, part, req, config)
    assert (data, part, req, config) == before
    expected = {"data.csv", "partitions.json", "benchmark.json", "prepared/spec.json",
                "prepared/dataset.csv", "prepared/partitions.json", "prepared/audit.json",
                "prepared/scisplit.json", "prepared/manifest.json", "run/run.json",
                "run/predictions.csv", "run/manifest.json"}
    with zipfile.ZipFile(io.BytesIO(bundle)) as archive:
        assert set(archive.namelist()) == expected
        assert archive.read("data.csv") == archive.read("prepared/dataset.csv") == raw
        assert archive.read("partitions.json") == archive.read("prepared/partitions.json")
        card = json.loads(archive.read("benchmark.json"))
        assert card == json.loads(archive.read("prepared/spec.json"))
        assert card["source"]["citation"] == data.source.citation
        assert card["source"]["license"] == data.source.license
        assert card["source"]["transformations"] == data.source.transformations
        assert card["data"]["sha256"] == data.sha256
        assert card["audit"] == {**config, "feature_columns": req.numeric_features + req.categorical_features,
                                 "target_column": req.target}
        assert card["accepted_warnings"] == req.accepted_warnings
        assert card["partitions"]["sha256"] == hashlib.sha256(archive.read("partitions.json")).hexdigest()
        assert json.loads(archive.read("run/run.json")) == result
        for directory in ("prepared", "run"):
            manifest = json.loads(archive.read(f"{directory}/manifest.json"))
            members = {name.removeprefix(directory + "/") for name in expected if name.startswith(directory + "/")}
            assert set(manifest["files"]) == members - {"manifest.json"}
            for name, digest in manifest["files"].items():
                assert hashlib.sha256(archive.read(f"{directory}/{name}")).hexdigest() == digest
        assert result["prediction_sha256"] == hashlib.sha256(archive.read("run/predictions.csv")).hexdigest()
        archive.extractall(tmp_path)  # Only the above exact locally generated inventory.
    spec, frame, frozen, manifest = load_prepared(tmp_path / "prepared")
    assert result["benchmark_id"] == manifest["benchmark_id"]
    assert result["method"]["name"] == model and result["method"]["seed"] == req.seed
    assert result["method"]["parameters"] and result["method"]["validation_search"]
    assert result["software"] and result["verification_scope"]
    # All metric computation is upstream, including this independent verification.
    assert score_predictions(spec, frame, frozen, (tmp_path / "run/predictions.csv").read_bytes()) == result["metrics"]
    assert set(result["metrics"]) == {"validation", "test"}


@pytest.mark.parametrize("fault,match", [
    ("missing_units", "Units must be declared"),
    ("unknown_unit", "Unknown expected unit"),
    ("identifier_feature", "identifiers cannot be model features"),
    ("unavailable_feature", "unavailable_feature"),
    ("grouping", "preserve every declared independent-unit group"),
    ("provenance", "provenance_gap"),
    ("target_copy", "target_copy"),
    ("source", "source field"),
])
def test_upstream_admission_rejects_invalid_science(fault, match):
    raw, data, part = inputs()
    config = example("audit")
    changes = {}
    if fault == "missing_units": changes["units"] = {}
    elif fault == "unknown_unit": changes["units"] = {"temperature": "invented_c04_unit", "response": "dimensionless"}
    elif fault == "identifier_feature": changes["categorical_features"] = ["group_id"]
    elif fault == "unavailable_feature": config["unavailable_features"] = ["temperature"]
    elif fault == "grouping": changes["group_columns"] = ["source_id"]
    elif fault == "provenance": config["provenance_columns"] = ["absent_source"]
    elif fault == "target_copy":
        raw = changed_csv(raw, data, part, lambda f: f.__setitem__("temperature", f["response"]))
    elif fault == "source": data.source.citation = ""
    with pytest.raises(ValueError, match=match):
        adapters.run_benchmark(raw, data, part, request(data, part, **changes), config)


@pytest.mark.parametrize("label,match", [("meter", "incompatible_units"),
                                         ("degree_Celsius", "unit_conversion"),
                                         ("invented_c04_unit", "unknown_unit")])
def test_original_unit_metadata_is_not_hidden_by_task_card(label, match):
    raw, data, part = inputs()
    raw = changed_csv(raw, data, part, lambda f: f.__setitem__("temperature_unit", label))
    config = {**example("audit"), "units": {"temperature": {"column": "temperature_unit", "expected": "kelvin"}}}
    before = deepcopy(config)
    with pytest.raises(ValueError, match=match):
        adapters.run_benchmark(raw, data, part, request(data, part), config)
    assert config == before
    assert hashlib.sha256(raw).hexdigest() == data.sha256


def test_valid_original_units_and_explicit_warning_acceptance_retained():
    raw, data, part = inputs()
    raw = changed_csv(raw, data, part, lambda f: f.__setitem__("temperature_unit", "kelvin"))
    config = {**example("audit"), "units": {"temperature": {"column": "temperature_unit", "expected": "kelvin"}},
              "provenance_columns": ["absent_source"]}
    warnings = {"provenance_gap": "Synthetic fixture deliberately has no source column; no empirical inference."}
    result, bundle = adapters.run_benchmark(raw, data, part, request(data, part, accepted_warnings=warnings), config)
    with zipfile.ZipFile(io.BytesIO(bundle)) as archive:
        preflight = json.loads(archive.read("original-units-audit.json"))
        assert preflight["metadata"]["config"]["units"] == config["units"]
        assert not any(f["severity"] == "error" for f in preflight["findings"])
        assert json.loads(archive.read("benchmark.json"))["accepted_warnings"] == warnings
        assert json.loads(archive.read("prepared/manifest.json"))["admission"] == "passed_with_documented_warnings"
        assert json.loads(archive.read("run/run.json")) == result


def test_durable_incompatible_units_failure_retains_no_invented_metrics(api):
    client, app, settings, pid = api
    raw, data, template = inputs()
    raw = changed_csv(raw, data, template, lambda f: f.__setitem__("temperature_unit", "meter"))
    response = client.post(f"/api/v1/projects/{pid}/datasets", content=raw,
                           headers={"X-Source": json.dumps(example("source")), "X-Filename": "units.csv"})
    assert response.status_code == 201, response.text
    data_id = response.json()["id"]
    def run(kind, payload):
        response = client.post(f"/api/v1/projects/{pid}/{kind}", json=payload, headers={"Idempotency-Key": kind})
        assert response.status_code == 202, response.text
        process_job(settings, claim(app.state.db, 120))
        with app.state.db.session() as session:
            job = session.get(JobRow, response.json()["id"])
            state, result_id = job.state, job.result_id
        assert result_id is not None
        return state, client.get(f"/api/v1/projects/{pid}/artifacts/{result_id}").json()
    config = {**example("audit"), "units": {"temperature": {"column": "temperature_unit", "expected": "kelvin"}}}
    state, audited = run("audit", {"dataset_id": data_id, "config": config})
    assert state == "succeeded"
    assert any(f["code"] == "incompatible_units" for f in audited["result"]["findings"])
    state, part = run("split", {"dataset_id": data_id, "audit_id": audited["id"], "config": template.config})
    assert state == "succeeded"
    state, baseline = run("benchmark", {**example("benchmark"), "dataset_id": data_id, "split_id": part["id"],
        "accepted_warnings": {"incompatible_units": "An error cannot be waived as a warning"}})
    assert state == baseline["status"] == "failed"
    # E14 deliberately keeps raw adapter diagnostics out of persisted errors;
    # the retained audit above carries the structured incompatible-units finding.
    assert baseline["error"] == "Task could not complete. Inspect the job error code and retained inputs."
    assert baseline["result"] == {} and baseline["bundle_key"] is None
    assert client.get(f"/api/v1/projects/{pid}/artifacts/{data_id}/download").content == raw

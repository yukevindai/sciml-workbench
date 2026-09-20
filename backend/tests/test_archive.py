"""C08-C10 real science, offline verification, tampering and comparison gates."""
from copy import deepcopy
import hashlib
import io
import json
import subprocess
import sys
import zipfile

import pytest

from workbench import adapters
from workbench.archive import compatible, environment, verify_archive
from workbench.contracts import Audit, Benchmark
from workbench.replay import compare, replay
from workbench.services import report_bundle, software
from workbench.storage import LocalStore
from test_benchmark_adapter import request
from test_split_integrity import example, inputs


@pytest.fixture
def science(tmp_path):
    raw, data, part = inputs()
    config = example("audit")
    audit = Audit(id=part.audit_id, project_id="p", dataset_id=data.id, config=config,
                  result=adapters.run_audit(raw, config).result.model_dump(mode="json"))
    req = request(data, part)
    result, bundle = adapters.run_benchmark(raw, data, part, req, config)
    store = LocalStore(tmp_path / "store")
    store.put(raw)
    bench = Benchmark(project_id="p", dataset_id=data.id, split_id=part.id, model=req.model,
                      seed=req.seed, config=req.model_dump(mode="json"), status="succeeded",
                      result=result, bundle_key=store.put(bundle))
    for artifact in (audit, part, bench):
        artifact.software = software()
    snapshot = {"schema_version": "1.0", "project": {"id": "p", "name": "Real fixture", "description": "Synthetic"},
                "jobs": [], "materials": [], "environment": environment(),
                "artifacts": [a.model_dump(mode="json") for a in (data, audit, part, bench)]}
    return snapshot, store


def rewrite(raw, change, *, rehash=True):
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        files = {n: z.read(n) for n in z.namelist()}
    manifest = json.loads(files.pop("manifest.json"))
    change(files)
    if rehash:
        manifest["files"] = {n: hashlib.sha256(b).hexdigest() for n, b in files.items()}
    files["manifest.json"] = adapters.encoded(manifest)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for n, b in files.items():
            z.writestr(n, b)
    return out.getvalue()


def test_real_report_is_repeatable_and_cli_replay_matches(science, tmp_path):
    snapshot, store = science
    raw, ids = report_bundle(snapshot, store)
    assert raw == report_bundle(snapshot, store)[0]
    files, values = verify_archive(io.BytesIO(raw))
    assert set(ids) == {a.id for a in values}
    assert b"scientific replay has not run" in files["README.md"]
    archive = tmp_path / "report.zip"
    archive.write_bytes(raw)
    result = subprocess.run([sys.executable, "-m", "workbench.replay", str(archive), str(tmp_path / "replayed")],
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    comparison = json.loads((tmp_path / "replayed/replay-comparison.json").read_bytes())
    assert comparison["status"] == "matched"
    assert len(comparison["comparisons"]) == 3
    assert comparison["failure_memory"] == "not_mutated"
    assert comparison["agent_execution"] == "not_replayed"
    # Version 1 archives remain explicitly readable when structurally complete.
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        manifest = json.loads(z.read("manifest.json"))
    manifest["schema_version"] = "1.0"
    legacy = io.BytesIO()
    with zipfile.ZipFile(legacy, "w") as z:
        for name, body in files.items():
            z.writestr(name, body)
        z.writestr("manifest.json", adapters.encoded(manifest))
    verify_archive(io.BytesIO(legacy.getvalue()))


@pytest.mark.parametrize("fault", ["path", "missing", "digest", "projection", "schema", "cycle", "pins"])
def test_adversarial_archive_fails_before_output(science, tmp_path, fault):
    snapshot, store = science
    raw = report_bundle(snapshot, store)[0]
    def change(files):
        if fault == "path": files["../outside"] = b"no"
        elif fault == "missing": del files["artifacts.json"]
        elif fault == "digest": files["project.json"] += b" "
        elif fault == "projection": files["artifacts.json"] = b"[]"
        elif fault == "schema": files["contracts/dataset.json"] = b"{}"
        else:
            snap = json.loads(files["snapshot.json"])
            if fault == "cycle":
                snap["artifacts"][0]["parents"] = [snap["artifacts"][0]["id"]]
                files["artifacts.json"] = adapters.encoded(snap["artifacts"])
            else:
                snap["environment"]["upstream_commits"] = {}
                files["environment.json"] = adapters.encoded(snap["environment"])
            files["snapshot.json"] = adapters.encoded(snap)
    archive = tmp_path / "bad.zip"
    archive.write_bytes(rewrite(raw, change, rehash=fault != "digest"))
    with pytest.raises((ValueError, KeyError)):
        replay(archive, tmp_path / "out")
    assert not (tmp_path / "out").exists()


def test_export_refuses_missing_bytes_and_credentials(science):
    snapshot, store = science
    bad = deepcopy(snapshot)
    bad["artifacts"][-1]["bundle_key"] = None
    with pytest.raises(ValueError, match="missing its output bundle"):
        report_bundle(bad, store)
    bad = deepcopy(snapshot)
    bad["artifacts"][1]["result"]["api_key"] = "credential-canary"
    with pytest.raises(ValueError, match="credential"):
        report_bundle(bad, store)


def test_numeric_tolerances_are_bounded():
    compare({"metric": [1.0]}, {"metric": [1.0 + 1e-10]})
    for changed in (1.01, float("nan"), float("inf"), True):
        with pytest.raises(ValueError, match="mismatch"):
            compare(1.0, changed)


def test_prediction_row_ids_are_exact_strings():
    from workbench.replay import compare_predictions
    original = b"row_id,partition,prediction\n001,test,1.0\nNA,validation,2.0\n"
    compare_predictions(original, original)
    with pytest.raises(ValueError, match="row identity"):
        compare_predictions(original, original.replace(b"001", b"1"))


def test_installed_source_pin_incompatibility_blocks_replay():
    record = environment()
    record["upstream_commits"]["chemdata-auditor"] = "0" * 40
    with pytest.raises(ValueError, match="source pins"):
        compatible(record)


def test_original_artifact_pins_must_match_not_just_export_environment(science, tmp_path):
    snapshot, store = science
    snapshot["artifacts"][1]["software"]["chemdata-auditor"] = "0.3.0@" + "0" * 40
    archive = tmp_path / "old-science.zip"
    archive.write_bytes(report_bundle(snapshot, store)[0])
    with pytest.raises(ValueError, match="Artifact scientific source pins"):
        replay(archive, tmp_path / "out")
    assert not (tmp_path / "out").exists()


def test_numeric_disagreement_is_not_reported_as_success(science, tmp_path):
    snapshot, store = science
    snapshot["artifacts"][1]["result"]["n_rows"] += 1
    raw = report_bundle(snapshot, store)[0]
    archive = tmp_path / "mismatch.zip"
    archive.write_bytes(raw)
    with pytest.raises(ValueError, match="Scientific replay mismatch"):
        replay(archive, tmp_path / "out")
    status = json.loads((tmp_path / "out/replay-comparison.json").read_bytes())
    assert status["status"] == "failed"


def test_configured_credentials_block_worker_publication(science):
    from types import SimpleNamespace
    from pydantic import SecretStr
    from workbench.archive import reject_configured_secrets
    snapshot, store = science
    snapshot["project"]["description"] = "accidentally pasted private-configured-token"
    raw = report_bundle(snapshot, store)[0]
    settings = SimpleNamespace(api_token=SecretStr("private-configured-token"),
                               efm_password=SecretStr("other-private-password"), database_url="sqlite:///metadata.db")
    with pytest.raises(ValueError, match="configured credential"):
        reject_configured_secrets(raw, settings)


@pytest.mark.parametrize("path", ["/absolute", "C:/drive", "back\\slash", "a/../b", "CON.json", "a.", "a//b"])
def test_unsafe_paths_are_rejected(path):
    from workbench.archive import zip_contents
    raw = io.BytesIO()
    with zipfile.ZipFile(raw, "w") as z:
        entry = zipfile.ZipInfo("placeholder")
        entry.filename = path  # Bypass Windows ZipInfo constructor normalization.
        z.writestr(entry, b"unsafe")
    with pytest.raises(ValueError, match="path"):
        zip_contents(io.BytesIO(raw.getvalue()))


def test_case_collision_and_symlink_rejected():
    from workbench.archive import zip_contents
    raw = io.BytesIO()
    with zipfile.ZipFile(raw, "w") as z:
        z.writestr("data", b"a")
        z.writestr("DATA", b"b")
    with pytest.raises(ValueError, match="Duplicate"):
        zip_contents(io.BytesIO(raw.getvalue()))
    raw = io.BytesIO()
    with zipfile.ZipFile(raw, "w") as z:
        link = zipfile.ZipInfo("link")
        link.external_attr = 0o120777 << 16
        z.writestr(link, b"outside")
    with pytest.raises(ValueError, match="member type"):
        zip_contents(io.BytesIO(raw.getvalue()))

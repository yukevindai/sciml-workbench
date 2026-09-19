"""C02 real ChemData audit acceptance across adapter and durable callers."""
from copy import deepcopy
import hashlib
import io
import json
from pathlib import Path

from chemdata_auditor import AuditConfig, audit
import pandas as pd
import pytest

from workbench.adapters import run_audit
from workbench.audit_contracts import AuditInputError, AuditOutput
from workbench.db import JobRow
from workbench.submission import SubmissionScope
from workbench.worker import claim, process_job
from test_intake import api, attach

FIXTURES = Path(__file__).parent / "fixtures/audit"


def fixture(name):
    return (FIXTURES / f"{name}.csv").read_bytes()


def configuration():
    return json.loads((FIXTURES / "config.json").read_text())


def upstream(raw, config):
    data = pd.read_csv(io.BytesIO(raw), dtype=str, keep_default_na=False)
    return audit(data, AuditConfig(**config)).to_dict()


@pytest.mark.parametrize("name", ["clean", "problematic"])
def test_typed_result_preserves_public_serialization_and_configuration(name):
    raw, config = fixture(name), configuration()
    before = deepcopy(config)
    output = run_audit(raw, config)
    assert isinstance(output, AuditOutput)
    assert output.result.model_dump(mode="json") == upstream(raw, before)
    assert output.config == config == before
    assert output.source_sha256 == hashlib.sha256(raw).hexdigest()
    assert output.result.metadata["config"]["check_missing"] is True
    assert "check_missing" not in output.config  # Requested vs effective defaults.
    assert output.execution_status == "completed"
    assert output.scientific_acceptance == "not_assessed"
    assert AuditOutput.model_validate_json(output.model_dump_json()) == output
    if name == "clean":
        assert output.result.findings == []
    else:
        findings = {item.code: item for item in output.result.findings}
        assert findings["duplicate_samples"].rows == [0, 1]
        assert findings["out_of_bounds"].rows == [2]
        assert findings["invalid_numeric"].rows == [3]
        assert findings["provenance_gap"].rows == [3]
        assert findings["out_of_bounds"].severity == "error"
    assert output.result.checks_run and output.result.checks_skipped
    config["bounds"]["x"][1] = 100
    assert output.config == before
    assert output.result.metadata["config"]["bounds"]["x"] == [0, 10]


def test_bytes_column_spelling_and_string_values_are_not_repaired():
    raw = b'\xef\xbb\xbf label ,x\r\n001,1\r\nNA,2\r\n003,99\r\n'
    config = {"bounds": {"x": [0, 10]}, "provenance_columns": [" label "]}
    output = run_audit(raw, config)
    assert output.source_sha256 == hashlib.sha256(raw).hexdigest()
    assert output.result.model_dump(mode="json") == upstream(raw, config)
    assert not any(f.code == "provenance_gap" for f in output.result.findings)
    assert output.result.metadata["dataset_sha256"] != output.source_sha256
    assert output.result.metadata["row_reference"].startswith("zero-based row position")


@pytest.mark.parametrize("config", [{"invented": True}, {"bounds": {"x": [10, 0]}},
                                    {"numeric_columns": ["absent"]}])
def test_invalid_configuration_has_no_success_value(config):
    with pytest.raises(AuditInputError) as caught:
        run_audit(fixture("clean"), config)
    assert caught.value.error_code == "VALIDATION_FAILED"


@pytest.mark.parametrize("name", ["clean", "problematic"])
def test_manual_and_scoped_action_publish_same_real_findings_without_changing_upload(api, name):
    client, app, settings, pid = api
    # Preserve a BOM and CRLF as well as scientific values through intake/execution.
    raw = b"\xef\xbb\xbf" + fixture(name).replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
    binding_response = attach(client, pid, raw)
    assert binding_response.status_code == 201, binding_response.text
    binding = binding_response.json()
    aid = binding["dataset_id"]
    before = client.get(f"/api/v1/projects/{pid}/artifacts/{aid}").json()
    config = configuration()
    payload = {"dataset_id": aid, "config": config}
    expected = upstream(raw, config)
    for actor in ("manual", "scoped_action"):
        if actor == "manual":
            response = client.post(f"/api/v1/projects/{pid}/audit", json=payload,
                                   headers={"Idempotency-Key": "manual-audit"})
            assert response.status_code == 202, response.text
            job_id = response.json()["id"]
        else:
            from workbench.submission import SubmissionService
            service = SubmissionService(app.state.db, app.state.store, settings)
            scope = SubmissionScope(pid, {aid}, set(), "c02-run")
            identity = {"action_id": "audit", "attempt_id": "one"}
            job_id = service.submit(scope, "audit", payload, **identity).id
            assert service.submit(scope, "audit", payload, **identity).id == job_id
        claimed = claim(app.state.db, 120)
        assert claimed.job_id == job_id
        process_job(settings, claimed)
        with app.state.db.session() as session:
            job = session.get(JobRow, job_id)
            assert job.state == "succeeded", job.error
            result_id = job.result_id
        result = client.get(f"/api/v1/projects/{pid}/artifacts/{result_id}").json()
        assert result["result"] == expected
        assert result["config"] == config
        assert result["parents"] == [aid] and result["dataset_id"] == aid
        assert "status" not in result  # Audit 1.0 never claimed scientific acceptance.
        assert client.get(f"/api/v1/projects/{pid}/research-materials/{binding['id']}/download").content == raw
        assert client.get(f"/api/v1/projects/{pid}/artifacts/{aid}").json() == before
        assert app.state.store.get(before["blob_key"]) == raw


def test_invalid_audit_job_is_failed_not_a_completed_finding(api):
    client, app, settings, pid = api
    binding = attach(client, pid, fixture("clean")).json()
    response = client.post(f"/api/v1/projects/{pid}/audit",
                           json={"dataset_id": binding["dataset_id"], "config": {"invented": True}},
                           headers={"Idempotency-Key": "invalid"})
    assert response.status_code == 202
    process_job(settings, claim(app.state.db, 120))
    with app.state.db.session() as session:
        job = session.get(JobRow, response.json()["id"])
        assert job.state == "failed" and job.result_id is None
        assert job.error_code == "VALIDATION_FAILED"

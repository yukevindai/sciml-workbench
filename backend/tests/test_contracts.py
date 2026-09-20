"""B01 compatibility and malformed-boundary cases; no model/provider required."""

import copy
import hashlib
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter, ValidationError

from workbench import contracts as legacy
from workbench import research_contracts as r
from workbench import scientific_contracts as s
from workbench.api import create_app
from workbench.config import Settings
from workbench.contract_core import ErrorResponse
from workbench.contract_registry import ARTIFACT_READERS, read_artifact, versioned_artifact_adapter
from workbench.db import Base

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).parent / "fixtures" / "contracts"
LEGACY = json.loads((FIXTURES / "legacy-v1.json").read_text(encoding="utf-8"))
HASH = "a" * 64
NOW = "2026-09-19T12:00:00Z"
POLICY = {"policy_id": "policy", "revision": 1, "sha256": HASH}


def dataset():
    return dict(kind="dataset", schema_version="2.0", project_id="project", filename="input.csv",
                blob_key=HASH, sha256=HASH, rows=3, columns=["row", "target"],
                source=s.SourceDeclarations().model_dump(mode="json"),
                unresolved_fields=list(s.SourceDeclarations.model_fields))


def actor():
    return dict(kind="agent", run_id="run", action_id="action", provider="test-provider",
                model="fixture-model", prompt_version="test-v1", policy=POLICY, policy_rule_id="objective-failure")


def failure():
    return dict(kind="failure", schema_version="2.0", project_id="project", benchmark_id="benchmark",
                source_job_id="job", reason="Admission rejected incomplete units", uncertainty_notes="No training occurred",
                actor=actor(), observation={"kind": "execution_failure", "error_code": "ADMISSION_REJECTED", "observed_error": "Units missing"},
                receipt={"external_id": "job", "request_sha256": HASH, "external_project_id": "ep", "external_record_id": "er", "record": {}})


def evidence():
    return dict(availability="available", source_artifact_id="paper", source_sha256=HASH,
                representation_sha256=HASH, extraction_version="fixture-v1",
                locator={"kind": "text_span", "unit": "unicode_codepoint", "start": 0, "end": 8},
                excerpt_sha256=HASH, page=None)


def metric():
    return dict(artifact_id="benchmark", field_path="/result/metrics/test/group_mae", partition="test", value=2.0)


def claim():
    return dict(id="claim", statement="The test group MAE was 2.", classification="computed_result",
                metric_references=[metric()], population="Synthetic fixture", limitations=["No experimental inference"],
                uncertainty="Synthetic data", reference_check={"status": "not_checked"}, semantic_review={"status": "not_reviewed"})


def protocol():
    return dict(project_id="project", revision=1, dataset_id="dataset", dataset_sha256=HASH,
                split_id="split", split_sha256=HASH, configuration_sha256=HASH, target="target", features=["feature"],
                preprocessing="Upstream training-only preprocessing", independent_unit={"name": "family", "group_columns": ["family"], "rationale": "Generated families"},
                candidates=[{"id": "ridge", "model": "ridge", "seed": 0, "configuration_sha256": HASH}],
                primary_metric="group_mae", selection_rule="predeclared_comparison", state="sealed", sealed_at=NOW,
                exposure_status="unexposed")


def limits():
    return dict(model_tokens=1000, model_requests=4, tool_calls=10, coordinator_iterations=5,
                specialist_assignments=2, specialist_concurrency=1, delegation_depth=1, review_rounds=1,
                scientific_attempts=4, active_seconds=900, transient_retries=1,
                finalization_model_tokens=100, finalization_scientific_attempts=1)


def usage():
    return dict(billed_token_categories={}, reserved_tokens=0, model_requests=0, tool_calls=0,
                scientific_attempts=0, active_seconds=0, unknown_request_ids=[], cost={"status": "unknown", "reason": "Fixture has no provider pricing"})


def step(identifier="audit", dependencies=None):
    return dict(id=identifier, objective="Audit input", depends_on=dependencies or [], allowed_input_ids=["dataset"],
                expected_artifact_kinds=["audit"], completion_criteria=["Actual findings returned"], status="pending")


def plan():
    return dict(id="plan", project_id="project", created_at=NOW, run_id="run", revision=1,
                steps=[step()], rationale_summary="Inspect input quality")


@pytest.mark.parametrize("payload", LEGACY, ids=lambda p: p["kind"])
def test_all_legacy_artifacts_read_without_rewrite(payload):
    before = copy.deepcopy(payload)
    assert legacy.artifact_adapter.validate_python(payload).model_dump(mode="json") == before
    assert read_artifact(payload).model_dump(mode="json") == before
    assert versioned_artifact_adapter.validate_python(payload).model_dump(mode="json") == before
    assert payload == before


def test_legacy_schema_bytes_are_frozen():
    expected = json.loads((FIXTURES / "legacy-schema-digests.json").read_text())
    for kind, digest in expected.items():
        text = (ROOT / "contracts" / "v1" / f"{kind}.json").read_text(encoding="utf-8")
        assert hashlib.sha256(text.encode()).hexdigest() == digest


@pytest.mark.parametrize("change", [{"kind": "invented"}, {"schema_version": "3.0"}, {"schema_version": None}, {"schema_version": ["1.0"]}])
def test_registry_rejects_unknown_or_invalid_discriminators(change):
    with pytest.raises(ValueError):
        read_artifact({**LEGACY[0], **change})


def test_missing_version_only_allowed_by_explicit_legacy_reader():
    payload = {k: v for k, v in LEGACY[0].items() if k != "schema_version"}
    assert legacy.artifact_adapter.validate_python(payload).schema_version == "1.0"
    with pytest.raises(ValueError):
        read_artifact(payload)
    for row in LEGACY:
        with pytest.raises(ValidationError):
            versioned_artifact_adapter.validate_python({k: v for k, v in row.items() if k != "schema_version"})


def test_dataset_unknowns_are_explicit_and_not_synthetic():
    value = s.DatasetV2(**dataset())
    assert value.source.data_kind.value is None
    assert value.source.license.origin == "unknown"
    saved = value.model_dump(mode="json")
    assert read_artifact(saved).model_dump(mode="json") == saved
    with pytest.raises(ValidationError):
        legacy.artifact_adapter.validate_python(saved)


@pytest.mark.parametrize("declaration", [
    {"origin": "unknown", "value": "synthetic"},
    {"origin": "user_supplied", "value": "synthetic", "supporting_references": []},
    {"origin": "user_supplied", "value": None, "supporting_references": [{"kind": "user_message", "id": "message"}]},
    {"origin": "source_derived", "value": "synthetic", "supporting_references": [{"kind": "user_message", "id": "message"}]},
    {"origin": "inferred", "value": "synthetic", "supporting_references": [{"kind": "artifact", "id": "data"}]},
    {"origin": "confirmed_by_model", "value": "empirical"},
    {"origin": "user_supplied", "value": "unspecified", "supporting_references": [{"kind": "user_message", "id": "message"}]},
])
def test_invalid_declaration_states_are_rejected(declaration):
    payload = dataset()
    payload["source"]["data_kind"] = declaration
    payload["unresolved_fields"].remove("data_kind")
    with pytest.raises(ValidationError):
        s.DatasetV2(**payload)


def test_inferred_declaration_keeps_its_origin_and_uncertainty():
    payload = dataset()
    payload["source"]["target"] = dict(origin="inferred", value="target", supporting_references=[{"kind": "artifact", "id": "data"}], rationale="Only outcome column", uncertainty="Unconfirmed")
    payload["unresolved_fields"].remove("target")
    assert s.DatasetV2(**payload).source.target.origin == "inferred"
    payload["unresolved_fields"].append("target")
    with pytest.raises(ValidationError, match="Unresolved fields"):
        s.DatasetV2(**payload)


def test_column_names_are_not_silently_normalized():
    payload = dataset()
    payload["columns"] = ["row", " target "]
    payload["source"]["target"] = dict(origin="user_supplied", value=" target ",
        supporting_references=[{"kind": "user_message", "id": "message"}])
    payload["unresolved_fields"].remove("target")
    value = s.DatasetV2(**payload)
    assert value.columns[-1] == value.source.target.value == " target "


@pytest.mark.parametrize("changes", [{"sha256": "b" * 64}, {"columns": ["row", "row"]}, {"rows": "3"}, {"rows": True}, {"unexpected": "data"}])
def test_dataset_identity_and_strict_shape(changes):
    with pytest.raises(ValidationError):
        s.DatasetV2(**{**dataset(), **changes})


def test_failure_attribution_and_receipt_roundtrip():
    value = s.FailureV2(**failure())
    saved = value.model_dump(mode="json")
    assert read_artifact(saved).model_dump(mode="json") == saved
    human = failure()
    human["actor"] = {"kind": "human", "operator_session_reference": "opaque-session-reference"}
    human["observation"] = {"kind": "researcher_assessment", "statement": "Not useful for my objective"}
    assert s.FailureV2(**human).actor.kind == "human"


@pytest.mark.parametrize("change", [
    {"actor": {"kind": "agent", "run_id": "run"}},
    {"actor": {**actor(), "operator_session_reference": "impersonation"}},
    {"observation": {"kind": "researcher_assessment", "statement": "The researcher says it failed"}},
    {"observation": {"kind": "execution_failure", "error_code": "RUN_CANCELLED", "observed_error": "Cancelled"}},
    {"receipt": {"state": "unknown", "external_id": "job", "request_sha256": HASH}},
])
def test_failure_rejects_ambiguous_actor_and_operational_events(change):
    with pytest.raises(ValidationError):
        s.FailureV2(**{**failure(), **change})


def test_criterion_must_actually_be_missed_on_assessed_benchmark():
    payload = failure()
    payload["observation"] = dict(kind="criterion_missed", protocol_id="protocol", protocol_revision=1,
                                  criterion_id="criterion", metric=metric(), success_comparison="lte", threshold=1.0)
    assert s.FailureV2(**payload).observation.metric.value == 2.0
    payload["observation"]["threshold"] = 3.0
    with pytest.raises(ValidationError, match="satisfies"):
        s.FailureV2(**payload)
    payload["observation"]["threshold"] = 1.0
    payload["observation"]["metric"]["artifact_id"] = "another-run"
    with pytest.raises(ValidationError, match="assessed benchmark"):
        s.FailureV2(**payload)


@pytest.mark.parametrize("change", [{"excerpt_sha256": "bad"}, {"page": 0}, {"locator": {"start": 8, "end": 2}}, {"locator": {"start": 0, "end": 8, "unit": "byte"}}])
def test_evidence_reference_cannot_invent_valid_locator_shape(change):
    with pytest.raises(ValidationError):
        TypeAdapter(s.EvidenceReference).validate_python({**evidence(), **change})


def test_unavailable_evidence_cannot_claim_a_page_or_excerpt():
    payload = {"availability": "unavailable", "source_artifact_id": "paper", "source_sha256": HASH, "reason": "No extracted text"}
    assert TypeAdapter(s.EvidenceReference).validate_python(payload).availability == "unavailable"
    with pytest.raises(ValidationError):
        TypeAdapter(s.EvidenceReference).validate_python({**payload, "page": 1})


def test_claims_require_references_without_claiming_semantic_proof():
    value = s.ClaimSet(project_id="project", run_id="run", revision=1, claims=[claim()])
    saved = value.model_dump(mode="json")
    assert read_artifact(saved).claims[0].semantic_review.status == "not_reviewed"
    with pytest.raises(ValidationError):
        s.Claim(**{**claim(), "metric_references": []})
    with pytest.raises(ValidationError):
        s.Claim(**{**claim(), "classification": "source_supported"})
    with pytest.raises(ValidationError):
        s.SemanticReview(status="supported")


def test_protocol_seals_before_release_and_forbids_test_winner():
    value = s.EvaluationProtocol(**protocol())
    assert read_artifact(value.model_dump(mode="json")).state == "sealed"
    for change in ({"state": "released"}, {"sealed_at": None}, {"features": ["target"]},
                   {"selected_candidate_id": "ridge"}, {"exposure_event_ids": ["prior-exposure"]}):
        with pytest.raises(ValidationError):
            s.EvaluationProtocol(**{**protocol(), **change})


@pytest.mark.parametrize("steps", [[step(), step()], [step(dependencies=["missing"])], [step("one", ["two"]), step("two", ["one"])], [step(dependencies=["audit"])]])
def test_plan_rejects_broken_dependency_graph(steps):
    with pytest.raises(ValidationError):
        r.ResearchPlan(**{**plan(), "steps": steps})


def test_reviewer_cannot_receive_write_permissions():
    assignment = dict(id="review", project_id="project", run_id="run", created_at=NOW, plan_revision=1,
                      role="scientific_reviewer", objective="Review claim", allowed_artifact_ids=["claim-set"],
                      allowed_material_ids=[], allowed_tools=["read_artifact"], budget_allocation_id="allocation",
                      deadline_at="2026-09-19T12:05:00Z", completion_criteria=["Return supported/unsupported findings"],
                      state="queued", reviewed_snapshot_sha256=HASH)
    assert r.SpecialistAssignment(**assignment).role == "scientific_reviewer"
    with pytest.raises(ValidationError):
        r.SpecialistAssignment(**{**assignment, "allowed_tools": ["run_baseline"]})


def test_budget_and_tool_outcomes_do_not_hide_uncertainty():
    assert r.ResourceLimits(**limits()).model_tokens == 1000
    assert r.UsageSnapshot(**usage()).cost.status == "unknown"
    with pytest.raises(ValidationError):
        r.ResourceLimits(**{**limits(), "finalization_model_tokens": 1001})
    with pytest.raises(ValidationError):
        r.UsageSnapshot(**{**usage(), "cost": {"status": "unknown", "amount": 0}})
    assert r.ToolResponse(action_id="action", attempt_id="attempt", outcome={"status": "submitted", "job_id": "job"})
    for outcome in ({"status": "submitted"}, {"status": "completed", "artifact_ids": [], "result": {"nested": [float("nan")]}}):
        with pytest.raises(ValidationError):
            r.ToolResponse(action_id="action", attempt_id="attempt", outcome=outcome)


def test_run_controls_do_not_accept_client_authority():
    for value in ({"expected_run_revision": 1, "claim_token": "forged"}, {"expected_run_revision": "1"}):
        with pytest.raises(ValidationError):
            r.RunControlInput(**value)
    with pytest.raises(ValidationError):
        r.RunAmendmentInput(expected_run_revision=1, expected_plan_revision=1)
    with pytest.raises(ValidationError):
        r.PlanAcceptanceInput(expected_run_revision=1)


def test_execution_record_roundtrip_and_no_hidden_trace_field():
    value = r.AgentExecutionRecord(project_id="project", run_id="run", objective="Audit fixture",
        inputs={"material_ids": [], "artifact_ids": ["dataset"]}, policy=POLICY, plan_revisions=[plan()],
        decisions=[], assignment_ids=[], actions=[], limits=limits(), usage=usage(),
        versions=dict(workbench_revision="test-commit", provider="fixture", model="fixture", model_revision=None,
                      provider_sdk="fixture", runtime="fixture", checkpointer="fixture", prompt="v1", tool_catalog="v1"),
        state_at_cutoff="running", event_cutoff=1, captured_at=NOW, pending_finalization_action_ids=["export"])
    saved = value.model_dump(mode="json")
    assert read_artifact(saved).model_dump(mode="json") == saved
    with pytest.raises(ValidationError):
        r.AgentExecutionRecord(**{**saved, "hidden_reasoning": "must not be stored"})
    assert len(ARTIFACT_READERS) == 13


@pytest.fixture
def api(tmp_path):
    app = create_app(Settings(_env_file=None, database_url=f"sqlite:///{tmp_path}/test.sqlite", storage_root=tmp_path,
                              api_token="a" * 48, efm_password="test-password-only"))
    Base.metadata.create_all(app.state.db.engine)
    with TestClient(app) as client:
        yield app, client
    app.state.db.engine.dispose()


def test_actual_openapi_has_contracts_and_guarded_run_routes(api):
    app, client = api
    schema = app.openapi()
    assert schema["openapi"].startswith("3.1")
    assert {"DatasetV2", "FailureV2", "ResearchRun", "ClaimSet", "EvaluationProtocol", "AgentExecutionRecord"} <= schema["components"]["schemas"].keys()
    assert "/api/v1/projects/{pid}/agent-runs/{rid}/review-plan" in schema["paths"]
    assert not any("checkpoint" in path for path in schema["paths"])
    assert schema["paths"]["/api/v1/projects"]["post"]["responses"]["201"]["content"]["application/json"]["schema"]["$ref"].endswith("/ProjectResponse")
    assert client.get("/api/v1/schema").status_code == 401
    client.headers["Authorization"] = "Bearer " + "a" * 48
    assert client.get("/api/v1/schema").json() == schema


def test_error_envelope_remains_compatible_and_does_not_echo_input(api):
    _, client = api
    unauthorized = client.get("/api/v1/projects")
    error = ErrorResponse.model_validate(unauthorized.json())
    assert error.error == "Unauthorized" and error.error_code == "UNAUTHORIZED"
    assert error.request_id == unauthorized.headers["x-request-id"]
    client.headers["Authorization"] = "Bearer " + "a" * 48
    response = client.post("/api/v1/projects", json={"name": "valid", "secret": "must-not-echo"})
    assert response.status_code == 422
    assert ErrorResponse.model_validate(response.json()).error_code == "VALIDATION_FAILED"
    assert isinstance(response.json()["error"], str) and isinstance(response.json()["details"], list)
    assert "must-not-echo" not in response.text
    assert client.get("/api/v1/projects/missing/artifacts").json()["error_code"] == "PROJECT_NOT_FOUND"

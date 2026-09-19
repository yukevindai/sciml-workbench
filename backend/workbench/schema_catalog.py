"""Single catalog used by file exports, OpenAPI and frontend generation."""

from pydantic import BaseModel, TypeAdapter

from . import contracts as legacy
from . import research_contracts as r
from . import scientific_contracts as s
from .contract_core import ErrorResponse
from .contract_registry import LEGACY_MODELS, NEW_ARTIFACT_MODELS, VersionedArtifact
from .http_contracts import JobResponse, LegacyJobResponse, ProjectResponse

BASE_URI = "https://sciml-workbench.local/contracts"
RECORD_TYPES = {
    "evidence_reference": s.EvidenceReference,
    "metric_reference": s.MetricReference,
    "failure_receipt": s.FailureReceipt,
    "research_run": r.ResearchRun,
    "run_input": r.RunInput,
    "run_control_input": r.RunControlInput,
    "run_amendment_input": r.RunAmendmentInput,
    "plan_acceptance_input": r.PlanAcceptanceInput,
    "research_plan": r.ResearchPlan,
    "specialist_assignment": r.SpecialistAssignment,
    "specialist_result": r.SpecialistResult,
    "research_question": r.ResearchQuestion,
    "question_answer_input": r.QuestionAnswerInput,
    "tool_request": r.ToolRequest,
    "tool_response": r.ToolResponse,
    "tool_descriptor": r.ToolDescriptor,
    "run_event": r.RunEvent,
    "resource_limits": r.ResourceLimits,
    "usage_snapshot": r.UsageSnapshot,
    "error_response": ErrorResponse,
    "project_response": ProjectResponse,
    "job_response": JobResponse,
}
CATALOG_TYPES = {
    **{m.__name__: m for m in (*LEGACY_MODELS, *NEW_ARTIFACT_MODELS)},
    **{model.__name__ if isinstance(model, type) and issubclass(model, BaseModel)
       else "".join(part.title() for part in name.split("_")): model
       for name, model in RECORD_TYPES.items()},
    "LegacyArtifact": legacy.Artifact,
    "VersionedArtifact": VersionedArtifact,
    "ProjectsResponse": list[ProjectResponse],
    "JobsResponse": list[LegacyJobResponse],
    "ArtifactsResponse": list[legacy.Artifact],
    **{m.__name__: m for m in (legacy.ProjectInput, legacy.Source, legacy.AuditInput,
                             legacy.SplitInput, legacy.BenchmarkInput, legacy.FailureInput)},
}

HTTP_RESPONSE_TYPES = {
    "ProjectResponse": ProjectResponse,
    "ProjectsResponse": list[ProjectResponse],
    "LegacyJobResponse": LegacyJobResponse,
    "JobsResponse": list[LegacyJobResponse],
    "LegacyArtifact": legacy.Artifact,
    "ArtifactsResponse": list[legacy.Artifact],
}


def without_null_defaults(value):
    # FastAPI's OpenAPI serialization omits default:null annotations.
    if isinstance(value, dict):
        return {k: without_null_defaults(v) for k, v in value.items() if k != "default" or v is not None}
    if isinstance(value, list):
        return [without_null_defaults(v) for v in value]
    return value


def catalog_schema(ref_template="#/$defs/{model}"):
    references, schema = TypeAdapter.json_schemas(
        [(name, "validation", TypeAdapter(model)) for name, model in CATALOG_TYPES.items()],
        ref_template=ref_template,
    )
    return references, schema


def add_openapi_contracts(schema):
    """Publish future component shapes without advertising unimplemented routes."""
    _, catalog = catalog_schema("#/components/schemas/{model}")
    components = schema.setdefault("components", {}).setdefault("schemas", {})
    # Existing FastAPI request/response components remain authoritative for routes.
    for name, definition in catalog.get("$defs", {}).items():
        if name in components and without_null_defaults(components[name]) != without_null_defaults(definition):
            raise ValueError(f"OpenAPI contract component collision: {name}")
        components.setdefault(name, definition)
    schema["x-workbench-contract-catalog"] = f"{BASE_URI}/catalog.json"
    return schema

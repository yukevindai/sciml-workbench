"""Shared primitives for new contracts; legacy 1.0 definitions stay unchanged."""

import math
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Identifier = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
# CSV header spelling is scientific input: never strip or rename it in a contract.
ColumnName = Annotated[str, Field(min_length=1, pattern=r"\S")]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
Digest = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
Counter = Annotated[int, Field(strict=True, ge=0, le=2**53 - 1)]
Revision = Annotated[int, Field(strict=True, ge=1, le=2**53 - 1)]
Number = Annotated[float, Field(strict=True, allow_inf_nan=False)]
Partition = Literal["train", "validation", "test", "excluded"]
RunState = Literal[
    "queued", "running", "waiting_for_job", "waiting_for_input", "paused",
    "completed", "partially_completed", "failed", "cancelled",
]
AgentRole = Literal[
    "coordinator", "data_evaluation", "evidence", "failure_memory", "scientific_reviewer",
]
ToolName = Literal[
    "inspect_project", "inspect_dataset", "list_artifacts", "read_artifact", "read_job",
    "run_audit", "generate_split", "seal_evaluation", "run_baseline", "read_evaluation",
    "ingest_evidence", "search_evidence", "read_evidence_span", "search_failures",
    "read_failure", "record_outcome", "reconcile_outcome", "validate_claims",
    "build_report", "verify_report", "replay_science", "read_memory",
]
ErrorCode = Literal[
    "UNAUTHORIZED", "ORIGIN_REJECTED", "PROJECT_NOT_FOUND", "ARTIFACT_NOT_FOUND",
    "JOB_NOT_FOUND", "IDEMPOTENCY_CONFLICT", "PROJECT_BUSY", "VALIDATION_FAILED",
    "LINEAGE_MISMATCH", "UPLOAD_TOO_LARGE", "STORAGE_UNAVAILABLE",
    "DEPENDENCY_UNAVAILABLE", "INTERNAL_ERROR", "ADMISSION_REJECTED", "JOB_TIMED_OUT",
    "WORKER_INTERRUPTED", "INTEGRITY_FAILED", "EXTERNAL_OUTCOME_UNKNOWN",
    "AGENT_UNAVAILABLE", "POLICY_DENIED", "DATA_EXPOSURE_DENIED", "RUN_REVISION_CHANGED",
    "QUESTION_STALE", "BUDGET_EXHAUSTED", "PROVIDER_UNAVAILABLE", "TOOL_SCHEMA_INVALID",
    "UNSUPPORTED_CAPABILITY", "REFERENCE_INVALID", "TEST_PROTOCOL_SEALED", "RUN_CANCELLED",
]


def finite_json(value):
    """Reject non-finite numbers even inside opaque upstream JSON dictionaries."""
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError("Non-finite numbers are not valid contract values")
    if isinstance(value, dict):
        for item in value.values():
            finite_json(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            finite_json(item)
    return value


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, validate_default=True,
                              json_schema_serialization_defaults_required=True)

    @model_validator(mode="before")
    @classmethod
    def reject_nonfinite(cls, value):
        return finite_json(value)


class PolicyReference(ContractModel):
    policy_id: Identifier
    revision: Revision
    sha256: Digest


class ContractReference(ContractModel):
    id: Identifier
    contract: Identifier
    schema_version: Annotated[str, Field(pattern=r"^[1-9][0-9]*\.[0-9]+$")]
    sha256: Digest


class ValidationIssue(ContractModel):
    loc: list[str | int]
    msg: Text


class ErrorResponse(ContractModel):
    """Additive API error fields: the original error string/details remain."""

    error: Text
    error_code: ErrorCode
    request_id: Identifier
    details: list[ValidationIssue] = Field(default_factory=list)

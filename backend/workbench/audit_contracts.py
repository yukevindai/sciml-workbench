"""Internal audit adapter values; persisted Audit 1.0 stays unchanged.

These types describe the pinned public serialization, not scientific admission.
Do not strip strings, summarize findings, or replace upstream metadata here.
"""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue


class AuditValue(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class AuditFinding(AuditValue):
    code: str
    severity: Literal["info", "warning", "error"]
    columns: list[str]
    rows: list[Annotated[int, Field(ge=0)]]
    message: str
    suggestion: str
    details: dict[str, JsonValue]


class AuditReport(AuditValue):
    n_rows: Annotated[int, Field(ge=1)]
    findings: list[AuditFinding]
    checks_run: list[str]
    checks_skipped: dict[str, str]
    metadata: dict[str, JsonValue]


class AuditOutput(AuditValue):
    execution_status: Literal["completed"] = "completed"
    scientific_acceptance: Literal["not_assessed"] = "not_assessed"
    source_sha256: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
    config: dict[str, JsonValue]
    result: AuditReport


class AuditInputError(ValueError):
    """Invalid upstream configuration/input; no completed audit is returned."""

    error_code = "VALIDATION_FAILED"

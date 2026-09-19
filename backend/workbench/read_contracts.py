"""Bounded B09 projections, separate from immutable scientific artifacts."""
from typing import Annotated, Literal
from pydantic import AwareDatetime, Field, model_validator
from .contract_core import ContractModel, Digest, Identifier
from .http_contracts import JobResponse


class ExternalReceiptProjection(ContractModel):
    external_id: Identifier
    connector: Literal["sciml-workbench"]
    state: Literal["prepared", "unknown", "confirmed"]
    request_sha256: Digest
    body_sha256: Digest
    attempts: int = Field(ge=0)
    submitted_at: AwareDatetime | None
    external_project_id: Identifier | None
    external_record_id: Identifier | None
    artifact_id: Identifier | None
    reconciliation_required: bool

    @model_validator(mode="after")
    def truthful_outcome(self):
        if self.reconciliation_required != (self.state == "unknown"):
            raise ValueError("Receipt reconciliation status does not match its outcome")
        if self.state == "confirmed":
            if self.external_project_id is None or self.external_record_id is None:
                raise ValueError("Confirmed receipt requires upstream identity")
        elif self.external_record_id is not None or self.artifact_id is not None:
            raise ValueError("Unconfirmed import cannot project a result")
        return self


class JobDetail(JobResponse):
    external_receipt: ExternalReceiptProjection | None = None


class ArtifactSummary(ContractModel):
    id: Identifier
    project_id: Identifier
    kind: str = Field(max_length=40)
    schema_version: str = Field(max_length=16)
    created_at: AwareDatetime


class ArtifactPage(ContractModel):
    items: list[ArtifactSummary] = Field(max_length=100)
    next_cursor: str | None = Field(default=None, max_length=2048)


class JobPage(ContractModel):
    items: list[JobDetail] = Field(max_length=100)
    next_cursor: str | None = Field(default=None, max_length=2048)


class CapabilityLimits(ContractModel):
    max_upload_bytes: int = Field(gt=0)
    max_rows: int = Field(gt=0)
    job_timeout_seconds: int = Field(gt=0)
    max_page_size: Literal[100] = 100
    max_detail_bytes: Literal[33554432] = 33554432


class Capabilities(ContractModel):
    schema_version: Literal["1.0"] = "1.0"
    operations: list[str] = Field(max_length=20)
    benchmark_models: list[str] = Field(max_length=20)
    split_strategies: list[str] = Field(max_length=20)
    artifact_read_versions: dict[str, list[str]]
    artifact_write_versions: dict[str, list[str]]
    dependency_pins: dict[str, Annotated[str, Field(pattern="^[a-f0-9]{40}$")]]
    limits: CapabilityLimits
    agent_reads_available: Literal[False] = False
    evaluation_exposure: Literal["unavailable_pending_C12"] = "unavailable_pending_C12"
    validation_only_execution: Literal[False] = False
    ocr: Literal[False] = False
    failure_search: Literal["project_scoped_lexical"] = "project_scoped_lexical"
    limitations: list[str] = Field(max_length=20)

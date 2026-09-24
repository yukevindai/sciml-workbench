"""Bounded B09 projections, separate from immutable scientific artifacts."""
from datetime import datetime
from typing import Annotated, Literal
from pydantic import AwareDatetime, Field, JsonValue, model_validator
from .contract_core import ContractModel, Digest, Identifier
from .contracts import Audit, Evidence, Provenance, Report, Split
from .http_contracts import IntakeDataset, IntakeFailure, JobResponse
from .scientific_contracts import ClaimSet, EvaluationProtocol


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
    schema_version: Literal["1.1"] = "1.1"
    operations: list[str] = Field(max_length=20)
    benchmark_models: list[str] = Field(max_length=20)
    split_strategies: list[str] = Field(max_length=20)
    artifact_read_versions: dict[str, list[str]]
    artifact_write_versions: dict[str, list[str]]
    dependency_pins: dict[str, Annotated[str, Field(pattern="^[a-f0-9]{40}$")]]
    limits: CapabilityLimits
    agent_reads_available: Literal[True] = True
    evaluation_exposure: Literal["tracked_with_quarantine"] = "tracked_with_quarantine"
    validation_only_execution: Literal[False] = False
    ocr: Literal[False] = False
    failure_search: Literal["project_scoped_lexical"] = "project_scoped_lexical"
    limitations: list[str] = Field(max_length=20)


class EvaluationStatusView(ContractModel):
    protocol_id: Identifier
    state: Literal["sealed", "released"]
    exploratory: bool
    clean_holdout_eligible: bool
    exposure_status: Literal["unexposed", "exposed", "unknown"]
    exposure_event_ids: list[Identifier]
    limitation: str


ScalarMetric = Literal["mae", "rmse", "r2", "group_mae", "group_rmse", "rows", "groups"]


class ValidationSearchPreview(ContractModel):
    parameters: dict[str, JsonValue]
    validation_primary: float


class BenchmarkMethodPreview(ContractModel):
    name: str | None
    seed: int | None
    parameters: dict[str, JsonValue] | None
    validation_search: list[ValidationSearchPreview] | None
    training_description: str | None


class BenchmarkPreview(ContractModel):
    """Manual list projection of a benchmark. Test-partition output is withheld and
    the projection itself records no holdout exposure; the complete artifact detail
    remains the explicit, exposure-recording reveal path."""
    kind: Literal["benchmark_preview"] = "benchmark_preview"
    schema_version: Literal["1.0"] = "1.0"
    id: str
    project_id: str
    created_at: datetime
    parents: list[str]
    software: dict[str, str]
    dataset_id: str
    split_id: str
    model: Literal["mean", "ridge"]
    seed: int
    status: Literal["succeeded", "failed"]
    error: str | None
    config: dict[str, JsonValue]
    protocol_ids: list[Identifier]
    validation_metrics: dict[ScalarMetric, float] | None
    method: BenchmarkMethodPreview | None
    verification_scope: str | None
    test_results: Literal["withheld", "not_produced"]
    holdout_exposure: Literal["unexposed", "exposed", "unknown"]
    bundle_available: bool

    @model_validator(mode="after")
    def withheld_only_when_computed(self):
        if (self.test_results == "withheld") != (self.status == "succeeded"):
            raise ValueError("Only succeeded benchmarks have withheld test output")
        if self.status == "failed" and (self.validation_metrics is not None or self.method is not None):
            raise ValueError("Failed benchmarks have no scientific result projection")
        return self


class EvaluationView(ContractModel):
    artifact_id: Identifier
    protocol_id: Identifier
    status: Literal["succeeded", "failed"]
    model: Literal["mean", "ridge"]
    seed: int
    metrics: dict[Literal["validation", "test"], dict[Literal["mae", "rmse", "r2", "group_mae", "group_rmse", "rows", "groups"], float]]
    test_visible: bool
    evaluation: EvaluationStatusView

    @model_validator(mode="after")
    def consistent_visibility(self):
        if self.test_visible != ("test" in self.metrics):
            raise ValueError("Test visibility must match the projected partitions")
        if self.test_visible and self.evaluation.state != "released":
            raise ValueError("Test projection requires a released comparison")
        return self


ArtifactPreview = Annotated[IntakeDataset | Audit | Split | BenchmarkPreview | Evidence | IntakeFailure | Provenance
                            | Report | EvaluationProtocol | ClaimSet, Field(discriminator="kind")]

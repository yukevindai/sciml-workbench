"""Bounded B09 projections, separate from immutable scientific artifacts."""
from datetime import datetime
from typing import Annotated, Literal
from pydantic import AwareDatetime, Field, JsonValue, model_validator
from .contract_core import ContractModel, Counter, Digest, ErrorCode, Identifier, Text
from .contracts import Audit, Evidence, Provenance, Report, Split
from .http_contracts import IntakeDataset, IntakeFailure, JobResponse
from .scientific_contracts import AvailableEvidenceReference, ClaimSet, EvaluationProtocol
from .research_contracts import AgentExecutionRecord, ExecutionVersions
from .contract_core import PolicyReference, RunState


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


class JobRunLink(ContractModel):
    """An agent run's recorded use of a job; absence is not proof of a manual origin."""
    run_id: Identifier
    action_id: Identifier
    ownership: Literal["owned", "shared", "detached"]


class JobRecoveryProjection(ContractModel):
    """D04 decision for a failed job; the original attempt is never rewritten."""
    state: Literal["pending", "running", "completed", "exhausted"]
    eligible: bool
    attempts: int = Field(ge=0)
    max_attempts: int = Field(ge=0)
    retry_job_id: Identifier | None
    next_attempt_at: AwareDatetime | None
    last_error_code: ErrorCode | None


class JobDetail(JobResponse):
    external_receipt: ExternalReceiptProjection | None = None
    run_links: list[JobRunLink] = Field(default_factory=list, max_length=100)
    recovery: JobRecoveryProjection | None = None


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
                            | Report | EvaluationProtocol | ClaimSet | AgentExecutionRecord, Field(discriminator="kind")]


class EvidencePageText(ContractModel):
    """Exact retained PDFium text layer for one upstream page; never OCR or normalized."""
    source_artifact_id: Identifier
    source_sha256: Digest
    page: Annotated[int, Field(strict=True, ge=1)]
    page_count: Annotated[int, Field(strict=True, ge=1)]
    has_text: bool
    text: Annotated[str, Field(max_length=1_000_000)]
    text_sha256: Digest
    representation_sha256: Digest
    extraction_version: Text

    @model_validator(mode="after")
    def consistent_page(self):
        if self.page > self.page_count or bool(self.text.strip()) != self.has_text:
            raise ValueError("Page text must match its inventory and availability")
        return self


class EvidenceSpanView(ContractModel):
    """A reverified citation with bounded unmodified context; not semantic support."""
    reference: AvailableEvidenceReference
    span_id: Identifier | None = None
    text: Annotated[str, Field(min_length=1, max_length=4000)]
    before: Annotated[str, Field(max_length=320)]
    after: Annotated[str, Field(max_length=320)]
    representation_length: Counter

    @model_validator(mode="after")
    def consistent_span(self):
        start, end = self.reference.locator.start, self.reference.locator.end
        if (len(self.text) != end - start or len(self.before) != min(start, 320)
                or end > self.representation_length or len(self.after) != min(self.representation_length - end, 320)):
            raise ValueError("Span context must match its code-point locator")
        return self


class EvidenceAnchor(ContractModel):
    """Immutable named anchor; text is read and reverified separately."""
    id: Identifier
    source_artifact_id: Identifier
    reference: AvailableEvidenceReference
    created_at: AwareDatetime


class ReportInput(ContractModel):
    """Identity of one frozen archived artifact; scientific values are not projected."""
    id: Identifier
    kind: Annotated[str, Field(max_length=40)]
    schema_version: Annotated[str, Field(max_length=16)]
    created_at: AwareDatetime
    label: Annotated[str, Field(max_length=300)]
    parents: list[Identifier]


class ReportJob(ContractModel):
    id: Identifier
    kind: Annotated[str, Field(max_length=40)]
    state: Literal["succeeded", "failed"]
    result_id: Identifier | None
    error_code: Annotated[str, Field(max_length=60)] | None


class ReportMaterial(ContractModel):
    id: Identifier
    filename: Annotated[str, Field(max_length=300)]
    media_type: Literal["text/csv", "application/pdf"]
    sha256: Digest


class ReportScope(ContractModel):
    kind: Literal["project", "run"]
    run_id: Identifier | None
    revision: int | None
    execution_cutoff: int | None
    export_status_at_cutoff: Literal["pending"] | None


class ReportAgentExecution(ContractModel):
    execution_record_id: Identifier
    run_id: Identifier
    objective: Text
    versions: ExecutionVersions
    policy: PolicyReference
    state_at_cutoff: RunState
    event_cutoff: Counter
    captured_at: AwareDatetime
    pending_finalization_action_ids: list[Identifier]


class ReportFinalization(ContractModel):
    execution_record_id: Identifier | None
    claim_set_id: Identifier | None
    review_status: Annotated[str, Field(max_length=60)] | None
    runtime_version_count: Counter
    gaps: list[Annotated[str, Field(max_length=4000)]]


class ReportVerification(ContractModel):
    status: Literal["verified", "failed"]
    method: Literal["structural"] = "structural"
    checked_at: AwareDatetime
    reason: Text | None = None


class ReportSummary(ContractModel):
    """Current structural reverification of stored report bytes plus frozen identities.

    Scientific replay is never run by this read; its status is always reported as not run.
    """
    report_id: Identifier
    sha256: Digest
    size_bytes: Counter
    verification: ReportVerification
    scientific_replay: Literal["not_run"] = "not_run"
    manifest_version: Literal["1.0", "2.0"] | None
    captured_at: AwareDatetime | None
    scope: ReportScope | None
    file_count: Counter
    inputs: list[ReportInput]
    jobs: list[ReportJob]
    materials: list[ReportMaterial]
    software: dict[Identifier, Annotated[str, Field(max_length=300)]]
    python: Annotated[str, Field(max_length=60)] | None
    platform: Annotated[str, Field(max_length=300)] | None
    upstream_commits: dict[Identifier, Annotated[str, Field(max_length=100)]]
    agent_executions: list[ReportAgentExecution]
    finalization: ReportFinalization | None

    @model_validator(mode="after")
    def failed_reports_have_no_contents(self):
        if self.verification.status == "failed":
            if self.verification.reason is None or self.inputs or self.jobs or self.materials or self.agent_executions                     or self.scope is not None or self.finalization is not None or self.software or self.upstream_commits:
                raise ValueError("A report that failed verification cannot project its contents")
        elif self.verification.reason is not None or self.manifest_version is None:
            raise ValueError("Verified reports require a manifest and no failure reason")
        return self

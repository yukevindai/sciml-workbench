"""New scientific record shapes. Validation is not scientific admission or truth."""

from typing import Annotated, Generic, Literal, TypeVar

from pydantic import AwareDatetime, Field, JsonValue, model_validator

from .contract_core import (
    ColumnName, ContractModel, Counter, Digest, Identifier, Number, Partition, PolicyReference,
    Revision, Text,
)
from .contracts import now, uid

T = TypeVar("T")


class ArtifactEnvelope(ContractModel):
    schema_version: Literal["1.0"] = "1.0"
    id: Identifier = Field(default_factory=uid)
    project_id: Identifier
    created_at: AwareDatetime = Field(default_factory=now)
    parents: list[Identifier] = Field(default_factory=list)
    software: dict[Identifier, Text] = Field(default_factory=dict)


class DeclarationReference(ContractModel):
    kind: Literal["user_message", "operator_assertion", "source_span", "artifact"]
    id: Identifier


class UnknownDeclaration(ContractModel):
    origin: Literal["unknown"] = "unknown"
    value: None = None
    supporting_references: list[DeclarationReference] = Field(default_factory=list)
    uncertainty: Text | None = None


class UserDeclaration(ContractModel, Generic[T]):
    origin: Literal["user_supplied"]
    value: T
    supporting_references: list[DeclarationReference] = Field(min_length=1)
    uncertainty: Text | None = None

    @model_validator(mode="after")
    def user_attribution(self):
        if not any(r.kind in {"user_message", "operator_assertion"} for r in self.supporting_references):
            raise ValueError("User-supplied declarations require a user attribution reference")
        return self


class SourceDeclaration(ContractModel, Generic[T]):
    origin: Literal["source_derived"]
    value: T
    supporting_references: list[DeclarationReference] = Field(min_length=1)
    uncertainty: Text | None = None

    @model_validator(mode="after")
    def source_attribution(self):
        if not any(r.kind in {"source_span", "artifact"} for r in self.supporting_references):
            raise ValueError("Source-derived declarations require a source reference")
        return self


class InferredDeclaration(ContractModel, Generic[T]):
    origin: Literal["inferred"]
    value: T
    supporting_references: list[DeclarationReference] = Field(min_length=1)
    rationale: Text
    uncertainty: Text
    confidence: Annotated[float, Field(strict=True, ge=0, le=1)] | None = None


type Declaration[T] = Annotated[
    UnknownDeclaration | UserDeclaration[T] | SourceDeclaration[T] | InferredDeclaration[T],
    Field(discriminator="origin"),
]
DeclarationField = Literal[
    "citation", "url", "license", "data_kind", "transformations", "units", "target", "independent_unit",
]


class IndependentUnit(ContractModel):
    name: Text
    group_columns: list[ColumnName] = Field(min_length=1)
    rationale: Text


class SourceDeclarations(ContractModel):
    citation: Declaration[Text] = Field(default_factory=UnknownDeclaration)
    url: Declaration[Text] = Field(default_factory=UnknownDeclaration)
    license: Declaration[Text] = Field(default_factory=UnknownDeclaration)
    data_kind: Declaration[Literal["empirical", "synthetic"]] = Field(default_factory=UnknownDeclaration)
    transformations: Declaration[list[Text]] = Field(default_factory=UnknownDeclaration)
    units: Declaration[Annotated[dict[ColumnName, Text], Field(min_length=1)]] = Field(default_factory=UnknownDeclaration)
    target: Declaration[ColumnName] = Field(default_factory=UnknownDeclaration)
    independent_unit: Declaration[IndependentUnit] = Field(default_factory=UnknownDeclaration)


class DatasetV2(ArtifactEnvelope):
    kind: Literal["dataset"] = "dataset"
    schema_version: Literal["2.0"] = "2.0"
    filename: Text
    blob_key: Digest
    sha256: Digest
    rows: Annotated[int, Field(strict=True, ge=3)]
    columns: Annotated[list[ColumnName], Field(min_length=1, max_length=200)]
    source: SourceDeclarations
    unresolved_fields: list[DeclarationField]

    @model_validator(mode="after")
    def consistent_declarations(self):
        if self.blob_key != self.sha256:
            raise ValueError("Dataset blob key must identify its exact-byte digest")
        if len(self.columns) != len(set(self.columns)):
            raise ValueError("Dataset columns must be unique")
        unknown = {name for name in SourceDeclarations.model_fields if getattr(self.source, name).origin == "unknown"}
        if len(self.unresolved_fields) != len(set(self.unresolved_fields)) or set(self.unresolved_fields) != unknown:
            raise ValueError("Unresolved fields must exactly match unknown declarations")
        if self.source.target.origin != "unknown" and self.source.target.value not in self.columns:
            raise ValueError("Declared target must be a dataset column")
        if self.source.units.origin != "unknown" and not set(self.source.units.value) <= set(self.columns):
            raise ValueError("Units must reference dataset columns")
        if self.source.independent_unit.origin != "unknown" and not set(self.source.independent_unit.value.group_columns) <= set(self.columns):
            raise ValueError("Independent groups must reference dataset columns")
        return self


class TextSpan(ContractModel):
    kind: Literal["text_span"] = "text_span"
    unit: Literal["unicode_codepoint"] = "unicode_codepoint"
    start: Counter
    end: Annotated[int, Field(strict=True, ge=1, le=2**53 - 1)]

    @model_validator(mode="after")
    def ordered(self):
        if self.end <= self.start:
            raise ValueError("Text span end must follow start")
        return self


class AvailableEvidenceReference(ContractModel):
    contract: Literal["evidence_reference"] = "evidence_reference"
    schema_version: Literal["1.0"] = "1.0"
    availability: Literal["available"]
    source_artifact_id: Identifier
    source_sha256: Digest
    representation_sha256: Digest
    extraction_version: Text
    locator: TextSpan
    excerpt_sha256: Digest
    page: Annotated[int, Field(strict=True, ge=1)] | None = None


class UnavailableEvidenceReference(ContractModel):
    contract: Literal["evidence_reference"] = "evidence_reference"
    schema_version: Literal["1.0"] = "1.0"
    availability: Literal["unavailable"]
    source_artifact_id: Identifier
    source_sha256: Digest
    reason: Text
    # No invented locator, page, excerpt or representation for failed extraction.


EvidenceReference = Annotated[
    AvailableEvidenceReference | UnavailableEvidenceReference, Field(discriminator="availability"),
]


class MetricReference(ContractModel):
    artifact_id: Identifier
    field_path: Annotated[str, Field(pattern=r"^/(?:[^~/]|~[01])+(?:/(?:[^~/]|~[01])+)*$")]
    partition: Partition
    value: Number
    units: Text | None = None


class HumanActor(ContractModel):
    kind: Literal["human"]
    operator_session_reference: Identifier


class AgentActor(ContractModel):
    kind: Literal["agent"]
    run_id: Identifier
    assignment_id: Identifier | None = None
    action_id: Identifier
    provider: Identifier
    model: Identifier
    prompt_version: Identifier
    policy: PolicyReference
    policy_rule_id: Identifier


AssessmentActor = Annotated[HumanActor | AgentActor, Field(discriminator="kind")]


class ExecutionFailure(ContractModel):
    kind: Literal["execution_failure"]
    error_code: Literal["ADMISSION_REJECTED", "JOB_TIMED_OUT", "WORKER_INTERRUPTED", "INTEGRITY_FAILED"]
    observed_error: Text


class CriterionFailure(ContractModel):
    kind: Literal["criterion_missed"]
    protocol_id: Identifier
    protocol_revision: Revision
    criterion_id: Identifier
    metric: MetricReference
    success_comparison: Literal["lt", "lte", "gt", "gte"]
    threshold: Number

    @model_validator(mode="after")
    def missed(self):
        value = self.metric.value
        passed = {"lt": value < self.threshold, "lte": value <= self.threshold,
                  "gt": value > self.threshold, "gte": value >= self.threshold}[self.success_comparison]
        if passed:
            raise ValueError("Observed metric satisfies the success criterion")
        return self


class ResearcherAssessment(ContractModel):
    kind: Literal["researcher_assessment"]
    statement: Text


FailureObservation = Annotated[
    ExecutionFailure | CriterionFailure | ResearcherAssessment, Field(discriminator="kind"),
]


class FailureReceipt(ContractModel):
    connector: Literal["sciml-workbench"] = "sciml-workbench"
    external_id: Identifier
    request_sha256: Digest
    state: Literal["confirmed"] = "confirmed"
    external_project_id: Identifier
    external_record_id: Identifier
    record: dict[str, JsonValue]


class FailureV2(ArtifactEnvelope):
    kind: Literal["failure"] = "failure"
    schema_version: Literal["2.0"] = "2.0"
    benchmark_id: Identifier
    source_job_id: Identifier
    reason: Text
    uncertainty_notes: Text
    actor: AssessmentActor
    observation: FailureObservation
    causal_hypotheses: list[Text] = Field(default_factory=list)
    receipt: FailureReceipt

    @model_validator(mode="after")
    def truthful_actor(self):
        if self.actor.kind == "agent" and self.observation.kind == "researcher_assessment":
            raise ValueError("An agent cannot make a researcher assessment")
        if self.observation.kind == "criterion_missed" and self.observation.metric.artifact_id != self.benchmark_id:
            raise ValueError("Criterion must reference the assessed benchmark")
        return self


class ReferenceCheck(ContractModel):
    status: Literal["not_checked", "valid", "invalid"]
    checked_at: AwareDatetime | None = None
    issues: list[Text] = Field(default_factory=list)

    @model_validator(mode="after")
    def consistent_status(self):
        if (self.status == "not_checked") != (self.checked_at is None):
            raise ValueError("Completed reference checks require a timestamp")
        if self.status == "valid" and self.issues:
            raise ValueError("A valid reference check cannot contain failures")
        if self.status == "invalid" and not self.issues:
            raise ValueError("An invalid reference check must explain its failures")
        return self


class SemanticReview(ContractModel):
    status: Literal["supported", "partially_supported", "unsupported", "conflicting", "not_reviewed"]
    reviewed_snapshot_sha256: Digest | None = None
    reviewer_assignment_id: Identifier | None = None
    explanation: Text | None = None

    @model_validator(mode="after")
    def bound_review(self):
        completed = self.status != "not_reviewed"
        if completed != all(v is not None for v in (self.reviewed_snapshot_sha256, self.reviewer_assignment_id, self.explanation)):
            raise ValueError("Semantic review requires an exact snapshot, reviewer and explanation")
        if not completed and any(v is not None for v in (self.reviewed_snapshot_sha256, self.reviewer_assignment_id, self.explanation)):
            raise ValueError("Unreviewed claims cannot carry a completed review")
        return self


class Claim(ContractModel):
    id: Identifier
    statement: Text
    classification: Literal["computed_result", "source_supported", "interpretation", "hypothesis"]
    source_references: list[AvailableEvidenceReference] = Field(default_factory=list)
    metric_references: list[MetricReference] = Field(default_factory=list)
    population: Text
    split_id: Identifier | None = None
    limitations: list[Text]
    uncertainty: Text
    reference_check: ReferenceCheck
    semantic_review: SemanticReview

    @model_validator(mode="after")
    def supported_shape(self):
        if self.classification == "computed_result" and not self.metric_references:
            raise ValueError("Computed claims require metric references")
        if self.classification == "source_supported" and not self.source_references:
            raise ValueError("Source-supported claims require available source references")
        return self


class ClaimSet(ArtifactEnvelope):
    kind: Literal["claim_set"] = "claim_set"
    run_id: Identifier
    revision: Revision
    claims: list[Claim] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_claims(self):
        if len({c.id for c in self.claims}) != len(self.claims):
            raise ValueError("Claim IDs must be unique")
        return self


class EvaluationCandidate(ContractModel):
    id: Identifier
    model: Literal["mean", "ridge"]
    seed: Annotated[int, Field(strict=True, ge=0, lt=2**32)]
    configuration_sha256: Digest


class SuccessCriterion(ContractModel):
    id: Identifier
    metric: Identifier
    partition: Literal["validation", "test"]
    comparison: Literal["lt", "lte", "gt", "gte"]
    threshold: Number
    declaration_reference: DeclarationReference


class EvaluationProtocol(ArtifactEnvelope):
    kind: Literal["evaluation_protocol"] = "evaluation_protocol"
    revision: Revision
    dataset_id: Identifier
    dataset_sha256: Digest
    split_id: Identifier
    split_sha256: Digest
    configuration_sha256: Digest
    target: ColumnName
    features: list[ColumnName] = Field(min_length=1)
    preprocessing: Text
    independent_unit: IndependentUnit
    candidates: list[EvaluationCandidate] = Field(min_length=1)
    primary_metric: Identifier
    selection_rule: Literal["validation", "predeclared_comparison"]
    success_criterion: SuccessCriterion | None = None
    state: Literal["draft", "sealed", "released"]
    sealed_at: AwareDatetime | None = None
    released_at: AwareDatetime | None = None
    selected_candidate_id: Identifier | None = None
    exposure_status: Literal["unexposed", "exposed", "unknown"]
    exposure_event_ids: list[Identifier] = Field(default_factory=list)

    @model_validator(mode="after")
    def consistent_protocol(self):
        ids = [c.id for c in self.candidates]
        if len(set(ids)) != len(ids) or len(set(self.features)) != len(self.features):
            raise ValueError("Candidate IDs and features must be unique")
        if self.target in self.features:
            raise ValueError("Target cannot be a feature")
        if (self.state != "draft") != (self.sealed_at is not None):
            raise ValueError("Sealed protocols require a seal timestamp")
        if (self.state == "released") != (self.released_at is not None):
            raise ValueError("Released protocols require a release timestamp")
        if self.released_at and self.released_at < self.sealed_at:
            raise ValueError("Test release cannot precede sealing")
        if self.selected_candidate_id is not None and (self.selected_candidate_id not in ids or self.state == "draft"):
            raise ValueError("Selection must reference a sealed candidate")
        if self.selection_rule == "predeclared_comparison" and self.selected_candidate_id is not None:
            raise ValueError("A predeclared comparison does not select a post-hoc winner")
        if self.exposure_status == "unexposed" and self.exposure_event_ids:
            raise ValueError("Exposure history cannot be labeled unexposed")
        return self

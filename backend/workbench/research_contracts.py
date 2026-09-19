"""Versioned agent wire/storage contracts, not a runnable agent implementation."""

from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, JsonValue, model_validator

from .contract_core import (
    AgentRole, ContractModel, ContractReference, Counter, Digest, ErrorCode,
    Identifier, PolicyReference, Revision, RunState, Text, ToolName,
)
from .scientific_contracts import ArtifactEnvelope, Claim, EvidenceReference


class RuntimeRecord(ContractModel):
    schema_version: Literal["1.0"] = "1.0"
    id: Identifier
    project_id: Identifier
    created_at: AwareDatetime


class InputScope(ContractModel):
    material_ids: list[Identifier]
    artifact_ids: list[Identifier]
    conversation_id: Identifier | None = None
    message_cutoff: Counter | None = None

    @model_validator(mode="after")
    def scoped_cutoff(self):
        if (self.conversation_id is None) != (self.message_cutoff is None):
            raise ValueError("Conversation scope requires both ID and message cutoff")
        for values in (self.material_ids, self.artifact_ids):
            if len(values) != len(set(values)):
                raise ValueError("Input scope IDs must be unique")
        return self


class ResourceLimits(ContractModel):
    """Values are required; E01 owns defaults and server/project intersections."""

    model_tokens: Counter
    model_requests: Counter
    tool_calls: Counter
    coordinator_iterations: Counter
    specialist_assignments: Counter
    specialist_concurrency: Counter
    delegation_depth: Annotated[int, Field(strict=True, ge=0, le=1)]
    review_rounds: Counter
    scientific_attempts: Counter
    active_seconds: Counter
    transient_retries: Counter
    # Reserved inside, never in addition to, the aggregate allowance.
    finalization_model_tokens: Counter
    finalization_scientific_attempts: Counter

    @model_validator(mode="after")
    def bounded_allocations(self):
        if self.finalization_model_tokens > self.model_tokens or self.finalization_scientific_attempts > self.scientific_attempts:
            raise ValueError("Finalization reservation exceeds the aggregate allowance")
        if self.specialist_concurrency > self.specialist_assignments:
            raise ValueError("Specialist concurrency exceeds the assignment allowance")
        return self


class UnknownCost(ContractModel):
    status: Literal["unknown"]
    reason: Text


class EstimatedCost(ContractModel):
    status: Literal["estimated"]
    amount: Annotated[float, Field(strict=True, ge=0, allow_inf_nan=False)]
    currency: Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
    pricing_revision: Identifier


CostEstimate = Annotated[UnknownCost | EstimatedCost, Field(discriminator="status")]


class UsageSnapshot(ContractModel):
    billed_token_categories: dict[Identifier, Counter]
    reserved_tokens: Counter
    model_requests: Counter
    tool_calls: Counter
    scientific_attempts: Counter
    active_seconds: Counter
    unknown_request_ids: list[Identifier]
    cost: CostEstimate


class ResearchStep(ContractModel):
    id: Identifier
    objective: Text
    depends_on: list[Identifier]
    allowed_input_ids: list[Identifier]
    expected_artifact_kinds: list[Identifier]
    completion_criteria: list[Text] = Field(min_length=1)
    status: Literal["pending", "ready", "running", "blocked", "completed", "failed", "skipped"]
    action_ids: list[Identifier] = Field(default_factory=list)


class ResearchPlan(RuntimeRecord):
    contract: Literal["research_plan"] = "research_plan"
    run_id: Identifier
    revision: Revision
    steps: list[ResearchStep] = Field(min_length=1, max_length=120)
    rationale_summary: Text

    @model_validator(mode="after")
    def dependency_graph(self):
        by_id = {s.id: s for s in self.steps}
        if len(by_id) != len(self.steps):
            raise ValueError("Plan step IDs must be unique")
        for step in self.steps:
            if len(step.depends_on) != len(set(step.depends_on)) or not set(step.depends_on) <= by_id.keys():
                raise ValueError("Plan dependencies must be unique existing steps")
        pending = {s.id: set(s.depends_on) for s in self.steps}
        while pending:
            ready = {key for key, deps in pending.items() if not deps}
            if not ready:
                raise ValueError("Plan dependencies must be acyclic")
            pending = {key: deps - ready for key, deps in pending.items() if key not in ready}
        return self


class RunInput(ContractModel):
    objective: Text
    inputs: InputScope
    policy_revision: Revision
    mode: Literal["autopilot", "review_plan"] = "autopilot"
    limits: ResourceLimits


class ResearchRun(RuntimeRecord):
    contract: Literal["research_run"] = "research_run"
    objective: Text
    inputs: InputScope
    policy: PolicyReference
    mode: Literal["autopilot", "review_plan"]
    state: RunState
    control_revision: Revision
    plan_revision: Counter
    limits: ResourceLimits
    usage: UsageSnapshot
    open_question_ids: list[Identifier]
    result_artifact_ids: list[Identifier]
    continued_from_run_id: Identifier | None = None
    finished_at: AwareDatetime | None = None
    stop_reason: Text | None = None

    @model_validator(mode="after")
    def terminal_shape(self):
        terminal = self.state in {"completed", "partially_completed", "failed", "cancelled"}
        if terminal != (self.finished_at is not None):
            raise ValueError("Only terminal runs have a finish timestamp")
        if self.finished_at and self.finished_at < self.created_at:
            raise ValueError("Run cannot finish before acceptance")
        if self.state in {"partially_completed", "failed", "cancelled"} and self.stop_reason is None:
            raise ValueError("Incomplete terminal runs require a stop reason")
        return self


class RunControlInput(ContractModel):
    expected_run_revision: Revision


class PlanAcceptanceInput(RunControlInput):
    expected_plan_revision: Revision


class RunAmendmentInput(RunControlInput):
    expected_plan_revision: Counter
    objective: Text | None = None
    inputs: InputScope | None = None
    policy_revision: Revision | None = None

    @model_validator(mode="after")
    def meaningful(self):
        if self.objective is None and self.inputs is None and self.policy_revision is None:
            raise ValueError("An amendment must supply a change")
        return self


class SpecialistAssignment(RuntimeRecord):
    contract: Literal["specialist_assignment"] = "specialist_assignment"
    run_id: Identifier
    plan_revision: Revision
    role: Literal["data_evaluation", "evidence", "failure_memory", "scientific_reviewer"]
    objective: Text
    allowed_artifact_ids: list[Identifier]
    allowed_material_ids: list[Identifier]
    allowed_tools: list[ToolName]
    budget_allocation_id: Identifier
    deadline_at: AwareDatetime
    completion_criteria: list[Text] = Field(min_length=1)
    state: Literal["queued", "running", "waiting", "completed", "failed", "cancelled"]
    reviewed_snapshot_sha256: Digest | None = None

    @model_validator(mode="after")
    def reviewer_reads_only(self):
        read_tools = {"inspect_project", "inspect_dataset", "list_artifacts", "read_artifact", "read_job",
                      "read_evaluation", "search_evidence", "read_evidence_span", "search_failures",
                      "read_failure", "validate_claims", "read_memory"}
        if self.role == "scientific_reviewer" and not set(self.allowed_tools) <= read_tools:
            raise ValueError("Scientific reviewers cannot receive mutation tools")
        if self.role == "scientific_reviewer" and self.reviewed_snapshot_sha256 is None:
            raise ValueError("Scientific review requires a candidate snapshot")
        if self.deadline_at <= self.created_at:
            raise ValueError("Assignment deadline must follow creation")
        return self


class SpecialistResult(ContractModel):
    contract: Literal["specialist_result"] = "specialist_result"
    schema_version: Literal["1.0"] = "1.0"
    assignment_id: Identifier
    findings: list[Claim]
    supporting_artifact_ids: list[Identifier]
    uncertainty: Text
    unresolved_issues: list[Text]
    recommended_actions: list[Text]


class QuestionOption(ContractModel):
    id: Identifier
    label: Text
    consequence: Text


class MaterialQuestion(ContractModel):
    id: Identifier
    field: Identifier
    prompt: Text
    blocked_step_ids: list[Identifier] = Field(min_length=1)
    options: list[QuestionOption]
    evidence: list[EvidenceReference]

    @model_validator(mode="after")
    def unique_options(self):
        if len({o.id for o in self.options}) != len(self.options):
            raise ValueError("Question option IDs must be unique")
        return self


class ResearchQuestion(RuntimeRecord):
    contract: Literal["research_question"] = "research_question"
    run_id: Identifier
    revision: Revision
    run_revision: Revision
    questions: list[MaterialQuestion] = Field(min_length=1, max_length=20)
    status: Literal["open", "answered", "superseded", "expired", "cancelled"]
    expires_at: AwareDatetime | None = None
    answer_message_id: Identifier | None = None

    @model_validator(mode="after")
    def answer_identity(self):
        if len({q.id for q in self.questions}) != len(self.questions):
            raise ValueError("Question IDs must be unique")
        if (self.status == "answered") != (self.answer_message_id is not None):
            raise ValueError("Answered questions require an attributed answer message")
        return self


class QuestionAnswerInput(RunControlInput):
    expected_question_revision: Revision
    answers: Annotated[dict[Identifier, Text], Field(min_length=1, max_length=20)]


class ToolRequest(ContractModel):
    """Trusted dispatch envelope. A provider proposes only name/arguments."""

    contract: Literal["tool_request"] = "tool_request"
    schema_version: Literal["1.0"] = "1.0"
    run_id: Identifier
    action_id: Identifier
    attempt_id: Identifier
    assignment_id: Identifier | None = None
    name: ToolName
    tool_version: Identifier
    arguments: dict[str, JsonValue]
    request_sha256: Digest
    policy: PolicyReference


class ToolCompleted(ContractModel):
    status: Literal["completed"]
    artifact_ids: list[Identifier]
    result: dict[str, JsonValue]


class ToolSubmitted(ContractModel):
    status: Literal["submitted"]
    job_id: Identifier


class ToolBlocked(ContractModel):
    status: Literal["blocked"]
    error_code: ErrorCode
    reason: Text
    blocked_step_ids: list[Identifier]


class ToolFailed(ContractModel):
    status: Literal["failed"]
    error_code: ErrorCode
    error: Text


ToolOutcome = Annotated[ToolCompleted | ToolSubmitted | ToolBlocked | ToolFailed, Field(discriminator="status")]


class ToolResponse(ContractModel):
    contract: Literal["tool_response"] = "tool_response"
    schema_version: Literal["1.0"] = "1.0"
    action_id: Identifier
    attempt_id: Identifier
    outcome: ToolOutcome


class ToolDescriptor(ContractModel):
    contract: Literal["tool_descriptor"] = "tool_descriptor"
    schema_version: Literal["1.0"] = "1.0"
    name: ToolName
    version: Identifier
    purpose: Text
    input_schema_id: Text
    output_schema_id: Text
    allowed_roles: list[AgentRole] = Field(min_length=1)
    prerequisites: list[Text]
    accepted_artifact_versions: dict[Identifier, list[Identifier]]
    side_effect: Literal["read", "compute", "external_write", "control", "report"]
    retry_class: Literal["read", "idempotent_submission", "receipt_reconciliation", "new_attempt", "never"]
    expected_artifact_kinds: list[Identifier]
    required_checks: list[Literal["project_scope", "policy", "exposure", "evaluation", "prerequisites", "budget"]]
    scientific_attempt_estimate: Counter
    active_seconds_estimate: Counter | None


class DecisionSummary(ContractModel):
    action_id: Identifier
    plan_revision: Revision
    summary: Text
    input_references: list[ContractReference]


class ActionSummary(ContractModel):
    action_id: Identifier
    attempt_id: Identifier
    tool: ToolName
    tool_version: Identifier
    request_sha256: Digest
    state: Literal["prepared", "submitted", "completed", "failed", "unknown", "cancelled"]
    job_id: Identifier | None = None
    receipt_id: Identifier | None = None
    artifact_ids: list[Identifier]


class ExecutionVersions(ContractModel):
    workbench_revision: Identifier
    provider: Identifier
    model: Identifier
    model_revision: Identifier | None
    provider_sdk: Text
    runtime: Text
    checkpointer: Text
    prompt: Identifier
    tool_catalog: Identifier


class RunEvent(ContractModel):
    contract: Literal["run_event"] = "run_event"
    schema_version: Literal["1.0"] = "1.0"
    run_id: Identifier
    sequence: Revision
    created_at: AwareDatetime
    event_type: Literal["accepted", "state_changed", "plan_changed", "action_changed", "question_changed", "usage_changed", "result_published"]
    run_revision: Revision
    state: RunState
    action_id: Identifier | None = None
    question_id: Identifier | None = None
    artifact_ids: list[Identifier] = Field(default_factory=list)
    summary: Text | None = None


class AgentExecutionRecord(ArtifactEnvelope):
    kind: Literal["agent_execution"] = "agent_execution"
    run_id: Identifier
    objective: Text
    inputs: InputScope
    policy: PolicyReference
    plan_revisions: list[ResearchPlan]
    decisions: list[DecisionSummary]
    assignment_ids: list[Identifier]
    actions: list[ActionSummary]
    limits: ResourceLimits
    usage: UsageSnapshot
    versions: ExecutionVersions
    state_at_cutoff: RunState
    event_cutoff: Counter
    captured_at: AwareDatetime
    pending_finalization_action_ids: list[Identifier]

    @model_validator(mode="after")
    def scoped_history(self):
        if any(p.run_id != self.run_id or p.project_id != self.project_id for p in self.plan_revisions):
            raise ValueError("Execution record plans must belong to this project/run")
        revisions = [p.revision for p in self.plan_revisions]
        if len(set(revisions)) != len(revisions):
            raise ValueError("Execution record plan revisions must be unique")
        if any(d.plan_revision not in revisions for d in self.decisions):
            raise ValueError("Decisions must reference an included plan revision")
        return self

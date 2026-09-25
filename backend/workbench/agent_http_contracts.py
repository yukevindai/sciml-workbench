"""Strict operator projections, separate from private runtime records."""
from typing import Literal

from pydantic import Field

from pydantic import AwareDatetime

from .contract_core import ContractModel, ErrorCode, Identifier, PolicyReference, Revision, RunState, Text, ToolName
from .research_contracts import ResearchRun, ResearchPlan, ResearchQuestion, ResourceLimits


class RunActionView(ContractModel):
    """One recorded tool attempt: identity, state and outputs only, never its arguments."""
    id: Identifier
    tool: Identifier
    attempt: Revision
    state: Literal["prepared", "submitted", "completed", "failed", "unknown", "cancelled"]
    assignment_id: Identifier | None
    job_id: Identifier | None
    artifact_ids: list[Identifier]
    error_code: ErrorCode | None


class RunAssignmentView(ContractModel):
    """A specialist assignment as scoped by the coordinator; results stay advisory."""
    id: Identifier
    role: Literal["data_evaluation", "evidence", "failure_memory", "scientific_reviewer"]
    objective: Text
    plan_revision: Revision
    state: Literal["queued", "running", "waiting", "completed", "failed", "cancelled"]
    created_at: AwareDatetime
    deadline_at: AwareDatetime


class RunDetail(ContractModel):
    run: ResearchRun
    plan: ResearchPlan | None
    questions: list[ResearchQuestion]
    control_effect: Text
    # A12: additive projections for the run workspace. Earlier plans are newest first.
    earlier_plans: list[ResearchPlan] = Field(default_factory=list, max_length=20)
    actions: list[RunActionView] = Field(default_factory=list)
    assignments: list[RunAssignmentView] = Field(default_factory=list)


class RunResult(ContractModel):
    run_id: Identifier
    state: RunState
    artifact_ids: list[Identifier]
    stop_reason: Text | None


class EffectivePolicy(ContractModel):
    """The current server/project intersection a new run would be admitted under.

    Input IDs are limited to this project's records; model identities are omitted.
    """
    reference: PolicyReference
    project_policy_revision: Revision
    exposure: Literal["schema_aggregates", "selected_excerpts", "raw_project_content"]
    allowed_tools: list[ToolName]
    material_ids: list[Identifier]
    artifact_ids: list[Identifier]
    limits: ResourceLimits
    spend_ceiling_usd: float | None = Field(ge=0)
    allow_reuse: bool
    automatic_failure_recording: bool
    verify_reports: bool
    share_operator_messages: bool


class ExecutionPolicySummary(ContractModel):
    project_id: Identifier
    policy: EffectivePolicy | None
    agent_available: bool
    unavailable_reason: Text | None

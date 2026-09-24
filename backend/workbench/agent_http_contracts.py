"""Strict operator projections, separate from private runtime records."""
from typing import Literal

from pydantic import Field

from .contract_core import ContractModel, Identifier, PolicyReference, Revision, RunState, Text, ToolName
from .research_contracts import ResearchRun, ResearchPlan, ResearchQuestion, ResourceLimits


class RunDetail(ContractModel):
    run: ResearchRun
    plan: ResearchPlan | None
    questions: list[ResearchQuestion]
    control_effect: Text


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

"""Strict operator projections, separate from private runtime records."""
from .contract_core import ContractModel, Identifier, RunState, Text
from .research_contracts import ResearchRun, ResearchPlan, ResearchQuestion


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

"""Research automation graphs. Cycles are represented by bounded repeat nodes."""
from typing import Literal
from pydantic import Field, model_validator
from .contract_core import ContractModel, Identifier, Revision
from .market_contracts import Name, AgentSelection
from .research_contracts import RunInput


class WorkflowNode(ContractModel):
    id: Identifier
    kind: Literal['trigger', 'research', 'tool', 'branch', 'join', 'repeat', 'finish']
    name: Name
    x: float = Field(default=0, ge=0, le=10000, allow_inf_nan=False)
    y: float = Field(default=0, ge=0, le=10000, allow_inf_nan=False)
    instructions: str = Field(default='', max_length=2000)
    assignment: AgentSelection = Field(default_factory=AgentSelection)
    tool_id: Identifier | None = None
    iterations: int = Field(default=2, ge=1, le=5)
    condition: Literal['has_artifacts', 'all_completed'] = 'has_artifacts'


class WorkflowEdge(ContractModel):
    source: Identifier = Field(title="ConnectionSource")
    target: Identifier = Field(title="ConnectionTarget")
    port: Literal['out', 'yes', 'no'] = 'out'
    data_type: Literal['signal', 'artifacts'] = 'artifacts'


class WorkflowInput(ContractModel):
    name: Name
    description: str = Field(default='', max_length=500)
    trigger: Literal['manual', 'daily'] = 'manual'
    nodes: list[WorkflowNode] = Field(min_length=2, max_length=30)
    edges: list[WorkflowEdge] = Field(min_length=1, max_length=60)
    concurrency: int = Field(default=2, ge=1, le=3)

    @model_validator(mode='after')
    def graph(self):
        by_id = {n.id: n for n in self.nodes}
        if len(by_id) != len(self.nodes):
            raise ValueError('Node IDs must be unique')
        starts = [n.id for n in self.nodes if n.kind == 'trigger']
        if len(starts) != 1 or not any(n.kind == 'finish' for n in self.nodes):
            raise ValueError('Use one trigger and at least one finish node')
        incoming = {n.id: set() for n in self.nodes}
        outgoing = {n.id: [] for n in self.nodes}
        seen = set()
        for e in self.edges:
            key = (e.source, e.target, e.port)
            if key in seen or e.source not in by_id or e.target not in by_id or e.source == e.target:
                raise ValueError('Connections must be unique and link different existing nodes')
            seen.add(key)
            source, target = by_id[e.source], by_id[e.target]
            if source.kind == 'finish' or target.kind == 'trigger':
                raise ValueError('Trigger has outputs only; finish has inputs only')
            if (source.kind == 'branch') != (e.port in {'yes', 'no'}):
                raise ValueError('Branches use yes/no ports; other nodes use out')
            if source.kind == 'trigger' and e.data_type != 'signal':
                raise ValueError('Triggers emit signals; research nodes can also pass artifacts')
            incoming[e.target].add(e.source)
            outgoing[e.source].append(e)
        for n in self.nodes:
            if n.kind != 'trigger' and not incoming[n.id]:
                raise ValueError('Every node must be connected to the trigger')
            if n.kind != 'finish' and not outgoing[n.id]:
                raise ValueError('Every path must reach a finish node')
            if n.kind == 'branch' and {e.port for e in outgoing[n.id]} != {'yes', 'no'}:
                raise ValueError('Connect both yes and no branches')
            if n.kind == 'tool' and not n.tool_id:
                raise ValueError('Choose a saved research tool')
            if n.kind in {'research', 'repeat'} and not n.instructions.strip():
                raise ValueError('Research and repeat nodes need instructions')
        pending = incoming
        while pending:
            ready = {k for k, deps in pending.items() if not deps}
            if not ready:
                raise ValueError('Connections cannot cycle; use a bounded repeat node')
            pending = {k: deps - ready for k, deps in pending.items() if k not in ready}
        return self


class ResearchWorkflow(WorkflowInput):
    id: Identifier
    revision: Revision = 1
    built_in: bool = False
    archived: bool = False


class WorkflowUpdate(WorkflowInput):
    expected_revision: Revision


class WorkflowStart(ContractModel):
    expected_revision: Revision
    request: RunInput
    enable_schedule: bool = False


class WorkflowNodeState(ContractModel):
    state: Literal['pending', 'running', 'completed', 'failed', 'skipped'] = 'pending'
    run_ids: list[Identifier] = Field(default_factory=list)
    artifact_ids: list[Identifier] = Field(default_factory=list)
    branch: Literal['yes', 'no'] | None = None


class WorkflowRun(ContractModel):
    id: Identifier
    project_id: Identifier
    workflow_id: Identifier
    name: str
    created_at: str
    state: Literal['running', 'waiting', 'completed', 'partially_completed', 'failed', 'cancelled']
    nodes: dict[str, WorkflowNodeState]
    error: str | None = None


class WorkflowCatalog(ContractModel):
    workflows: list[ResearchWorkflow]


class WorkflowActivity(ContractModel):
    runs: list[WorkflowRun]
    scheduled_workflow_ids: list[Identifier]

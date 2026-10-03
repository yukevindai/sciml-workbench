"""Private workspace agent catalog and immutable run roster contracts."""
from typing import Annotated, Literal
from pydantic import Field, StringConstraints, model_validator
from .contract_core import ContractModel, Identifier, Revision, ToolName

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Skill = Literal['planning', 'data_evaluation', 'evidence', 'failure_memory', 'scientific_reviewer']


class ResearchToolInput(ContractModel):
    name: Name
    description: str = Field(default='', max_length=500)
    instructions: str = Field(min_length=1, max_length=4000)
    capabilities: list[ToolName] = Field(min_length=1, max_length=30)

    @model_validator(mode='after')
    def unique(self):
        if len(set(self.capabilities)) != len(self.capabilities):
            raise ValueError('Capabilities must be unique')
        return self


class ResearchTool(ResearchToolInput):
    id: Identifier
    revision: Revision = 1
    archived: bool = False


class ResearchToolUpdate(ResearchToolInput):
    expected_revision: Revision


class AgentInput(ContractModel):
    name: Name
    role: Name
    description: str = Field(default='', max_length=500)
    instructions: str = Field(default='', max_length=4000)
    skills: list[Skill] = Field(min_length=1, max_length=5)
    tools: list[ToolName] = Field(default_factory=list, max_length=30)
    custom_tool_ids: list[Identifier] = Field(default_factory=list, max_length=20)

    @model_validator(mode='after')
    def unique(self):
        if len(set(self.skills)) != len(self.skills) or len(set(self.tools)) != len(self.tools) or len(set(self.custom_tool_ids)) != len(self.custom_tool_ids):
            raise ValueError('Skills and tools must be unique')
        return self


class AgentProfile(AgentInput):
    id: Identifier
    revision: Revision = 1
    built_in: bool = False
    custom_tools: list[ResearchTool] = Field(default_factory=list, max_length=20)
    archived: bool = False


class AgentUpdate(AgentInput):
    expected_revision: Revision


class TeamInput(ContractModel):
    name: Name
    description: str = Field(default='', max_length=500)
    agent_ids: list[Identifier] = Field(min_length=1, max_length=8)
    lead_agent_id: Identifier

    @model_validator(mode='after')
    def members(self):
        if len(set(self.agent_ids)) != len(self.agent_ids) or self.lead_agent_id not in self.agent_ids:
            raise ValueError('Choose unique members and a lead from the team')
        return self


class AgentTeam(TeamInput):
    id: Identifier
    revision: Revision = 1
    archived: bool = False


class TeamUpdate(TeamInput):
    expected_revision: Revision


class ArchiveInput(ContractModel):
    expected_revision: Revision


class AgentSelection(ContractModel):
    kind: Literal['automatic', 'agent', 'team'] = 'automatic'
    id: Identifier | None = None
    exclusive: bool = True

    @model_validator(mode='after')
    def target(self):
        if (self.kind == 'automatic') != (self.id is None):
            raise ValueError('Choose one agent or team, or automatic without an ID')
        return self


class AgentRoster(ContractModel):
    selection: AgentSelection
    name: Name
    lead_agent_id: Identifier
    agents: list[AgentProfile] = Field(min_length=1, max_length=13)


class MarketTool(ContractModel):
    id: ToolName
    description: str


class MarketSkill(ContractModel):
    id: Skill
    name: str
    description: str


class AgentMarket(ContractModel):
    agents: list[AgentProfile]
    teams: list[AgentTeam]
    tools: list[MarketTool]
    custom_tools: list[ResearchTool] = Field(default_factory=list)
    skills: list[MarketSkill]


class ProjectAgentSelection(ContractModel):
    project_id: Identifier
    selection: AgentSelection

from fastapi import APIRouter, Depends
from . import agent_market as market
from .market_contracts import (AgentInput, AgentUpdate, AgentProfile, TeamInput, TeamUpdate,
    ResearchToolInput, ResearchToolUpdate, ResearchTool, AgentTeam, ArchiveInput, AgentMarket, AgentSelection, ProjectAgentSelection)
from .market_db import ProjectAgentSelectionRow
from .egress import SecretGuard
from .barriers import lock_project


def router(session, protected, settings):
    routes = APIRouter(prefix='/api/v1', dependencies=protected)

    @routes.get('/agent-market', response_model=AgentMarket)
    def catalog(s=Depends(session, scope='function')):
        return market.catalog(s)

    @routes.post('/agent-market/agents', response_model=AgentProfile, status_code=201)
    def create_agent(body: AgentInput, s=Depends(session, scope='function')):
        SecretGuard(settings).check(body.model_dump(mode='json'))
        return market.save_entry(s, 'agent', body)

    @routes.post('/agent-market/agents/{ident}', response_model=AgentProfile)
    def update_agent(ident: str, body: AgentUpdate, s=Depends(session, scope='function')):
        SecretGuard(settings).check(body.model_dump(mode='json'))
        return market.save_entry(s, 'agent', body, ident)

    @routes.post('/agent-market/teams', response_model=AgentTeam, status_code=201)
    def create_team(body: TeamInput, s=Depends(session, scope='function')):
        SecretGuard(settings).check(body.model_dump(mode='json'))
        return market.save_entry(s, 'team', body)

    @routes.post('/agent-market/teams/{ident}', response_model=AgentTeam)
    def update_team(ident: str, body: TeamUpdate, s=Depends(session, scope='function')):
        SecretGuard(settings).check(body.model_dump(mode='json'))
        return market.save_entry(s, 'team', body, ident)

    @routes.post('/agent-market/agents/{ident}/archive', response_model=AgentProfile)
    def archive_agent(ident: str, body: ArchiveInput, s=Depends(session, scope='function')):
        return market.archive_entry(s, ident, 'agent', body.expected_revision)

    @routes.post('/agent-market/teams/{ident}/archive', response_model=AgentTeam)
    def archive_team(ident: str, body: ArchiveInput, s=Depends(session, scope='function')):
        return market.archive_entry(s, ident, 'team', body.expected_revision)

    @routes.post('/agent-market/tools', response_model=ResearchTool, status_code=201)
    def create_tool(body: ResearchToolInput, s=Depends(session, scope='function')):
        SecretGuard(settings).check(body.model_dump(mode='json'))
        return market.save_entry(s, 'tool', body)

    @routes.post('/agent-market/tools/{ident}', response_model=ResearchTool)
    def update_tool(ident: str, body: ResearchToolUpdate, s=Depends(session, scope='function')):
        SecretGuard(settings).check(body.model_dump(mode='json'))
        return market.save_entry(s, 'tool', body, ident)

    @routes.post('/agent-market/tools/{ident}/archive', response_model=ResearchTool)
    def archive_tool(ident: str, body: ArchiveInput, s=Depends(session, scope='function')):
        return market.archive_entry(s, ident, 'tool', body.expected_revision)

    @routes.get('/projects/{pid}/agent-selection', response_model=ProjectAgentSelection)
    def selection(pid: str, s=Depends(session, scope='function')):
        return dict(project_id=pid, selection=market.project_selection(s, pid))

    @routes.post('/projects/{pid}/agent-selection', response_model=ProjectAgentSelection)
    def assign(pid: str, body: AgentSelection, s=Depends(session, scope='function')):
        lock_project(s, pid)
        market.resolve_roster(s, pid, body)
        row = s.get(ProjectAgentSelectionRow, pid)
        if row:
            row.payload = body.model_dump(mode='json')
        else:
            s.add(ProjectAgentSelectionRow(project_id=pid, payload=body.model_dump(mode='json')))
        return dict(project_id=pid, selection=body)

    return routes

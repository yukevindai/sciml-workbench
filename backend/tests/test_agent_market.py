"""Catalog persistence, request assignment and hard runtime ceilings (no paid IO)."""
from dataclasses import replace
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from workbench import agent_market as market
from workbench.api import create_app
from workbench.agent_db import RunRow
from workbench.agent_policy import default_limits
from workbench.market_contracts import AgentInput, AgentUpdate, TeamInput, AgentSelection
from workbench.market_db import ProjectAgentSelectionRow
from workbench.research_contracts import RunInput
from workbench.errors import DomainError
from workbench.agent_specialists import AssignmentRequest, SpecialistService
from workbench.budgeted_provider import ModelBound
from test_metadata import old_db, db
from test_tool_registry import registry


def researcher(**overrides):
    return AgentInput(**{'name': 'Electrolyte Researcher', 'role': 'Researcher',
        'skills': ['evidence'], 'tools': ['inspect_project'],
        'instructions': 'Flag electrolyte composition aliasing.', **overrides})


def start(tool, selection=None, key='selected'):
    with tool.db.session.begin() as s:
        return tool.runs.create(s, 'p', RunInput(objective='Explain electrolyte evidence',
            inputs={'artifact_ids': [], 'material_ids': []}, policy_revision=1,
            limits=default_limits(), agent_selection=selection), key)


def test_catalog_crud_defaults_and_revision_conflict(registry):
    tool, _, _, _ = registry
    with TestClient(create_app(tool.settings)) as client:
        assert client.get('/api/v1/agent-market').status_code == 401
        client.headers['Authorization'] = 'Bearer ' + 'a' * 48
        initial = client.get('/api/v1/agent-market').json()
        assert len(initial['agents']) == 10 and initial['teams'] == []
        body = researcher().model_dump()
        created = client.post('/api/v1/agent-market/agents', json=body)
        assert created.status_code == 201, created.text
        item = created.json()
        path = '/api/v1/agent-market/agents/' + item['id']
        changed = client.post(path, json={**body, 'name': 'PI Kevin', 'expected_revision': 1})
        assert changed.status_code == 200 and changed.json()['revision'] == 2
        assert client.post(path, json={**body, 'expected_revision': 1}).status_code == 409
        assert client.post('/api/v1/agent-market/agents/default-pi', json={**body, 'expected_revision': 1}).status_code == 409
        assert client.post('/api/v1/agent-market/agents', json={**body, 'tools': ['search_evidence']}).status_code == 422
        assert client.post(path + '/archive', json={'expected_revision': 2}).status_code == 200
        assert len(client.get('/api/v1/agent-market').json()['agents']) == 10


def test_team_and_project_assignment_persist_and_override(registry):
    tool, _, _, _ = registry
    with tool.db.session.begin() as s:
        a = market.save_entry(s, 'agent', researcher())
        team = market.save_entry(s, 'team', TeamInput(name='Battery team', agent_ids=[a.id, 'default-reviewer'], lead_agent_id=a.id))
        s.add(ProjectAgentSelectionRow(project_id='p', payload=AgentSelection(kind='team', id=team.id).model_dump(mode='json')))
    inherited = start(tool)
    assert inherited['agent_roster']['lead_agent_id'] == a.id
    assert len(inherited['agent_roster']['agents']) == 2
    assert start(tool, AgentSelection(), key='auto')['agent_roster'] is None
    with tool.db.session.begin() as s:
        with pytest.raises(DomainError):
            market.save_entry(s, 'team', TeamInput(name='Invalid', agent_ids=['missing'], lead_agent_id='missing'))


def test_snapshot_survives_edits_archive_and_idempotent_retry(registry):
    tool, _, _, _ = registry
    with tool.db.session.begin() as s:
        a = market.save_entry(s, 'agent', researcher())
    selection = AgentSelection(kind='agent', id=a.id)
    run = start(tool, selection)
    with tool.db.session.begin() as s:
        market.save_entry(s, 'agent', AgentUpdate(**researcher(name='Renamed', tools=['run_audit']).model_dump(), expected_revision=1), a.id)
        market.archive_entry(s, a.id, 'agent', 2)
    assert start(tool, selection)['agent_roster'] == run['agent_roster']
    with tool.db.session() as s:
        row = s.get(RunRow, run['id'])
        assert tool.runs.effective_policy(s, row).allowed_tools == {'inspect_project'}
        assert row.original_request['agent_roster']['agents'][0]['name'] == 'Electrolyte Researcher'
    with pytest.raises(DomainError):
        start(tool, selection, 'after-archive')


def test_runtime_blocks_unselected_tools_and_specialists(registry):
    tool, ctx, data, _ = registry
    with tool.db.session.begin() as s:
        a = market.save_entry(s, 'agent', researcher())
    run = start(tool, AgentSelection(kind='agent', id=a.id))
    result = tool.dispatch(replace(ctx, run_id=run['id']), 'run_audit', {'dataset_id': data.id})
    assert result.status == 'blocked'
    with tool.db.session() as s:
        assert market.specialist_profile(run['agent_roster'], 'evidence', a.id).name == a.name
        with pytest.raises(DomainError):
            market.specialist_profile(run['agent_roster'], 'data_evaluation')
        with pytest.raises(DomainError):
            market.specialist_profile(run['agent_roster'], 'evidence', 'default-researcher')
    bound = ModelBound(model='model', revision='fixture', source_reference='fixture', max_request_bytes=64000, input_tokens=100, max_output_tokens=1024, max_active_seconds=5)
    specialist = SpecialistService(tool.db, tool.runs, None, model='model', bounds={'model': bound})
    with pytest.raises(DomainError, match='No selected agent'):
        specialist.create('p', run['id'], 'outside', AssignmentRequest(role='scientific_reviewer', objective='Review', completion_criteria=['Check'], reviewed_snapshot_sha256='a' * 64))


def test_assisted_selection_expands_only_to_integrated_defaults(registry):
    tool, _, _, _ = registry
    with tool.db.session.begin() as s:
        a = market.save_entry(s, 'agent', researcher(tools=[]))
    strict = start(tool, AgentSelection(kind='agent', id=a.id), 'strict')
    assisted = start(tool, AgentSelection(kind='agent', id=a.id, exclusive=False), 'assisted')
    assert len(assisted['agent_roster']['agents']) == 6
    with tool.db.session() as s:
        assert not tool.runs.effective_policy(s, s.get(RunRow, strict['id'])).allowed_tools
        assert 'run_audit' in tool.runs.effective_policy(s, s.get(RunRow, assisted['id'])).allowed_tools


def test_selected_identity_reaches_real_coordinator_context(registry):
    from test_agent_coordinator import setup, advance
    tool, ctx, data, foreign = registry
    with tool.db.session.begin() as s:
        a = market.save_entry(s, 'agent', researcher())
    run = start(tool, AgentSelection(kind='agent', id=a.id))
    scoped = (tool, replace(ctx, run_id=run['id']), data, foreign)
    coordinator, scheduler, saver, provider = setup(scoped, [{'kind': 'answer', 'summary': 'Check independent formulations before comparing electrolyte effects.'}])
    # The fixture also has an older queued run; finish it before claiming the selected one.
    with tool.db.session.begin() as s:
        tool.runs.finish(s, 'p', ctx.run_id, 1, state='completed', artifact_ids=[])
    assert advance(scheduler, saver, coordinator) == 'queued'
    assert advance(scheduler, saver, coordinator) == 'completed'
    sent = '\n'.join(part.text for part in provider.contexts[0])
    assert 'Electrolyte Researcher' in sent and 'Flag electrolyte composition aliasing.' in sent
    assert 'default-pi' not in sent
    assert provider.requests[0]['tools'] == []


def test_support_has_no_tools_and_curated_profiles_cannot_be_overwritten(registry):
    tool, *_ = registry
    run = start(tool, AgentSelection(kind='agent', id='support-guide', exclusive=True))
    assert [a['id'] for a in run['agent_roster']['agents']] == ['support-guide']
    with tool.db.session.begin() as s:
        assert not tool.runs.effective_policy(s, s.get(RunRow, run['id'])).allowed_tools
        for ident in ['support-guide', 'stress-general', 'stress-methods', 'stress-statistics', 'stress-evidence']:
            with pytest.raises(DomainError):
                market.save_entry(s, 'agent', AgentUpdate(**researcher().model_dump(), expected_revision=1), ident)

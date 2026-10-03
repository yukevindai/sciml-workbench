"""Saved agent preferences narrow, and never grant, execution authority."""
from sqlalchemy import select, update
from .contracts import uid
from .errors import DomainError
from .market_contracts import AgentProfile, AgentTeam, AgentSelection, AgentRoster, ResearchTool
from .market_db import MarketEntryRow, ProjectAgentSelectionRow

SKILLS = [
    dict(id='planning', name='Research planning', description='Break questions into a useful research plan and synthesize results.'),
    dict(id='data_evaluation', name='Data & evaluation', description='Check data quality, leakage, splits and model comparisons.'),
    dict(id='evidence', name='Literature research', description='Interpret papers and ground findings in retained sources.'),
    dict(id='failure_memory', name='Experiment memory', description='Learn from recorded failures and previous experiments.'),
    dict(id='scientific_reviewer', name='Scientific review', description='Independently check exact claims and their supporting evidence.'),
]


def defaults():
    from .tool_registry import DESCRIPTORS
    read = [name for name, d in DESCRIPTORS.items() if d.effect == 'read']
    definitions = [
        ('default-pi', 'Principal Investigator', 'PI', ['planning'], list(DESCRIPTORS), 'Plan the work, coordinate specialists and synthesize grounded results.'),
        ('default-data', 'Data Specialist', 'Specialist', ['data_evaluation'], read + ['run_audit', 'generate_split', 'seal_evaluation', 'run_baseline'], 'Focus on data integrity, independence and fair model evaluation.'),
        ('default-researcher', 'Researcher', 'Researcher', ['evidence'], read + ['ingest_evidence'], 'Investigate the supplied papers and preserve exact evidence and uncertainty.'),
        ('default-memory', 'Experiment Analyst', 'Specialist', ['failure_memory'], read + ['record_outcome'], 'Use prior experiment outcomes to identify useful next steps.'),
        ('default-reviewer', 'Scientific Reviewer', 'Reviewer', ['scientific_reviewer'], read, 'Independently verify each claim against retained evidence.'),
    ]
    return [AgentProfile(id=i, name=n, role=r, skills=s, tools=t, description=d, built_in=True)
            for i, n, r, s, t, d in definitions]


def entry(s, ident, kind):
    row = s.get(MarketEntryRow, ident)
    if not row or row.kind != kind or row.payload.get('archived'):
        raise DomainError('Saved agent or team is unavailable; choose another assignment', 404, 'REFERENCE_INVALID')
    return row


def agent(s, ident):
    built_in = next((a for a in defaults() if a.id == ident), None)
    value = built_in or AgentProfile.model_validate(entry(s, ident, 'agent').payload)
    return value.model_copy(update={'custom_tools': [ResearchTool.model_validate(entry(s, i, 'tool').payload) for i in value.custom_tool_ids]})


def validate_input(s, kind, body):
    if kind == 'agent':
        from .tool_registry import DESCRIPTORS
        if not set(body.tools) <= DESCRIPTORS.keys():
            raise DomainError('Choose only currently integrated tools', 422, 'UNSUPPORTED_CAPABILITY')
        for ident in body.custom_tool_ids:
            entry(s, ident, 'tool')
    elif kind == 'tool':
        from .tool_registry import DESCRIPTORS
        if not set(body.capabilities) <= DESCRIPTORS.keys():
            raise DomainError('Choose only currently integrated capabilities', 422, 'UNSUPPORTED_CAPABILITY')
    elif kind == 'team':
        for ident in body.agent_ids:
            agent(s, ident)


def save_entry(s, kind, body, ident=None):
    validate_input(s, kind, body)
    if ident and any(a.id == ident for a in defaults()):
        raise DomainError('Built-in agents are preserved. Create a customized copy instead.', 409, 'REFERENCE_INVALID')
    model = {'agent': AgentProfile, 'team': AgentTeam, 'tool': ResearchTool}[kind]
    data = body.model_dump(exclude={'expected_revision'})
    if ident:
        row = entry(s, ident, kind)
        expected = body.expected_revision
        value = model(id=ident, revision=expected + 1, **data)
        # Compare-and-swap prevents lost edits on SQLite as well as PostgreSQL.
        result = s.execute(update(MarketEntryRow).where(MarketEntryRow.id == ident,
            MarketEntryRow.payload['revision'].as_integer() == expected,
            MarketEntryRow.payload['archived'].as_boolean() == False).values(payload=value.model_dump(mode='json')))
        if result.rowcount != 1:
            raise DomainError('This item changed. Reload before saving.', 409, 'RUN_REVISION_CHANGED')
    else:
        value = model(id=uid(), **data)
        s.add(MarketEntryRow(id=value.id, kind=kind, payload=value.model_dump(mode='json')))
    s.flush()
    return value


def archive_entry(s, ident, kind, expected):
    if any(a.id == ident for a in defaults()):
        raise DomainError('Built-in agents cannot be archived.', 409, 'REFERENCE_INVALID')
    row = entry(s, ident, kind)
    value = {**row.payload, 'archived': True, 'revision': expected + 1}
    result = s.execute(update(MarketEntryRow).where(MarketEntryRow.id == ident,
        MarketEntryRow.payload['revision'].as_integer() == expected).values(payload=value))
    if result.rowcount != 1:
        raise DomainError('This item changed. Reload before archiving.', 409, 'RUN_REVISION_CHANGED')
    return value


def catalog(s):
    from .tool_registry import DESCRIPTORS
    rows = list(s.scalars(select(MarketEntryRow).where(MarketEntryRow.kind.in_(['agent', 'team', 'tool'])).order_by(MarketEntryRow.id)))
    return dict(agents=[*defaults(), *[r.payload for r in rows if r.kind == 'agent' and not r.payload['archived']]],
        teams=[r.payload for r in rows if r.kind == 'team' and not r.payload['archived']], skills=SKILLS,
        custom_tools=[r.payload for r in rows if r.kind == 'tool' and not r.payload['archived']],
        tools=[dict(id=n, description=d.purpose) for n, d in DESCRIPTORS.items()])


def project_selection(s, pid):
    from .services import project
    project(s, pid)
    row = s.get(ProjectAgentSelectionRow, pid)
    return AgentSelection.model_validate(row.payload) if row else AgentSelection()


def resolve_roster(s, pid, selection=None):
    selection = selection or project_selection(s, pid)
    if selection.kind == 'automatic':
        return None  # Preserve existing adaptive execution and legacy runs.
    if selection.kind == 'agent':
        chosen = agent(s, selection.id)
        members, lead, name = [chosen], chosen.id, chosen.name
    else:
        team = AgentTeam.model_validate(entry(s, selection.id, 'team').payload)
        members, lead, name = [agent(s, i) for i in team.agent_ids], team.lead_agent_id, team.name
    if not selection.exclusive:
        members += [a for a in defaults() if a.id not in {m.id for m in members}]
    return AgentRoster(selection=selection, name=name, lead_agent_id=lead, agents=members)


def restrict_policy(policy, roster):
    if not roster:
        return policy
    value = AgentRoster.model_validate(roster)
    tools = frozenset(t for a in value.agents for t in [*a.tools, *[c for recipe in a.custom_tools for c in recipe.capabilities]])
    return policy.model_copy(update={'allowed_tools': policy.allowed_tools & tools})


def specialist_profile(roster, role, ident=None):
    if not roster:
        if ident:
            raise DomainError('Named delegation requires a selected roster', 403, 'POLICY_DENIED')
        return None
    value = AgentRoster.model_validate(roster)
    eligible = [a for a in value.agents if role in a.skills and (not ident or a.id == ident)]
    if not eligible:
        raise DomainError('No selected agent has this skill; select a suitable agent or team', 403, 'POLICY_DENIED')
    return eligible[0]


def profile_context(pid, profile, policy):
    from .model_provider import ContextPart
    import json
    return ContextPart(pid, 'operator' if policy.share_operator_messages else 'raw',
        json.dumps({'agent_profile': profile.model_dump(mode='json')}))

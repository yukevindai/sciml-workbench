"""E16 operator recipe: no implicit grants, atomic revisions, safe dry run."""
import pytest
from sqlalchemy import select, func

from test_metadata import old_db, db
from test_tool_registry import registry
from workbench.agent_db import ProjectPolicyRow, ServerPolicyRow
from workbench.agent_policy import AuthorityPolicy
from workbench.errors import DomainError
from workbench.operator_policy import PolicyBundle, install


def bundle(registry):
    tool, _, data, _ = registry
    policy = AuthorityPolicy(policy_id='reviewed', revision=2, project_ids={'p'},
        artifact_ids={data.id}, provider_models={'model'}, allowed_tools={'inspect_dataset', 'run_audit'},
        share_operator_messages=True, spend_ceiling_usd=1)
    return PolicyBundle(server=policy, project=policy)


def test_validate_apply_and_repeat_are_exact_and_atomic(registry):
    tool, *_ = registry
    value = bundle(registry)
    with tool.db.session.begin() as s:
        result = install(s, value)
        assert result['status'] == 'validated_only'
        assert s.scalar(select(func.count()).select_from(ServerPolicyRow)) == 1
    with tool.db.session.begin() as s:
        assert install(s, value, apply=True)['status'] == 'applied'
    with tool.db.session.begin() as s:
        assert install(s, value, apply=True)['status'] == 'unchanged'
        assert s.scalar(select(func.count()).select_from(ServerPolicyRow)) == 2
        assert s.scalar(select(func.count()).select_from(ProjectPolicyRow)) == 2
    from workbench.research_contracts import RunInput
    with tool.db.session.begin() as s:
        run = tool.runs.create(s, 'p', RunInput(objective='Audit the authorized synthetic dataset',
            policy_revision=2, limits=value.project.limits,
            inputs={'artifact_ids': sorted(value.project.artifact_ids), 'material_ids': []}), 'operator-demo')
    assert run['state'] == 'queued' and run['mode'] == 'autopilot'
    assert run['policy']['sha256']


@pytest.mark.parametrize('fault', ['foreign', 'missing', 'stale', 'server_scope', 'multiple_projects'])
def test_bad_bundle_cannot_partially_change_policy(registry, fault):
    tool, _, _, foreign = registry
    value = bundle(registry)
    if fault in {'foreign', 'missing'}:
        value.project = value.project.model_copy(update={'artifact_ids': frozenset({foreign.id if fault == 'foreign' else 'missing'})})
    elif fault == 'stale':
        value.project = value.project.model_copy(update={'revision': 1})
    elif fault == 'server_scope':
        value.server = value.server.model_copy(update={'project_ids': frozenset({'q'}), 'artifact_ids': frozenset()})
    else:
        value.project = value.project.model_copy(update={'project_ids': frozenset({'p', 'q'})})
    with pytest.raises(DomainError), tool.db.session.begin() as s:
        install(s, value, apply=True)
    with tool.db.session() as s:
        assert s.scalar(select(func.count()).select_from(ServerPolicyRow)) == 1
        assert s.scalar(select(func.count()).select_from(ProjectPolicyRow)) == 1


def test_effective_policy_intersection_does_not_widen_server(registry):
    tool, *_ = registry
    value = bundle(registry)
    value.server = value.server.model_copy(update={'allowed_tools': frozenset({'inspect_dataset'}), 'share_operator_messages': False})
    with tool.db.session.begin() as s:
        result = install(s, value, apply=True)
    assert result['effective_policy']['allowed_tools'] == ['inspect_dataset']
    assert not result['effective_policy']['share_operator_messages']


def test_cli_validate_apply_and_redacted_rejection(registry, monkeypatch, capsys, tmp_path):
    import json
    from workbench import operator_policy
    from workbench.config import AgentSettings
    tool, *_ = registry
    bound = dict(model='model', revision='reviewed', source_reference='test', max_request_bytes=64000,
                 input_tokens=100, max_output_tokens=1024, max_active_seconds=100)
    price = dict(model='model', revision='test', effective_at='2000-01-01T00:00:00Z', currency='USD',
                 rates={k: '0.000001' for k in ('input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens')})
    agents = AgentSettings(_env_file=None, coordinator_model='model', specialist_model='model',
        anthropic_api_key='operator-private-key-canary', agent_model_bounds=json.dumps({'model': bound}),
        agent_model_prices=json.dumps({'model': price}))
    monkeypatch.setattr(operator_policy, 'load_settings', lambda kind=None: agents if kind is AgentSettings else tool.settings)
    monkeypatch.setattr(operator_policy, 'Database', lambda url: tool.db)
    path = tmp_path / 'reviewed.json'
    path.write_text(bundle(registry).model_dump_json(), encoding='utf-8')
    assert operator_policy.main(['--file', str(path)]) == 0
    assert json.loads(capsys.readouterr().out)['status'] == 'validated_only'
    with tool.db.session() as s:
        assert s.scalar(select(func.count()).select_from(ServerPolicyRow)) == 1
    assert operator_policy.main(['--file', str(path), '--apply']) == 0
    assert json.loads(capsys.readouterr().out)['status'] == 'applied'
    path.write_text('{"private_error_canary": "malformed"}', encoding='utf-8')
    assert operator_policy.main(['--file', str(path), '--apply']) == 2
    result = capsys.readouterr()
    assert 'private_error_canary' not in result.out + result.err
    assert 'operator-private-key-canary' not in result.out + result.err
    agents.agent_model_prices = '{}'
    path.write_text(bundle(registry).model_dump_json(), encoding='utf-8')
    assert operator_policy.main(['--file', str(path), '--apply']) == 2
    assert 'reviewed prices' in capsys.readouterr().err

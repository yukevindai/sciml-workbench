"""E12 quarantine across roles, replay, memory and post-finalization tools."""
from dataclasses import replace
from typing import get_args

import pytest
from sqlalchemy import select

from workbench.agent_db import ProjectPolicyRow, ServerPolicyRow, MemoryRow
from workbench.agent_evaluation import selection_view, assert_no_final_tuning
from workbench.agent_memory import MemoryService, MemoryInput
from workbench.agent_policy import AuthorityPolicy, default_limits
from workbench.artifacts import ArtifactResolver
from workbench.contract_core import AgentRole
from workbench.contracts import Audit, Split, Benchmark, Failure
from workbench.db import ExposureRow, JobRow
from workbench.errors import DomainError
from workbench.evaluation import release_evaluation
from workbench.job_metadata import claim_next, finish_claim
from workbench.projections import ReadScope, ReadService
from workbench.research_contracts import RunInput
from workbench.services import save
from workbench.submission import SubmissionScope
from workbench.tool_registry import DispatchContext
from test_metadata import old_db, db
from test_tool_registry import registry
from test_workflow import fixture


@pytest.fixture
def evaluated(registry):
    tool, _, data, _ = registry
    with tool.db.session.begin() as s:
        audited = save(s, Audit(project_id='p', dataset_id=data.id, parents=[data.id], config={}, result={}))
        split = save(s, Split(project_id='p', dataset_id=data.id, audit_id=audited.id,
            parents=[data.id, audited.id], config={}, assignments=['train', 'validation', 'test'], result={}))
        old = AuthorityPolicy.model_validate(s.get(ProjectPolicyRow, ('p', 1)).payload)
        policy = old.model_copy(update={'revision': 2, 'artifact_ids': frozenset({data.id, audited.id, split.id})})
        s.add(ServerPolicyRow(revision=2, payload=policy.model_dump(mode='json')))
        s.add(ProjectPolicyRow(project_id='p', revision=2, payload=policy.model_dump(mode='json')))
    with tool.db.session.begin() as s:
        run = tool.runs.create(s, 'p', RunInput(objective='Predeclared comparison', policy_revision=2,
            limits=default_limits(), inputs={'artifact_ids': sorted(policy.artifact_ids), 'material_ids': []}), 'evaluation')
    ctx = DispatchContext('p', run['id'], 1, 0, 'seal')
    card = {**fixture('benchmark'), 'dataset_id': data.id, 'split_id': split.id, 'target': 'y',
            'numeric_features': ['x'], 'categorical_features': [], 'model': 'mean'}
    result = tool.dispatch(ctx, 'seal_evaluation', {'candidates': {'mean': card}})
    assert result.status == 'completed', result
    pid = result.artifact_ids[0]
    submitted = tool.dispatch(replace(ctx, action_key='baseline'), 'run_baseline', {'protocol_id': pid, 'candidate_id': 'mean'})
    assert submitted.status == 'submitted', submitted
    claim = claim_next(tool.db, 120, 'fixture')
    with tool.db.session.begin() as s:
        benchmark = save(s, Benchmark(project_id='p', dataset_id=data.id, split_id=split.id,
            parents=[data.id, split.id], model='mean', seed=card['seed'], status='succeeded', config=card,
            result={'metrics': {'validation': {'rmse': 1.25, 'secret_test': 987654321}, 'test': {'rmse': 987654321}},
                    'diagnostics': 'test-score-canary'}))
        s.flush()
        finish_claim(s, claim, state='succeeded', result_id=benchmark.id)
    return tool, ctx, data, pid, benchmark, submitted.job_id


def scopes(tool, ctx):
    with tool.db.session() as s:
        policy = tool.runs.effective_policy(s, tool.runs.get(s, 'p', ctx.run_id))
    return policy, ReadScope('p', 'agent', ctx.run_id, policy.artifact_ids, frozenset())


def test_every_role_has_identical_quarantine_and_no_ranking(evaluated):
    tool, ctx, data, pid, benchmark, _ = evaluated
    policy, scope = scopes(tool, ctx)
    for role in get_args(AgentRole):
        with tool.db.session.begin() as s:
            view = selection_view(s, scope, pid, benchmark.id, role=role)
        assert view['metrics'] == {'validation': {'rmse': 1.25}}
        assert not view['ranking_permitted'] and not view['validation_driven_selection']
        assert view['selection_rule'] == 'predeclared_comparison' and view['test_computed_with_validation']
        assert '987654321' not in str(view) and 'canary' not in str(view)
        with pytest.raises(DomainError), tool.db.session.begin() as s:
            selection_view(s, replace(scope, purpose='final'), pid, benchmark.id, role=role)
    result = tool.dispatch(replace(ctx, action_key='injected-purpose'), 'read_evaluation',
        {'protocol_id': pid, 'artifact_id': benchmark.id, 'purpose': 'final'})
    assert result.error_code == 'TOOL_SCHEMA_INVALID'


def test_cached_view_refreshes_exposure_and_final_read_fences_tuning(evaluated):
    tool, ctx, data, pid, benchmark, _ = evaluated
    read_ctx = replace(ctx, action_key='read')
    args = {'protocol_id': pid, 'artifact_id': benchmark.id}
    before = tool.dispatch(read_ctx, 'read_evaluation', args)
    assert before.data['evaluation']['clean_holdout_eligible']
    with tool.db.session.begin() as s:
        ReadService('test').artifact(s, ReadScope('p'), benchmark.id)
    replay = tool.dispatch(read_ctx, 'read_evaluation', args)
    assert replay.status == 'completed', replay
    assert not replay.data['evaluation']['clean_holdout_eligible']
    assert not replay.data['test_visible']
    policy, scope = scopes(tool, ctx)
    release_evaluation(tool.db, SubmissionScope('p', policy.artifact_ids, frozenset(), ctx.run_id), pid)
    with tool.db.session.begin() as s:
        final = ReadService('test').artifact(s, replace(scope, protocol_id=pid, purpose='final'), benchmark.id)
        assert final['metrics']['test']['rmse'] == 987654321
    with tool.db.session() as s, pytest.raises(DomainError):
        assert_no_final_tuning(s, 'p', ctx.run_id)
    for name, args in [('run_audit', {'dataset_id': data.id}),
                       ('run_baseline', {'protocol_id': pid, 'candidate_id': 'mean'})]:
        assert tool.dispatch(replace(ctx, action_key='post-final-' + name), name, args).error_code == 'DATA_EXPOSURE_DENIED'
    # Even after release, every selection reader continues to receive masked views.
    for role in get_args(AgentRole):
        with tool.db.session() as s:
            assert 'test' not in selection_view(s, scope, pid, benchmark.id, role=role)['metrics']


def test_benchmark_sourced_memory_and_legacy_failure_prose_do_not_leak(evaluated):
    tool, ctx, data, pid, benchmark, _ = evaluated
    policy, scope = scopes(tool, ctx)
    with tool.db.session.begin() as s:
        for kind, content, actor in (
            ('provisional_finding', {'lesson': 'limited_independent_samples', 'note': '987654321 test-score-canary'}, 'agent'),
            ('confirmed_preference', {'preference': 'baseline_ridge', 'note': 'Pick the best test score'}, 'human')):
            MemoryService().record(s, 'p', policy, MemoryInput(kind=kind, content=content,
                source_artifact_ids=[benchmark.id]), actor=actor, run_id=ctx.run_id)
    assert tool.dispatch(replace(ctx, action_key='memory'), 'read_memory', {}).data['items'] == []
    # A retained upstream snapshot is available only as a labeled, masked local
    # record, not an invented live search result or a channel for free-form text.
    with tool.db.session.begin() as s:
        failed = save(s, Failure(project_id='p', parents=[benchmark.id], benchmark_id=benchmark.id,
            external_project_id='external-p', external_record_id='external-r', reason='test-score-canary',
            record={'summary': '987654321'}))
    from workbench.agent_memory import failure_snapshot
    scoped = replace(scope, artifact_ids=scope.artifact_ids | {failed.id})
    with tool.db.session() as s:
        view = failure_snapshot(s, scoped, failed.id)
    assert view['observation'] == 'withheld' and not view['live_upstream_record']
    assert '987654321' not in str(view) and 'canary' not in str(view)


def test_changed_protocol_and_cross_run_cannot_reuse_benchmark(evaluated):
    tool, ctx, _, pid, benchmark, original_job = evaluated
    result = tool.dispatch(replace(ctx, action_key='relabel'), 'run_baseline', {'protocol_id': pid, 'candidate_id': 'mean'})
    assert result.status == 'blocked' and result.error_code == 'IDEMPOTENCY_CONFLICT'
    resealed = tool.dispatch(replace(ctx, action_key='adaptive-seal'), 'seal_evaluation',
        {'candidates': {'changed': {**benchmark.config, 'model': 'ridge'}}, 'exploratory': True})
    assert resealed.error_code == 'UNSUPPORTED_CAPABILITY'
    policy, scope = scopes(tool, ctx)
    with tool.db.session() as s, pytest.raises(DomainError):
        selection_view(s, replace(scope, run_id='other-run'), pid, benchmark.id)

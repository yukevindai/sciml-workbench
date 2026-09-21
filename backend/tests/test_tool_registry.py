"""E03 dispatch acceptance against durable SQLite/PostgreSQL metadata."""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace

import pytest
from sqlalchemy import select, func, update

from workbench.agent_db import ActionRow, RunJobRow, ServerPolicyRow, ProjectPolicyRow, UsageRow, RunRow
from workbench.agent_policy import AuthorityPolicy, default_limits
from workbench.agent_runs import RunService
from workbench.config import Settings
from workbench.contracts import Source, Audit, Split
from workbench.db import JobRow
from workbench.research_contracts import RunInput, RunControlInput
from workbench.services import upload_csv, save
from workbench.storage import LocalStore
from workbench.tool_registry import ToolRegistry, DispatchContext, DESCRIPTORS
from workbench.worker import process_job
from workbench.job_metadata import claim_next
from test_metadata import old_db, db
from test_workflow import fixture


@pytest.fixture
def registry(db, tmp_path):
    settings = Settings(_env_file=None, database_url=str(db.engine.url), storage_root=tmp_path / 'files',
                        api_token='a' * 48, efm_password='b' * 24)
    store = LocalStore(settings.storage_root)
    with db.session.begin() as s:
        data = upload_csv(s, store, settings, 'p', b'x,y\n1,2\n3,4\n5,6\n', 'input.csv',
                          Source(citation='Synthetic', license='CC0', data_kind='synthetic', transformations='Generated'))
        foreign = upload_csv(s, store, settings, 'q', b'x,y\n1,2\n3,4\n5,6\n', 'foreign.csv',
                             Source(citation='Synthetic', license='CC0', data_kind='synthetic', transformations='Generated'))
        policy = AuthorityPolicy(policy_id='trusted', revision=1, project_ids={'p'},
            artifact_ids={data.id}, scientific_models={'mean', 'ridge'}, provider_models={'model'})
        s.add(ServerPolicyRow(revision=1, payload=policy.model_dump(mode='json')))
        s.add(ProjectPolicyRow(project_id='p', revision=1, payload=policy.model_dump(mode='json')))
    runs = RunService(admission=lambda: None)
    with db.session.begin() as s:
        run = runs.create(s, 'p', RunInput(objective='Audit', policy_revision=1, limits=default_limits(),
            inputs={'artifact_ids': [data.id], 'material_ids': []}), 'run')
    tool = ToolRegistry(db, store, settings, runs=runs)
    context = DispatchContext('p', run['id'], 1, 0, 'audit')
    return tool, context, data, foreign


def count(tool, model):
    with tool.db.session() as s:
        return s.scalar(select(func.count()).select_from(model))


def test_registry_schemas_and_no_arbitrary_execution(registry):
    tool, ctx, data, _ = registry
    with tool.db.session() as s:
        policy = tool.runs.effective_policy(s, tool.runs.get(s, 'p', ctx.run_id))
    offered = tool.definitions(policy)
    assert {d.name for d in offered} == set(DESCRIPTORS) - {'read_evidence_span', 'record_outcome'}
    for d in offered:
        assert d.input_model.model_json_schema()['additionalProperties'] is False
        assert DESCRIPTORS[d.name].output_model.model_json_schema()
    for name in ('shell', 'python', 'sql', 'fetch_url', 'replay_science', 'fetch_live_failure_prose'):
        result = tool.dispatch(ctx, name, {})
        assert result.error_code == 'UNSUPPORTED_CAPABILITY'
    assert not tool.definitions(policy, role='scientific_reviewer')
    assert count(tool, ActionRow) == count(tool, JobRow) == 0


@pytest.mark.parametrize('arguments', [{}, {'dataset_id': 'missing', 'project_id': 'q'},
    {'dataset_id': 'missing', 'config': {'invented': 'secret-canary'}},
    {'dataset_id': 'missing', 'config': {'check_missing': 'yes'}},
    {'dataset_id': 'missing', 'config': {'density_radius': float('nan')}}])
def test_malformed_never_creates_work(registry, arguments):
    tool, ctx, _, _ = registry
    result = tool.dispatch(ctx, 'run_audit', arguments)
    assert result.status == 'blocked' and 'secret-canary' not in result.model_dump_json()
    assert count(tool, ActionRow) == count(tool, JobRow) == count(tool, UsageRow) == 0


def test_cross_project_and_forged_authority(registry):
    tool, ctx, data, foreign = registry
    for context, args in ((ctx, {'dataset_id': foreign.id}),
                          (replace(ctx, project_id='q'), {'dataset_id': foreign.id}),
                          (replace(ctx, claim_token=1), {'dataset_id': data.id}),
                          (replace(ctx, role='evidence'), {'dataset_id': data.id})):
        assert tool.dispatch(context, 'run_audit', args).status == 'blocked'
    assert count(tool, JobRow) == count(tool, ActionRow) == 0


def test_atomic_submission_replay_and_changed_intent(registry):
    tool, ctx, data, _ = registry
    def call(_):
        return tool.dispatch(ctx, 'run_audit', {'dataset_id': data.id})
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(call, range(4)))
    assert all(r.status == 'submitted' for r in results), results
    assert len({r.job_id for r in results}) == len({r.action_id for r in results}) == 1
    assert count(tool, JobRow) == count(tool, ActionRow) == count(tool, RunJobRow) == count(tool, UsageRow) == 1
    tool.db.engine.dispose()
    assert call(0) == results[0]
    changed = tool.dispatch(ctx, 'run_audit', {'dataset_id': data.id, 'config': {'check_missing': False}})
    assert changed.error_code == 'IDEMPOTENCY_CONFLICT'
    with tool.db.session() as s:
        usage = tool.budgets.snapshot(s, 'p', ctx.run_id)
        assert usage.tool_calls == usage.scientific_attempts == 1


def test_budget_failure_rolls_back_job_and_action(registry):
    tool, ctx, data, _ = registry
    with tool.db.session.begin() as s:
        old = s.get(ProjectPolicyRow, ('p', 1))
        policy = AuthorityPolicy.model_validate(old.payload)
        policy = policy.model_copy(update={'revision': 2, 'limits': policy.limits.model_copy(update={'scientific_attempts': 0})})
        s.add(ProjectPolicyRow(project_id='p', revision=2, payload=policy.model_dump(mode='json')))
    result = tool.dispatch(ctx, 'run_audit', {'dataset_id': data.id})
    assert result.error_code == 'BUDGET_EXHAUSTED'
    assert count(tool, ActionRow) == count(tool, JobRow) == count(tool, RunJobRow) == count(tool, UsageRow) == 0


def test_cancel_and_claim_rotation_fence_replay(registry):
    tool, ctx, data, _ = registry
    result = tool.dispatch(ctx, 'run_audit', {'dataset_id': data.id})
    assert result.status == 'submitted'
    with tool.db.session.begin() as s:
        tool.runs.mutate(s, 'p', ctx.run_id, 'cancel', RunControlInput(expected_run_revision=1), 'cancel')
    assert tool.dispatch(ctx, 'run_audit', {'dataset_id': data.id}).error_code == 'RUN_REVISION_CHANGED'
    assert count(tool, JobRow) == 1


def test_real_audit_generated_scope_and_safe_projection(registry):
    tool, ctx, data, _ = registry
    result = tool.dispatch(ctx, 'run_audit', {'dataset_id': data.id})
    claim = claim_next(tool.db, 120, 'test')
    assert claim.job_id == result.job_id
    process_job(tool.settings, claim, db=tool.db)
    with tool.db.session() as s:
        job = s.get(JobRow, result.job_id)
        assert job.state == 'succeeded'
        aid = job.result_id
    output = tool.dispatch(replace(ctx, action_key='read'), 'read_artifact', {'artifact_id': aid})
    assert output.status == 'completed', output
    assert output.data['scientific_acceptance'] == 'not_assessed'
    assert 'findings' not in output.data and 'config' not in output.data
    assert tool.dispatch(replace(ctx, action_key='poll'), 'read_job', {'job_id': result.job_id}).data['result_id'] == aid
    with tool.db.session.begin() as s:
        old = AuthorityPolicy.model_validate(s.get(ProjectPolicyRow, ('p', 1)).payload)
        s.add(ProjectPolicyRow(project_id='p', revision=2,
            payload=old.model_copy(update={'revision': 2, 'artifact_ids': frozenset()}).model_dump(mode='json')))
    assert tool.dispatch(replace(ctx, action_key='read-again'), 'read_artifact', {'artifact_id': aid}).status == 'blocked'


def test_bounded_reads_are_accounted_and_replay_is_frozen(registry):
    tool, ctx, data, _ = registry
    first = tool.dispatch(ctx, 'list_artifacts', {'limit': 1})
    assert first.status == 'completed' and len(first.data['items']) == 1
    assert tool.dispatch(ctx, 'list_artifacts', {'limit': 1}) == first
    assert count(tool, UsageRow) == 1
    # A smaller current context ceiling fences replay as well as new results.
    with tool.db.session.begin() as s:
        old = AuthorityPolicy.model_validate(s.get(ProjectPolicyRow, ('p', 1)).payload)
        s.add(ProjectPolicyRow(project_id='p', revision=2,
            payload=old.model_copy(update={'revision': 2, 'max_context_bytes': 1}).model_dump(mode='json')))
    assert tool.dispatch(ctx, 'list_artifacts', {'limit': 1}).status == 'blocked'
    assert tool.dispatch(replace(ctx, action_key='tiny'), 'inspect_project', {}).error_code == 'DATA_EXPOSURE_DENIED'
    assert count(tool, ActionRow) == count(tool, UsageRow) == 1


def test_schema_classification_and_wrong_job_scope(registry):
    tool, ctx, data, _ = registry
    result = tool.dispatch(ctx, 'inspect_dataset', {'dataset_id': data.id})
    assert result.status == 'completed' and result.content_class == 'schema'
    assert result.data['columns'] == ['x', 'y']
    assert result.context('p').content_class == 'schema'
    unknown = tool.dispatch(replace(ctx, action_key='other-job'), 'read_job', {'job_id': 'not-linked'})
    assert unknown.status == 'blocked'
    assert count(tool, UsageRow) == 1


def test_split_seal_baseline_and_quarantined_metrics(registry):
    from workbench.contracts import Benchmark
    from workbench.job_metadata import finish_claim
    tool, ctx, data, _ = registry
    audit = tool.dispatch(ctx, 'run_audit', {'dataset_id': data.id})
    process_job(tool.settings, claim_next(tool.db, 120, 'audit'), db=tool.db)
    with tool.db.session() as s:
        audit_id = s.get(JobRow, audit.job_id).result_id
    split = tool.dispatch(replace(ctx, action_key='split'), 'generate_split',
        {'dataset_id': data.id, 'audit_id': audit_id,
         'config': {'strategy': 'random', 'test_size': 0.33, 'validation_size': 0.33}})
    assert split.status == 'submitted', split
    process_job(tool.settings, claim_next(tool.db, 120, 'split'), db=tool.db)
    with tool.db.session() as s:
        split_id = s.get(JobRow, split.job_id).result_id
        assert split_id
    reused_split = tool.dispatch(replace(ctx, action_key='reuse-split'), 'generate_split',
        {'dataset_id': data.id, 'audit_id': audit_id,
         'config': {'strategy': 'random', 'test_size': 0.33, 'validation_size': 0.33}})
    assert reused_split.status == 'completed' and reused_split.data['reused']
    assert reused_split.job_id == split.job_id and reused_split.artifact_ids == [split_id]
    candidate = {**fixture('benchmark'), 'dataset_id': data.id, 'split_id': split_id,
                 'target': 'y', 'numeric_features': ['x'], 'categorical_features': [], 'model': 'mean'}
    sealed = tool.dispatch(replace(ctx, action_key='seal'), 'seal_evaluation', {'candidates': {'mean': candidate}})
    assert sealed.status == 'completed', sealed
    assert tool.dispatch(replace(ctx, action_key='seal'), 'seal_evaluation', {'candidates': {'mean': candidate}}) == sealed
    protocol_id = sealed.artifact_ids[0]
    baseline = tool.dispatch(replace(ctx, action_key='baseline'), 'run_baseline', {'protocol_id': protocol_id, 'candidate_id': 'mean'})
    assert baseline.status == 'submitted', baseline
    claim = claim_next(tool.db, 120, 'benchmark')
    # Synthetic persisted benchmark exercises C12 projection, not scientific performance.
    with tool.db.session.begin() as s:
        bench = save(s, Benchmark(project_id='p', parents=[data.id, split_id], dataset_id=data.id,
            split_id=split_id, model='mean', seed=candidate['seed'], config=candidate, status='succeeded',
            result={'metrics': {'validation': {'rmse': 1.0}, 'test': {'rmse': 987654321}}, 'private': 'test-canary'}))
        s.flush()
        finish_claim(s, claim, state='succeeded', result_id=bench.id)
    viewed = tool.dispatch(replace(ctx, action_key='evaluation'), 'read_evaluation',
        {'protocol_id': protocol_id, 'artifact_id': bench.id})
    assert viewed.status == 'completed', viewed
    assert viewed.data['metrics'] == {'validation': {'rmse': 1.0}}
    assert '987654321' not in viewed.model_dump_json() and 'test-canary' not in viewed.model_dump_json()
    assert tool.dispatch(replace(ctx, action_key='raw'), 'read_artifact', {'artifact_id': bench.id}).error_code == 'DATA_EXPOSURE_DENIED'


def test_report_snapshot_replay_and_no_nested_reports(registry):
    tool, ctx, _, _ = registry
    first = tool.dispatch(ctx, 'build_report', {})
    assert first.status == 'submitted', first
    process_job(tool.settings, claim_next(tool.db, 120, 'report'), db=tool.db)
    with tool.db.session() as s:
        assert s.get(JobRow, first.job_id).state == 'succeeded'
    assert tool.dispatch(ctx, 'build_report', {}) == first
    second = tool.dispatch(replace(ctx, action_key='report-two'), 'build_report', {})
    assert second.status == 'submitted', second
    with tool.db.session() as s:
        snapshot = s.get(JobRow, second.job_id).payload['snapshot']
        assert not any(a['kind'] == 'report' for a in snapshot['artifacts'])


def test_stale_generation_and_pending_work_report(registry):
    tool, ctx, data, _ = registry
    audit = tool.dispatch(ctx, 'run_audit', {'dataset_id': data.id})
    assert audit.status == 'submitted'
    assert tool.dispatch(replace(ctx, action_key='report'), 'build_report', {}).error_code == 'PROJECT_BUSY'
    with tool.db.session.begin() as s:
        s.execute(update(RunRow).where(RunRow.id == ctx.run_id).values(claim_token=1))
    assert tool.dispatch(replace(ctx, action_key='inspect'), 'inspect_project', {}).error_code == 'RUN_REVISION_CHANGED'
    assert count(tool, ActionRow) == 1


def test_fault_after_submission_rolls_back_without_leaking(registry, monkeypatch):
    tool, ctx, data, _ = registry
    original = tool.runs.bind_job
    def interrupted(*args, **kwargs):
        raise RuntimeError('private-db-credential-canary')
    monkeypatch.setattr(tool.runs, 'bind_job', interrupted)
    result = tool.dispatch(ctx, 'run_audit', {'dataset_id': data.id})
    assert result.status == 'failed' and 'canary' not in result.model_dump_json()
    assert count(tool, JobRow) == count(tool, ActionRow) == 0
    monkeypatch.setattr(tool.runs, 'bind_job', original)
    assert tool.dispatch(ctx, 'run_audit', {'dataset_id': data.id}).status == 'submitted'


def test_mixed_projection_requires_all_content_classes(registry):
    tool, ctx, data, _ = registry
    with tool.db.session.begin() as s:
        old = AuthorityPolicy.model_validate(s.get(ProjectPolicyRow, ('p', 1)).payload)
        s.add(ProjectPolicyRow(project_id='p', revision=2,
            payload=old.model_copy(update={'revision': 2, 'content_classes': frozenset({'schema'})}).model_dump(mode='json')))
    result = tool.dispatch(ctx, 'inspect_dataset', {'dataset_id': data.id})
    assert result.error_code == 'DATA_EXPOSURE_DENIED'
    assert count(tool, ActionRow) == count(tool, UsageRow) == 0

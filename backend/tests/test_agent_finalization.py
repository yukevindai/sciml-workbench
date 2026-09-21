"""E11/E13 exact review and actual report build/verification, without paid IO."""
import io
import json
from copy import deepcopy

import pytest
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from test_metadata import old_db, db
from test_tool_registry import registry
from test_agent_coordinator import setup, PLAN, advance
from workbench.agent_db import FinalizationRow, RunRow, AssignmentRow, ActionRow
from workbench.agent_review import candidate_digest, apply_review, ReviewResult
from workbench.agent_runs import RunService
from workbench.db import JobRow, ArtifactRow
from workbench.execution import TaskResult
from workbench.job_metadata import claim_next, finish_claim
from workbench.services import execute
from workbench.worker import prepare_claim, publish_result
from workbench.errors import DomainError
from workbench.scientific_contracts import Claim
from test_worker import runtime
from test_references import source, claim as source_claim
from test_agent_evaluation import evaluated, scopes


def execute_job(tool):
    claim = claim_next(tool.db, 120, 'test-science')
    assert claim
    work, _ = prepare_claim(tool.db, claim)
    artifact = execute(tool.store, tool.settings, work)
    publish_result(tool.db, claim, work, TaskResult(artifact=artifact.model_dump(mode='json')), store=tool.store)
    return artifact


def export_ready(registry, claims=None):
    tool, ctx, data, _ = registry
    step, scheduler, saver, provider = setup(registry, [PLAN,
        {'id': 'ignored', 'name': 'run_audit', 'input': {'dataset_id': data.id}},
        {'kind': 'finish', 'summary': 'Audit is finished', 'export_report': True, 'claims': claims or []}])
    for _ in range(4):
        advance(scheduler, saver, step)
    audit = execute_job(tool)
    assert audit.kind == 'audit'
    for _ in range(2):
        assert advance(scheduler, saver, step) == 'queued'
    if claims:
        assert advance(scheduler, saver, step) == 'queued'
    assert advance(scheduler, saver, step) == 'waiting_for_job'
    return step, scheduler, saver, provider


def test_real_audit_report_verified_and_execution_frozen(registry):
    tool, ctx, data, _ = registry
    step, scheduler, saver, provider = export_ready(registry)
    report = execute_job(tool)
    assert advance(scheduler, saver, step) == 'completed'
    from workbench.archive import verify_archive
    files, artifacts = verify_archive(io.BytesIO(tool.store.get(report.blob_key)))
    execution, = [a for a in artifacts if a.kind == 'agent_execution']
    assert execution.run_id == ctx.run_id
    assert execution.versions.model == 'model'
    assert execution.versions.prompt and execution.policy.sha256
    assert report.id not in execution.parents
    assert execution.pending_finalization_action_ids
    assert 'scientific replay was not run' in files['report.md'].decode()
    assert data.id in {a.id for a in artifacts}
    with tool.db.session() as s:
        frozen = s.get(FinalizationRow, ctx.run_id)
        assert frozen.state == 'verified'
        assert frozen.result['verification'] == 'structural'
        assert frozen.result['scientific_replay'] == 'not_run'
        assert report.id in s.get(RunRow, ctx.run_id).payload['result_artifact_ids']
    with pytest.raises(IntegrityError), tool.db.session.begin() as s:
        s.execute(update(FinalizationRow).where(FinalizationRow.run_id == ctx.run_id).values(candidate={}))


def test_export_retry_retains_identical_capture(registry):
    tool, ctx, _, _ = registry
    step, scheduler, saver, _ = export_ready(registry)
    claim = claim_next(tool.db, 120, 'crashed-export')
    with tool.db.session.begin() as s:
        original = deepcopy(s.get(JobRow, claim.job_id).payload)
        finish_claim(s, claim, state='failed', error='Interrupted', error_code='WORKER_INTERRUPTED')
    assert advance(scheduler, saver, step) == 'waiting_for_job'
    with tool.db.session() as s:
        frozen = s.get(FinalizationRow, ctx.run_id)
        retry = s.get(JobRow, frozen.report_job_id)
        assert retry.id != claim.job_id
        assert retry.retry_of_job_id == claim.job_id
        assert retry.payload == original
        assert frozen.result['retries'] == 1
    execute_job(tool)
    assert advance(scheduler, saver, step) == 'completed'


def test_corrupt_export_never_reports_completion(registry):
    tool, ctx, _, _ = registry
    step, scheduler, saver, _ = export_ready(registry)
    report = execute_job(tool)
    tool.store.path(report.blob_key).write_bytes(b'corrupt')
    assert advance(scheduler, saver, step) == 'partially_completed'
    with tool.db.session() as s:
        run = s.get(RunRow, ctx.run_id)
        assert report.id not in run.payload['result_artifact_ids']
        assert 'not verified' in run.payload['stop_reason']


def test_policy_narrowing_withholds_frozen_deliverables(registry):
    from workbench.agent_db import ProjectPolicyRow
    tool, ctx, _, _ = registry
    step, scheduler, saver, _ = export_ready(registry)
    report = execute_job(tool)
    with tool.db.session.begin() as s:
        old = s.get(ProjectPolicyRow, ('p', 2))
        s.add(ProjectPolicyRow(project_id='p', revision=3,
            payload={**old.payload, 'revision': 3, 'artifact_ids': []}))
    assert advance(scheduler, saver, step) == 'partially_completed'
    with tool.db.session() as s:
        assert s.get(RunRow, ctx.run_id).payload['result_artifact_ids'] == []


def test_revocation_before_capture_does_not_export_or_grant_empty_parent_record(registry):
    from workbench.agent_db import ProjectPolicyRow
    tool, ctx, _, _ = registry
    step, scheduler, saver, _ = setup(registry, [PLAN,
        {'kind': 'finish', 'summary': 'Stop', 'export_report': True}])
    for _ in range(4):
        assert advance(scheduler, saver, step) == 'queued'
    with tool.db.session.begin() as s:
        old = s.get(ProjectPolicyRow, ('p', 2))
        s.add(ProjectPolicyRow(project_id='p', revision=3,
            payload={**old.payload, 'revision': 3, 'artifact_ids': []}))
    assert advance(scheduler, saver, step) == 'partially_completed'
    with tool.db.session() as s:
        run = s.get(RunRow, ctx.run_id)
        assert run.payload['result_artifact_ids'] == []
        assert s.get(FinalizationRow, ctx.run_id).execution_id is not None
        assert not list(s.scalars(select(JobRow)))


def test_runtime_versions_are_retained_before_model_io(registry):
    from workbench.agent_db import RuntimeVersionRow
    tool, ctx, _, _ = registry
    step, scheduler, saver, provider = setup(registry, [PLAN])
    original = provider.complete
    def inspect_versions(**kwargs):
        with tool.db.session() as s:
            versions = s.scalar(select(RuntimeVersionRow).where(RuntimeVersionRow.run_id == ctx.run_id))
            assert versions.payload == step.versions.model_dump(mode='json')
        return original(**kwargs)
    provider.complete = inspect_versions
    advance(scheduler, saver, step)
    with pytest.raises(IntegrityError), tool.db.session.begin() as s:
        s.execute(update(RuntimeVersionRow).where(RuntimeVersionRow.run_id == ctx.run_id).values(payload={}))


def test_unavailable_review_exports_factual_partial_without_narrative(registry):
    tool, ctx, _, _ = registry
    claims = [hypothetical_claim().model_dump(mode='json')]
    step, scheduler, saver, provider = export_ready(registry, claims)
    report = execute_job(tool)
    assert advance(scheduler, saver, step) == 'partially_completed'
    from workbench.archive import verify_archive
    files, artifacts = verify_archive(io.BytesIO(tool.store.get(report.blob_key)))
    assert b'A mechanism may explain' not in files['report.md']
    assert b'Independent review unavailable' in files['report.md']
    assert any(a.kind == 'audit' for a in artifacts)
    assert not any(a.kind == 'claim_set' for a in artifacts)
    assert len(provider.contexts) == 3  # No source-free raw review call escapes.


def test_finalization_resumes_without_checkpoint_or_extra_model(registry):
    tool, ctx, _, _ = registry
    step, scheduler, saver, provider = export_ready(registry)
    execute_job(tool)
    # A committed finalization ledger is sufficient even after losing the
    # advisory proposal state. Scheduler still enforces its committed pointer.
    claim = scheduler.claim('restored')
    runs = RunService(claim=claim)
    with tool.db.session.begin() as s:
        snapshot = runs.reconcile(s, 'p', ctx.run_id)
    _, status = step(snapshot, None, runs)
    assert status == 'completed' and len(provider.contexts) == 3


def hypothetical_claim():
    return Claim(id='c', statement='A mechanism may explain this observation', classification='hypothesis',
        population='Fixture', limitations=['Unproven'], uncertainty='High',
        reference_check={'status': 'not_checked', 'issues': []}, semantic_review={'status': 'not_reviewed'})


def test_review_exact_candidate_and_unsupported_removal():
    claims = [hypothetical_claim()]
    result = ReviewResult(candidate_sha256=candidate_digest(claims), verdicts=[{
        'claim_id': 'c', 'status': 'unsupported', 'explanation': 'No supporting evidence'}],
        residual_uncertainty='No evidence')
    accepted, removed = apply_review(claims, result, 'reviewer')
    assert accepted == [] and removed == ['c']
    changed = claims[0].model_copy(update={'statement': 'This mechanism is established'})
    with pytest.raises(DomainError, match='exact candidate'):
        apply_review([changed], result, 'reviewer')


def test_frozen_run_fences_science_and_amendments(registry):
    tool, ctx, data, _ = registry
    step, scheduler, saver, _ = export_ready(registry)
    # Run is waiting for its accepted report; no new scientific work is admitted.
    from workbench.research_contracts import RunAmendmentInput
    with tool.db.session.begin() as s:
        run = s.get(RunRow, ctx.run_id)
        with pytest.raises(DomainError, match='frozen'):
            tool.runs.mutate(s, 'p', ctx.run_id, 'amend', RunAmendmentInput(
                expected_run_revision=run.control_revision, expected_plan_revision=run.plan_revision,
                objective='Train another model'), 'amend-after-finalization')


def test_independent_review_uses_exact_sources_and_caches_receipt(source, runtime):
    from workbench.agent_policy import AuthorityPolicy, default_limits
    from workbench.agent_db import ServerPolicyRow, ProjectPolicyRow
    from workbench.research_contracts import RunInput
    from workbench.agent_scheduler import Scheduler
    from workbench.agent_review import IndependentReviewer, checked_candidate
    from workbench.budgeted_provider import ModelBound
    from workbench.model_provider import ModelResult
    from workbench.references import make_reference
    from workbench.projections import ReadScope
    from test_agent_runs import plan
    db, store, evidence = source
    _, settings, _ = runtime
    policy = AuthorityPolicy(policy_id='review', revision=1, project_ids={'p'}, artifact_ids={evidence.id},
        provider_models={'model'}, exposure='raw_project_content', content_classes={'schema', 'aggregates', 'raw'})
    runs = RunService(admission=lambda: None)
    with db.session.begin() as s:
        s.add(ServerPolicyRow(revision=1, payload=policy.model_dump(mode='json')))
        s.add(ProjectPolicyRow(project_id='p', revision=1, payload=policy.model_dump(mode='json')))
        s.flush()
        run = runs.create(s, 'p', RunInput(objective='Review source claims', policy_revision=1,
            limits=default_limits(), inputs={'artifact_ids': [evidence.id], 'material_ids': []}), 'review')
        ref = make_reference(s, store, ReadScope('p'), evidence.id, 0, 4, page=1)
        candidate, removed = checked_candidate(s, store,
            ReadScope('p', 'agent', run['id'], frozenset({evidence.id}), frozenset()), [source_claim(ref.model_dump(mode='json'))])
        assert removed == []
    plan(db, runs, run)
    claim = Scheduler(db).claim('reviewer-test')
    runs = RunService(claim=claim)
    class Provider:
        calls = 0
        def resolved_model(self, model):
            return model
        def complete(self, **kwargs):
            self.calls += 1
            assert kwargs['tools'] == []
            context = json.loads(kwargs['context'][1].text)
            assert context['answer'] == 'source_supported: The source states a measurement'
            assert context['verified_source_spans'][0]['text'] == 'Caf\u00e9'
            return ModelResult('model', 'end_turn', (json.dumps({
                'candidate_sha256': context['candidate_sha256'], 'verdicts': [{'claim_id': 'claim',
                    'status': 'unsupported', 'explanation': 'The exact cited span is only one word'}],
                'residual_uncertainty': 'A longer source span might support a narrower claim'}),), (),
                {'input_tokens': 20, 'output_tokens': 20})
    provider = Provider()
    bound = ModelBound(model='model', revision='fixture', source_reference='fixture', max_request_bytes=64000,
        input_tokens=100, max_output_tokens=1024, max_active_seconds=5)
    reviewer = IndependentReviewer(db, store, settings, runs, provider, model='model', bounds={'model': bound})
    result, aid = reviewer.review('p', run['id'], candidate)
    assert apply_review(candidate, result, aid) == ([], ['claim'])
    assert reviewer.review('p', run['id'], candidate) == (result, aid)
    assert provider.calls == 1
    with db.session() as s:
        assignment = s.get(AssignmentRow, aid)
        assert assignment.payload['allowed_tools'] == []
        assert assignment.payload['reviewed_snapshot_sha256'] == candidate_digest(candidate)


def test_review_candidate_cannot_include_sealed_test_metrics(evaluated):
    from workbench.agent_review import checked_candidate
    tool, ctx, _, protocol, benchmark, _ = evaluated
    _, scope = scopes(tool, ctx)
    base = hypothetical_claim().model_dump(mode='json')
    base.update(classification='computed_result', statement='A retained metric was computed',
        metric_references=[{'artifact_id': benchmark.id, 'partition': 'validation',
            'field_path': '/result/metrics/validation/rmse', 'value': 1.25}])
    with tool.db.session.begin() as s:
        checked, removed = checked_candidate(s, tool.store, scope, [base])
        assert len(checked) == 1 and not removed
        base['metric_references'] = [{'artifact_id': benchmark.id, 'partition': 'test',
            'field_path': '/result/metrics/test/rmse', 'value': 987654321}]
        assert checked_candidate(s, tool.store, scope, [base]) == ([], ['c'])
    from workbench.db import ExposureRow
    with tool.db.session() as s:
        assert not list(s.scalars(select(ExposureRow)))


def test_frozen_export_releases_comparison_and_records_final_exposure(evaluated):
    from workbench.agent_finalization import Finalizer, execution_versions
    from workbench.agent_recovery import reconcile_effects
    from test_agent_runs import plan
    from test_agent_coordinator import ScriptedProvider
    from workbench.db import EvaluationRow, ExposureRow
    from workbench.agent_evaluation import final_exposure_marker
    tool, ctx, _, protocol, benchmark, _ = evaluated
    with tool.db.session.begin() as s:
        snapshot = reconcile_effects(s, tool.runs, 'p', ctx.run_id)
    plan(tool.db, tool.runs, snapshot['run'])
    finalizer = Finalizer(tool.db, tool.store, tool.settings, tool.runs)
    finalizer.begin('p', ctx.run_id, claims=[], export=True,
        versions=execution_versions('model', ScriptedProvider([]), 'fixture'))
    assert finalizer.advance('p', ctx.run_id)[1] == 'waiting_for_job'
    with tool.db.session() as s:
        assert s.get(EvaluationRow, protocol).released_at is not None
        assert s.scalar(select(ExposureRow.id).where(ExposureRow.via == final_exposure_marker(ctx.run_id)))
        finalization = s.get(FinalizationRow, ctx.run_id)
        captured = s.get(JobRow, finalization.report_job_id).payload['snapshot']
        assert captured['test_exposures']
        assert captured['agent_finalization']['export_status_at_cutoff'] == 'pending'

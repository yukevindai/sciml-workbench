"""Actual installed science and adversarial orchestration; provider decisions are fixtures."""
import json
from pathlib import Path
from dataclasses import replace
from threading import Barrier

import pytest
from sqlalchemy import select
from test_metadata import old_db, db
from test_tool_registry import registry
from test_agent_coordinator import setup, PLAN, advance
from test_agent_finalization import execute_job
from test_workflow import fixture
from workbench.agent_db import RunRow, ServerPolicyRow, ProjectPolicyRow, AssignmentRow, ReservationRow, QuestionRow
from workbench.db import JobRow
from workbench.model_provider import ModelResult, ProviderError, ContextPart
from workbench.contracts import Source
from workbench.services import upload_csv


def test_real_audit_split_baseline_report_without_intermediate_approval(registry):
    tool, ctx, original, _ = registry
    step, scheduler, saver, provider = setup(registry, [PLAN])
    with tool.db.session.begin() as s:
        data = upload_csv(s, tool.store, tool.settings, 'p',
            Path('examples/demo.csv').read_bytes(), 'demo.csv', Source(**fixture('source')))
        for cls in (ServerPolicyRow, ProjectPolicyRow):
            previous = s.scalar(select(cls).where(cls.revision == 2))
            payload = {**previous.payload, 'revision': 3, 'artifact_ids': [original.id, data.id]}
            s.add(cls(**({'project_id': 'p'} if cls is ProjectPolicyRow else {}), revision=3, payload=payload))
        run = s.get(RunRow, ctx.run_id)
        run.policy = {**run.policy, 'artifact_ids': [original.id, data.id]}
    advance(scheduler, saver, step)
    advance(scheduler, saver, step)

    def call(name, arguments, science=False):
        provider.responses = iter([{'id': 'proposal', 'name': name, 'input': arguments}])
        assert advance(scheduler, saver, step) == 'queued'
        status = advance(scheduler, saver, step)
        assert status == ('waiting_for_job' if science else 'queued')
        if science:
            return execute_job(tool)

    audit = call('run_audit', {'dataset_id': data.id, 'config': fixture('audit')}, True)
    split = call('generate_split', {'dataset_id': data.id, 'audit_id': audit.id, 'config': fixture('split')}, True)
    call('seal_evaluation', {'candidates': {'mean': {**fixture('benchmark'), 'dataset_id': data.id,
        'split_id': split.id, 'model': 'mean'}}})
    from workbench.db import ArtifactRow
    with tool.db.session() as s:
        protocol = s.scalar(select(ArtifactRow).where(ArtifactRow.kind == 'evaluation_protocol'))
        protocol_id = protocol.id
    baseline = call('run_baseline', {'protocol_id': protocol_id, 'candidate_id': 'mean'}, True)
    assert baseline.status == 'succeeded'
    call('read_evaluation', {'protocol_id': protocol_id, 'artifact_id': baseline.id})
    provider.responses = iter([{'kind': 'finish', 'summary': 'Completed predeclared comparison', 'export_report': True}])
    advance(scheduler, saver, step)
    advance(scheduler, saver, step)
    assert advance(scheduler, saver, step) == 'waiting_for_job'
    assert execute_job(tool).kind == 'report'
    assert advance(scheduler, saver, step) == 'completed'
    with tool.db.session() as s:
        assert not list(s.scalars(select(QuestionRow)))
        assert not list(s.scalars(select(AssignmentRow)))
        assert len(list(s.scalars(select(JobRow)))) == 4


def delegation(data, roles):
    return {'kind': 'delegate', 'summary': 'Independent scoped checks', 'assignments': [
        {'role': role, 'objective': 'Inspect limitations', 'artifact_ids': [data.id],
         'completion_criteria': ['Report uncertainty']} for role in roles]}


def test_parallel_specialists_share_budget_and_cannot_delegate(registry):
    tool, ctx, data, _ = registry
    step, scheduler, saver, provider = setup(registry, [PLAN, delegation(data, ['data_evaluation', 'evidence'])])
    for _ in range(3):
        advance(scheduler, saver, step)
    barrier = Barrier(2, timeout=10)
    def complete(**kwargs):
        assert kwargs['tools'] == []
        ident = kwargs['context'][0].text.split('Assignment ID: ')[1]
        barrier.wait()
        return ModelResult('model', 'end_turn', (json.dumps(dict(assignment_id=ident,
            findings=[], supporting_artifact_ids=[data.id], uncertainty='Limited fixture',
            unresolved_issues=[], recommended_actions=[])),), (), {'input_tokens': 10, 'output_tokens': 10})
    provider.complete = complete
    assert advance(scheduler, saver, step) == 'queued'
    with tool.db.session() as s:
        assert [a.state for a in s.scalars(select(AssignmentRow))] == ['completed', 'completed']
        run = s.get(RunRow, ctx.run_id)
        assert tool.runs.projected_payload(s, run)['usage']['model_requests'] == 4
        allocations = [r for r in s.scalars(select(ReservationRow)) if r.payload['intent']['kind'] == 'allocation']
        assert len(allocations) == 2 and all(r.payload['state'] == 'released' for r in allocations)


def test_interrupted_specialist_retains_unknown_usage_and_is_not_replayed(registry):
    tool, ctx, data, _ = registry
    step, scheduler, saver, provider = setup(registry, [PLAN, delegation(data, ['evidence'])])
    for _ in range(3):
        advance(scheduler, saver, step)
    calls = []
    def fail(**kwargs):
        calls.append(1)
        raise ProviderError('provider_unavailable', usage_unknown=True)
    provider.complete = fail
    assert advance(scheduler, saver, step) == 'waiting_for_input'
    # Reconciliation under a fresh, trusted lease diagnoses rather than replays.
    from workbench.agent_recovery import reconcile_effects
    from workbench.agent_runs import RunService
    from workbench.research_contracts import QuestionAnswerInput
    with tool.db.session.begin() as s:
        run = s.get(RunRow, ctx.run_id)
        q = s.scalar(select(QuestionRow))
        tool.runs.mutate(s, 'p', run.id, 'answer', QuestionAnswerInput(
            expected_run_revision=run.control_revision, expected_question_revision=q.revision,
            answers={'recovery': 'Continue'}), 'answer', q.id)
    assert advance(scheduler, saver, step) == 'waiting_for_input'
    assert calls == [1]
    with tool.db.session() as s:
        assert s.scalar(select(AssignmentRow)).state == 'waiting'
        assert any(r.payload['state'] == 'unknown' for r in s.scalars(select(ReservationRow)))


def test_operator_channel_requires_explicit_consent_and_does_not_allow_raw(registry):
    from workbench.agent_policy import AuthorityPolicy, intersect_policy
    from workbench.egress import check_context, EgressDenied
    policy = AuthorityPolicy(policy_id='p', revision=1, project_ids={'p'}, artifact_ids={'data'})
    message = ContextPart('p', 'operator', 'Audit my dataset')
    with pytest.raises(EgressDenied):
        check_context(policy, [message])
    consent = policy.model_copy(update={'share_operator_messages': True})
    check_context(consent, [message])
    with pytest.raises(EgressDenied):
        check_context(consent, [ContextPart('p', 'raw', 'private rows', ('data',))])
    assert not intersect_policy(policy, consent).share_operator_messages


def test_failure_recording_uses_trusted_actor_and_original_receipt(registry):
    from workbench.agent_recovery import reconcile_effects
    tool, ctx, data, _ = registry
    step, _, _, _ = setup(registry, [])
    tool.versions = step.versions
    with tool.db.session.begin() as s:
        for cls in (ServerPolicyRow, ProjectPolicyRow):
            previous = s.scalar(select(cls).where(cls.revision == 2))
            payload = {**previous.payload, 'revision': 3, 'automatic_failure_recording': True}
            s.add(cls(**({'project_id': 'p'} if cls is ProjectPolicyRow else {}), revision=3, payload=payload))
        run = s.get(RunRow, ctx.run_id)
        run.policy = {**run.policy, 'automatic_failure_recording': True}
    assert tool.dispatch(ctx, 'run_audit', {'dataset_id': data.id}).status == 'submitted'
    audit = execute_job(tool)
    assert tool.dispatch(replace(ctx, action_key='split'), 'generate_split', dict(dataset_id=data.id,
        audit_id=audit.id, config={'strategy': 'random', 'validation_size': .33, 'test_size': .33})).status == 'submitted'
    split = execute_job(tool)
    # Missing declared columns produce a real pinned-adapter admission failure.
    sealed = tool.dispatch(replace(ctx, action_key='seal'), 'seal_evaluation', {'candidates': {'mean': {
        **fixture('benchmark'), 'dataset_id': data.id, 'split_id': split.id, 'target': 'y',
        'numeric_features': ['x'], 'model': 'mean'}}})
    assert sealed.status == 'completed'
    submitted = tool.dispatch(replace(ctx, action_key='baseline'), 'run_baseline',
        {'protocol_id': sealed.artifact_ids[0], 'candidate_id': 'mean'})
    failed = execute_job(tool)
    assert failed.status == 'failed'
    with tool.db.session.begin() as s:
        reconcile_effects(s, tool.runs, 'p', ctx.run_id)
    outcome_ctx = replace(ctx, action_key='outcome')
    recorded = tool.dispatch(outcome_ctx, 'record_outcome', {'job_id': submitted.job_id})
    assert recorded.status == 'submitted', recorded
    assert tool.dispatch(outcome_ctx, 'record_outcome', {'job_id': submitted.job_id}).job_id == recorded.job_id
    with tool.db.session() as s:
        payload = s.get(JobRow, recorded.job_id).payload
        assert payload['actor']['run_id'] == ctx.run_id and payload['actor']['model'] == 'model'
        assert payload['observation']['kind'] == 'execution_failure'
    assert tool.dispatch(replace(ctx, action_key='forged'), 'record_outcome',
        {'job_id': submitted.job_id, 'actor': {'kind': 'human'}}).error_code == 'TOOL_SCHEMA_INVALID'
    from workbench.bootstrap import main as provision
    from workbench.external_operations import run_import
    from workbench.worker import prepare_claim, publish_result
    from workbench.job_metadata import claim_next
    from test_external_operations import public_runner
    provision(tool.settings)
    claim = claim_next(tool.db, 120, 'failure-import')
    work, deadline = prepare_claim(tool.db, claim)
    result = run_import(tool.db, tool.settings, work, deadline, lambda: False, public_runner)
    publish_result(tool.db, claim, work, result, store=tool.store)
    assert result.artifact['actor']['action_id'] == recorded.action_id
    assert result.artifact['receipt']['external_id']


def test_evidence_span_requires_excerpt_policy_and_returns_exact_anchor(registry):
    import io
    from reportlab.pdfgen.canvas import Canvas
    from workbench import adapters
    from workbench.contracts import Evidence
    from workbench.services import save
    tool, ctx, data, _ = registry
    output = io.BytesIO()
    canvas = Canvas(output)
    canvas.drawString(40, 700, 'Verified source excerpt.')
    canvas.save()
    raw = output.getvalue()
    record, bundle = adapters.ingest_pdf(raw, 'Fixture')
    key = tool.store.put(raw)
    with tool.db.session.begin() as s:
        evidence = save(s, Evidence(project_id='p', title='Fixture', pdf_key=key, sha256=key,
            result=record, bundle_key=tool.store.put(bundle)))
        for cls in (ServerPolicyRow, ProjectPolicyRow):
            previous = s.scalar(select(cls))
            payload = {**previous.payload, 'revision': 2, 'exposure': 'selected_excerpts',
                'content_classes': ['schema', 'aggregates', 'excerpt'], 'artifact_ids': [data.id, evidence.id]}
            s.add(cls(**({'project_id': 'p'} if cls is ProjectPolicyRow else {}), revision=2, payload=payload))
        run = s.get(RunRow, ctx.run_id)
        run.policy = {**run.policy, 'exposure': 'selected_excerpts',
            'content_classes': ['schema', 'aggregates', 'excerpt'], 'artifact_ids': [data.id, evidence.id]}
    args = dict(artifact_id=evidence.id, page=1, start=0, end=8)
    result = tool.dispatch(replace(ctx, action_key='span'), 'read_evidence_span', args)
    assert result.status == 'completed', result
    assert result.content_class == 'excerpt' and result.data['text'] == 'Verified'
    assert result.data['reference']['source_artifact_id'] == evidence.id
    assert tool.dispatch(replace(ctx, action_key='huge'), 'read_evidence_span', {**args, 'end': 9000}).status == 'blocked'


def test_postgres_worker_restart_executes_saved_proposal_without_new_call(registry):
    from threading import Event
    from test_metadata import database_url
    from workbench.agent_worker import run
    from workbench.checkpoints import setup as checkpoint_setup
    from workbench.agent_db import PlanRow
    tool, ctx, _, _ = registry
    if tool.db.engine.dialect.name != 'postgresql':
        pytest.skip('Durable runtime checkpoints require PostgreSQL')
    step, _, _, provider = setup(registry, [PLAN])
    settings = tool.settings.model_copy(update={'database_url': database_url(tool.db)})
    checkpoint_setup(settings.database_url)
    for _ in range(2):
        stopping = Event()
        def one_step(snapshot, previous, runs):
            value = step(snapshot, previous, runs)
            stopping.set()
            return value
        run(settings, one_step, stopping)
    assert len(provider.contexts) == 1
    with tool.db.session() as s:
        assert s.scalar(select(PlanRow).where(PlanRow.run_id == ctx.run_id)) is not None


def test_specialist_objective_cannot_relabel_broader_source_scope(registry):
    from workbench.agent_specialists import SpecialistService, AssignmentRequest
    from workbench.agent_runs import RunService
    from workbench.egress import EgressDenied
    tool, ctx, data, foreign = registry
    step, scheduler, saver, provider = setup(registry, [PLAN])
    advance(scheduler, saver, step)
    advance(scheduler, saver, step)
    claim = scheduler.claim('specialist-check')
    service = SpecialistService(tool.db, RunService(claim=claim), provider,
        model='model', bounds=step.bounds, settings=tool.settings)
    request = AssignmentRequest(role='evidence', objective='Prose derived from broader inputs',
        artifact_ids=[data.id], completion_criteria=['Inspect'])
    with pytest.raises(EgressDenied):
        service.execute_batch('p', ctx.run_id, 'scope-check', [request],
            [ContextPart('p', 'raw', 'Broader source prose', (foreign.id,))])
    assert len(provider.contexts) == 1
    with tool.db.session() as s:
        assert s.scalar(select(AssignmentRow)).state == 'cancelled'

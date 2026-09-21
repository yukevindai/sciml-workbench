"""Coordinator proposals, committed effects and crash boundaries; no paid calls."""
import json
from sqlalchemy import select
from langgraph.checkpoint.memory import InMemorySaver

from test_metadata import old_db, db
from test_tool_registry import registry
from workbench.agent_db import ProjectPolicyRow, ServerPolicyRow, RunRow, ActionRow
from workbench.agent_coordinator import Coordinator
from workbench.agent_recovery import reconcile_effects
from workbench.agent_runs import RunService
from workbench.agent_scheduler import Scheduler
from workbench.budgeted_provider import ModelBound
from workbench.model_provider import ModelResult
from workbench.db import JobRow
from workbench.job_metadata import claim_next, finish_claim


class ScriptedProvider:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.contexts = []

    def resolved_model(self, model):
        return model

    def complete(self, **kwargs):
        self.contexts.append(kwargs['context'])
        value = next(self.responses)
        if isinstance(value, Exception):
            raise value
        calls = (value,) if 'name' in value else ()
        return ModelResult('model', 'tool_use' if calls else 'end_turn',
                           () if calls else (json.dumps(value),), calls,
                           {'input_tokens': 10, 'output_tokens': 10})


def setup(registry, responses):
    tool, ctx, data, _ = registry
    with tool.db.session.begin() as s:
        for cls in (ServerPolicyRow, ProjectPolicyRow):
            row = s.scalar(select(cls))
            values = {'revision': 2, 'payload': {**row.payload, 'revision': 2,
                'exposure': 'raw_project_content', 'content_classes': ['schema', 'aggregates', 'raw']}}
            if cls is ProjectPolicyRow:
                values['project_id'] = 'p'
            s.add(cls(**values))
        row = s.get(RunRow, ctx.run_id)
        row.policy = {**row.policy, 'exposure': 'raw_project_content',
                      'content_classes': ['schema', 'aggregates', 'raw']}
    provider = ScriptedProvider(responses)
    bound = ModelBound(model='model', revision='fixture', source_reference='fixture',
        max_request_bytes=64000, input_tokens=100, max_output_tokens=1024, max_active_seconds=5)
    step = Coordinator(tool.db, tool.store, tool.settings, provider, model='model', bounds={'model': bound})
    return step, Scheduler(tool.db), InMemorySaver(), provider


PLAN = {'kind': 'plan', 'summary': 'Audit the declared dataset', 'steps': [dict(
    id='audit', objective='Audit', depends_on=[], allowed_input_ids=[], expected_artifact_kinds=['audit'],
    completion_criteria=['Inspect audit findings'], status='ready')]}


def advance(scheduler, saver, step):
    claim = scheduler.claim('test')
    assert claim
    return scheduler.advance(claim, saver, step)


def test_plan_precedes_real_submission_and_reconciles_failure(registry):
    tool, ctx, data, _ = registry
    step, scheduler, saver, provider = setup(registry, [PLAN,
        {'id': 'untrusted', 'name': 'run_audit', 'input': {'dataset_id': data.id}},
        {'kind': 'finish', 'summary': 'No further work'}])
    assert advance(scheduler, saver, step) == 'queued'
    assert advance(scheduler, saver, step) == 'queued'
    assert advance(scheduler, saver, step) == 'queued'
    assert advance(scheduler, saver, step) == 'waiting_for_job'
    assert scheduler.claim('waiting') is None
    science = claim_next(tool.db, 60, 'science')
    with tool.db.session.begin() as s:
        finish_claim(s, science, state='failed', error='Fixture failure', error_code='ADMISSION_REJECTED')
    assert advance(scheduler, saver, step) == 'queued'
    assert any('ADMISSION_REJECTED' in part.text for part in provider.contexts[-1])
    assert advance(scheduler, saver, step) == 'queued'
    assert advance(scheduler, saver, step) == 'partially_completed'
    with tool.db.session() as s:
        assert s.scalar(select(ActionRow)).state == 'failed'
        assert len(s.scalars(select(JobRow)).all()) == 1


def test_lost_response_does_not_repeat_provider(registry):
    from test_agent_scheduler import expire
    tool, ctx, _, _ = registry
    step, scheduler, saver, provider = setup(registry, [PLAN])
    claim = scheduler.claim('first')
    runs = RunService(claim=claim)
    with tool.db.session.begin() as s:
        snapshot = runs.reconcile(s, 'p', ctx.run_id)
    step(snapshot, None, runs)  # Crash before publishing the returned checkpoint.
    expire(tool.db, ctx.run_id)
    assert advance(scheduler, saver, step) == 'waiting_for_input'
    assert len(provider.contexts) == 1


def test_checkpoint_action_replay_reuses_original_job(registry):
    from test_agent_scheduler import expire
    tool, ctx, data, _ = registry
    step, scheduler, saver, provider = setup(registry, [PLAN,
        {'id': 'ignored', 'name': 'run_audit', 'input': {'dataset_id': data.id}}])
    for _ in range(3):
        advance(scheduler, saver, step)
    claim = scheduler.claim('crash')
    runs = RunService(claim=claim)
    from workbench.agent_db import LeaseRow
    with tool.db.session.begin() as s:
        snapshot = runs.reconcile(s, 'p', ctx.run_id)
        pointer = s.get(LeaseRow, ctx.run_id).checkpoint
    step(snapshot, saver.get_tuple(pointer).checkpoint['channel_values']['state'], runs)
    expire(tool.db, ctx.run_id)
    assert scheduler.claim('wait') is None
    science = claim_next(tool.db, 60, 'science')
    with tool.db.session.begin() as s:
        finish_claim(s, science, state='failed', error='Fixture', error_code='INTERNAL_ERROR')
    # Recovery never accepts a second scientific submission from stale state.
    advance(scheduler, saver, step)
    with tool.db.session() as s:
        assert len(s.scalars(select(JobRow)).all()) == 1


def test_material_questions_resume_with_attributed_answers(registry):
    from workbench.agent_db import QuestionRow
    from workbench.research_contracts import QuestionAnswerInput
    tool, ctx, data, _ = registry
    question = {'kind': 'question', 'summary': 'Target and units are material', 'questions': [dict(
        id='target', field='target', prompt='Which column is the target and what are its units?',
        blocked_step_ids=['audit'], options=[], evidence=[])]}
    step, scheduler, saver, provider = setup(registry, [PLAN, question, {'kind': 'finish', 'summary': 'Done'}])
    for _ in range(3):
        advance(scheduler, saver, step)
    assert advance(scheduler, saver, step) == 'waiting_for_input'
    assert scheduler.claim('blocked') is None
    with tool.db.session.begin() as s:
        row = s.get(RunRow, ctx.run_id)
        q = s.scalar(select(QuestionRow))
        tool.runs.mutate(s, 'p', ctx.run_id, 'answer', QuestionAnswerInput(
            expected_run_revision=row.control_revision, expected_question_revision=q.revision,
            answers={'target': 'y, in kelvin'}), 'answer', q.id)
    advance(scheduler, saver, step)
    assert any('y, in kelvin' in p.text for p in provider.contexts[-1])


def test_delegation_is_conditional_scoped_and_charged(registry):
    from workbench.agent_db import AssignmentRow, ReservationRow
    tool, ctx, data, _ = registry
    delegation = {'kind': 'delegate', 'summary': 'Inspect scientific limitations', 'assignment': {
        'role': 'data_evaluation', 'objective': 'Identify limitations in the available aggregate dataset schema',
        'artifact_ids': [data.id], 'completion_criteria': ['Return explicit uncertainty']}}
    step, scheduler, saver, provider = setup(registry, [PLAN, delegation])
    for _ in range(3):
        advance(scheduler, saver, step)
    original = provider.complete
    def specialist(**kwargs):
        if kwargs['tools']:
            return original(**kwargs)
        assert all(set(p.artifact_ids) <= {data.id} for p in kwargs['context'])
        with tool.db.session() as s:
            assignment = s.scalar(select(AssignmentRow))
            aid = assignment.id
        return ModelResult('model', 'end_turn', (json.dumps({'assignment_id': aid, 'findings': [],
            'supporting_artifact_ids': [data.id], 'uncertainty': 'Only aggregate schema was inspected',
            'unresolved_issues': [], 'recommended_actions': []}),), (), {'input_tokens': 10, 'output_tokens': 10})
    provider.complete = specialist
    assert advance(scheduler, saver, step) == 'queued'
    with tool.db.session() as s:
        assignment = s.scalar(select(AssignmentRow))
        assert assignment.state == 'completed'
        assert assignment.payload['allowed_tools'] == []
        allocations = list(s.scalars(select(ReservationRow).where(ReservationRow.assignment_id == assignment.id)))
        assert len(allocations) == 2
        assert {r.payload['state'] for r in allocations} == {'released', 'settled'}


def test_terminal_continuation_gets_new_identity(registry):
    from workbench.research_contracts import RunInput
    from workbench.agent_policy import default_limits
    tool, ctx, data, _ = registry
    with tool.db.session.begin() as s:
        tool.runs.finish(s, 'p', ctx.run_id, 1, state='completed', artifact_ids=[])
    body = RunInput(objective='Continue audit', policy_revision=1, limits=default_limits(),
                    inputs={'artifact_ids': [data.id], 'material_ids': []})
    with tool.db.session.begin() as s:
        new = tool.runs.continue_from(s, 'p', ctx.run_id, body, 'continue')
    with tool.db.session.begin() as s:
        replay = tool.runs.continue_from(s, 'p', ctx.run_id, body, 'continue')
        assert s.get(RunRow, ctx.run_id).state == 'completed'
    assert new == replay and new['id'] != ctx.run_id
    assert new['continued_from_run_id'] == ctx.run_id


def test_unchanged_admission_rejection_does_not_submit_again(registry):
    tool, ctx, data, _ = registry
    call = {'id': 'not-authority', 'name': 'run_audit', 'input': {'dataset_id': data.id}}
    step, scheduler, saver, provider = setup(registry, [PLAN, call, call])
    for _ in range(4):
        advance(scheduler, saver, step)
    science = claim_next(tool.db, 60, 'science')
    with tool.db.session.begin() as s:
        finish_claim(s, science, state='failed', error='Rejected', error_code='ADMISSION_REJECTED')
    advance(scheduler, saver, step)
    assert advance(scheduler, saver, step) == 'queued'
    assert advance(scheduler, saver, step) == 'partially_completed'
    with tool.db.session() as s:
        assert len(s.scalars(select(JobRow)).all()) == 1
        assert 'deterministically rejected' in s.get(RunRow, ctx.run_id).payload['stop_reason']


def test_amendment_discards_pending_science_and_requests_new_plan(registry):
    from workbench.research_contracts import RunAmendmentInput
    tool, ctx, data, _ = registry
    step, scheduler, saver, provider = setup(registry, [PLAN,
        {'id': 'not-authority', 'name': 'run_audit', 'input': {'dataset_id': data.id}}, PLAN])
    for _ in range(3):
        advance(scheduler, saver, step)
    with tool.db.session.begin() as s:
        row = s.get(RunRow, ctx.run_id)
        tool.runs.mutate(s, 'p', ctx.run_id, 'amend', RunAmendmentInput(
            expected_run_revision=row.control_revision, expected_plan_revision=row.plan_revision,
            objective='Only inspect the dataset'), 'amend')
    advance(scheduler, saver, step)
    assert any('amended' in p.text for p in provider.contexts[-1])
    with tool.db.session() as s:
        assert not list(s.scalars(select(JobRow)))


def test_schema_only_policy_does_not_egress_operator_prose(registry):
    tool, ctx, data, _ = registry
    bound = ModelBound(model='model', revision='fixture', source_reference='fixture',
        max_request_bytes=64000, input_tokens=100, max_output_tokens=1024, max_active_seconds=5)
    provider = ScriptedProvider([PLAN])
    step = Coordinator(tool.db, tool.store, tool.settings, provider, model='model', bounds={'model': bound})
    assert advance(Scheduler(tool.db), InMemorySaver(), step) == 'waiting_for_input'
    assert provider.contexts == []

"""Frozen paired trajectories through the real coordinator, budgets and science."""
import hashlib
import json
import os
import time
from pathlib import Path

import pytest
from sqlalchemy import select

from test_metadata import old_db, db
from test_tool_registry import registry
from test_agent_coordinator import setup, PLAN, advance
from test_agent_finalization import execute_job
from workbench.agent_db import ProjectPolicyRow, ServerPolicyRow, RunRow, AssignmentRow
from workbench.autonomy_metrics import observe
from workbench.contracts import Source
from workbench.model_provider import ModelResult
from workbench.services import upload_csv

MANIFEST = Path(__file__).parent / 'fixtures/autonomy/v1.json'
SUITE = json.loads(MANIFEST.read_text())
LIVE = os.environ.get('WB_E15_LIVE') == '1'
ATTEMPTS = int(os.environ.get('WB_E15_ATTEMPTS', '1')) if LIVE else 1
if not 1 <= ATTEMPTS <= 5:
    raise ValueError('E15 attempts must be in [1, 5]')


@pytest.mark.parametrize('attempt', range(ATTEMPTS))
@pytest.mark.parametrize('variant', ['coordinator_only', 'selective_specialists'])
@pytest.mark.parametrize('case', SUITE['cases'], ids=lambda c: c['id'])
def test_frozen_audit(registry, case, variant, attempt, record_property):
    tool, ctx, original, _ = registry
    if LIVE and tool.db.engine.dialect.name != 'sqlite':
        pytest.skip('Live pilot executes once per attempt on isolated SQLite only')
    step, scheduler, saver, provider = setup(registry, [])
    agents = None
    if LIVE:
        from workbench.config import AgentSettings, load_settings
        from workbench.agent_runtime import coordinator
        agents = load_settings(AgentSettings)
        assert 0 < float(os.environ['WB_E15_CEILING']) <= 5
        _, prices = agents.runtime_limits()
        assert {agents.coordinator_model, agents.specialist_model} <= prices.keys()
        step = coordinator(tool.db, tool.store, tool.settings, agents)
    started = time.monotonic()
    try:
        models = [step.model, step.specialist_model]
        with tool.db.session.begin() as s:
            data = upload_csv(s, tool.store, tool.settings, 'p', case['csv'].encode(), 'evaluation.csv',
                Source(citation='E15 frozen synthetic fixture', license='CC0', data_kind='synthetic', transformations='Generated'))
            for cls in (ServerPolicyRow, ProjectPolicyRow):
                previous = s.scalar(select(cls).where(cls.revision == 2))
                limits = {**previous.payload['limits'], 'model_requests': 12, 'coordinator_iterations': 12,
                          'scientific_attempts': 1, 'specialist_assignments': 1,
                          'specialist_concurrency': 1, 'model_tokens': 32000}
                payload = {**previous.payload, 'revision': 3, 'artifact_ids': [data.id],
                    'provider_models': sorted(set(models)), 'limits': limits, 'share_operator_messages': True,
                    'allowed_tools': ['inspect_project', 'inspect_dataset', 'list_artifacts', 'read_artifact', 'read_job', 'run_audit']}
                if LIVE:
                    payload['spend_ceiling_usd'] = float(os.environ['WB_E15_CEILING'])
                s.add(cls(**({'project_id': 'p'} if cls is ProjectPolicyRow else {}), revision=3, payload=payload))
            run = s.get(RunRow, ctx.run_id)
            # Both arms have identical ceilings; the routing instruction is the
            # only treatment difference. A coordinator-only violation is scored.
            routing = (' Do not delegate.' if variant == 'coordinator_only' else
                       ' Request one data_evaluation specialist to independently inspect schema limitations before auditing.')
            run.policy = payload
            run.payload = {**run.payload, 'objective': case['objective'] + routing,
                           'inputs': {'artifact_ids': [data.id], 'material_ids': []}, 'limits': limits}
        if not LIVE:
            responses = [PLAN]
            if variant == 'selective_specialists':
                responses.append({'kind': 'delegate', 'summary': 'Independent schema limitations', 'assignment': {
                    'role': 'data_evaluation', 'objective': 'Inspect schema limitations', 'artifact_ids': [data.id],
                    'completion_criteria': ['State uncertainty']}})
            responses += [{'id': 'audit', 'name': 'run_audit', 'input': {'dataset_id': data.id}},
                          {'kind': 'finish', 'summary': 'Audit complete'}]
            provider.responses = iter(responses)
            original_complete = provider.complete
            def complete(**kwargs):
                if kwargs['tools']:
                    return original_complete(**kwargs)
                with tool.db.session() as s:
                    assignment = s.scalar(select(AssignmentRow).where(AssignmentRow.run_id == ctx.run_id))
                return ModelResult('model', 'end_turn', (json.dumps({'assignment_id': assignment.id,
                    'findings': [], 'supporting_artifact_ids': [data.id], 'uncertainty': 'Synthetic schema only',
                    'unresolved_issues': [], 'recommended_actions': []}),), (), {'input_tokens': 10, 'output_tokens': 10})
            provider.complete = complete
        for _ in range(40):
            state = advance(scheduler, saver, step)
            if state == 'waiting_for_job':
                execute_job(tool)
            elif state not in {'queued', 'running'}:
                break
        with tool.db.session() as s:
            observation = observe(s, tool.runs, 'p', ctx.run_id)
        quality = {
            'completed': observation['state'] == 'completed',
            'expected_artifacts': observation['artifact_kinds'] == ['audit'],
            'science_succeeded': observation['job_states'] == {'succeeded': 1},
            'autonomous': observation['required_interventions'] == 0,
            'no_duplicate_job_references': observation['duplicate_job_references'] == 0,
            'routing': sum(observation['assignments'].values()) == (variant == 'selective_specialists'),
            'scoped_tools': all(a['tool'] in payload['allowed_tools'] for a in observation['trajectory']),
            'plan_before_effects': next((e['sequence'] for e in observation['events'] if e['event_type'] == 'plan_changed'), float('inf'))
                < next((e['sequence'] for e in observation['events'] if e['event_type'] == 'action_changed'), 0),
        }
        result = {'suite': SUITE['version'], 'fixture_sha256': hashlib.sha256(MANIFEST.read_bytes()).hexdigest(),
            'case': case['id'], 'partition': case['partition'], 'variant': variant, 'attempt': attempt,
            'database': tool.db.engine.dialect.name,
            'provider_mode': 'live' if LIVE else 'scripted', 'seed': None if LIVE else SUITE['seed'],
            'nondeterminism': 'Provider API exposes no seed control' if LIVE else 'Scripted decisions; IDs and timing vary',
            'models': models, 'versions': step.versions.model_dump(mode='json'),
            'bounds': {k: v.model_dump(mode='json') for k, v in step.bounds.items()},
            'prices': {k: v.model_dump(mode='json') for k, v in (step.prices or {}).items()},
            'policy_sha256': hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest(),
            'max_output_tokens': step.max_tokens, 'policy_limits': limits,
            'input_sha256': hashlib.sha256(case['csv'].encode()).hexdigest(),
            'initial_memory': 'empty', 'elapsed_seconds': time.monotonic() - started,
            'quality': quality, 'observation': observation}
        record_property('e15_result', json.dumps(result))
        assert all(quality.values()), quality
    finally:
        if LIVE:
            step.provider.close()


def test_intervention_metrics_count_unanswered_batches_and_idempotent_answers(registry):
    from workbench.research_contracts import ResearchQuestion, MaterialQuestion, QuestionAnswerInput
    from workbench.contracts import now
    tool, ctx, _, _ = registry
    with tool.db.session.begin() as s:
        question = ResearchQuestion(id='evaluation-question', project_id='p', created_at=now(),
            run_id=ctx.run_id, revision=1, run_revision=1, status='open', questions=[
                MaterialQuestion(id='target', field='target', prompt='Target?', blocked_step_ids=['audit'], options=[], evidence=[]),
                MaterialQuestion(id='units', field='units', prompt='Units?', blocked_step_ids=['audit'], options=[], evidence=[])])
        tool.runs.ask(s, 'p', ctx.run_id, question, 1)
    with tool.db.session() as s:
        before = observe(s, tool.runs, 'p', ctx.run_id)
        revision = s.get(RunRow, ctx.run_id).control_revision
    assert before['required_interventions'] == 1
    assert before['interventions']['answer_submissions'] == 0
    body = QuestionAnswerInput(expected_run_revision=revision, expected_question_revision=1,
                               answers={'target': 'y', 'units': 'kelvin'})
    for _ in range(2):
        with tool.db.session.begin() as s:
            tool.runs.mutate(s, 'p', ctx.run_id, 'answer', body, 'same-answer', question.id)
    with tool.db.session() as s:
        after = observe(s, tool.runs, 'p', ctx.run_id)
    assert after['required_interventions'] == 1
    assert after['interventions']['answer_submissions'] == 1
    assert after['manual_configuration_edits'] is None

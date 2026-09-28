"""Budget-driven delegation, bounded waves and checkpoint replay; no live models."""
import json
from threading import Barrier, Lock

import pytest
from sqlalchemy import select

from test_metadata import old_db, db
from test_tool_registry import registry
from test_agent_coordinator import setup, PLAN, advance
from workbench.agent_db import AssignmentRow, LeaseRow, RunRow, ServerPolicyRow, ProjectPolicyRow
from workbench.model_provider import ModelResult


def delegation(data, count):
    return {'kind': 'delegate', 'summary': 'Independent checks', 'assignments': [
        {'role': 'data_evaluation', 'objective': f'Check dimension {i}',
         'artifact_ids': [data.id], 'completion_criteria': ['Report limitations']}
        for i in range(count)]}


def specialist_provider(provider, data, calls, barrier=None):
    original = provider.complete
    lock = Lock()

    def complete(**kwargs):
        if kwargs['tools']:
            return original(**kwargs)
        ident = kwargs['context'][0].text.split('Assignment ID: ')[1]
        with lock:
            calls.append(ident)
        if barrier:
            barrier.wait()
        return ModelResult('model', 'end_turn', (json.dumps(dict(assignment_id=ident,
            findings=[], supporting_artifact_ids=[data.id], uncertainty='Limited fixture',
            unresolved_issues=[], recommended_actions=[])),), (), {'input_tokens': 10, 'output_tokens': 10})

    provider.complete = complete


def test_six_specialists_use_three_waves_and_replay_does_not_bill_again(registry):
    tool, ctx, data, _ = registry
    step, scheduler, saver, provider = setup(registry, [PLAN, delegation(data, 6)])
    for _ in range(3):
        advance(scheduler, saver, step)
    calls = []
    specialist_provider(provider, data, calls, Barrier(2, timeout=10))
    with tool.db.session() as s:
        before_wave = s.get(LeaseRow, ctx.run_id).checkpoint
    assert advance(scheduler, saver, step) == 'queued'
    assert len(calls) == 2
    # Simulate a completed wave whose newer checkpoint was not committed.
    with tool.db.session.begin() as s:
        s.get(LeaseRow, ctx.run_id).checkpoint = before_wave
    assert advance(scheduler, saver, step) == 'queued'
    assert len(calls) == 2
    assert advance(scheduler, saver, step) == 'queued'
    assert len(calls) == 4
    assert advance(scheduler, saver, step) == 'queued'
    assert len(calls) == len(set(calls)) == 6
    with tool.db.session() as s:
        assert all(a.state == 'completed' for a in s.scalars(select(AssignmentRow)))
        assert tool.runs.projected_payload(s, s.get(RunRow, ctx.run_id))['usage']['model_requests'] == 8


@pytest.mark.parametrize('limit_field,limit', [('specialist_assignments', 2), ('model_requests', 4)])
def test_saved_policy_or_shared_budget_stops_further_waves(registry, limit_field, limit):
    tool, ctx, data, _ = registry
    step, scheduler, saver, provider = setup(registry, [PLAN, delegation(data, 6)])
    for _ in range(3):
        advance(scheduler, saver, step)
    with tool.db.session.begin() as s:
        for cls in (ServerPolicyRow, ProjectPolicyRow):
            old = s.scalar(select(cls).where(cls.revision == 2))
            payload = {**old.payload, 'revision': 3,
                       'limits': {**old.payload['limits'], limit_field: limit}}
            s.add(cls(**({'project_id': 'p'} if cls is ProjectPolicyRow else {}), revision=3, payload=payload))
    calls = []
    specialist_provider(provider, data, calls)
    advance(scheduler, saver, step)
    assert len(calls) == 2
    advance(scheduler, saver, step)
    assert len(calls) == 2


def test_aggregate_specialist_results_can_return_to_coordinator(registry):
    tool, ctx, data, _ = registry
    step, scheduler, saver, provider = setup(registry, [PLAN, delegation(data, 1),
        {'kind': 'finish', 'summary': 'Reviewed the result'}])
    with tool.db.session.begin() as s:
        for cls in (ServerPolicyRow, ProjectPolicyRow):
            old = s.scalar(select(cls).where(cls.revision == 2))
            payload = {**old.payload, 'revision': 3, 'exposure': 'schema_aggregates',
                'content_classes': ['schema', 'aggregates'], 'share_operator_messages': True}
            s.add(cls(**({'project_id': 'p'} if cls is ProjectPolicyRow else {}), revision=3, payload=payload))
        run = s.get(RunRow, ctx.run_id)
        run.policy = {**run.policy, 'exposure': 'schema_aggregates',
            'content_classes': ['schema', 'aggregates'], 'share_operator_messages': True}
    for _ in range(3):
        advance(scheduler, saver, step)
    calls = []
    specialist_provider(provider, data, calls)
    advance(scheduler, saver, step)
    assert len(calls) == 1
    assert advance(scheduler, saver, step) == 'queued'
    result_parts = [p for p in provider.contexts[-1] if 'Limited fixture' in p.text]
    assert len(result_parts) == 1 and result_parts[0].content_class == 'operator'
    assert 'raw' not in result_parts[0].source_classes

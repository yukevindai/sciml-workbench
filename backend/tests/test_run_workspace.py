"""A12 run reads: tool actions without arguments, earlier plans and specialist assignments."""
from fastapi.testclient import TestClient

from workbench.agent_specialists import AssignmentRequest, SpecialistService
from workbench.api import create_app
from workbench.budgeted_provider import ModelBound
from workbench.contracts import now, uid
from workbench.research_contracts import ResearchPlan
from test_metadata import database_url, db, old_db  # noqa: F401
from test_tool_registry import registry  # noqa: F401


def publish(tool, ctx, revision, summary):
    with tool.db.session.begin() as s:
        row = tool.runs.get(s, 'p', ctx.run_id)
        tool.runs.publish_plan(s, 'p', ctx.run_id, ResearchPlan(id=uid(), project_id='p', created_at=now(),
            run_id=ctx.run_id, revision=revision, rationale_summary=summary, steps=[dict(id='audit', objective='Audit',
                depends_on=[], allowed_input_ids=[], expected_artifact_kinds=['audit'], completion_criteria=['Audit published'],
                status='ready')]), row.control_revision)


def test_detail_projects_actions_plans_and_assignments(registry, tmp_path):  # noqa: F811
    tool, ctx, data, _ = registry
    publish(tool, ctx, 1, 'First plan')
    publish(tool, ctx, 2, 'Revised plan')
    bound = ModelBound(model='model', revision='r', source_reference='test', max_request_bytes=100000,
                       input_tokens=1000, max_output_tokens=256, max_active_seconds=30)
    SpecialistService(tool.db, tool.runs, None, model='model', bounds={'model': bound}).create('p', ctx.run_id, 'check',
        AssignmentRequest(role='data_evaluation', objective='Identify independent groups', artifact_ids=[data.id],
                          completion_criteria=['Name a grouping column']))
    with tool.db.session() as s:
        row = tool.runs.get(s, 'p', ctx.run_id)
    submitted = tool.dispatch(type(ctx)('p', ctx.run_id, row.control_revision, row.claim_token, 'audit'),
                              'run_audit', {'dataset_id': data.id})
    assert submitted.job_id

    app = create_app(tool.settings.model_copy(update={'database_url': database_url(tool.db)}))
    token = tool.settings.api_token.get_secret_value()
    with TestClient(app, headers={'Authorization': 'Bearer ' + token}) as client:
        response = client.get(f'/api/v1/projects/p/agent-runs/{ctx.run_id}')
        assert response.status_code == 200, response.text
        body = response.json()
    assert body['plan']['revision'] == 2
    assert [p['revision'] for p in body['earlier_plans']] == [1]
    [action] = body['actions']
    assert action['tool'] == 'run_audit' and action['state'] == 'submitted'
    assert action['job_id'] == submitted.job_id and action['error_code'] is None
    # Canonical arguments stay private to the ledger.
    assert 'request' not in action and 'arguments' not in action and data.id not in str(action)
    [assignment] = body['assignments']
    assert assignment['role'] == 'data_evaluation' and assignment['state'] == 'queued'
    assert assignment['objective'] == 'Identify independent groups' and assignment['plan_revision'] == 2
    assert 'allowed_tools' not in assignment and 'budget_allocation_id' not in assignment

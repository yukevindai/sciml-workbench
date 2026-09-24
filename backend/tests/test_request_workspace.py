"""A11 request-workspace reads: saved-policy summary and one-request Autopilot admission."""
from fastapi.testclient import TestClient
from workbench.agent_db import ProjectPolicyRow, ServerPolicyRow
from workbench.agent_policy import AuthorityPolicy, default_limits
from workbench.api import create_app
from workbench.config import Settings
from test_metadata import db, migrate, old_db, database_url  # noqa: F401

TOKEN = 'a' * 48
CSV = b'x,y\n1,2\n2,4\n3,6\n'


def client_for(tmp_path, db):
    app = create_app(Settings(database_url=database_url(db), storage_root=tmp_path,
        api_token=TOKEN, efm_password='strong-test-password'))
    return app, TestClient(app, headers={'Authorization': 'Bearer ' + TOKEN})


def provision(app, pid, *, revision=3, **grants):
    # Empty ID sets grant nothing, so both layers name the inputs they authorize.
    server = AuthorityPolicy(policy_id='server', revision=1, project_ids={pid, 'other'},
                             limits=default_limits().model_copy(update={'tool_calls': 40}), **grants)
    project = AuthorityPolicy(policy_id='project', revision=1, project_ids={pid}, **grants)
    with app.state.db.session.begin() as s:
        s.add(ServerPolicyRow(revision=1, payload=server.model_dump(mode='json')))
        s.add(ProjectPolicyRow(project_id=pid, revision=revision, payload=project.model_dump(mode='json')))


def test_policy_summary_is_scoped_and_admits_one_autopilot_request(tmp_path, db):
    app, client = client_for(tmp_path, db)
    with client:
        pid = client.post('/api/v1/projects', json={'name': 'A11', 'description': ''}).json()['id']
        other = client.post('/api/v1/projects', json={'name': 'Other', 'description': ''}).json()['id']
        summary = client.get(f'/api/v1/projects/{pid}/execution-policy')
        assert summary.status_code == 200, summary.text
        assert summary.json()['policy'] is None
        assert summary.json()['agent_available'] is False
        assert summary.json()['unavailable_reason']
        assert client.get('/api/v1/projects/missing/execution-policy').status_code == 404

        material = client.post(f'/api/v1/projects/{pid}/research-materials', content=CSV,
            headers={'Content-Type': 'text/csv', 'X-Filename': 'a.csv', 'Idempotency-Key': 'csv'}).json()
        foreign = client.post(f'/api/v1/projects/{other}/research-materials', content=CSV,
            headers={'Content-Type': 'text/csv', 'X-Filename': 'b.csv', 'Idempotency-Key': 'csv'}).json()
        provision(app, pid, material_ids={material['id'], foreign['id']},
                  artifact_ids={material['dataset_id'], foreign['dataset_id']})

        policy = client.get(f'/api/v1/projects/{pid}/execution-policy').json()['policy']
        # The stored row revision, which admission compares, not the payload's own revision.
        assert policy['project_policy_revision'] == 3
        # Another project's IDs are never listed, even when a policy names them.
        assert policy['material_ids'] == [material['id']]
        assert policy['artifact_ids'] == [material['dataset_id']]
        assert policy['limits']['tool_calls'] == 40
        assert 'replay_science' not in policy['allowed_tools']
        assert 'provider_models' not in policy
        assert client.get(f'/api/v1/projects/{other}/execution-policy').json()['policy'] is None

        app.state.runs.admission = lambda: None
        assert client.get(f'/api/v1/projects/{pid}/execution-policy').json()['agent_available'] is True
        request = {'objective': 'Audit a.csv for duplicates and missing values.', 'mode': 'autopilot',
                   'inputs': {'material_ids': [material['id']], 'artifact_ids': [material['dataset_id']]},
                   'policy_revision': policy['project_policy_revision'], 'limits': policy['limits']}
        created = client.post(f'/api/v1/projects/{pid}/agent-runs', json=request, headers={'Idempotency-Key': 'one'})
        assert created.status_code == 202, created.text
        run = created.json()
        # Autopilot is queued for execution: no plan review or second approval is pending.
        assert run['state'] == 'queued' and run['mode'] == 'autopilot' and run['open_question_ids'] == []
        # A reload resends with the same retained key and gets the same run.
        again = client.post(f'/api/v1/projects/{pid}/agent-runs', json=request, headers={'Idempotency-Key': 'one'})
        assert again.json()['id'] == run['id']
        assert [r['id'] for r in client.get(f'/api/v1/projects/{pid}/agent-runs').json()] == [run['id']]

        outside = {**request, 'inputs': {'material_ids': [foreign['id']], 'artifact_ids': []}}
        denied = client.post(f'/api/v1/projects/{pid}/agent-runs', json=outside, headers={'Idempotency-Key': 'two'})
        assert denied.status_code == 404
        stale = client.post(f'/api/v1/projects/{pid}/agent-runs', json={**request, 'policy_revision': 2},
                            headers={'Idempotency-Key': 'three'})
        assert stale.status_code == 409

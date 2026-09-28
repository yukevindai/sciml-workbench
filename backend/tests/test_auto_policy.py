"""Opt-in automatic agent access: a project's own uploads only, append-only revisions."""
from sqlalchemy import select
import pytest
from workbench.agent_db import ProjectPolicyRow, ServerPolicyRow
from test_metadata import db, migrate, old_db, database_url  # noqa: F401
from test_request_workspace import CSV, client_for


def upload(client, pid, key, name='a.csv'):
    return client.post(f'/api/v1/projects/{pid}/research-materials', content=CSV,
        headers={'Content-Type': 'text/csv', 'X-Filename': name, 'Idempotency-Key': key}).json()


def env(monkeypatch, auto):
    # These HTTP fixtures use isolated SQLite, never the operator's .env runtime.
    monkeypatch.setenv('WB_STORAGE_BACKEND', 'local')
    monkeypatch.setenv('WB_DEPLOYMENT_MODE', 'local')
    monkeypatch.setenv('WB_AGENTS_ENABLED', '0')
    monkeypatch.setenv('WB_AGENT_AUTO_POLICY', '1' if auto else '0')
    monkeypatch.setenv('WB_COORDINATOR_MODEL', 'deepseek-chat')
    monkeypatch.setenv('WB_SPECIALIST_MODEL', 'deepseek-chat')


def test_auto_grant_is_opt_in(tmp_path, db, monkeypatch):
    env(monkeypatch, auto=False)
    app, client = client_for(tmp_path, db)
    with client:
        pid = client.post('/api/v1/projects', json={'name': 'Auto', 'description': ''}).json()['id']
        # Agents unavailable: refused before any policy is written.
        assert client.post(f'/api/v1/projects/{pid}/execution-policy/auto').status_code == 503
        app.state.runs.admission = lambda: None
        refused = client.post(f'/api/v1/projects/{pid}/execution-policy/auto')
        assert refused.status_code == 409 and 'WB_AGENT_AUTO_POLICY' in refused.json()['error']
        with app.state.db.session() as s:
            assert s.scalar(select(ServerPolicyRow)) is None


def test_auto_grant_covers_only_own_uploads_and_is_idempotent(tmp_path, db, monkeypatch):
    env(monkeypatch, auto=True)
    app, client = client_for(tmp_path, db)
    with client:
        app.state.runs.admission = lambda: None
        pid = client.post('/api/v1/projects', json={'name': 'Auto', 'description': ''}).json()['id']
        other = client.post('/api/v1/projects', json={'name': 'Other', 'description': ''}).json()['id']
        mine, foreign = upload(client, pid, 'a'), upload(client, other, 'b')

        first = client.post(f'/api/v1/projects/{pid}/execution-policy/auto')
        assert first.status_code == 200, first.text
        policy = first.json()['policy']
        assert policy['material_ids'] == [mine['id']] and policy['artifact_ids'] == [mine['dataset_id']]
        assert policy['exposure'] == 'schema_aggregates' and policy['share_operator_messages'] is True
        assert foreign['id'] not in policy['material_ids']

        again = client.post(f'/api/v1/projects/{pid}/execution-policy/auto').json()['policy']
        assert again['project_policy_revision'] == policy['project_policy_revision'] == 1

        second = upload(client, pid, 'c', 'b.csv')
        grown = client.post(f'/api/v1/projects/{pid}/execution-policy/auto').json()['policy']
        assert grown['project_policy_revision'] == 2
        assert sorted(grown['material_ids']) == sorted([mine['id'], second['id']])

        # A second project joins the same server policy without losing the first.
        client.post(f'/api/v1/projects/{other}/execution-policy/auto')
        assert client.get(f'/api/v1/projects/{pid}/execution-policy').json()['policy']['material_ids']
        with app.state.db.session() as s:
            assert [r.revision for r in s.scalars(select(ServerPolicyRow).order_by(ServerPolicyRow.revision))] == [1, 2, 3]
            assert len(list(s.scalars(select(ProjectPolicyRow).where(ProjectPolicyRow.project_id == pid)))) == 2


@pytest.mark.parametrize('server_id,expected', [('auto-server', 1000), ('operator-server', 4)])
def test_automatic_limit_refresh_preserves_operator_caps(tmp_path, db, monkeypatch, server_id, expected):
    env(monkeypatch, auto=True)
    app, client = client_for(tmp_path, db)
    with client:
        app.state.runs.admission = lambda: None
        pid = client.post('/api/v1/projects', json={'name': 'Existing policy', 'description': ''}).json()['id']
        client.post(f'/api/v1/projects/{pid}/execution-policy/auto').raise_for_status()
        with app.state.db.session.begin() as s:
            for cls in (ServerPolicyRow, ProjectPolicyRow):
                row = s.scalar(select(cls))
                payload = {**row.payload, 'revision': 2,
                    'limits': {**row.payload['limits'], 'specialist_assignments': 4}}
                if cls is ServerPolicyRow:
                    payload['policy_id'] = server_id
                s.add(cls(**({'project_id': pid} if cls is ProjectPolicyRow else {}), revision=2, payload=payload))
        response = client.post(f'/api/v1/projects/{pid}/execution-policy/auto')
        assert response.status_code == 200, response.text
        policy = response.json()['policy']
        assert policy['limits']['specialist_assignments'] == expected
        assert policy['limits']['specialist_concurrency'] == 2
        assert policy['limits']['model_requests'] == 1000
        repeated = client.post(f'/api/v1/projects/{pid}/execution-policy/auto').json()['policy']
        assert repeated['project_policy_revision'] == policy['project_policy_revision']

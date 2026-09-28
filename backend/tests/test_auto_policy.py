"""Opt-in automatic agent access: a project's own uploads only, append-only revisions."""
from sqlalchemy import select
from workbench.agent_db import ProjectPolicyRow, ServerPolicyRow
from test_metadata import db, migrate, old_db, database_url  # noqa: F401
from test_request_workspace import CSV, client_for


def upload(client, pid, key, name='a.csv'):
    return client.post(f'/api/v1/projects/{pid}/research-materials', content=CSV,
        headers={'Content-Type': 'text/csv', 'X-Filename': name, 'Idempotency-Key': key}).json()


def env(monkeypatch, auto):
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


def test_concurrent_grants_for_different_projects_take_successive_server_revisions(db, monkeypatch):
    """Both transactions reach install() together unless the server-wide lock serializes them."""
    import threading
    import pytest
    from workbench import auto_policy
    from workbench.config import AgentSettings
    if db.engine.dialect.name != 'postgresql':
        pytest.skip('SQLite serializes writers at lock_project already')
    agents = AgentSettings(_env_file=None, agent_auto_policy=True, coordinator_model='deepseek-chat', specialist_model='deepseek-chat')
    barrier = threading.Barrier(2, timeout=2)
    original = auto_policy.install

    def rendezvous(*args, **kwargs):
        try:
            barrier.wait()  # Only reachable by both at once when nothing serializes the reads.
        except threading.BrokenBarrierError:
            pass
        return original(*args, **kwargs)

    monkeypatch.setattr(auto_policy, 'install', rendezvous)
    errors = []

    def grant(pid):
        try:
            with db.session.begin() as s:
                auto_policy.grant_project_inputs(s, pid, agents)
        except Exception as exc:  # noqa: BLE001 - reported below
            errors.append(repr(exc))

    threads = [threading.Thread(target=grant, args=(pid,)) for pid in ('p', 'q')]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(30)
    assert errors == []
    with db.session() as s:
        assert [r.revision for r in s.scalars(select(ServerPolicyRow).order_by(ServerPolicyRow.revision))] == [1, 2]

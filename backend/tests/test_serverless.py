"""Vercel boundaries and real PostgreSQL state across independent invocations."""
import hashlib
import asyncio
import io
import json
import shutil
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import update
from workbench import serverless
from workbench.api import create_app
from workbench.bootstrap import main as bootstrap
from workbench.config import ConfigurationError, Settings
from workbench.connector_state import failure_workspace
from workbench.db import BlobRow, ConnectorStateRow, JobRow
from workbench.failure_memory import FailureMemory
from workbench.postgres_storage import PostgresStore
from workbench.storage import LocalStore, StorageIntegrityError
from test_metadata import db, old_db, database_url
from test_failure_memory_adapter import project, record
from test_workflow import create, upload, fixture


def config(url='postgresql+psycopg://test:testing@localhost/disposable', **extra):
    return Settings(_env_file=None, database_url=url, api_token='a' * 48,
        efm_password='synthetic-test-password', storage_root='/tmp/vercel-test',
        deployment_mode='vercel', storage_backend='postgres', job_timeout_seconds=240,
        max_upload_bytes=4 * 1024 * 1024, **extra)


@pytest.fixture
def settings(db, tmp_path):
    if db.engine.dialect.name != 'postgresql':
        pytest.skip('Serverless storage requires PostgreSQL')
    value = config(database_url(db))
    value.storage_root = tmp_path / 'ephemeral'
    return value


def test_vercel_configuration_fails_closed():
    for changes in ({'storage_backend': 'local'}, {'storage_root': Path('/var/data')},
                    {'storage_root': Path('/tmp/../var/data')}, {'job_timeout_seconds': 241},
                    {'max_upload_bytes': 4194305}, {'database_url': 'sqlite://'}):
        with pytest.raises(ConfigurationError):
            config().model_copy(update=changes).validate_secrets()
    config().validate_secrets()
    paused = config().model_copy(update={"scheduler_enabled": False})
    assert serverless.tick(paused, "science") == {"status": "disabled"}


def test_cron_authentication_and_preview_guard(monkeypatch):
    from workbench.errors import DomainError
    from fastapi.responses import JSONResponse
    app = FastAPI()
    @app.exception_handler(DomainError)
    async def error(request, exc):
        return JSONResponse({'error': exc.message}, status_code=exc.status)
    calls = []
    monkeypatch.setenv('CRON_SECRET', 'c' * 48)
    monkeypatch.setattr(serverless, 'tick', lambda settings, kind: calls.append(kind) or {'status': 'idle'})
    serverless.install(app, config())
    with TestClient(app) as client:
        for token in ('', 'Bearer wrong', 'Bearer ' + 'a' * 48):
            assert client.get('/internal/cron/science', headers={'Authorization': token}).status_code == 401
        assert not calls
        client.headers['Authorization'] = 'Bearer ' + 'c' * 48
        assert client.get('/internal/cron/science').json() == {'status': 'idle'}
        assert calls == ['science']
        assert client.get('/internal/cron/unknown').status_code == 404
        monkeypatch.setenv('VERCEL_ENV', 'preview')
        assert client.get('/internal/cron/science').status_code == 403
        assert calls == ['science']
    monkeypatch.setenv('CRON_SECRET', 'short')
    with pytest.raises(ConfigurationError):
        serverless.install(FastAPI(), config())


def test_blobs_are_durable_immutable_and_integrity_checked(settings, db):
    first = PostgresStore(settings.database_url)
    second = PostgresStore(settings.database_url)
    raw = b'durable scientific data'
    with ThreadPoolExecutor(max_workers=4) as pool:
        keys = list(pool.map(first.put, [raw] * 4))
    assert len(set(keys)) == 1
    key = keys[0]
    assert second.get(key) == raw
    with pytest.raises(StorageIntegrityError):
        second.get('../escape')
    with db.engine.begin() as conn:
        conn.execute(update(BlobRow).where(BlobRow.key == key).values(data=b'corrupt'))
    with pytest.raises(StorageIntegrityError):
        second.get(key)
    with pytest.raises(StorageIntegrityError):
        first.put(raw)


def test_overlapping_ticks_skip_and_release_lock(settings, db):
    with serverless.lane(db, 'science') as acquired:
        assert acquired
        assert serverless.tick(settings, 'science') == {'status': 'busy'}
        assert serverless.tick(settings, 'recovery') == {'status': 'idle'}
    assert serverless.tick(settings, 'science') == {'status': 'idle'}


def test_failure_memory_replay_and_rollback_across_instances(settings, db):
    bootstrap(settings)
    receipt = FailureMemory(settings).save(project(), 'stable-import', record())
    repeated = FailureMemory(settings).save(project(), 'stable-import', record())
    assert repeated.external_record_id == receipt.external_record_id
    with db.session() as session:
        before = bytes(session.get(ConnectorStateRow, 'failure-memory').data)
    with pytest.raises(RuntimeError):
        with failure_workspace(settings) as root:
            (root / 'failure-memory.sqlite').write_bytes(b'incomplete write')
            raise RuntimeError('invocation interrupted')
    with db.session() as session:
        assert bytes(session.get(ConnectorStateRow, 'failure-memory').data) == before
    assert FailureMemory(settings).save(project(), 'stable-import', record()).external_record_id == receipt.external_record_id


def test_offline_transfer_verifies_references_and_preserves_upstream(settings, db, tmp_path):
    from workbench.migrate_storage import migrate
    root = tmp_path / 'old-volume'
    local = settings.model_copy(update={'storage_backend': 'local', 'deployment_mode': 'local', 'storage_root': root})
    bootstrap(local)
    raw = b'old upload'
    key = LocalStore(root).put(raw)
    receipt = FailureMemory(local).save(project(), 'old-import', record())
    before = {p.name: p.read_bytes() for p in root.iterdir() if p.is_file()}
    assert migrate(settings, root, writers_stopped=True)['blobs_verified'] == 1
    assert {p.name: p.read_bytes() for p in root.iterdir() if p.is_file()} == before
    assert PostgresStore(settings.database_url).get(key) == raw
    # Replay transfer before any new writes; never replace differing live state.
    assert migrate(settings, root, writers_stopped=True)['blobs_verified'] == 1
    assert FailureMemory(settings).save(project(), 'old-import', record()).external_record_id == receipt.external_record_id
    with pytest.raises(StorageIntegrityError):
        migrate(settings, root, writers_stopped=True)
    with pytest.raises(ValueError):
        migrate(settings, root)


def test_complete_mvp_across_ephemeral_invocations(settings, db, monkeypatch):
    monkeypatch.setenv('WB_AGENTS_ENABLED', '0')
    monkeypatch.setenv('CRON_SECRET', 'c' * 48)
    monkeypatch.delenv('VERCEL_ENV', raising=False)
    from workbench import queue_runtime
    messages = []
    async def sent(topic, payload, **options):
        messages.append((payload, str(len(messages)) + '-' + str(len(dispatched))))
    dispatched = []
    monkeypatch.setattr(queue_runtime, 'send', sent)
    def drain():
        for _ in range(100):
            if not messages:
                return
            payload, identity = messages.pop(0)
            dispatched.append(payload)
            shutil.rmtree(settings.storage_root, ignore_errors=True)
            asyncio.run(queue_runtime.consume(settings, payload, identity))
        pytest.fail('Queue did not settle')
    bootstrap(settings)
    app = create_app(settings)
    serverless.install(app, settings)
    with TestClient(app) as client:
        client.headers['Authorization'] = 'Bearer ' + 'a' * 48
        pid = create(client)
        data = upload(client, pid)
        def run(kind, payload=None, expected="succeeded"):
            response = client.post(f'/api/v1/projects/{pid}/{kind}', json=payload or {},
                headers={'Idempotency-Key': f'{kind}-{len(ids)}'})
            assert response.status_code == 202, response.text
            # Remove every temporary byte between invocations.
            shutil.rmtree(settings.storage_root, ignore_errors=True)
            drain()
            with db.session() as session:
                job = session.get(JobRow, response.json()['id'])
                assert job.state == expected and job.result_id, (job.error_code, job.error)
                aid = job.result_id
            artifact = client.get(f'/api/v1/projects/{pid}/artifacts/{aid}').json()
            ids.append(aid)
            return artifact
        ids = []
        audit = run('audit', {'dataset_id': data['id'], 'config': fixture('audit')})
        split = run('split', {'dataset_id': data['id'], 'audit_id': audit['id'], 'config': fixture('split')})
        args = {**fixture('benchmark'), 'dataset_id': data['id'], 'split_id': split['id']}
        assert run('benchmark', args)['status'] == 'succeeded'
        failed = run('benchmark', {**args, 'units': {}}, expected='failed')
        assert failed['status'] == 'failed'
        assert run('failure', {'benchmark_id': failed['id'], 'reason': 'Missing units',
            'uncertainty_notes': 'Synthetic only'})['external_record_id']
        report = run('report')
    # New API instance has no dependency on the previous function's disk or memory.
    shutil.rmtree(settings.storage_root, ignore_errors=True)
    with TestClient(create_app(settings)) as fresh:
        fresh.headers['Authorization'] = 'Bearer ' + 'a' * 48
        response = fresh.get(f'/api/v1/projects/{pid}/artifacts/{report["id"]}/download')
        assert response.status_code == 200
        assert hashlib.sha256(response.content).hexdigest() == report['sha256']
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            manifest = json.loads(archive.read('manifest.json'))
            for name, digest in manifest['files'].items():
                assert hashlib.sha256(archive.read(name)).hexdigest() == digest
        assert 'content-length' not in response.headers
    assert {p['phase'] for p in dispatched} == {0, 1, 2}
    assert serverless.tick(settings, 'science') == {'status': 'idle'}
    assert serverless.tick(settings, 'agent') == {'status': 'disabled'}


def test_enabled_idle_agent_tick_does_not_contact_provider(settings, monkeypatch):
    import workbench.agent_runtime as runtime
    monkeypatch.setattr(serverless, 'load_settings', lambda *a: SimpleNamespace(
        agents_enabled=True, agent_lease_seconds=180, provider_timeout_seconds=20, require_runtime=lambda: None))
    monkeypatch.setattr(runtime, 'coordinator', lambda *a: pytest.fail('Idle tick contacted provider'))
    assert serverless.tick(settings, 'agent') == {'status': 'idle'}


def test_cron_secret_is_rejected_from_egress_and_archives(monkeypatch):
    from workbench.archive import reject_configured_secrets
    from workbench.egress import EgressDenied, SecretGuard
    secret = 'private-cron-secret-that-must-stay-server-side'
    monkeypatch.setenv('CRON_SECRET', secret)
    with pytest.raises(EgressDenied):
        SecretGuard().check({'source': secret})
    data = io.BytesIO()
    with zipfile.ZipFile(data, 'w') as archive:
        archive.writestr('data.txt', secret)
    with pytest.raises(ValueError, match='configured credential'):
        reject_configured_secrets(data.getvalue(), config())

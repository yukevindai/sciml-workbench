"""D07 integrity guards and an isolated full PostgreSQL + upstream restore drill."""
import io
import json
import os
from pathlib import Path
import shutil
import time
from uuid import uuid4

import httpx
import psycopg
from psycopg import sql
import pytest
from sqlalchemy import select, func

from workbench import backup
from workbench.db import Database, ProjectRow, JobRow, ArtifactRow, ExposureRow
from workbench.checkpoints import setup as checkpoint_setup, saver
from workbench.bootstrap import main as provision
from workbench.storage import LocalStore
from test_metadata import migrate
from test_tool_registry import registry
from test_external_operations import operation, public_runner, row

REVISION = 'd' * 40


@pytest.fixture
def databases():
    url = os.environ.get('TEST_BACKUP_DATABASE_URL')
    if not url:
        pytest.skip('Set TEST_BACKUP_DATABASE_URL for isolated full-database restore drills')
    assert shutil.which('pg_dump') and shutil.which('pg_restore'), 'PostgreSQL client tools required'
    base = backup.connection(url)
    names = ['d07_' + uuid4().hex for _ in range(2)]
    with psycopg.connect(base.render_as_string(hide_password=False), autocommit=True) as admin:
        try:
            for name in names:
                admin.execute(sql.SQL('CREATE DATABASE {} TEMPLATE template0').format(sql.Identifier(name)))
            yield [base.set(database=name, drivername='postgresql+psycopg').render_as_string(hide_password=False)
                   for name in names]
        finally:
            # Only the exact UUID databases created by this fixture are removed.
            for name in names:
                admin.execute(sql.SQL('DROP DATABASE IF EXISTS {} WITH (FORCE)').format(sql.Identifier(name)))


@pytest.fixture
def db(databases):
    db = Database(databases[0])
    migrate(db)
    checkpoint_setup(databases[0])
    with db.session.begin() as s:
        s.add_all([ProjectRow(id='p', name='One'), ProjectRow(id='q', name='Two')])
    try:
        yield db
    finally:
        db.engine.dispose()


@pytest.fixture
def runtime(registry):
    tool, _, data, _ = registry
    return tool.db, tool.settings, data


def snapshot_restore(tool, databases, tmp_path):
    bundle = tmp_path / 'backup'
    manifest = backup.create(databases[0], tool.settings.storage_root, bundle,
        revision=REVISION, configuration_ref='test-vault/config-version-1', writers_stopped=True)
    target = tmp_path / 'restored'
    result = backup.restore(bundle, databases[1], target, revision=REVISION, writers_stopped=True)
    assert result['services_started'] is False
    assert backup.inventory(databases[1]) == manifest['database']
    print('D07 restore evidence:', json.dumps(result, sort_keys=True))
    return bundle, target, manifest, result


def test_restore_report_checkpoint_budgets_exposure_and_resume(registry, databases, tmp_path, monkeypatch):
    from test_agent_finalization import export_ready, execute_job
    import test_agent_finalization
    from workbench.agent_coordinator import Coordinator
    from workbench.agent_scheduler import Scheduler
    from workbench.agent_runs import RunService
    from workbench.agent_db import RunRow, ReservationRow
    from workbench.research_contracts import RunInput, RunControlInput
    from workbench.agent_policy import default_limits
    from workbench.evaluation import expose_artifact
    from workbench.archive import verify_archive
    from workbench.replay import replay

    started = time.monotonic()
    tool, ctx, data, _ = registry
    provision(tool.settings)
    original_setup = test_agent_finalization.setup
    with saver(databases[0]) as durable:
        def durable_setup(*args, **kwargs):
            step, scheduler, _, provider = original_setup(*args, **kwargs)
            return step, scheduler, durable, provider
        monkeypatch.setattr(test_agent_finalization, 'setup', durable_setup)
        step, _, _, provider = export_ready(registry)
        report = execute_job(tool)
        # Crash after durable report publication, before coordinator completion.
    with tool.db.session.begin() as s:
        expose_artifact(s, 'p', data, via='manual', raw=True)
        usage = tool.budgets.snapshot(s, 'p', ctx.run_id).model_dump(mode='json')
        assert usage['model_requests'] > 0
        assert s.scalar(select(func.count()).select_from(ReservationRow)) > 0
        assert s.scalar(select(func.count()).select_from(ExposureRow)) > 0
        paused = tool.runs.create(s, 'p', RunInput(objective='Paused control', policy_revision=2,
            limits=default_limits(), inputs={'artifact_ids': [data.id], 'material_ids': []}), 'paused')
        tool.runs.mutate(s, 'p', paused['id'], 'pause', RunControlInput(expected_run_revision=1), 'pause')
        expected_jobs = s.scalar(select(func.count()).select_from(JobRow))
        expected_artifacts = s.scalar(select(func.count()).select_from(ArtifactRow))
    calls = len(provider.contexts)
    bundle, target, manifest, result = snapshot_restore(tool, databases, tmp_path)
    store = LocalStore(target)
    raw = store.get(report.blob_key)
    assert raw == tool.store.get(report.blob_key)
    verify_archive(io.BytesIO(raw))
    archive = tmp_path / 'report.zip'
    archive.write_bytes(raw)
    out = replay(archive, tmp_path / 'replayed')
    assert json.loads((out / 'replay-comparison.json').read_text())['status'] == 'matched'
    restored = Database(databases[1])
    try:
        settings = tool.settings.model_copy(update={'database_url': databases[1], 'storage_root': target})
        resumed = Coordinator(restored, store, settings, provider, model='model', bounds=step.bounds)
        scheduler = Scheduler(restored)
        with saver(databases[1]) as durable:
            claim = scheduler.claim('restored')
            assert claim and claim.run_id == ctx.run_id
            assert scheduler.advance(claim, durable, resumed) == 'completed'
        assert scheduler.claim('again') is None
        assert len(provider.contexts) == calls
        with restored.session() as s:
            assert s.get(RunRow, paused['id']).state == 'paused'
            assert s.scalar(select(func.count()).select_from(JobRow)) == expected_jobs
            assert s.scalar(select(func.count()).select_from(ArtifactRow)) == expected_artifacts
            assert tool.budgets.snapshot(s, 'p', ctx.run_id).model_dump(mode='json') == usage
        # A verified bundle cannot overwrite a populated database or volume.
        with pytest.raises(backup.BackupError, match='empty dedicated'):
            backup.restore(bundle, databases[1], tmp_path / 'another', revision=REVISION, writers_stopped=True)
        with pytest.raises(backup.BackupError, match='already exists'):
            backup.restore(bundle, databases[1], target, revision=REVISION, writers_stopped=True)
    finally:
        restored.engine.dispose()
    print('D07 report/replay/resume drill seconds:', round(time.monotonic() - started, 3))


def test_restore_unknown_import_reconciles_original_upstream_record(operation, registry, databases, tmp_path, monkeypatch):
    from types import SimpleNamespace
    from workbench.external_operations import run_import
    from workbench.job_metadata import fail_claim
    from workbench.recovery import recover_once
    from workbench.failure_memory import FailureMemory

    db, settings, claim, work, deadline = operation
    original_post = httpx.AsyncClient.post
    ids = []
    async def lost_response(client, url, **kwargs):
        response = await original_post(client, url, **kwargs)
        if url.endswith('/import'):
            ids.append(response.json()['record']['id'])
            if len(ids) == 1:
                raise httpx.ReadError('Simulated response loss after upstream commit')
        return response
    monkeypatch.setattr(httpx.AsyncClient, 'post', lost_response)
    with pytest.raises(httpx.ReadError):
        run_import(db, settings, work, deadline, lambda: False, public_runner)
    fail_claim(db, claim, error='Response lost', error_code='INTERNAL_ERROR')
    assert row(db, work.job_id).state == 'unknown'
    _, target, _, _ = snapshot_restore(registry[0], databases, tmp_path)
    restored = Database(databases[1])
    settings = settings.model_copy(update={'database_url': databases[1], 'storage_root': target})
    try:
        assert recover_once(restored, settings, runner=public_runner)
        assert ids == [ids[0], ids[0]]
        receipt = row(restored, work.job_id)
        assert receipt.state == 'confirmed' and receipt.artifact_id
        assert not recover_once(restored, settings, runner=lambda *a: pytest.fail('duplicate import'))
        records = FailureMemory(settings).search(SimpleNamespace(id='p', name='One', description='')).records
        assert len(records) == 1 and records[0]['id'] == ids[0]
        with restored.session() as s:
            assert s.get(ArtifactRow, receipt.artifact_id).payload['external_record_id'] == ids[0]
            assert s.scalar(select(func.count()).select_from(JobRow)) == 1
    finally:
        restored.engine.dispose()


def test_backup_requires_offline_attestation_and_new_destination(tmp_path):
    with pytest.raises(backup.BackupError, match='Stop all'):
        backup.create('unused', tmp_path, tmp_path / 'backup', revision=REVISION, configuration_ref='vault')
    with pytest.raises(backup.BackupError, match='already exists'):
        backup.fresh_path(tmp_path)


def test_pg_credentials_never_enter_argv_or_diagnostics(monkeypatch):
    monkeypatch.setenv('PGSERVICE', 'must-not-inherit')
    def failure(command, **kwargs):
        assert 'secret-canary' not in ' '.join(command)
        assert kwargs['env']['PGPASSWORD'] == 'secret-canary'
        assert 'PGSERVICE' not in kwargs['env']
        return type('Result', (), {'returncode': 1, 'stderr': b'secret-canary'})()
    monkeypatch.setattr(backup.subprocess, 'run', failure)
    with pytest.raises(backup.BackupError, match='pg_dump failed') as error:
        backup.pg_command('pg_dump', [], 'postgresql://user:secret-canary@host/db')
    assert 'secret-canary' not in str(error.value)


@pytest.fixture
def sample_bundle(tmp_path):
    root = tmp_path / 'bundle'
    (root / 'data').mkdir(parents=True)
    for name in ('metadata.dump', 'data/failure-memory.sqlite', 'data/.efm-provisioned'):
        (root / name).write_bytes(b'fixture')
    manifest = {'format': 'workbench-backup-v1', 'application_revision': REVISION,
        'configuration_ref': 'vault/test', 'database': {'migration_revisions': ['0011'],
        'tables': {'public.checkpoints': {}}}, 'files': backup.regular_tree(root)}
    (root / 'manifest.json').write_text(json.dumps(manifest))
    return root


@pytest.mark.parametrize('change', ['corrupt', 'missing', 'extra', 'traversal'])
def test_bundle_integrity_rejected_before_database_io(sample_bundle, monkeypatch, tmp_path, change):
    backup.verify(sample_bundle)
    if change == 'corrupt':
        (sample_bundle / 'metadata.dump').write_bytes(b'corrupt')
    elif change == 'missing':
        (sample_bundle / 'data/.efm-provisioned').unlink()
    elif change == 'extra':
        (sample_bundle / 'unlisted').write_bytes(b'extra')
    else:
        path = sample_bundle / 'manifest.json'
        value = json.loads(path.read_text())
        value['files']['../escape'] = value['files']['metadata.dump']
        path.write_text(json.dumps(value))
    monkeypatch.setattr(backup, 'require_empty_database', lambda *_: pytest.fail('must not touch database'))
    with pytest.raises(backup.BackupError, match='checksums'):
        backup.restore(sample_bundle, 'unused', tmp_path / 'target', revision=REVISION, writers_stopped=True)


@pytest.mark.skipif(os.name != 'posix', reason='Linux backup runtime')
def test_links_rejected(tmp_path):
    (tmp_path / 'link').symlink_to('/etc/passwd')
    with pytest.raises(backup.BackupError, match='Links'):
        backup.regular_tree(tmp_path)


def test_changed_source_never_publishes_backup(tmp_path, monkeypatch):
    source = tmp_path / 'data'
    source.mkdir()
    for name in ('failure-memory.sqlite', '.efm-provisioned'):
        (source / name).write_bytes(b'original')
    snapshot = {'migration_revisions': ['0011'], 'tables': {'public.checkpoints': {}}}
    monkeypatch.setattr(backup, 'inventory', lambda *_: snapshot)
    def dump(*args):
        Path(args[1][-1]).write_bytes(b'dump')
        (source / 'failure-memory.sqlite').write_bytes(b'writer-was-not-stopped')
    monkeypatch.setattr(backup, 'pg_command', dump)
    destination = tmp_path / 'completed'
    with pytest.raises(backup.BackupError, match='Source changed'):
        backup.create('unused', source, destination, revision=REVISION,
                      configuration_ref='vault', writers_stopped=True)
    assert not destination.exists()
    partial, = tmp_path.glob('.completed.partial-*')
    with pytest.raises(backup.BackupError, match='manifest is missing'):
        backup.verify(partial)


def test_wrong_revision_and_cli_error_redaction(sample_bundle, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(backup, 'require_empty_database', lambda *_: pytest.fail('must not connect'))
    with pytest.raises(backup.BackupError, match='recorded application revision'):
        backup.restore(sample_bundle, 'unused', tmp_path / 'target', revision='e' * 40, writers_stopped=True)
    monkeypatch.setenv('BROKEN_DATABASE_URL', 'postgresql://private-user:secret-canary@private-host/db')
    monkeypatch.setattr(backup, 'restore', lambda *a, **kw: (_ for _ in ()).throw(RuntimeError('secret-canary')))
    # Main masks unexpected driver/OS errors that can contain private connection values.
    assert backup.main(['restore', str(sample_bundle), '--database-env', 'BROKEN_DATABASE_URL',
                        '--storage-root', str(tmp_path / 'target'), '--revision', REVISION, '--writers-stopped']) == 1
    assert 'secret-canary' not in capsys.readouterr().err
    assert not (tmp_path / 'target').exists()


def test_maintenance_serves_only_constant_health():
    from http.server import HTTPServer
    from threading import Thread
    from workbench.maintenance import Handler
    server = HTTPServer(('127.0.0.1', 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with httpx.Client(base_url=f'http://127.0.0.1:{server.server_port}') as client:
            assert client.get('/health').status_code == 200
            for method, path in [('GET', '/api/v1/projects'), ('POST', '/api/v1/projects'),
                                 ('GET', '/failure-memory.sqlite'), ('GET', '/')]:
                response = client.request(method, path)
                assert response.status_code == 503
                assert response.json() == {'status': 'maintenance'}
                assert response.headers['cache-control'] == 'no-store'
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

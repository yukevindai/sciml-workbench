"""Private diagnostics, liveness/progress separation, alert and redaction acceptance."""
from datetime import datetime, timedelta, timezone
import json
from threading import Event

import httpx
import pytest
from sqlalchemy import select
from langgraph.checkpoint.memory import InMemorySaver

from workbench import diagnostics as diag
from workbench.telemetry import Heartbeat, write_observation
from workbench.config import Settings
from workbench.agent_db import RunRow, EventRow, ActionRow, LeaseRow, ReservationRow
from workbench.db import JobRow
from workbench.agent_scheduler import Scheduler
from workbench.egress import EgressDenied
from test_metadata import old_db, db
from test_agent_runs import service, create, mutate
from test_agent_scheduler import linked_job, expire
from test_agent_runtime import configured


@pytest.fixture
def settings(tmp_path):
    return Settings(_env_file=None, database_url='sqlite://', storage_root=tmp_path,
                    api_token='token-canary-at-least-32-characters-long', efm_password='password-canary-long')


@pytest.fixture(autouse=True)
def enabled(monkeypatch):
    monkeypatch.setattr(diag, 'AgentSettings', configured)


def healthy_resources(_):
    return {'storage': {'status': 'observed', 'total_bytes': 10 * 1024**3, 'free_bytes': 5 * 1024**3,
                        'free_fraction': .5}, 'memory': {'status': 'unknown'}}


def observe(db, settings, **kwargs):
    return diag.snapshot(db, settings, resource_probe=healthy_resources, **kwargs)


def test_operator_waits_are_not_worker_stalls(db, service, settings):
    paused = create(db, service, key='paused')
    mutate(db, service, paused, 'pause')
    waiting = create(db, service, key='waiting')
    with db.session.begin() as s:
        row = s.get(RunRow, waiting['id'])
        service.save(row, {**row.payload, 'state': 'waiting_for_input'})
    now = datetime.now(timezone.utc) + timedelta(hours=1)
    value = observe(db, settings, now=now)
    assert {r['condition'] for r in value['runs']} == {'operator_wait'}
    assert 'AGENT_QUEUE_DELAYED' not in value['alerts']
    assert 'AGENT_LEASE_EXPIRED' not in value['alerts']
    assert value['workers']['agent']['status'] == 'unknown'
    assert value['model']['status'] == 'unknown'


def test_expired_lease_and_checkpoint_gap_are_explicit(db, service, settings):
    run = create(db, service)
    scheduler = Scheduler(db)
    claim = scheduler.claim('first')
    scheduler.advance(claim, InMemorySaver(), lambda *_: ({'private': 'checkpoint-canary'}, 'queued'))
    scheduler.claim('interrupted')
    expire(db, run['id'])
    value = observe(db, settings)
    assert value['runs'][0]['condition'] == 'lease_expired'
    assert value['runs'][0]['checkpoint_lag_advances'] == 1
    assert {'AGENT_LEASE_EXPIRED', 'CHECKPOINT_ADVANCEMENT_INTERRUPTED'} <= set(value['alerts'])
    assert 'checkpoint-canary' not in json.dumps(value)


def test_queue_alerts_include_rows_beyond_detail_limit(db, service, settings):
    paused = create(db, service, key='first')
    mutate(db, service, paused, 'pause')
    run = create(db, service, key='second')
    linked_job(db, service, run['id'])
    value = observe(db, settings, limit=1, now=datetime.now(timezone.utc) + timedelta(hours=1))
    assert value['truncated']['runs']
    assert {'AGENT_QUEUE_DELAYED', 'SCIENTIFIC_QUEUE_DELAYED'} <= set(value['alerts'])
    assert value['scientific_queue']['oldest_queued_seconds'] >= 3500


def test_private_correlation_excludes_content_and_foreign_project(db, service, settings):
    run = create(db, service)
    from workbench.job_metadata import submit_job
    with db.session.begin() as s:
        action = service.prepare_action(s, 'p', run['id'], 'private-action',
            {'tool': 'run_audit', 'arguments': {'prompt': 'prompt-canary', 'password': 'password-canary-long'}}, 1)
        job = submit_job(s, 'p', 'report', {'raw': 'raw-input-canary'}, 'private-job')
        jid = job.id
        service.bind_job(s, 'p', run['id'], action.id, jid)
        job.error = 'raw-row-canary token-canary-at-least-32-characters-long'
        job.error_code = 'arbitrary-error-canary'
        action.outcome = {'response': 'response-canary'}
        foreign = submit_job(s, 'q', 'report', {'raw': 'foreign-content'}, 'foreign-key')
        foreign_id = foreign.id
    value = observe(db, settings, project_id='p', run_id=run['id'])
    correlation, = value['correlations']
    assert correlation['job_id'] == jid and correlation['run_id'] == run['id'] and correlation['action_id']
    assert value['jobs'][0]['error_code'] == 'INTERNAL_ERROR'
    encoded = json.dumps(value)
    for word in ('canary', 'foreign-content', foreign_id, 'claim_token', 'request_key', 'password'):
        assert word not in encoded
    with pytest.raises(ValueError, match='Run not found'):
        observe(db, settings, project_id='q', run_id=run['id'])


def test_known_secret_in_identifier_withholds_entire_projection(db, service, settings, monkeypatch):
    run = create(db, service)
    monkeypatch.setenv('ANTHROPIC_API_KEY', run['id'])
    with pytest.raises(EgressDenied):
        observe(db, settings)


def test_unknown_provider_usage_survives_and_model_failure_is_separate(db, service, settings):
    from test_budgeted_provider import prepare, wrapper, call
    run = prepare(db, service)
    def lost(_):
        raise httpx.ReadError('raw-provider-error-canary')
    provider, _ = wrapper(db, lost)
    provider.backend_settings = settings
    try:
        from workbench.model_provider import ProviderError
        with pytest.raises(ProviderError):
            call(provider, run)
    finally:
        provider.provider.close()
    value = observe(db, settings)
    assert value['model']['last_result'] == 'usage_unknown'
    assert value['unknown_model_usage']['reservations'] == 1
    assert 'MODEL_CALL_FAILED' in value['alerts']
    assert 'SCIENTIFIC_QUEUE_DELAYED' not in value['alerts']
    assert 'MODEL_USAGE_UNRESOLVED' not in value['alerts']  # In-flight window is explicit.
    value = observe(db, settings, now=datetime.now(timezone.utc) + timedelta(hours=1))
    assert 'MODEL_USAGE_UNRESOLVED' in value['alerts']
    assert 'raw-provider-error-canary' not in json.dumps(value)
    with db.session() as s:
        assert s.scalar(select(ReservationRow)).payload['state'] == 'unknown'


def test_disabled_agents_do_not_imply_scientific_failure(db, service, settings, monkeypatch):
    create(db, service)
    monkeypatch.setattr(diag, 'AgentSettings', lambda: configured(agents_enabled=False))
    now = datetime.now(timezone.utc) + timedelta(hours=1)
    value = observe(db, settings, now=now)
    assert value['runs'][0]['condition'] == 'execution_disabled'
    assert 'AGENT_QUEUE_DELAYED' not in value['alerts']
    assert 'AGENT_HEARTBEAT_UNAVAILABLE' not in value['alerts']


def test_resource_alerts_and_private_paths(db, settings):
    def pressure(_):
        return {'storage': {'status': 'observed', 'free_fraction': .01, 'free_bytes': 10},
                'memory': {'status': 'observed', 'used_fraction': .95}}
    value = diag.snapshot(db, settings, resource_probe=pressure)
    assert {'STORAGE_LOW', 'MEMORY_PRESSURE'} <= set(value['alerts'])
    assert str(settings.storage_root) not in json.dumps(value)


def test_heartbeat_progress_is_not_refreshed_by_background_pulses(settings):
    with Heartbeat(settings.storage_root, 'scientific', interval=.01) as heartbeat:
        heartbeat.progress('busy', job_id='job-id')
        before = json.loads((settings.storage_root / '.diagnostics/scientific.json').read_text())
        Event().wait(.06)
        after = json.loads((settings.storage_root / '.diagnostics/scientific.json').read_text())
        assert after['observed_at'] > before['observed_at']
        assert after['progress_at'] == before['progress_at']
        assert diag.observation(settings.storage_root, 'scientific', datetime.now(timezone.utc), 30)['status'] == 'recent'
    assert diag.observation(settings.storage_root, 'scientific', datetime.now(timezone.utc), 30)['status'] == 'stopped'


def test_telemetry_storage_failure_does_not_abort_work(settings):
    (settings.storage_root / '.diagnostics').write_text('unavailable')
    with Heartbeat(settings.storage_root, 'agent', interval=.01) as heartbeat:
        heartbeat.progress('busy', run_id='r')
    assert diag.observation(settings.storage_root, 'agent', datetime.now(timezone.utc), 30)['status'] == 'unknown'


def test_cli_failure_redacts_driver_error(monkeypatch, capsys):
    monkeypatch.setattr(diag, 'load_settings', lambda: (_ for _ in ()).throw(RuntimeError('secret-driver-canary')))
    assert diag.main([]) == 2
    assert json.loads(capsys.readouterr().out) == {'error_code': 'DIAGNOSTICS_UNAVAILABLE'}


def test_stale_and_malformed_heartbeats_are_unavailable(settings):
    now = datetime.now(timezone.utc)
    write_observation(settings.storage_root, 'scientific', {'phase': 'busy',
        'observed_at': (now - timedelta(minutes=1)).isoformat(), 'progress_at': now.isoformat()})
    assert diag.observation(settings.storage_root, 'scientific', now, 30)['status'] == 'stale'
    write_observation(settings.storage_root, 'scientific', {'phase': 'secret-phase-canary',
        'observed_at': now.isoformat(), 'progress_at': now.isoformat()})
    assert diag.observation(settings.storage_root, 'scientific', now, 30)['status'] == 'unknown'


def test_scientific_main_reports_real_claim_without_changing_authority(db, settings, monkeypatch):
    import os
    if os.name != 'posix':
        pytest.skip('Linux scientific runtime')
    from workbench import worker, recovery
    from workbench.job_metadata import JobClaim
    from types import SimpleNamespace
    stopping = Event()
    claimed = JobClaim('job-id', 1, 'worker-id')
    monkeypatch.setattr(worker, 'load_settings', lambda: settings)
    monkeypatch.setattr(worker, 'Database', lambda _: db)
    monkeypatch.setattr(worker, 'threading', SimpleNamespace(Event=lambda: stopping))
    monkeypatch.setattr(recovery, 'recover_once', lambda *a, **kw: False)
    monkeypatch.setattr(worker, 'claim_next', lambda *a: claimed)
    def execute(config, claim, **kwargs):
        assert claim is claimed
        value = json.loads((settings.storage_root / '.diagnostics/scientific.json').read_text())
        assert value['job_id'] == claimed.job_id and value['phase'] == 'busy'
        stopping.set()
    monkeypatch.setattr(worker, 'process_job', execute)
    worker.main()
    assert diag.observation(settings.storage_root, 'scientific', datetime.now(timezone.utc), 30)['status'] == 'stopped'

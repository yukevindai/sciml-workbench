"""Durable Hobby dispatch without browser polling or paid cron scheduling."""
import asyncio
from pathlib import Path
import json
import tomllib
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from vercel.queue import RetryAfter
from workbench import queue_runtime as runtime
from workbench.api import create_app
from workbench.db import ProjectRow
from test_metadata import db, old_db, database_url
from test_serverless import settings, config


def test_hobby_deployment_configuration():
    root = Path(__file__).resolve().parents[2]
    cfg = json.loads((root / 'vercel.json').read_text())
    assert all(f['maxDuration'] <= 300 for f in cfg['functions'].values())
    assert cfg['crons'] == [{'path': '/internal/cron/dispatch', 'schedule': '0 0 * * *'}]
    assert tomllib.loads((root / 'pyproject.toml').read_text())['tool']['vercel']['subscribers'] == [{'entrypoint': 'queue_consumer'}]


def test_queue_disabled_or_preview_never_dispatches(monkeypatch):
    async def fail(*args, **kwargs):
        pytest.fail('Disabled dispatch contacted Vercel')
    monkeypatch.setattr(runtime, 'send', fail)
    assert not asyncio.run(runtime.wake(config().model_copy(update={'scheduler_enabled': False})))
    monkeypatch.setenv('VERCEL_ENV', 'preview')
    assert not asyncio.run(runtime.wake(config()))
    asyncio.run(runtime.consume(config(), {'version': 1, 'phase': 0}, 'delivery'))


def test_continuations_are_awaited_deduplicated_and_stop_at_idle(monkeypatch):
    monkeypatch.delenv('VERCEL_ENV', raising=False)
    sent, steps = [], []
    async def send(topic, payload, **options):
        sent.append((topic, payload, options))
    def tick(settings, lane):
        steps.append(lane)
        return {'status': 'idle'}
    monkeypatch.setattr(runtime, 'send', send)
    monkeypatch.setattr(runtime, 'tick', tick)
    monkeypatch.setattr(runtime, 'has_work', lambda settings: False)
    for _ in range(2):
        asyncio.run(runtime.consume(config(), {'version': 1, 'phase': 0}, 'same-delivery'))
    assert steps == ['science', 'science']
    assert sent[0][2]['idempotency_key'] == sent[1][2]['idempotency_key']
    assert sent[0][1] == {'version': 1, 'phase': 1}
    asyncio.run(runtime.consume(config(), {'version': 1, 'phase': 2}, 'last'))
    assert len(sent) == 2
    monkeypatch.setattr(runtime, 'has_work', lambda settings: True)
    asyncio.run(runtime.consume(config(), {'version': 1, 'phase': 2}, 'last'))
    assert sent[-1][1]['phase'] == 0 and sent[-1][2]['delay'] == 5


def test_busy_and_delivery_failure_require_redelivery(monkeypatch):
    monkeypatch.delenv('VERCEL_ENV', raising=False)
    monkeypatch.setattr(runtime, 'tick', lambda *args: {'status': 'busy'})
    with pytest.raises(RetryAfter):
        asyncio.run(runtime.consume(config(), {'version': 1, 'phase': 0}, 'busy'))
    monkeypatch.setattr(runtime, 'tick', lambda *args: {'status': 'processed'})
    async def failed(*args, **kwargs):
        raise OSError('transport unavailable')
    monkeypatch.setattr(runtime, 'send', failed)
    with pytest.raises(OSError):
        asyncio.run(runtime.consume(config(), {'version': 1, 'phase': 0}, 'unacknowledged'))
    with pytest.raises(ValueError):
        asyncio.run(runtime.consume(config(), {'version': 1, 'phase': 10}, 'invalid'))


def test_api_commit_precedes_dispatch_and_failure_is_explicit(settings, db, monkeypatch):
    monkeypatch.setenv('CRON_SECRET', 'c' * 48)
    monkeypatch.delenv('VERCEL_ENV', raising=False)
    observed = []
    async def send(topic, payload, **options):
        # Independent DB session must observe the committed write before send.
        with db.session() as session:
            observed.extend(session.scalars(select(ProjectRow.id).where(ProjectRow.name == 'Hobby')))
        raise OSError('private-scheduler-secret')
    monkeypatch.setattr(runtime, 'send', send)
    with TestClient(create_app(settings)) as client:
        assert client.post('/api/v1/projects', json={'name': 'Hobby'}).status_code == 401
        assert not observed
        client.headers['Authorization'] = 'Bearer ' + 'a' * 48
        response = client.post('/api/v1/projects', json={'name': 'Hobby'})
        assert response.status_code == 503
        assert response.json()['error_code'] == 'DEPENDENCY_UNAVAILABLE'
        assert 'private-scheduler-secret' not in response.text
        assert len(observed) == 1
        assert any(p['id'] == observed[0] for p in client.get('/api/v1/projects').json())


def test_idle_storage_has_no_work(settings, monkeypatch):
    monkeypatch.setenv('WB_AGENTS_ENABLED', '0')
    assert not runtime.has_work(settings)

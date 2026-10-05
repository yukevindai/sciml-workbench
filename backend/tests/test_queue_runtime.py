"""Durable Hobby dispatch without browser polling or paid cron scheduling."""
import asyncio
import ast
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
from test_tool_registry import registry


def test_hobby_deployment_configuration():
    root = Path(__file__).resolve().parents[2]
    cfg = json.loads((root / 'vercel.json').read_text())
    assert all(f['maxDuration'] <= 300 for f in cfg['functions'].values())
    assert cfg['crons'] == [{'path': '/internal/cron/dispatch', 'schedule': '0 0 * * *'}]
    assert tomllib.loads((root / 'pyproject.toml').read_text())['tool']['vercel']['subscribers'] == [{'entrypoint': 'queue_consumer'}]
    # The deployed consumer must permit overlapping lanes, not just dispatch
    # their messages independently while globally serializing all execution.
    module = ast.parse((root / 'queue_consumer.py').read_text())
    handler = next(node for node in module.body if isinstance(node, ast.AsyncFunctionDef) and node.name == 'execute')
    options = {kw.arg: ast.literal_eval(kw.value) for kw in handler.decorator_list[0].keywords if kw.arg == 'max_concurrency'}
    assert options['max_concurrency'] >= len(runtime.PHASES)


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
    monkeypatch.setattr(runtime, 'has_ready_work', lambda settings: False)
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
    monkeypatch.setattr(runtime, 'has_ready_work', lambda settings: True)
    asyncio.run(runtime.consume(config(), {'version': 1, 'phase': 2}, 'ready'))
    assert sent[-1][1]['phase'] == 0 and sent[-1][2]['delay'] == 0


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
        assert len(observed) == 3 and len(set(observed)) == 1
        assert any(p['id'] == observed[0] for p in client.get('/api/v1/projects').json())


def test_idle_storage_has_no_work(settings, monkeypatch):
    monkeypatch.setenv('WB_AGENTS_ENABLED', '0')
    assert not runtime.has_work(settings)


def test_only_queued_enabled_agents_skip_the_idle_backoff(registry, monkeypatch):
    from workbench.agent_db import RunRow
    tool, ctx, _, _ = registry
    # Exercise real configuration validation without relying on operator settings.
    monkeypatch.setenv('WB_MODEL_PROVIDER', 'anthropic')
    monkeypatch.setenv('WB_COORDINATOR_MODEL', 'model')
    monkeypatch.setenv('WB_SPECIALIST_MODEL', 'model')
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'synthetic-test-key')
    monkeypatch.setenv('WB_AGENTS_ENABLED', '0')
    assert not runtime.has_ready_work(tool.settings)
    monkeypatch.setenv('WB_AGENTS_ENABLED', '1')
    assert runtime.has_ready_work(tool.settings)
    with tool.db.session.begin() as s:
        row = s.get(RunRow, ctx.run_id)
        tool.runs.save(row, {**row.payload, 'state': 'paused'})
    assert not runtime.has_ready_work(tool.settings)


def test_new_wake_starts_all_lanes_concurrently_and_awaits_partial_failure(monkeypatch):
    monkeypatch.delenv('VERCEL_ENV', raising=False)
    sent = []
    async def run():
        all_started = asyncio.Event()
        async def send(topic, payload, **options):
            sent.append((payload, options))
            if len(sent) == 3:
                all_started.set()
            await asyncio.wait_for(all_started.wait(), 1)
            if payload['phase'] == 0:
                raise OSError('science delivery failed')
        monkeypatch.setattr(runtime, 'send', send)
        with pytest.raises(OSError):
            await runtime.wake(config(), key='request')
    asyncio.run(run())
    assert {v[0]['phase'] for v in sent} == {0, 1, 2}
    assert all(v[0]['version'] == 2 for v in sent)
    assert len({v[1]['idempotency_key'] for v in sent}) == 3


def test_agent_continuations_never_wait_for_science_and_stop_at_idle(monkeypatch):
    monkeypatch.delenv('VERCEL_ENV', raising=False)
    sent, steps = [], []
    async def send(topic, payload, **options):
        sent.append((payload, options))
    monkeypatch.setattr(runtime, 'send', send)
    monkeypatch.setattr(runtime, 'tick', lambda settings, lane: steps.append(lane) or {'status': 'advanced'})
    monkeypatch.setattr(runtime, 'lane_work', lambda settings, phase: (True, True))
    for _ in range(2):
        asyncio.run(runtime.consume(config(), {'version': 2, 'phase': 1}, 'same'))
    assert steps == ['agent', 'agent']
    assert sent[0] == sent[1]
    assert sent[0][0] == {'version': 2, 'phase': 1} and sent[0][1]['delay'] == 0
    monkeypatch.setattr(runtime, 'lane_work', lambda settings, phase: (True, False))
    asyncio.run(runtime.consume(config(), {'version': 2, 'phase': 1}, 'waiting'))
    assert sent[-1][1]['delay'] == 5
    monkeypatch.setattr(runtime, 'lane_work', lambda settings, phase: (False, False))
    asyncio.run(runtime.consume(config(), {'version': 2, 'phase': 1}, 'idle'))
    assert len(sent) == 3


def test_dependency_lanes_remain_awake_while_agents_can_submit_science(registry, monkeypatch):
    from workbench.agent_db import RunRow
    tool, ctx, _, _ = registry
    monkeypatch.setattr(runtime, 'load_settings', lambda _: type('Agents', (), {'agents_enabled': True})())
    assert runtime.lane_work(tool.settings, 0) == (True, False)
    assert runtime.lane_work(tool.settings, 1) == (True, True)
    assert runtime.lane_work(tool.settings, 2) == (True, False)
    # A finished job may leave its agent waiting until the next agent tick.
    # Keep dependent lanes awake for the follow-up job it can then submit.
    with tool.db.session.begin() as s:
        row = s.get(RunRow, ctx.run_id)
        tool.runs.save(row, {**row.payload, 'state': 'waiting_for_job'})
    assert all(runtime.lane_work(tool.settings, phase) == (True, False) for phase in range(3))
    with tool.db.session.begin() as s:
        row = s.get(RunRow, ctx.run_id)
        tool.runs.save(row, {**row.payload, 'state': 'paused'})
    assert all(runtime.lane_work(tool.settings, phase) == (False, False) for phase in range(3))

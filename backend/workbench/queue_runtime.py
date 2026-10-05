"""Hobby-compatible durable wakeups; PostgreSQL remains the work authority."""
import hashlib
import asyncio
import os
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool
from vercel.queue import RetryAfter, send
from .config import AgentSettings, load_settings
from .db import Database, JobRow, RecoveryRow
from .agent_db import RunRow
from .market_db import MarketEntryRow
from .serverless import tick

TOPIC = 'workbench-wake-v1'
PHASES = ('science', 'agent', 'recovery')


def enabled(settings):
    return (settings.deployment_mode == 'vercel' and settings.scheduler_enabled
            and os.environ.get('VERCEL_ENV') != 'preview')


async def wake(settings, *, key=None):
    if not enabled(settings):
        return False
    # Independent deliveries keep a slow scientific subprocess from holding up
    # agent responses. Each lane retains its existing advisory lock and claims.
    # Wait for ALL sends, including after a partial failure, before returning.
    results = await asyncio.gather(*(send(TOPIC, {'version': 2, 'phase': phase}, retention=86400,
        idempotency_key=hashlib.sha256(f'{key}:{phase}'.encode()).hexdigest() if key else None)
        for phase in range(len(PHASES))), return_exceptions=True)
    for result in results:
        if isinstance(result, BaseException):
            raise result
    return True


def lane_work(settings, phase):
    """Return (pending, ready) for one lane; unrelated work cannot keep it alive."""
    db = Database(settings.database_url)
    try:
        with db.session() as session:
            agents_enabled = load_settings(AgentSettings).agents_enabled
            workflow = agents_enabled and bool(session.scalar(select(MarketEntryRow.id).where(MarketEntryRow.kind == 'workflow_run',
                MarketEntryRow.payload['state'].as_string() == 'running').limit(1)))
            # Keep dependency lanes alive while an agent may enqueue a tool/job.
            # Include waiting agents: when their job finishes they can resume
            # and submit another job without a new API wakeup.
            agent_producing = agents_enabled and (workflow or bool(session.scalar(select(RunRow.id).where(
                RunRow.state.in_(['queued', 'running', 'waiting_for_job'])).limit(1))))
            recovering = undiscovered = False
            if phase in (0, 2):
                recovering = bool(session.scalar(select(RecoveryRow.job_id).where(RecoveryRow.state.in_(['pending', 'running'])).limit(1)))
                undiscovered = bool(session.scalar(select(JobRow.id).where(JobRow.state == 'failed',
                    ~JobRow.id.in_(select(RecoveryRow.job_id))).limit(1)))
            if phase == 0:
                ready = bool(session.scalar(select(JobRow.id).where(JobRow.state == 'queued').limit(1)))
                pending = ready or agent_producing or recovering or undiscovered or bool(session.scalar(select(JobRow.id).where(JobRow.state == 'running').limit(1)))
                return pending, ready
            if phase == 2:
                producing = agent_producing or bool(session.scalar(select(JobRow.id).where(JobRow.state.in_(['queued', 'running'])).limit(1)))
                return recovering or undiscovered or producing, undiscovered
            if not agents_enabled:
                return False, False
            ready = bool(session.scalar(select(RunRow.id).where(RunRow.state == 'queued').limit(1)))
            pending = workflow or ready or bool(session.scalar(select(RunRow.id).where(
                RunRow.state.in_(['running', 'waiting_for_job'])).limit(1)))
            return pending, ready
    finally:
        db.engine.dispose()


def has_work(settings):
    """Include future recovery/expired claims so a chain waits, rather than loses work."""
    db = Database(settings.database_url)
    try:
        with db.session() as session:
            if session.scalar(select(JobRow.id).where(JobRow.state.in_(['queued', 'running'])).limit(1)):
                return True
            if session.scalar(select(RecoveryRow.job_id).where(RecoveryRow.state.in_(['pending', 'running'])).limit(1)):
                return True
            # Discovery is bounded; a later cycle handles any remaining failures.
            if session.scalar(select(JobRow.id).where(JobRow.state == 'failed',
                    ~JobRow.id.in_(select(RecoveryRow.job_id))).limit(1)):
                return True
            agents = load_settings(AgentSettings)
            if agents.agents_enabled and session.scalar(select(MarketEntryRow.id).where(
                    MarketEntryRow.kind == 'workflow_run', MarketEntryRow.payload['state'].as_string() == 'running').limit(1)):
                return True
            return bool(agents.agents_enabled and session.scalar(select(RunRow.id).where(
                RunRow.state.in_(['queued', 'running', 'waiting_for_job'])).limit(1)))
    finally:
        db.engine.dispose()


def has_ready_work(settings):
    """Do not impose the idle backoff on immediately runnable work."""
    db = Database(settings.database_url)
    try:
        with db.session() as session:
            if session.scalar(select(JobRow.id).where(JobRow.state == 'queued').limit(1)):
                return True
            agents = load_settings(AgentSettings)
            if agents.agents_enabled and session.scalar(select(MarketEntryRow.id).where(
                    MarketEntryRow.kind == 'workflow_run', MarketEntryRow.payload['state'].as_string() == 'running').limit(1)):
                return True
            return bool(agents.agents_enabled and session.scalar(select(RunRow.id).where(
                RunRow.state == 'queued').limit(1)))
    finally:
        db.engine.dispose()


async def consume(settings, payload, message_id):
    if not enabled(settings):
        return
    if (not isinstance(payload, dict) or set(payload) != {'version', 'phase'}
            or type(payload['version']) is not int or payload['version'] not in (1, 2) or type(payload['phase']) is not int
            or payload['phase'] not in range(len(PHASES))):
        raise ValueError('Unsupported scheduler message')
    phase = payload['phase']
    # Exactly one bounded lane per function. Keep the SDK event loop free to
    # renew the queue delivery lease while scientific subprocesses run.
    result = await run_in_threadpool(tick, settings, PHASES[phase])
    if result['status'] == 'busy':
        raise RetryAfter(15)
    if payload['version'] == 2:
        # Continue only this lane: no growing fan-out on each model/tool step.
        # lane_work accounts for producers so downstream lanes cannot exit early.
        pending, ready = await run_in_threadpool(lane_work, settings, phase)
        if pending:
            await send(TOPIC, payload, retention=86400, delay=0 if ready else 5,
                idempotency_key=hashlib.sha256(('next:' + message_id).encode()).hexdigest())
        return
    # Drain already-delivered v1 chains during rolling deployments.
    following = (phase + 1) % len(PHASES)
    if following == 0 and not await run_in_threadpool(has_work, settings):
        return
    # Await durable continuation before acknowledgement. Redelivery after a
    # lost acknowledgement reuses this key; job claims prevent duplicate effects.
    key = hashlib.sha256(('next:' + message_id).encode()).hexdigest()
    delay = 5 if following == 0 and not await run_in_threadpool(has_ready_work, settings) else 0
    await send(TOPIC, {'version': 1, 'phase': following}, retention=86400,
               delay=delay, idempotency_key=key)

"""Hobby-compatible durable wakeups; PostgreSQL remains the work authority."""
import hashlib
import os
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool
from vercel.queue import RetryAfter, send
from .config import AgentSettings, load_settings
from .db import Database, JobRow, RecoveryRow
from .agent_db import RunRow
from .serverless import tick

TOPIC = 'workbench-wake-v1'
PHASES = ('science', 'agent', 'recovery')


def enabled(settings):
    return (settings.deployment_mode == 'vercel' and settings.scheduler_enabled
            and os.environ.get('VERCEL_ENV') != 'preview')


async def wake(settings, *, key=None):
    if not enabled(settings):
        return False
    await send(TOPIC, {'version': 1, 'phase': 0}, retention=86400,
               idempotency_key=key)
    return True


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
            return bool(agents.agents_enabled and session.scalar(select(RunRow.id).where(
                RunRow.state.in_(['queued', 'running', 'waiting_for_job'])).limit(1)))
    finally:
        db.engine.dispose()


async def consume(settings, payload, message_id):
    if not enabled(settings):
        return
    if (not isinstance(payload, dict) or set(payload) != {'version', 'phase'}
            or payload['version'] != 1 or type(payload['phase']) is not int
            or payload['phase'] not in range(len(PHASES))):
        raise ValueError('Unsupported scheduler message')
    phase = payload['phase']
    # Exactly one bounded lane per function. Keep the SDK event loop free to
    # renew the queue delivery lease while scientific subprocesses run.
    result = await run_in_threadpool(tick, settings, PHASES[phase])
    if result['status'] == 'busy':
        raise RetryAfter(15)
    following = (phase + 1) % len(PHASES)
    if following == 0 and not await run_in_threadpool(has_work, settings):
        return
    # Await durable continuation before acknowledgement. Redelivery after a
    # lost acknowledgement reuses this key; job claims prevent duplicate effects.
    key = hashlib.sha256(('next:' + message_id).encode()).hexdigest()
    await send(TOPIC, {'version': 1, 'phase': following}, retention=86400,
               delay=5 if following == 0 else 0, idempotency_key=key)

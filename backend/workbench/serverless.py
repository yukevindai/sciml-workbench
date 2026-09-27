"""Bounded, authenticated Vercel invocations over the existing durable queues."""
from contextlib import contextmanager
import hmac
import os
from fastapi import Header
from sqlalchemy import text
from .config import AgentSettings, ConfigurationError, load_settings
from .contracts import uid
from .db import Database
from .errors import DomainError
from .storage import create_store

LOCKS = {'science': 739410131, 'agent': 739410132, 'recovery': 739410133}

@contextmanager
def lane(db, name):
    # Dedicated connection/session, never a transaction-mode connection pooler.
    with db.engine.connect().execution_options(isolation_level='AUTOCOMMIT') as conn:
        acquired = conn.scalar(text('SELECT pg_try_advisory_lock(:key)'), {'key': LOCKS[name]})
        try:
            yield bool(acquired)
        finally:
            if acquired:
                conn.execute(text('SELECT pg_advisory_unlock(:key)'), {'key': LOCKS[name]})


def tick(settings, kind):
    if not settings.scheduler_enabled:
        return {'status': 'disabled'}
    db = Database(settings.database_url)
    try:
        with lane(db, kind) as acquired:
            if not acquired:
                return {'status': 'busy'}
            if kind == 'science':
                from .worker import process_job
                from .job_metadata import claim_next
                claim = claim_next(db, settings.job_timeout_seconds, 'vercel:' + uid())
                if claim:
                    process_job(settings, claim, db=db)
                return {'status': 'processed' if claim else 'idle'}
            if kind == 'recovery':
                from .recovery import recover_once
                return {'status': 'processed' if recover_once(db, settings) else 'idle'}
            agents = load_settings(AgentSettings)
            if not agents.agents_enabled:
                return {'status': 'disabled'}
            from .agent_scheduler import Scheduler
            from .agent_runtime import coordinator
            from .checkpoints import saver
            agents.require_runtime()
            if agents.agent_lease_seconds > 180 or agents.provider_timeout_seconds > 20:
                raise ConfigurationError('Vercel Hobby requires agent leases <=180 seconds and provider timeouts <=20 seconds.')
            scheduler = Scheduler(db, lease_seconds=agents.agent_lease_seconds)
            # Do not make model lookups on idle cron ticks.
            claim = scheduler.claim('vercel:' + uid())
            if not claim:
                return {'status': 'idle'}
            step = coordinator(db, create_store(settings), settings, agents)
            try:
                with saver(settings.database_url) as checkpointer:
                    try:
                        scheduler.advance(claim, checkpointer, step)
                    except DomainError as exc:
                        if exc.error_code != 'RUN_REVISION_CHANGED':
                            raise
            finally:
                step.provider.close()
            return {'status': 'advanced', 'steps': 1}
    finally:
        db.engine.dispose()


def install(app, settings):
    settings.validate_secrets()
    if settings.deployment_mode != 'vercel':
        raise ConfigurationError('Vercel entrypoint requires WB_DEPLOYMENT_MODE=vercel.')
    secret = os.environ.get('CRON_SECRET', '')
    if len(secret) < 32 or secret.startswith('replace-with-'):
        raise ConfigurationError('Set an independent CRON_SECRET of at least 32 characters.')

    def authenticate(authorization):
        if not hmac.compare_digest(authorization.encode(), ('Bearer ' + secret).encode()):
            raise DomainError('Unauthorized', 401)
        # Preview deployments must use isolated DBs and cannot advance production.
        if os.environ.get('VERCEL_ENV') == 'preview':
            raise DomainError('Scheduled execution is disabled on preview deployments', 403)

    @app.get('/internal/cron/dispatch', include_in_schema=False)
    async def dispatch(authorization: str = Header(default='')):
        authenticate(authorization)
        from .queue_runtime import wake
        return {'status': 'dispatched' if await wake(settings) else 'disabled'}

    @app.get('/internal/cron/{kind}', include_in_schema=False)
    def run(kind: str, authorization: str = Header(default='')):
        authenticate(authorization)
        if kind not in LOCKS:
            raise DomainError('Unknown scheduler lane', 404)
        return tick(settings, kind)

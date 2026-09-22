"""Independent durable scheduler process with trusted coordinator construction."""

import sys

from .config import AgentSettings, ConfigurationError, load_settings


def run(settings, step, stopping, *, worker_id=None, lease_seconds=60):
    """Trusted integration entry point. No user-supplied module/code loading."""
    from .agent_scheduler import Scheduler
    from .checkpoints import saver
    from .contracts import uid
    from .db import Database
    from .errors import DomainError
    db = Database(settings.database_url)
    scheduler = Scheduler(db, lease_seconds=lease_seconds)
    identity = worker_id or uid()
    try:
        from .telemetry import Heartbeat
        with saver(settings.database_url) as checkpointer, Heartbeat(settings.storage_root, 'agent') as heartbeat:
            while not stopping.is_set():
                claim = scheduler.claim(identity)
                if claim is None:
                    heartbeat.progress('idle')
                    stopping.wait(0.5)
                    continue
                try:
                    heartbeat.progress('busy', project_id=claim.project_id, run_id=claim.run_id)
                    scheduler.advance(claim, checkpointer, step)
                except DomainError as exc:
                    if exc.error_code != 'RUN_REVISION_CHANGED':
                        raise
    finally:
        db.engine.dispose()


def main():
    import signal
    from threading import Event
    from .agent_runtime import coordinator
    from .db import Database
    from .storage import LocalStore
    from .model_provider import ProviderError
    db = step = None
    previous = {}
    try:
        agents = load_settings(AgentSettings)
        agents.require_runtime()
        settings = load_settings()
        db = Database(settings.database_url)
        step = coordinator(db, LocalStore(settings.storage_root), settings, agents)
        stopping = Event()
        for sig in (signal.SIGTERM, signal.SIGINT):
            previous[sig] = signal.signal(sig, lambda *_: stopping.set())
        run(settings, step, stopping, lease_seconds=agents.agent_lease_seconds)
        return 0
    except (ConfigurationError, ProviderError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)
        if step:
            step.provider.close()
        if db:
            db.engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())

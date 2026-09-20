"""Independent durable scheduler process; E04 supplies the coordinator step."""

import sys

from .config import AgentSettings, ConfigurationError, load_settings


def run(settings, step, stopping, *, worker_id=None):
    """Trusted integration entry point. No user-supplied module/code loading."""
    from .agent_scheduler import Scheduler
    from .checkpoints import saver
    from .contracts import uid
    from .db import Database
    from .errors import DomainError
    db = Database(settings.database_url)
    scheduler = Scheduler(db)
    identity = worker_id or uid()
    try:
        with saver(settings.database_url) as checkpointer:
            while not stopping.is_set():
                claim = scheduler.claim(identity)
                if claim is None:
                    stopping.wait(0.5)
                    continue
                try:
                    scheduler.advance(claim, checkpointer, step)
                except DomainError as exc:
                    if exc.error_code != 'RUN_REVISION_CHANGED':
                        raise
    finally:
        db.engine.dispose()


def main():
    try:
        load_settings(AgentSettings).require_runtime()
    except ConfigurationError as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

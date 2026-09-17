"""Single-instance hosting launcher: API and worker share one mounted disk."""

import os
import signal
import subprocess
import sys
import time

from .bootstrap import main as bootstrap
from .config import Settings


def supervise(commands):
    children = []
    stopping = False

    def stop(signum, frame):
        nonlocal stopping
        stopping = True

    previous = {s: signal.signal(s, stop) for s in (signal.SIGTERM, signal.SIGINT)}
    try:
        for command in commands:
            children.append(subprocess.Popen(command, start_new_session=True))
        while not stopping:
            if any(child.poll() is not None for child in children):
                # Fail the service so the platform restarts both processes.
                return 1
            time.sleep(0.25)
        return 0
    finally:
        # Include a worker's task subprocess in shutdown, not just its parent.
        for child in children:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and any(c.poll() is None for c in children):
            time.sleep(0.1)
        for child in children:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait()
        for sig, handler in previous.items():
            signal.signal(sig, handler)


def main():
    settings = Settings()
    settings.validate_secrets()
    # Run at runtime: Render disks are unavailable to pre-deploy commands.
    subprocess.run(
        ["alembic", "-c", "backend/alembic.ini", "upgrade", "head"], check=True
    )
    bootstrap()
    return supervise(
        [
            [
                sys.executable,
                "-m",
                "uvicorn",
                "workbench.api:create_app",
                "--factory",
                "--host",
                "0.0.0.0",
                "--port",
                os.environ.get("PORT", "8000"),
            ],
            [sys.executable, "-m", "workbench.worker"],
        ]
    )


if __name__ == "__main__":
    raise SystemExit(main())

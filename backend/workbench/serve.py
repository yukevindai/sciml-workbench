"""Single-instance hosting launcher: API and worker share one mounted disk."""

import os
import signal
import subprocess
import sys
import time

from .setup import main as setup
from .config import AgentSettings, ConfigurationError, load_settings


def require_posix():
    if os.name != "posix":
        raise ConfigurationError(
            "The supervised runtime requires Linux process groups. "
            "Use Docker Compose with Linux containers or WSL2; native Windows is supported for tests only."
        )


def supervise(commands):
    require_posix()
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
        # The worker handles TERM and asks its guardian to stop the task tree.
        # Parent-loss detection also covers an abruptly killed worker.
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
    require_posix()
    settings = load_settings()
    agent = load_settings(AgentSettings)
    if agent.agents_enabled:
        # Fail before migrations or child processes; D11 will supply the scheduler.
        agent.require_runtime()
    # Run at runtime: Render disks are unavailable to pre-deploy commands.
    setup(settings)
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
    try:
        raise SystemExit(main())
    except ConfigurationError as exc:
        sys.exit(str(exc))

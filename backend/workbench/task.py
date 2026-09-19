"""Private task guardian and compute subprocess. Neither publishes metadata."""

import json
import os
from pathlib import Path
import signal
import sys

from .processes import ProcessInterrupted, ProcessTimedOut, run_bounded


def compute(directory):
    from .execution import MAX_RESULT_BYTES, TaskResult, TaskSettings, Work
    from .services import execute, safe_error
    from .storage import LocalStore

    request = json.loads((directory / "input.json").read_bytes())
    work = Work.model_validate(request["work"])
    settings = TaskSettings.model_validate(request["settings"])
    try:
        value = execute(LocalStore(settings.storage_root), settings, work)
        result = TaskResult(artifact=value.model_dump(mode="json"))
    except Exception as exc:
        result = TaskResult(error=safe_error(exc, settings), error_code=getattr(exc, "error_code", "INTERNAL_ERROR"))
    raw = result.model_dump_json().encode()
    if len(raw) > MAX_RESULT_BYTES:
        raw = TaskResult(error="Task output exceeds the supported size limit.", error_code="WORKER_INTERRUPTED").model_dump_json().encode()
    staging = directory / "output.tmp"
    staging.write_bytes(raw)
    os.replace(staging, directory / "output.json")
    return 0


def guard(directory, deadline, parent_pid, *, command=None):
    stopping = False

    def stop(signum, frame):
        nonlocal stopping
        stopping = True

    previous = {sig: signal.signal(sig, stop) for sig in (signal.SIGTERM, signal.SIGINT)}
    try:
        # This guardian stays responsive even when native scientific code hangs.
        return run_bounded(
            command or [sys.executable, "-m", "workbench.task", "--compute", str(directory)], deadline,
            stopped=lambda: stopping or (os.name == "posix" and os.getppid() != parent_pid),
        )
    except ProcessTimedOut:
        return 124
    except ProcessInterrupted:
        return 125
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


if __name__ == "__main__":
    if sys.argv[1] == "--compute":
        raise SystemExit(compute(Path(sys.argv[2])))
    raise SystemExit(guard(Path(sys.argv[1]), float(sys.argv[2]), int(sys.argv[3])))

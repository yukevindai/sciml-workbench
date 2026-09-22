"""Short metadata phases around independently supervised scientific tasks."""

from datetime import timezone
import json
import logging
import os
from pathlib import Path
import signal
import sys
import tempfile
import threading
import time

from .config import ConfigurationError, load_settings
from .contracts import uid
from .db import Database, JobRow
from .execution import MAX_RESULT_BYTES, TaskFailure, TaskResult
from .publication import publish_result
from .storage import LocalStore
from .job_metadata import (JobClaim, StaleClaim, claim_is_current, claim_next, database_now,
                           fail_claim)
from .processes import ProcessInterrupted, ProcessTimedOut, run_bounded
from .services import prepare_execution, safe_error


def claim(db, timeout):
    return claim_next(db, timeout, uid())


def prepare_claim(db, claimed):
    # Query latency, input loading and launch overhead cannot renew the budget.
    started = time.monotonic()
    with db.session.begin() as session:
        if not claim_is_current(session, claimed):
            raise StaleClaim()
        job = session.get(JobRow, claimed.job_id)
        stamp = database_now(session)
        deadline = job.deadline_at
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        end = started + (deadline - stamp).total_seconds()
        work = prepare_execution(session, job)
        if work.kind == "failure":
            from .external_operations import prepare
            prepare(session, work)
    return work, end


def task_environment(workspace):
    # This is a trusted-code process boundary, not an OS sandbox.
    allowed = {"PATH", "PYTHONPATH", "PYTHONHOME", "SYSTEMROOT", "WINDIR", "COMSPEC",
               "LD_LIBRARY_PATH", "LANG", "LC_ALL", "TZ", "HOME", "USERPROFILE"}
    env = {key: value for key, value in os.environ.items() if key.upper() in allowed}
    if "PYTHONPATH" in env:
        env["PYTHONPATH"] = os.pathsep.join(str(Path(part or ".").resolve()) for part in env["PYTHONPATH"].split(os.pathsep))
    env.update(TMPDIR=str(workspace / "scratch"), TEMP=str(workspace / "scratch"), TMP=str(workspace / "scratch"),
               PYTHONUNBUFFERED="1", PYTHONDONTWRITEBYTECODE="1")
    for key in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
        if key in os.environ:
            env[key] = os.environ[key]
    return env


def read_result(path):
    try:
        if path.is_symlink() or not path.is_file():
            raise ValueError()
        with path.open("rb") as source:
            raw = source.read(MAX_RESULT_BYTES + 1)
        if len(raw) > MAX_RESULT_BYTES:
            raise ValueError()
        return TaskResult.model_validate_json(raw)
    except (OSError, ValueError):
        raise TaskFailure("Task did not produce a valid bounded result.") from None


def run_task(settings, work, deadline, stopped):
    root = settings.storage_root.resolve() / "workspaces"
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="job-", dir=root) as directory:
        workspace = Path(directory)
        (workspace / "scratch").mkdir(mode=0o700)
        private = {"storage_root": str(settings.storage_root.resolve())}
        if work.kind == "failure":
            private.update(efm_username=settings.efm_username, efm_password=settings.efm_password.get_secret_value())
        (workspace / "input.json").write_text(json.dumps({"work": work.model_dump(mode="json"), "settings": private}), encoding="utf-8")
        code = run_bounded(
            [sys.executable, "-m", "workbench.task", str(workspace), str(deadline), str(os.getpid())],
            deadline, stopped=stopped, env=task_environment(workspace), cwd=workspace, grace=5.0,
        )
        if code == 124:
            raise ProcessTimedOut()
        if code == 125:
            raise ProcessInterrupted()
        if code != 0:
            raise TaskFailure("Task subprocess exited without a result; retry explicitly.")
        return read_result(workspace / "output.json")


def process_job(settings, claimed, *, db=None, stopped=lambda: False):
    if not isinstance(claimed, JobClaim):
        raise TypeError("Scientific execution requires the original JobClaim, not a job ID")
    owned_db = db is None
    db = db or Database(settings.database_url)
    stop_requested = stopped
    next_check = 0.0
    lost_claim = False

    def stopped():
        nonlocal next_check, lost_claim
        if stop_requested() or lost_claim:
            return True
        if time.monotonic() >= next_check:
            next_check = time.monotonic() + 0.5
            try:
                with db.session() as session:
                    from sqlalchemy import select
                    from .job_metadata import claim_predicate
                    # Deadline expiry is handled by the fixed process timer, so
                    # it retains JOB_TIMED_OUT rather than becoming cancellation.
                    lost_claim = session.scalar(select(JobRow.id).where(*claim_predicate(claimed))) is None
            except Exception:
                # Fail closed if metadata authority cannot be verified.
                lost_claim = True
        return lost_claim

    try:
        work, deadline = prepare_claim(db, claimed)
        if work.kind == "failure":
            from .external_operations import run_import
            result = run_import(db, settings, work, deadline, stopped, run_task)
        else:
            result = run_task(settings, work, deadline, stopped)
        if stopped():
            raise ProcessInterrupted()
        if time.monotonic() >= deadline:
            raise ProcessTimedOut()
        if work.kind == "report" and result.artifact and not result.error:
            from .archive import reject_configured_secrets
            reject_configured_secrets(LocalStore(settings.storage_root).get(result.artifact["blob_key"]), settings)
        publish_result(db, claimed, work, result, store=LocalStore(settings.storage_root), stopped=stopped)
    except StaleClaim:
        fail_claim(db, claimed, error="Claim expired before publication; retry explicitly.", error_code="JOB_TIMED_OUT")
    except ProcessTimedOut:
        fail_claim(db, claimed, error="Task exceeded its fixed execution deadline; retry explicitly.", error_code="JOB_TIMED_OUT")
    except ProcessInterrupted:
        fail_claim(db, claimed, error="Worker stopped before task completion; retry explicitly.", error_code="WORKER_INTERRUPTED")
    except Exception as exc:
        logging.getLogger(__name__).error("Job %s failed (%s)", claimed.job_id, type(exc).__name__)
        fail_claim(db, claimed, error=safe_error(exc, settings), error_code=getattr(exc, "error_code", "INTERNAL_ERROR"))
    finally:
        if owned_db:
            db.engine.dispose()


def main():
    from .serve import require_posix

    require_posix()
    settings = load_settings()
    stopping = threading.Event()
    previous = {sig: signal.signal(sig, lambda signum, frame: stopping.set()) for sig in (signal.SIGTERM, signal.SIGINT)}
    db = Database(settings.database_url)
    worker_id = uid()
    try:
        from .telemetry import Heartbeat
        with Heartbeat(settings.storage_root, 'scientific') as heartbeat:
            while not stopping.is_set():
                from .recovery import recover_once
                heartbeat.progress('recovering')
                recover_once(db, settings, stopped=stopping.is_set)
                if stopping.is_set():
                    break
                claimed = claim_next(db, settings.job_timeout_seconds, worker_id)
                if claimed:
                    heartbeat.progress('busy', job_id=claimed.job_id)
                    process_job(settings, claimed, db=db, stopped=stopping.is_set)
                else:
                    heartbeat.progress('idle')
                    stopping.wait(1)
    finally:
        db.engine.dispose()
        for sig, handler in previous.items():
            signal.signal(sig, handler)


if __name__ == "__main__":
    try:
        main()
    except ConfigurationError as exc:
        sys.exit(str(exc))

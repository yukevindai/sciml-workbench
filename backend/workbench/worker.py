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
from .contracts import Provenance, artifact_adapter, uid
from .db import Database, JobRow
from .execution import MAX_RESULT_BYTES, TaskResult
from .job_metadata import (JobClaim, StaleClaim, claim_is_current, claim_next, database_now,
                           fail_claim, finish_claim, lock_claim)
from .processes import ProcessInterrupted, ProcessTimedOut, run_bounded
from .services import artifact, ensure_lineage, prepare_execution, safe_error, save


class TaskFailure(ValueError):
    def __init__(self, message, code="WORKER_INTERRUPTED"):
        super().__init__(message)
        self.error_code = code


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


def publish_result(db, claimed, work, result):
    from .artifacts import validate_result
    if result.error is not None:
        raise TaskFailure(result.error, result.error_code)
    try:
        value = artifact_adapter.validate_python(result.artifact)
    except ValueError:
        raise TaskFailure("Task returned an invalid artifact.") from None
    if (value.id, value.project_id, value.kind) != (work.result_id, work.project_id, work.kind):
        raise TaskFailure("Task result does not match its accepted operation.")
    with db.session.begin() as session:
        from .barriers import lock_project
        lock_project(session, work.project_id)
        lock_claim(session, claimed)
        job = session.get(JobRow, claimed.job_id)
        if (work.job_id, work.project_id, work.kind, work.payload) != (job.id, job.project_id, job.kind, job.payload):
            raise TaskFailure("Task snapshot does not match its accepted operation.")
        ensure_lineage(session, work.project_id, work.kind, work.payload)
        if work.kind == "report":
            from .reports import read_snapshot
            if work.report != read_snapshot(job.payload):
                raise TaskFailure("Task report differs from its accepted capture.", "INTEGRITY_FAILED")
        validate_result(value, work)
        save(session, value)
        save(session, Provenance(project_id=work.project_id, software=value.software, parents=value.parents,
                                 activity=work.kind, inputs=value.parents, outputs=[value.id],
                                 parameters=({"request": work.payload["request"], "snapshot_digest": work.payload["snapshot_digest"]}
                                             if work.kind == "report" else work.payload)))
        failed = value.kind == "benchmark" and value.status == "failed"
        finish_claim(session, claimed, state="failed" if failed else "succeeded", result_id=value.id,
                     error=value.error if failed else None, error_code="VALIDATION_FAILED" if failed else None)


def process_job(settings, claimed, *, db=None, stopped=lambda: False):
    if not isinstance(claimed, JobClaim):
        raise TypeError("Scientific execution requires the original JobClaim, not a job ID")
    owned_db = db is None
    db = db or Database(settings.database_url)
    try:
        work, deadline = prepare_claim(db, claimed)
        result = run_task(settings, work, deadline, stopped)
        if stopped():
            raise ProcessInterrupted()
        if time.monotonic() >= deadline:
            raise ProcessTimedOut()
        publish_result(db, claimed, work, result)
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
        while not stopping.is_set():
            claimed = claim_next(db, settings.job_timeout_seconds, worker_id)
            if claimed:
                process_job(settings, claimed, db=db, stopped=stopping.is_set)
            else:
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

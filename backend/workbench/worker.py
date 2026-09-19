"""Durable PostgreSQL queue with atomic claims and isolated, bounded jobs.

A crashed job is marked interrupted after its deadline, never silently replayed.
Retries are explicit new jobs. Failure Memory imports are idempotent per job ID.
"""

import logging
import multiprocessing as mp
import time
from .config import Settings
from .contracts import uid
from .db import Database, JobRow
from .job_metadata import JobClaim, StaleClaim, claim_is_current, claim_next, fail_claim, finish_claim
from .services import execute, safe_error
from .storage import LocalStore


def claim(db, timeout):
    claimed = claim_next(db, timeout, uid())
    return claimed.job_id if claimed else None


def process_job(settings, job_id, expected_claim=None):
    db = Database(settings.database_url)
    claimed = expected_claim
    try:
        with db.session.begin() as s:
            job = s.get(JobRow, job_id)
            if not job or job.state != "running":
                return
            claimed = claimed or JobClaim.from_row(job)
            if claimed != JobClaim.from_row(job):
                return
            if not claim_is_current(s, claimed):
                return
            value = execute(s, LocalStore(settings.storage_root), settings, job)
            state = (
                "failed"
                if value.kind == "benchmark" and value.status == "failed"
                else "succeeded"
            )
            finish_claim(s, claimed, state=state, result_id=value.id,
                         error=value.error if value.kind == "benchmark" else None,
                         error_code="VALIDATION_FAILED" if state == "failed" else None)
    except StaleClaim:
        # Transaction rollback discards every pending artifact and provenance row.
        pass
    except Exception as exc:
        logging.getLogger(__name__).error(
            "Job %s failed (%s)", job_id, type(exc).__name__
        )
        # No request payloads/credentials are emitted into logs or responses.
        if claimed is not None:
            fail_claim(db, claimed, error=safe_error(exc, settings), error_code=getattr(exc, "error_code", "INTERNAL_ERROR"))
    finally:
        db.engine.dispose()


def main():
    settings = Settings()
    settings.validate_secrets()
    db = Database(settings.database_url)
    worker_id = uid()
    while True:
        claimed = claim_next(db, settings.job_timeout_seconds, worker_id)
        if not claimed:
            time.sleep(1)
            continue
        child = mp.get_context("spawn").Process(
            target=process_job, args=(settings, claimed.job_id, claimed)
        )
        child.start()
        child.join(settings.job_timeout_seconds)
        if child.is_alive():
            child.terminate()
            child.join(5)
            if child.is_alive():
                child.kill()
                child.join()
        fail_claim(db, claimed, error="Worker exited or task exceeded its deadline; retry explicitly.",
                   error_code="WORKER_INTERRUPTED")


if __name__ == "__main__":
    main()

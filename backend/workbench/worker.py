"""Durable PostgreSQL queue with atomic claims and isolated, bounded jobs.

A crashed job is marked interrupted after its deadline, never silently replayed.
Retries are explicit new jobs. Failure Memory imports are idempotent per job ID.
"""

import logging
import multiprocessing as mp
import time
from datetime import timedelta
from sqlalchemy import select, update
from .config import Settings
from .contracts import now
from .db import Database, JobRow
from .services import execute, safe_error
from .storage import LocalStore


def claim(db, timeout):
    with db.session.begin() as s:
        s.execute(
            update(JobRow)
            .where(
                JobRow.state == "running",
                JobRow.started_at < now() - timedelta(seconds=timeout + 30),
            )
            .values(
                state="failed",
                error="Worker interrupted or deadline exceeded; retry explicitly.",
                finished_at=now(),
            )
        )
        job = s.scalar(
            select(JobRow)
            .where(JobRow.state == "queued")
            .order_by(JobRow.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if not job:
            return None
        job.state, job.started_at = "running", now()
        return job.id


def process_job(settings, job_id):
    db = Database(settings.database_url)
    try:
        with db.session.begin() as s:
            job = s.get(JobRow, job_id)
            if not job or job.state != "running":
                return
            value = execute(s, LocalStore(settings.storage_root), settings, job)
            job.result_id = value.id
            job.state = (
                "failed"
                if value.kind == "benchmark" and value.status == "failed"
                else "succeeded"
            )
            job.error = value.error if value.kind == "benchmark" else None
            job.finished_at = now()
    except Exception as exc:
        logging.getLogger(__name__).error(
            "Job %s failed (%s)", job_id, type(exc).__name__
        )
        # No request payloads/credentials are emitted into logs or responses.
        with db.session.begin() as s:
            job = s.get(JobRow, job_id)
            job.state, job.error, job.finished_at = (
                "failed",
                safe_error(exc, settings),
                now(),
            )
    finally:
        db.engine.dispose()


def main():
    settings = Settings()
    settings.validate_secrets()
    db = Database(settings.database_url)
    while True:
        job_id = claim(db, settings.job_timeout_seconds)
        if not job_id:
            time.sleep(1)
            continue
        child = mp.get_context("spawn").Process(
            target=process_job, args=(settings, job_id)
        )
        child.start()
        child.join(settings.job_timeout_seconds)
        if child.is_alive():
            child.terminate()
            child.join(5)
            if child.is_alive():
                child.kill()
                child.join()
        with db.session.begin() as s:
            job = s.get(JobRow, job_id)
            if job.state == "running":
                job.state, job.error, job.finished_at = (
                    "failed",
                    "Worker exited or task exceeded its deadline; retry explicitly.",
                    now(),
                )


if __name__ == "__main__":
    main()

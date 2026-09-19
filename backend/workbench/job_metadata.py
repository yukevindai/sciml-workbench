"""Short transactions and compare-and-set primitives for scientific job metadata.

Claims are internal authority, never API responses. D03 owns process supervision;
B08 owns the complete publication service and its higher-level lock ordering.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from .db import JobRow
from .request_identity import request_digest
from .services import DomainError, ensure_lineage


def submit_job(session, project_id, kind, payload, request_key, *, retry_of_job_id=None):
    if not request_key or len(request_key) > 100:
        raise DomainError("Provide an Idempotency-Key of 1–100 characters")
    digest = request_digest(kind, payload)
    query = select(JobRow).where(JobRow.project_id == project_id, JobRow.request_key == request_key)

    def replay(old):
        if old.request_digest != digest or old.retry_of_job_id != retry_of_job_id:
            raise DomainError("Idempotency key was used for a different request", 409)
        return old

    old = session.scalar(query)
    if old is not None:
        return replay(old)
    ensure_lineage(session, project_id, kind, payload)
    job = JobRow(project_id=project_id, kind=kind, payload=payload, request_key=request_key,
                 request_digest=digest, retry_of_job_id=retry_of_job_id)
    try:
        with session.begin_nested():
            session.add(job)
            session.flush()
    except IntegrityError:
        # The unique index arbitrates concurrent inserts. A savepoint keeps the
        # surrounding READ COMMITTED transaction usable to read the winner.
        old = session.scalar(query)
        if old is None:
            raise
        return replay(old)
    return job


def database_now(session):
    expression = func.clock_timestamp() if session.bind.dialect.name == "postgresql" else func.current_timestamp()
    stamp = session.scalar(select(expression))
    if isinstance(stamp, str):
        stamp = datetime.fromisoformat(stamp)
    return stamp.replace(tzinfo=timezone.utc) if stamp.tzinfo is None else stamp


@dataclass(frozen=True)
class JobClaim:
    job_id: str
    token: int
    worker_id: str

    @classmethod
    def from_row(cls, job):
        return cls(job.id, job.claim_token, job.worker_id)


class StaleClaim(Exception):
    """No authority to publish; the caller must roll back its transaction."""


def claim_next(db, timeout_seconds, worker_id):
    if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, int) or timeout_seconds <= 0:
        raise ValueError("Job timeout must be a positive number of seconds")
    if not worker_id or len(worker_id) > 160:
        raise ValueError("Worker identity must contain 1–160 characters")
    with db.session.begin() as session:
        stamp = database_now(session)
        # SKIP LOCKED also avoids waiting for a publisher when sweeping expiry.
        expired = session.scalars(select(JobRow.id).where(
            JobRow.state == "running", JobRow.deadline_at <= stamp,
        ).order_by(JobRow.deadline_at, JobRow.id).with_for_update(skip_locked=True).limit(100)).all()
        if expired:
            session.execute(update(JobRow).where(JobRow.id.in_(expired), JobRow.state == "running").values(
                state="failed", claim_token=JobRow.claim_token + 1, error_code="JOB_TIMED_OUT",
                error="Worker interrupted or deadline exceeded; retry explicitly.", finished_at=stamp,
            ))
        job = session.scalar(select(JobRow).where(JobRow.state == "queued")
                             .order_by(JobRow.created_at, JobRow.id).with_for_update(skip_locked=True).limit(1))
        if job is None:
            return None
        stamp = database_now(session)
        # Conditional update additionally protects the SQLite development path.
        changed = session.execute(update(JobRow).where(JobRow.id == job.id, JobRow.state == "queued").values(
            state="running", claim_token=JobRow.claim_token + 1, worker_id=worker_id,
            started_at=stamp, deadline_at=stamp + timedelta(seconds=timeout_seconds),
        ).returning(JobRow.claim_token)).scalar_one_or_none()
        return JobClaim(job.id, changed, worker_id) if changed is not None else None


def claim_predicate(claim):
    return (JobRow.id == claim.job_id, JobRow.state == "running",
            JobRow.claim_token == claim.token, JobRow.worker_id == claim.worker_id)


def claim_is_current(session, claim):
    return session.scalar(select(JobRow.id).where(
        *claim_predicate(claim), JobRow.deadline_at > database_now(session),
    )) is not None


def lock_claim(session, claim):
    """Acquire publication authority before flushing any pending artifacts."""
    with session.no_autoflush:
        row = session.scalar(select(JobRow.id).where(*claim_predicate(claim)).with_for_update())
        if row is None:
            raise StaleClaim()
        stamp = database_now(session)  # Read after lock acquisition, not before waiting.
        valid = session.scalar(select(JobRow.id).where(*claim_predicate(claim), JobRow.deadline_at > stamp))
        if valid is None:
            raise StaleClaim()


def finish_claim(session, claim, *, state, result_id=None, error=None, error_code=None):
    """Finish within the caller's artifact/provenance transaction or roll it back."""
    if state not in {"succeeded", "failed"}:
        raise ValueError("Expected a terminal job state")
    lock_claim(session, claim)
    session.flush()
    stamp = database_now(session)
    changed = session.execute(update(JobRow).execution_options(synchronize_session="fetch").where(*claim_predicate(claim), JobRow.deadline_at > stamp).values(
        state=state, result_id=result_id, error=error, error_code=error_code, finished_at=stamp,
    ).returning(JobRow.id)).scalar_one_or_none()
    if changed is None:
        raise StaleClaim()


def fail_claim(db, claim, *, error, error_code):
    """A late error cannot overwrite success or the outcome of a newer fence."""
    with db.session.begin() as session:
        stamp = database_now(session)
        return session.execute(update(JobRow).where(*claim_predicate(claim)).values(
            state="failed", error=error, error_code=error_code, finished_at=stamp,
            claim_token=JobRow.claim_token + 1,
        ).returning(JobRow.id)).scalar_one_or_none() is not None

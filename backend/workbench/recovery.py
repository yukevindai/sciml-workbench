"""D04 recovery: fixed policy, durable leases, exact imports and retained history.

Manual scientific work gets at most one additional execution. Agent-owned jobs
remain with the agent budget/control scheduler. Import reconciliation never
creates a replacement job or changes the original terminal outcome.
"""
from datetime import timedelta, timezone
import time

from sqlalchemy import select

from .barriers import lock_project
from .contracts import Provenance, uid
from .db import ExternalOperationRow, JobRow, RecoveryRow
from .errors import DomainError
from .job_metadata import StaleClaim, database_now, submit_job

TRANSIENT = {"WORKER_INTERRUPTED", "JOB_TIMED_OUT", "DEPENDENCY_UNAVAILABLE"}
POLICY = {"version": "manual-recovery-v1", "max_attempts": 3, "backoff_seconds": 30,
          "scientific_retries": 1}


def eligible(job, external):
    if (job.state != "failed" or job.result_id is not None or job.retry_of_job_id
            or job.request_key.startswith("action:v1:") or job.error_code == "RUN_CANCELLED"):
        return False
    if job.kind == "failure":
        return external is not None and external.artifact_id is None and (
            external.state == "confirmed" or job.error_code in TRANSIENT
            or (external.state == "unknown" and job.error_code == "INTERNAL_ERROR"))
    return job.kind in {"audit", "split", "benchmark", "evidence", "report"} and job.error_code in TRANSIENT


def separately_managed(session, job_id):
    from .agent_db import RunJobRow
    from .db import EvaluationJobRow
    return (session.scalar(select(RunJobRow.job_id).where(RunJobRow.job_id == job_id).limit(1)) is not None
        or session.scalar(select(EvaluationJobRow.job_id).where(EvaluationJobRow.job_id == job_id).limit(1)) is not None
        or session.scalar(select(JobRow.id).where(JobRow.retry_of_job_id == job_id).limit(1)) is not None)


def discover(db):
    # Excluding recorded decisions prevents an old failure from starving newer work.
    with db.session() as session:
        candidates = session.execute(select(JobRow.id, JobRow.project_id).where(
            JobRow.state == "failed", ~JobRow.id.in_(select(RecoveryRow.job_id)))
            .order_by(JobRow.created_at, JobRow.id).limit(100)).all()
    for jid, pid in candidates:
        with db.session.begin() as session:
            lock_project(session, pid)
            if session.get(RecoveryRow, jid) is not None:
                continue
            job = session.get(JobRow, jid)
            accepted = eligible(job, session.get(ExternalOperationRow, jid)) and not separately_managed(session, jid)
            session.add(RecoveryRow(job_id=jid, project_id=pid, policy=dict(POLICY),
                state="pending" if accepted else "exhausted",
                history=[] if accepted else [{"event": "ineligible", "code": job.error_code}]))


def acquire(db, timeout):
    with db.session() as session:
        stamp = database_now(session)
        candidates = session.execute(select(RecoveryRow.job_id, RecoveryRow.project_id).where(
            ((RecoveryRow.state == "pending") & (RecoveryRow.due_at <= stamp)) |
            ((RecoveryRow.state == "running") & (RecoveryRow.lease_until <= stamp)))
            .order_by(RecoveryRow.due_at, RecoveryRow.job_id).limit(100)).all()
    for jid, pid in candidates:
        with db.session.begin() as session:
            lock_project(session, pid)
            row = session.get(RecoveryRow, jid)
            stamp = database_now(session)
            def utc(value):
                return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
            if row.state not in {"pending", "running"} or utc(
                    row.lease_until if row.state == "running" else row.due_at) > stamp:
                continue
            if row.state == "running":
                row.history = row.history + [{"event": "lease_expired", "attempt": row.attempts}]
            if row.attempts >= row.policy["max_attempts"]:
                row.state = "exhausted"
                continue
            row.state, row.lease_token = "running", uid()
            row.attempts += 1
            row.lease_until = stamp + timedelta(seconds=timeout)
            row.history = row.history + [{"event": "started", "attempt": row.attempts, "at": stamp.isoformat()}]
            return jid, pid, row.lease_token
    return None


def fenced(session, identity):
    jid, pid, token = identity
    lock_project(session, pid)
    row = session.get(RecoveryRow, jid)
    stamp = database_now(session)
    deadline = row.lease_until
    if deadline is not None and deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    if row.state != "running" or row.lease_token != token or deadline is None or deadline <= stamp:
        raise StaleClaim()
    return row


def completed(row):
    row.state = "completed"
    row.history = row.history + [{"event": "completed", "attempt": row.attempts}]


def execute(db, settings, identity, *, runner=None, stopped=lambda: False):
    from .external_operations import prepare, run_import, result_from_receipt, link_artifact
    from .services import prepare_execution, save
    from .worker import run_task
    from .processes import ProcessInterrupted
    from .artifacts import validate_result
    from .contract_registry import read_artifact
    from .scientific_contracts import FailureReceipt

    try:
        with db.session.begin() as session:
            row = fenced(session, identity)
            if stopped():
                raise ProcessInterrupted()
            job = session.get(JobRow, row.job_id)
            if not eligible(job, session.get(ExternalOperationRow, job.id)) or separately_managed(session, job.id):
                raise DomainError("Recovery is no longer eligible")
            work = prepare_execution(session, job)
            if job.kind != "failure":
                # Original canonical inputs (including frozen reports) are retained.
                retry = submit_job(session, job.project_id, job.kind, job.payload,
                    "recovery:v1:" + job.id, retry_of_job_id=job.id)
                row.retry_job_id = retry.id
                session.flush()
                fenced(session, identity)
                if stopped():
                    raise ProcessInterrupted()
                completed(row)
                return
            prepare(session, work)
            end = time.monotonic() + (row.lease_until.replace(tzinfo=timezone.utc)
                - database_now(session)).total_seconds()
        run_import(db, settings, work, end, stopped, runner or run_task)
        with db.session.begin() as session:
            row = fenced(session, identity)
            if stopped():
                raise ProcessInterrupted()
            job = session.get(JobRow, row.job_id)
            external = session.get(ExternalOperationRow, row.job_id)
            if external.artifact_id is not None:
                completed(row)
                return
            if not eligible(job, external) or external.state != "confirmed" or separately_managed(session, job.id):
                raise DomainError("Recovery requires a confirmed eligible receipt")
            authoritative = prepare_execution(session, job)
            prepare(session, authoritative)
            # Construct only from the persisted, verified receipt and current inputs.
            result = result_from_receipt(authoritative, FailureReceipt.model_validate(external.receipt))
            value = read_artifact(result.artifact)
            validate_result(value, authoritative)
            save(session, value)
            session.flush()
            link_artifact(session, authoritative, value)
            save(session, Provenance(project_id=job.project_id, software=value.software,
                parents=value.parents, activity="failure", inputs=value.parents, outputs=[value.id],
                parameters={"request": job.payload, "recovered_job_id": job.id,
                            "recovery_policy": row.policy["version"]}))
            session.flush()
            fenced(session, identity)
            if stopped():
                raise ProcessInterrupted()
            completed(row)
    except StaleClaim:
        return
    except Exception as exc:
        # No exception text/credentials enters the durable recovery log.
        try:
            with db.session.begin() as session:
                row = fenced(session, identity)
                code = getattr(exc, "error_code", None) or "RECOVERY_INTERRUPTED"
                deterministic = ((isinstance(exc, DomainError) and exc.status != 503)
                    or code in {"VALIDATION_FAILED", "ADMISSION_REJECTED", "INTEGRITY_FAILED",
                                "POLICY_DENIED", "IDEMPOTENCY_CONFLICT", "UNSUPPORTED_CAPABILITY"})
                row.state = "exhausted" if deterministic or row.attempts >= row.policy["max_attempts"] else "pending"
                row.due_at = database_now(session) + timedelta(
                    seconds=row.policy["backoff_seconds"] * 2 ** (row.attempts - 1))
                row.history = row.history + [{"event": "failed", "attempt": row.attempts, "code": code}]
        except StaleClaim:
            pass


def recover_once(db, settings, *, runner=None, stopped=lambda: False):
    if stopped():
        return False
    discover(db)
    identity = acquire(db, settings.job_timeout_seconds)
    if identity is None:
        return False
    execute(db, settings, identity, runner=runner, stopped=stopped)
    return True

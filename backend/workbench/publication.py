"""B08: project-before-job publication and cancellation fencing.

Scientific computation, blob IO and upstream calls are never run in this module's
metadata transaction. Run/assignment/action ownership belongs to B11/D12.
"""
from .contracts import Provenance
from .contract_registry import read_artifact
from .db import JobRow
from .execution import TaskFailure
from .job_metadata import JobClaim, finish_claim, lock_claim
from .processes import ProcessInterrupted
from .services import prepare_execution, save


def fence_cancelled(session, project_id, claimed):
    """Trusted controller primitive, in its own control transaction.

    Caller must establish sole ownership and authorization. No run API or process
    termination is implied. False means a terminal/replaced claim was retained.
    """
    from sqlalchemy import select, update
    from .barriers import lock_project
    from .job_metadata import claim_predicate, database_now
    from .errors import DomainError
    if not isinstance(claimed, JobClaim):
        raise TypeError("Cancellation fencing requires the original JobClaim")
    lock_project(session, project_id)
    job = session.scalar(select(JobRow).where(JobRow.id == claimed.job_id,
        JobRow.project_id == project_id).with_for_update())
    if job is None:
        raise DomainError("Job not found in this project", 404, "JOB_NOT_FOUND")
    return session.execute(update(JobRow).where(*claim_predicate(claimed), JobRow.project_id == project_id).values(
        state="failed", claim_token=JobRow.claim_token + 1, error_code="RUN_CANCELLED",
        error="Execution cancelled by its authorized controller.", finished_at=database_now(session),
    ).returning(JobRow.id)).scalar_one_or_none() is not None


def publish_result(db, claimed, work, result, *, store=None, stopped=lambda: False):
    """Verify durable output bytes outside metadata locks, then commit one outcome.

    The linearization point is finish_claim's conditional terminal update. Run
    controllers must commit their claim fence before acknowledging cancellation.
    """
    from .artifacts import validate_result
    if not isinstance(claimed, JobClaim):
        raise TypeError("Publication requires the original JobClaim")
    work = work.model_copy(deep=True)
    result = result.model_copy(deep=True)
    if stopped():
        raise ProcessInterrupted()
    if result.error is not None:
        raise TaskFailure(result.error, result.error_code)
    try:
        value = read_artifact(result.artifact)
    except ValueError:
        raise TaskFailure("Task returned an invalid artifact.") from None
    if (value.id, value.project_id, value.kind) != (work.result_id, work.project_id, work.kind):
        raise TaskFailure("Task result does not match its accepted operation.")
    # LocalStore.get verifies complete bytes and their content-addressed key.
    # Immutable blobs are retained if the metadata transaction later rolls back.
    keys = {getattr(value, field, None) for field in ("blob_key", "bundle_key", "pdf_key")} - {None}
    if value.kind == "benchmark" and value.status == "succeeded" and not value.bundle_key:
        raise TaskFailure("Successful benchmark is missing its output bundle", "INTEGRITY_FAILED")
    if keys and store is None:
        raise TaskFailure("Publication requires verified blob storage", "INTEGRITY_FAILED")
    report_raw = None
    for key in sorted(keys):
        raw = store.get(key)
        if value.kind == "report":
            report_raw = raw
    if value.kind == "report":
        import io
        import json
        from .archive import verify_archive
        files, _ = verify_archive(io.BytesIO(report_raw))
        if json.loads(files["snapshot.json"]) != work.report:
            raise TaskFailure("Report bytes differ from the accepted capture", "INTEGRITY_FAILED")
    if stopped():
        raise ProcessInterrupted()
    with db.session.begin() as session:
        from .barriers import lock_project
        lock_project(session, work.project_id)
        lock_claim(session, claimed)
        job = session.get(JobRow, claimed.job_id)
        if (work.job_id, work.project_id, work.kind, work.payload) != (job.id, job.project_id, job.kind, job.payload):
            raise TaskFailure("Task snapshot does not match its accepted operation.")
        if stopped():
            raise ProcessInterrupted()
        authoritative = prepare_execution(session, job)
        if work.artifacts != authoritative.artifacts:
            raise TaskFailure("Task inputs differ from authoritative artifacts", "INTEGRITY_FAILED")
        if work.kind == "report":
            from .reports import read_snapshot
            if work.report != read_snapshot(job.payload):
                raise TaskFailure("Task report differs from its accepted capture.", "INTEGRITY_FAILED")
        validate_result(value, work)
        save(session, value)
        if work.kind == "failure":
            from .external_operations import link_artifact
            session.flush()
            link_artifact(session, work, value)
        save(session, Provenance(project_id=work.project_id, software=value.software, parents=value.parents,
                                 activity=work.kind, inputs=value.parents, outputs=[value.id],
                                 parameters=({"request": work.payload["request"], "snapshot_digest": work.payload["snapshot_digest"]}
                                             if work.kind == "report" else work.payload)))
        if stopped():
            raise ProcessInterrupted()
        failed = value.kind == "benchmark" and value.status == "failed"
        finish_claim(session, claimed, state="failed" if failed else "succeeded", result_id=value.id,
                     error=value.error if failed else None, error_code="VALIDATION_FAILED" if failed else None)

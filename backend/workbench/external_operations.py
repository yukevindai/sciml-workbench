"""Durable Failure Memory import identity; only the parent writes metadata.

`unknown` is committed before launching import IO, so even process death needs
no cleanup to preserve a truthful outcome. Reconciliation only replays this body.
"""
import hashlib
import json
import time

from .barriers import lock_project
from .contracts import now
from .db import ExternalOperationRow, ExternalProjectRow, JobRow
from .errors import DomainError
from .request_identity import request_digest
from .scientific_contracts import FailureReceipt


def body_for(work):
    from .services import failure_record
    return json.dumps({"schema_version": "1.0", "connector": "sciml-workbench",
                       "external_id": work.job_id, "record": failure_record(work)},
                      sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def verify(row, expected_body=None):
    payload = json.loads(row.body)
    if (hashlib.sha256(row.body.encode("utf-8")).hexdigest() != row.body_sha256
            or request_digest("failure_import", {"project_id": row.project_id, "import": payload}) != row.request_sha256
            or payload.get("external_id") != row.job_id or payload.get("connector") != row.connector
            or (expected_body is not None and row.body != expected_body)):
        raise DomainError("External operation identity/body conflict; reconciliation refused", 409)


def prepare(session, work):
    lock_project(session, work.project_id)
    # Legacy imports contain complete benchmark metrics; human prose may also
    # disclose holdout results through the independently accessible upstream app.
    actor = work.payload.get("actor")
    if actor is None or actor["kind"] == "human":
        from .artifacts import ArtifactResolver
        from .evaluation import expose_artifact
        value = ArtifactResolver(session, work.project_id).resolve(work.payload["benchmark_id"], "benchmark")
        expose_artifact(session, work.project_id, value, via="failure_import")
    job = session.get(JobRow, work.job_id)
    if job.retry_of_job_id and session.get(ExternalOperationRow, job.retry_of_job_id) is not None:
        raise DomainError("Reconcile the original external operation; do not replace its import ID", 409)
    row = session.get(ExternalOperationRow, work.job_id)
    body = body_for(work)
    if row is None:
        row = ExternalOperationRow(job_id=work.job_id, project_id=work.project_id,
            connector="sciml-workbench", body=body, body_sha256=hashlib.sha256(body.encode("utf-8")).hexdigest(),
            request_sha256=request_digest("failure_import", {"project_id": work.project_id, "import": json.loads(body)}))
        session.add(row)
        session.flush()
    verify(row, body)
    work.external_import = row.body
    binding = session.get(ExternalProjectRow, work.project_id)
    work.external_project_id = row.external_project_id or (binding.external_project_id if binding else None)
    return row


def bind_and_submit(db, work, remote_id):
    with db.session.begin() as session:
        lock_project(session, work.project_id)
        row = session.get(ExternalOperationRow, work.job_id)
        verify(row, work.external_import)
        binding = session.get(ExternalProjectRow, work.project_id)
        if binding is None:
            binding = ExternalProjectRow(project_id=work.project_id, external_project_id=remote_id)
            session.add(binding)
        if binding.external_project_id != remote_id or row.external_project_id not in (None, remote_id):
            raise DomainError("External destination changed; reconciliation refused", 409)
        if row.state == "confirmed":
            return FailureReceipt.model_validate(row.receipt)
        row.external_project_id = remote_id
        row.state = "unknown"
        row.attempts += 1
        row.submitted_at = now()
    work.external_project_id = remote_id
    return None


def confirm(db, work, receipt):
    receipt = FailureReceipt.model_validate(receipt)
    with db.session.begin() as session:
        lock_project(session, work.project_id)
        row = session.get(ExternalOperationRow, work.job_id)
        verify(row, work.external_import)
        if (receipt.external_id != row.job_id or receipt.request_sha256 != row.request_sha256
                or receipt.external_project_id != row.external_project_id
                or receipt.record.get("id") != receipt.external_record_id
                or receipt.record.get("project_id") != receipt.external_project_id
                or row.state == "prepared"):
            raise DomainError("Receipt does not match the submitted external operation", 409)
        if row.state == "confirmed":
            if row.receipt["external_record_id"] != receipt.external_record_id:
                raise DomainError("Conflicting external receipt", 409)
            return FailureReceipt.model_validate(row.receipt)
        row.receipt = receipt.model_dump(mode="json")
        row.state = "confirmed"
    return receipt


def result_from_receipt(work, receipt):
    from .contracts import Failure
    from .services import software
    from .execution import TaskResult
    if "actor" in work.payload:
        from .outcomes import artifact_from_receipt
        value = artifact_from_receipt(work, receipt, software())
        return TaskResult(artifact=value.model_dump(mode="json"), receipt=receipt.model_dump(mode="json"))
    value = Failure(id=work.result_id, project_id=work.project_id, software=software(),
                    parents=[work.payload["benchmark_id"]], benchmark_id=work.payload["benchmark_id"],
                    external_project_id=receipt.external_project_id, external_record_id=receipt.external_record_id,
                    reason=work.payload["reason"], record=receipt.record)
    return TaskResult(artifact=value.model_dump(mode="json"), receipt=receipt.model_dump(mode="json"))


def run_import(db, settings, work, deadline, stopped, runner):
    from .worker import TaskFailure
    from .processes import ProcessInterrupted, ProcessTimedOut
    def check_budget():
        if stopped():
            raise ProcessInterrupted()
        if time.monotonic() >= deadline:
            raise ProcessTimedOut()
    check_budget()
    if work.external_project_id is None:
        resolved = runner(settings, work, deadline, stopped)
        if resolved.error is not None or resolved.external_project_id is None:
            raise TaskFailure(resolved.error or "Missing external destination", resolved.error_code or "INTERNAL_ERROR")
        work.external_project_id = resolved.external_project_id
    check_budget()
    receipt = bind_and_submit(db, work, work.external_project_id)
    if receipt is None:
        result = runner(settings, work, deadline, stopped)
        if result.error is not None or result.receipt is None:
            raise TaskFailure(result.error or "Missing external receipt", result.error_code or "INTERNAL_ERROR")
        # Persist confirmation even if the deadline/claim expired after IO.
        receipt = confirm(db, work, result.receipt)
    return result_from_receipt(work, receipt)


def link_artifact(session, work, value):
    row = session.get(ExternalOperationRow, work.job_id)
    if row is None or row.state != "confirmed":
        raise DomainError("Failure publication requires a confirmed external receipt", 409)
    verify(row, work.external_import)
    receipt = FailureReceipt.model_validate(row.receipt)
    if ((value.schema_version == "2.0" and value.receipt != receipt)
            or (value.schema_version == "1.0" and (value.external_project_id != receipt.external_project_id
            or value.external_record_id != receipt.external_record_id or value.record != receipt.record))):
        raise DomainError("Failure artifact differs from the confirmed receipt", 409)
    if row.artifact_id not in (None, value.id):
        raise DomainError("External receipt already published", 409)
    row.artifact_id = value.id


def reconcile(db, settings, project_id, job_id, *, expected_body=None, runner=None):
    """Trusted/operator entry point. Confirm the original import; do not rewrite a job.

    Automatic eligibility, recovery artifact publication and scheduling belong to D04.
    """
    from .services import prepare_execution
    from .worker import run_task
    with db.session.begin() as session:
        lock_project(session, project_id)
        job = session.get(JobRow, job_id)
        row = session.get(ExternalOperationRow, job_id)
        if job is None or job.project_id != project_id or job.kind != "failure" or row is None:
            raise DomainError("External operation not found", 404)
        verify(row, expected_body)
        if row.state == "confirmed":
            return FailureReceipt.model_validate(row.receipt)
        if job.state not in {"failed", "succeeded"}:
            raise DomainError("Reconciliation requires a terminal original job", 409)
        work = prepare_execution(session, job)
        prepare(session, work)
    result = run_import(db, settings, work, time.monotonic() + settings.job_timeout_seconds,
                        lambda: False, runner or run_task)
    return FailureReceipt.model_validate(result.receipt)

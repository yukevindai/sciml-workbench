"""Shared durable operation admission for authenticated HTTP and trusted tools.

Scopes are constructed by the server, never from provider arguments. This module
owns the submission transaction; it does not run science or implement agent policy.
"""

from dataclasses import dataclass
import hashlib
import json

from pydantic import Field, ValidationError
from sqlalchemy import select

from .contract_core import ContractModel, Digest, Identifier, finite_json
from .contracts import AuditInput, BenchmarkInput, FailureInput, SplitInput
from .db import JobRow
from .intake import material
from .job_metadata import submit_job
from .request_identity import request_digest
from .services import DomainError, artifact, ensure_lineage, project
from .artifacts import operation_inputs
from .barriers import lock_project
from .reports import ReportSelection, report_request, read_snapshot, authorize_snapshot, freeze


@dataclass(frozen=True)
class SubmissionScope:
    project_id: str
    artifact_ids: frozenset[str] | None = None
    material_ids: frozenset[str] | None = None
    run_id: str | None = None
    report_selection: ReportSelection | None = None

    def __post_init__(self):
        if not isinstance(self.project_id, str) or not self.project_id.strip():
            raise DomainError("A trusted project scope is required", 403)
        for field in ("artifact_ids", "material_ids"):
            values = getattr(self, field)
            if values is not None:
                if not isinstance(values, (set, frozenset, list, tuple)) or any(not isinstance(value, str) or not value for value in values):
                    raise DomainError("Invalid input scope", 403)
                object.__setattr__(self, field, frozenset(values))
        if self.run_id is not None and (not isinstance(self.run_id, str) or not self.run_id.strip()
                                        or len(self.run_id) > 160 or self.artifact_ids is None or self.material_ids is None):
            raise DomainError("Tool submission requires a run and explicit input scope", 403)
        if self.report_selection is not None and (not isinstance(self.report_selection, ReportSelection) or self.run_id is None):
            raise DomainError("Report selection requires a trusted run scope", 403)


class EvidenceInput(ContractModel):
    material_id: Identifier


class UploadedEvidenceInput(ContractModel):
    pdf_key: Digest
    title: str = Field(min_length=1, max_length=500)


class ReportInput(ContractModel):
    pass


INPUTS = {"audit": AuditInput, "split": SplitInput, "benchmark": BenchmarkInput,
          "failure": FailureInput, "evidence": EvidenceInput, "report": ReportInput}
ACTION_PREFIX = "action:v1:"


def identity_key(scope, request_key, action_id, attempt_id):
    if scope.run_id is not None:
        if request_key is not None or any(not isinstance(value, str) or not value.strip() or len(value) > 160
                                          for value in (action_id, attempt_id)):
            raise DomainError("Tool submission requires action and attempt IDs, not a client request key")
        digest = request_digest("tool_action", {"run_id": scope.run_id, "action_id": action_id, "attempt_id": attempt_id})
        return ACTION_PREFIX + digest
    if action_id is not None or attempt_id is not None:
        raise DomainError("Action identities require a trusted run scope", 403)
    if not isinstance(request_key, str) or not request_key.strip() or len(request_key) > 100:
        raise DomainError("Provide an Idempotency-Key of 1–100 characters")
    if request_key.startswith(ACTION_PREFIX):
        raise DomainError("This request-key namespace is reserved for tool actions")
    return request_key


class SubmissionService:
    def __init__(self, db, store, settings):
        self.db, self.store, self.settings = db, store, settings

    def submit(self, scope, kind, payload, *, request_key=None, action_id=None, attempt_id=None, retry_of_job_id=None):
        return self._submit(scope, kind, payload, request_key=request_key, action_id=action_id,
                            attempt_id=attempt_id, retry_of_job_id=retry_of_job_id)

    def submit_outcome(self, scope, payload, *, actor, request_key=None, action_id=None, attempt_id=None):
        """Actor comes from the trusted caller, never from provider arguments."""
        from .outcomes import submit_outcome
        return submit_outcome(self, scope, payload, actor=actor, request_key=request_key,
                              action_id=action_id, attempt_id=attempt_id)

    def submit_pdf(self, scope, raw, title, *, request_key):
        """Compatibility upload; tools must reference an allowed material instead."""
        if not isinstance(scope, SubmissionScope):
            raise DomainError("A trusted submission scope is required", 403)
        if scope.run_id is not None or scope.material_ids is not None or scope.artifact_ids is not None:
            raise DomainError("Scoped callers must ingest an attached PDF", 403)
        if not isinstance(raw, bytes):
            raise DomainError("Upload a PDF document as bytes")
        if len(raw) > self.settings.max_upload_bytes:
            raise DomainError("Upload exceeds configured byte limit", 413)
        if not raw.startswith(b"%PDF-"):
            raise DomainError("Upload a PDF document")
        if not isinstance(title, str) or not title.strip():
            raise DomainError("Provide a title of 1–500 characters")
        return self._submit(scope, "evidence", {"pdf_key": hashlib.sha256(raw).hexdigest(), "title": title},
                            request_key=request_key, raw_pdf=raw)

    def _submit(self, scope, kind, payload, *, request_key=None, action_id=None, attempt_id=None,
                retry_of_job_id=None, raw_pdf=None):
        if not isinstance(scope, SubmissionScope):
            raise DomainError("A trusted submission scope is required", 403)
        key = identity_key(scope, request_key, action_id, attempt_id)
        if retry_of_job_id is not None and (not isinstance(retry_of_job_id, str) or not retry_of_job_id.strip() or len(retry_of_job_id) > 160):
            raise DomainError("Invalid retry job reference")
        model = UploadedEvidenceInput if raw_pdf is not None else INPUTS.get(kind) if isinstance(kind, str) else None
        if model is None:
            raise DomainError("Unsupported operation", 422, "UNSUPPORTED_CAPABILITY")
        try:
            finite_json(payload)
            encoded = json.dumps(payload, allow_nan=False).encode("utf-8")
            if len(encoded) > self.settings.max_upload_bytes:
                raise DomainError("Request exceeds configured byte limit", 413)
            canonical = model.model_validate(payload).model_dump(mode="json")
        except (ValidationError, TypeError, ValueError, RecursionError):
            raise DomainError("Invalid operation request", 422, "VALIDATION_FAILED") from None

        def prepare(session):
            # Scope is checked even on replay. Idempotency is not authority.
            project(session, scope.project_id)
            accepted = dict(canonical)
            self._scope(scope, kind, canonical)
            old = session.scalar(select(JobRow).where(JobRow.project_id == scope.project_id, JobRow.request_key == key))
            if kind == "report":
                request = report_request(scope)
                if old is not None:
                    if old.kind != kind or old.payload.get("request", old.payload) != request or old.retry_of_job_id != retry_of_job_id:
                        raise DomainError("Idempotency key was used for a different request", 409)
                    # Pre-B06 jobs have no capture. Replay preserves their identity;
                    # execution fails closed rather than recapturing newer state.
                    if "snapshot" in old.payload:
                        authorize_snapshot(read_snapshot(old.payload), scope)
                    return old.payload, old
                if retry_of_job_id is not None:
                    prior = session.get(JobRow, retry_of_job_id)
                    if prior is None or prior.project_id != scope.project_id:
                        raise DomainError("Retry job not found in this project", 404, "JOB_NOT_FOUND")
                    if prior.kind != "report" or prior.payload.get("request") != request:
                        raise DomainError("Retry must preserve the original report selection", 422, "LINEAGE_MISMATCH")
                    if prior.state != "failed":
                        raise DomainError("Only a failed terminal job can be retried")
                    authorize_snapshot(read_snapshot(prior.payload), scope)
                    return prior.payload, None
                self._admit(session, scope, kind, request, None)
                return freeze(session, scope, request), None
            if old is not None:
                same_input = (old.payload.get("material_id") == canonical["material_id"]
                              if kind == "evidence" and raw_pdf is None
                              else old.request_digest == request_digest(kind, canonical))
                if old.kind != kind or not same_input or old.retry_of_job_id != retry_of_job_id:
                    raise DomainError("Idempotency key was used for a different request", 409)
            if kind == "evidence" and raw_pdf is None:
                mid = canonical["material_id"]
                source = material(session, scope.project_id, mid)
                if source.media_type != "application/pdf":
                    raise DomainError("Evidence ingestion requires a PDF attachment")
                accepted = {"pdf_key": source.blob_key, "title": source.filename, "material_id": source.id}
            operation_inputs(session, scope.project_id, kind, accepted,
                             allowed_ids=scope.artifact_ids, material_ids=scope.material_ids)
            if old is not None:
                if old.request_digest != request_digest(kind, accepted) or old.retry_of_job_id != retry_of_job_id:
                    raise DomainError("Idempotency key was used for a different request", 409)
                return accepted, old
            self._admit(session, scope, kind, accepted, retry_of_job_id)
            return accepted, None

        if raw_pdf is not None:
            # Validate/replay before blob I/O; release metadata before fsync. The
            # locked transaction below rechecks state after immutable publication.
            with self.db.session() as session:
                _, old = prepare(session)
                if old is not None:
                    return old
            self.store.put(raw_pdf)

        with self.db.session.begin() as session:
            lock_project(session, scope.project_id)
            accepted, old = prepare(session)
            job = old if old is not None else submit_job(session, scope.project_id, kind, accepted, key,
                                                        retry_of_job_id=retry_of_job_id)
        # The transaction is committed before HTTP serialization or tool return.
        return job

    def _scope(self, scope, kind, payload):
        if scope.run_id is not None and kind == "benchmark":
            raise DomainError("Agent baselines require a sealed evaluation candidate", 422, "UNSUPPORTED_CAPABILITY")
        if scope.run_id is not None and kind == "failure":
            raise DomainError("Agent outcome recording requires the actor-aware failure service", 422, "UNSUPPORTED_CAPABILITY")
        if kind == "report" and scope.report_selection is None and (scope.run_id is not None or scope.artifact_ids is not None or scope.material_ids is not None):
            raise DomainError("Restricted reports require run-scoped report capture", 422, "UNSUPPORTED_CAPABILITY")
        for field in ("dataset_id", "audit_id", "split_id", "benchmark_id"):
            aid = payload.get(field)
            if aid is not None and scope.artifact_ids is not None and aid not in scope.artifact_ids:
                raise DomainError("Artifact is outside the authorized input scope", 403)
        if kind == "evidence" and "material_id" in payload and scope.material_ids is not None and payload["material_id"] not in scope.material_ids:
            raise DomainError("Attachment is outside the authorized input scope", 403)

    def _admit(self, session, scope, kind, payload, retry_of_job_id):
        ensure_lineage(session, scope.project_id, kind, payload)
        if retry_of_job_id is not None:
            old = session.get(JobRow, retry_of_job_id)
            if old is None or old.project_id != scope.project_id:
                raise DomainError("Retry job not found in this project", 404, "JOB_NOT_FOUND")
            if old.kind != kind or old.request_digest != request_digest(kind, payload):
                raise DomainError("Retry must preserve the original operation and payload", 422, "LINEAGE_MISMATCH")
            if old.state != "failed":
                raise DomainError("Only a failed terminal job can be retried", 422, "VALIDATION_FAILED")
            if kind == "failure":
                from .db import ExternalOperationRow
                if session.get(ExternalOperationRow, old.id) is not None:
                    raise DomainError("Reconcile the original external operation before making a new assessment", 409)
        if kind == "benchmark":
            from .adapters import benchmark_source
            data = artifact(session, scope.project_id, payload["dataset_id"], "dataset")
            try:
                benchmark_source(data)
            except ValueError:
                raise DomainError("Benchmark requires resolved source declarations", 422, "ADMISSION_REJECTED") from None
        if kind == "report" and scope.report_selection is None:
            active = session.scalar(select(JobRow.id).where(JobRow.project_id == scope.project_id,
                JobRow.state.in_(["queued", "running"]), JobRow.kind != "report").limit(1))
            if active:
                raise DomainError("Wait for active jobs before exporting a report", 409, "PROJECT_BUSY")

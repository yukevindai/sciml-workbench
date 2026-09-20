"""Scoped reads; C12 owns benchmark projection and exposure decisions."""
import base64
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import hmac
import json
from typing import Literal, get_args

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import load_only
from .artifacts import ArtifactResolver, artifact_download, material_download
from .contract_core import ErrorCode
from .contract_registry import ARTIFACT_READERS
from .db import ArtifactRow, ExternalOperationRow, JobRow
from .errors import DomainError
from .read_contracts import ArtifactPage, ArtifactSummary, ExternalReceiptProjection, JobDetail, JobPage
from .services import project


@dataclass(frozen=True)
class ReadScope:
    project_id: str
    audience: Literal["manual", "agent"] = "manual"
    run_id: str | None = None
    artifact_ids: frozenset[str] | None = None
    job_ids: frozenset[str] | None = None
    protocol_id: str | None = None
    purpose: Literal["selection", "final"] = "selection"

    def __post_init__(self):
        for name in ("artifact_ids", "job_ids"):
            values = getattr(self, name)
            if values is not None:
                if not isinstance(values, (set, frozenset, list, tuple)) or any(not isinstance(v, str) or not v for v in values):
                    raise DomainError("Invalid trusted read scope", 403)
                object.__setattr__(self, name, frozenset(values))


def authorize(session, scope):
    if not isinstance(scope, ReadScope) or scope.audience not in {"manual", "agent"}:
        raise DomainError("A trusted read scope is required", 403)
    if scope.audience == "agent" and (not scope.run_id or scope.artifact_ids is None or scope.job_ids is None
                                      or scope.purpose not in {"selection", "final"}):
        raise DomainError("Agent reads require an explicit run and input scope", 403, "DATA_EXPOSURE_DENIED")
    project(session, scope.project_id)


def utc(stamp):
    return stamp.replace(tzinfo=timezone.utc) if stamp is not None and stamp.tzinfo is None else stamp


def safe_job_fields(job):
    code = job.error_code if job.error_code in get_args(ErrorCode) else ("INTERNAL_ERROR" if job.error else None)
    return dict(id=job.id, project_id=job.project_id, kind=job.kind, state=job.state, result_id=job.result_id,
                error="Operation did not complete; inspect its safe error code." if job.error or code else None,
                error_code=code, retry_of_job_id=job.retry_of_job_id, deadline_at=utc(job.deadline_at),
                created_at=utc(job.created_at), started_at=utc(job.started_at), finished_at=utc(job.finished_at))


def receipt_projection(row):
    if row is None:
        return None
    return ExternalReceiptProjection(external_id=row.job_id, connector=row.connector, state=row.state,
        request_sha256=row.request_sha256, body_sha256=row.body_sha256, attempts=row.attempts,
        submitted_at=utc(row.submitted_at), external_project_id=row.external_project_id,
        external_record_id=row.external_record_id,
        artifact_id=row.artifact_id, reconciliation_required=row.state == "unknown")


class ReadService:
    def __init__(self, cursor_secret):
        self.key = hmac.digest(cursor_secret.encode(), b"workbench-read-cursor-v1", "sha256")

    def _cursor(self, context, row):
        body = json.dumps([1, context, utc(row.created_at).isoformat(), row.id], separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(body + hmac.digest(self.key, body, "sha256")).decode().rstrip("=")

    def _after(self, cursor, context):
        try:
            if not isinstance(cursor, str) or len(cursor) > 2048:
                raise ValueError()
            raw = base64.b64decode(cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True)
            body, signature = raw[:-32], raw[-32:]
            if not hmac.compare_digest(signature, hmac.digest(self.key, body, "sha256")):
                raise ValueError()
            version, binding, stamp, identifier = json.loads(body)
            parsed = datetime.fromisoformat(stamp)
            if version != 1 or binding != context or parsed.tzinfo is None or not isinstance(identifier, str):
                raise ValueError()
            return parsed, identifier
        except (ValueError, TypeError, UnicodeError):
            raise DomainError("Invalid pagination cursor", 422) from None

    def _page(self, session, scope, table, resource, kind, after, limit):
        authorize(session, scope)
        kinds = {k for k, _ in ARTIFACT_READERS} if resource == "artifacts" else {"audit", "split", "benchmark", "evidence", "failure", "report"}
        if type(limit) is not int or not 1 <= limit <= 100 or (kind is not None and kind not in kinds):
            raise DomainError("Invalid page limit or kind filter")
        context = [scope.project_id, scope.audience, resource, kind]
        if scope.audience == "agent":
            from .request_identity import request_digest
            context.append(request_digest("read_scope", {"run_id": scope.run_id, "protocol_id": scope.protocol_id,
                "purpose": scope.purpose, "artifact_ids": sorted(scope.artifact_ids), "job_ids": sorted(scope.job_ids)}))
        fields = (table.id, table.project_id, table.kind, table.created_at,
                  table.payload["schema_version"].as_string().label("schema_version")) if resource == "artifacts" else (table,)
        query = select(*fields).where(table.project_id == scope.project_id)
        if scope.audience == "agent":
            query = query.where(table.id.in_(scope.artifact_ids if resource == "artifacts" else scope.job_ids))
        if resource == "jobs":
            query = query.options(load_only(*JOB_FIELDS))
        if kind is not None:
            query = query.where(table.kind == kind)
        if after is not None:
            stamp, identifier = self._after(after, context)
            query = query.where(or_(table.created_at > stamp, and_(table.created_at == stamp, table.id > identifier)))
        query = query.order_by(table.created_at, table.id).limit(limit + 1)
        rows = session.execute(query).all() if resource == "artifacts" else session.scalars(query).all()
        cursor = self._cursor(context, rows[limit - 1]) if len(rows) > limit else None
        return rows[:limit], cursor

    def artifact_index(self, session, scope, *, kind=None, after=None, limit=50):
        rows, cursor = self._page(session, scope, ArtifactRow, "artifacts", kind, after, limit)
        return ArtifactPage(items=[ArtifactSummary(id=r.id, project_id=r.project_id, kind=r.kind,
            schema_version=r.schema_version, created_at=utc(r.created_at)) for r in rows], next_cursor=cursor)

    def job_index(self, session, scope, *, kind=None, after=None, limit=50):
        rows, cursor = self._page(session, scope, JobRow, "jobs", kind, after, limit)
        receipts = self._receipts(session, scope.project_id, [r.id for r in rows])
        return JobPage(items=[JobDetail(**safe_job_fields(r), external_receipt=receipt_projection(receipts.get(r.id)))
                              for r in rows], next_cursor=cursor)

    def job(self, session, scope, job_id):
        authorize(session, scope)
        if scope.audience == "agent" and job_id not in scope.job_ids:
            raise DomainError("Job is outside the authorized input scope", 403)
        job = session.scalar(select(JobRow).options(load_only(*JOB_FIELDS)).where(JobRow.id == job_id, JobRow.project_id == scope.project_id))
        if job is None:
            raise DomainError("Job not found in this project", 404, "JOB_NOT_FOUND")
        receipt = self._receipts(session, scope.project_id, [job.id]).get(job.id)
        return JobDetail(**safe_job_fields(job), external_receipt=receipt_projection(receipt))

    @staticmethod
    def _receipts(session, project_id, job_ids):
        if not job_ids:
            return {}
        r = ExternalOperationRow
        fields = [getattr(r, name) for name in ("job_id", "connector", "state", "request_sha256", "body_sha256",
                  "attempts", "submitted_at", "external_project_id", "artifact_id")]
        fields.append(r.receipt["external_record_id"].as_string().label("external_record_id"))
        return {row.job_id: row for row in session.execute(select(*fields).where(
            r.project_id == project_id, r.job_id.in_(job_ids)))}

    def artifact(self, session, scope, artifact_id):
        authorize(session, scope)
        value = ArtifactResolver(session, scope.project_id, scope.artifact_ids).resolve(artifact_id)
        if scope.audience == "agent":
            if value.kind != "benchmark":
                raise DomainError("Use a typed evidence or evaluation projection; raw artifacts are quarantined", 403, "DATA_EXPOSURE_DENIED")
            from .evaluation import evaluation_view
            return evaluation_view(session, scope, value)
        if len(value.model_dump_json().encode()) > 32 * 1024 * 1024:
            raise DomainError("Artifact exceeds the bounded detail response limit", 422, "UNSUPPORTED_CAPABILITY")
        from .evaluation import expose_artifact
        expose_artifact(session, scope.project_id, value, via="artifact_detail")
        return value

    def download(self, session, scope, identifier, *, material=False, representation="default"):
        authorize(session, scope)
        if scope.audience == "agent":
            raise DomainError("Raw data, predictions, bundles and reports are quarantined; use typed projections", 403, "DATA_EXPOSURE_DENIED")
        from .evaluation import expose_artifact
        if material:
            from .artifacts import resolve_material
            value = resolve_material(session, scope.project_id, identifier)
            if value.dataset_id:
                expose_artifact(session, scope.project_id, ArtifactResolver(session, scope.project_id).resolve(value.dataset_id), via="material_download", raw=True)
            return material_download(session, scope.project_id, identifier)
        value = ArtifactResolver(session, scope.project_id).resolve(identifier)
        result = artifact_download(session, scope.project_id, identifier, representation)
        expose_artifact(session, scope.project_id, value, via="artifact_download", raw=True)
        return result


JOB_FIELDS = [getattr(JobRow, name) for name in ("id", "project_id", "kind", "state", "result_id", "error_code",
              "error", "retry_of_job_id", "deadline_at", "created_at", "started_at", "finished_at")]

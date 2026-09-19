import hmac
from datetime import datetime, timezone
from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select, text
from .config import load_settings
from .contracts import (
    Artifact,
    Dataset,
    AuditInput,
    BenchmarkInput,
    FailureInput,
    ProjectInput,
    Source,
    SplitInput,
)
from .contract_core import ErrorResponse
from .contracts import uid
from .http_contracts import LegacyJobResponse as JobResponse, ProjectResponse
from .schema_catalog import add_openapi_contracts
from .db import ArtifactRow, Database, JobRow, ProjectRow
from .job_metadata import submit_job
from .services import DomainError, artifact, project, upload_csv
from .storage import LocalStore, StorageError, StorageIntegrityError


def job_json(j):
    value = {
        k: getattr(j, k)
        for k in (
            "id",
            "project_id",
            "kind",
            "state",
            "result_id",
            "error",
            "created_at",
            "started_at",
            "finished_at",
        )
    }
    # These columns are written in UTC; SQLite drops their timezone on read.
    for key in ("created_at", "started_at", "finished_at"):
        stamp = value[key]
        if isinstance(stamp, datetime) and stamp.tzinfo is None:
            value[key] = stamp.replace(tzinfo=timezone.utc)
    return value


def create_app(settings=None):
    settings = settings or load_settings()
    settings.validate_secrets()
    app = FastAPI(
        title="SciML Workbench",
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        separate_input_output_schemas=False,
        responses={status: {"model": ErrorResponse} for status in (401, 403, 404, 409, 413, 422, 500, 503)},
    )
    db, store = Database(settings.database_url), LocalStore(settings.storage_root)
    app.state.db, app.state.store = db, store

    original_openapi = app.openapi

    def openapi():
        if app.openapi_schema is None:
            app.openapi_schema = add_openapi_contracts(original_openapi())
            # HTTPStatus changed these defaults in Python 3.13. Preserve the
            # published descriptions and key ordering on Python 3.12 as well.
            for path in app.openapi_schema["paths"].values():
                for operation in path.values():
                    if not isinstance(operation, dict):
                        continue
                    for status, old, current in (
                        ("413", "Request Entity Too Large", "Content Too Large"),
                        ("422", "Unprocessable Entity", "Unprocessable Content"),
                    ):
                        response = operation.get("responses", {}).get(status, {})
                        if response.get("description") == old:
                            response["description"] = current
        return app.openapi_schema

    app.openapi = openapi

    def error_response(request, message, code, status, details=None):
        fields = dict(error=message, error_code=code, request_id=request.state.request_id)
        if details is not None:
            fields["details"] = details
        value = ErrorResponse(**fields)
        return JSONResponse(value.model_dump(mode="json", exclude_unset=True), status_code=status)

    def session():
        with db.session.begin() as s:
            yield s

    def auth(authorization: str = Header(default="")):
        if not hmac.compare_digest(
            authorization.encode(),
            ("Bearer " + settings.api_token.get_secret_value()).encode(),
        ):
            raise DomainError("Unauthorized", 401)

    @app.exception_handler(DomainError)
    async def domain_error(request, exc):
        return error_response(request, exc.message, exc.error_code, exc.status)

    @app.exception_handler(StorageError)
    async def storage_error(request, exc):
        status = 500 if isinstance(exc, StorageIntegrityError) else 503
        return error_response(request, str(exc), exc.error_code, status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return error_response(
            request, "Invalid request", "VALIDATION_FAILED", 422,
            [{"loc": e["loc"], "msg": e["msg"]} for e in exc.errors()],
        )

    @app.exception_handler(Exception)
    async def unexpected(request, exc):
        return error_response(
            request, "Internal service error. Check server configuration and storage availability.",
            "INTERNAL_ERROR", 500,
        )

    @app.middleware("http")
    async def limit_body(request, call_next):
        request.state.request_id = uid()
        # Bound bodies before FastAPI parses JSON; uploads use raw bytes.
        if request.method in {"POST", "PUT", "PATCH"}:
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > settings.max_upload_bytes:
                    res = error_response(request, "Upload exceeds configured byte limit", "UPLOAD_TOO_LARGE", 413)
                    res.headers["X-Request-ID"] = request.state.request_id
                    res.headers["Cache-Control"] = "no-store"
                    return res
            request._body = bytes(body)
        res = await call_next(request)
        res.headers["Cache-Control"] = "no-store"
        res.headers["X-Content-Type-Options"] = "nosniff"
        res.headers["X-Request-ID"] = request.state.request_id
        return res

    @app.get("/health")
    def health(s=Depends(session)):
        s.execute(text("SELECT 1"))
        return {"status": "ok"}

    protected = [Depends(auth)]

    @app.get("/api/v1/schema", dependencies=protected)
    def schema():
        return app.openapi()

    @app.get("/api/v1/projects", dependencies=protected, response_model=list[ProjectResponse])
    def projects(s=Depends(session)):
        return [
            {"id": p.id, "name": p.name, "description": p.description}
            for p in s.scalars(
                select(ProjectRow).order_by(ProjectRow.created_at.desc())
            )
        ]

    @app.post("/api/v1/projects", dependencies=protected, status_code=201, response_model=ProjectResponse)
    def create_project(payload: ProjectInput, s=Depends(session)):
        p = ProjectRow(**payload.model_dump())
        s.add(p)
        s.flush()
        return {"id": p.id, "name": p.name, "description": p.description}

    @app.get("/api/v1/projects/{pid}/artifacts", dependencies=protected, response_model=list[Artifact])
    def artifacts(pid: str, s=Depends(session)):
        project(s, pid)
        return [
            a.payload
            for a in s.scalars(
                select(ArtifactRow)
                .where(ArtifactRow.project_id == pid)
                .order_by(ArtifactRow.created_at)
            )
        ]

    @app.get("/api/v1/projects/{pid}/artifacts/{aid}", dependencies=protected, response_model=Artifact)
    def get_artifact(pid: str, aid: str, s=Depends(session)):
        return artifact(s, pid, aid)

    @app.post(
        "/api/v1/projects/{pid}/datasets", dependencies=protected, status_code=201, response_model=Dataset
    )
    async def upload(
        pid: str,
        request: Request,
        x_filename: str = Header(default="dataset.csv"),
        x_source: str = Header(),
        s=Depends(session),
    ):
        try:
            source = Source.model_validate_json(x_source)
        except ValueError as exc:
            raise DomainError(
                "X-Source must contain valid source metadata JSON"
            ) from exc
        return upload_csv(
            s, store, settings, pid, await request.body(), x_filename, source
        )

    def queue(s, pid, kind, payload, key):
        return job_json(submit_job(s, pid, kind, payload, key))

    @app.post("/api/v1/projects/{pid}/audit", dependencies=protected, status_code=202, response_model=JobResponse, response_model_exclude_unset=True)
    def audit(
        pid: str,
        payload: AuditInput,
        idempotency_key: str = Header(),
        s=Depends(session),
    ):
        return queue(s, pid, "audit", payload.model_dump(), idempotency_key)

    @app.post("/api/v1/projects/{pid}/split", dependencies=protected, status_code=202, response_model=JobResponse, response_model_exclude_unset=True)
    def split(
        pid: str,
        payload: SplitInput,
        idempotency_key: str = Header(),
        s=Depends(session),
    ):
        return queue(s, pid, "split", payload.model_dump(), idempotency_key)

    @app.post(
        "/api/v1/projects/{pid}/benchmark", dependencies=protected, status_code=202, response_model=JobResponse, response_model_exclude_unset=True
    )
    def benchmark(
        pid: str,
        payload: BenchmarkInput,
        idempotency_key: str = Header(),
        s=Depends(session),
    ):
        return queue(s, pid, "benchmark", payload.model_dump(), idempotency_key)

    @app.post("/api/v1/projects/{pid}/failure", dependencies=protected, status_code=202, response_model=JobResponse, response_model_exclude_unset=True)
    def failure(
        pid: str,
        payload: FailureInput,
        idempotency_key: str = Header(),
        s=Depends(session),
    ):
        return queue(s, pid, "failure", payload.model_dump(), idempotency_key)

    @app.post(
        "/api/v1/projects/{pid}/evidence", dependencies=protected, status_code=202, response_model=JobResponse, response_model_exclude_unset=True
    )
    async def evidence(
        pid: str,
        request: Request,
        x_title: str = Header(),
        idempotency_key: str = Header(),
        s=Depends(session),
    ):
        project(s, pid)
        if not x_title.strip() or len(x_title) > 500:
            raise DomainError("Provide a title of 1–500 characters")
        raw = await request.body()
        if not raw.startswith(b"%PDF-"):
            raise DomainError("Upload a PDF document")
        key = store.put(raw)
        return queue(
            s, pid, "evidence", {"pdf_key": key, "title": x_title}, idempotency_key
        )

    @app.post("/api/v1/projects/{pid}/report", dependencies=protected, status_code=202, response_model=JobResponse, response_model_exclude_unset=True)
    def report(pid: str, idempotency_key: str = Header(), s=Depends(session)):
        # A reproducible export must describe settled work, not partial tasks.
        active = s.scalar(
            select(JobRow)
            .where(
                JobRow.project_id == pid,
                JobRow.state.in_(["queued", "running"]),
                JobRow.kind != "report",
            )
            .limit(1)
        )
        if active:
            raise DomainError("Wait for active jobs before exporting a report", 409, "PROJECT_BUSY")
        return queue(s, pid, "report", {}, idempotency_key)

    @app.get("/api/v1/projects/{pid}/jobs", dependencies=protected, response_model=list[JobResponse], response_model_exclude_unset=True)
    def jobs(pid: str, s=Depends(session)):
        project(s, pid)
        return [
            job_json(j)
            for j in s.scalars(
                select(JobRow)
                .where(JobRow.project_id == pid)
                .order_by(JobRow.created_at.desc())
            )
        ]

    @app.get("/api/v1/projects/{pid}/artifacts/{aid}/download", dependencies=protected)
    def download(pid: str, aid: str, s=Depends(session)):
        a = artifact(s, pid, aid)
        key = getattr(a, "blob_key", None) or getattr(a, "bundle_key", None)
        if not key:
            raise DomainError("Artifact has no downloadable file", 404)
        ext = "csv" if a.kind == "dataset" else "zip"
        return Response(
            store.get(key),
            media_type="text/csv" if ext == "csv" else "application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{a.kind}-{a.id}.{ext}"'
            },
        )

    return app

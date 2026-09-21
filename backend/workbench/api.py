import hmac
from typing import Literal
from fastapi import Depends, FastAPI, Header, Request, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from sqlalchemy import select, text
from .config import load_settings
from .contracts import (
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
from .submission import SubmissionScope, SubmissionService
from .services import DomainError, project, upload_csv
from .storage import LocalStore, StorageError, StorageIntegrityError
from .http_contracts import IntakeArtifact, IntakeDataset, MaterialResponse
from .scientific_contracts import SourceDeclarations
from . import intake
from .db import MaterialRow
from .artifacts import ArtifactResolver

from .capabilities import capabilities
from .projections import ReadScope, ReadService, safe_job_fields
from .read_contracts import Capabilities, JobDetail, JobPage, ArtifactPage
from .read_contracts import EvaluationStatusView


def job_json(j):
    safe = safe_job_fields(j)
    return {field: safe[field] for field in JobResponse.model_fields}



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
    submissions = SubmissionService(db, store, settings)
    app.state.submissions = submissions
    reads = ReadService(settings.api_token.get_secret_value())
    app.state.reads = reads

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

    @app.get("/api/v1/capabilities", dependencies=protected, response_model=Capabilities)
    def get_capabilities():
        return capabilities(settings)

    @app.get("/api/v1/projects/{pid}/artifact-index", dependencies=protected, response_model=ArtifactPage)
    def artifact_index(pid: str, after: str | None = Query(default=None, max_length=2048),
                       limit: int = Query(default=50, ge=1, le=100), kind: str | None = Query(default=None, max_length=40), s=Depends(session)):
        return reads.artifact_index(s, ReadScope(pid), after=after, limit=limit, kind=kind)

    @app.get("/api/v1/projects/{pid}/evaluations/{protocol_id}", dependencies=protected, response_model=EvaluationStatusView)
    def get_evaluation(pid: str, protocol_id: str, s=Depends(session)):
        from .evaluation import evaluation_status
        project(s, pid)
        return evaluation_status(s, ReadScope(pid), protocol_id)

    @app.get("/api/v1/projects/{pid}/job-index", dependencies=protected, response_model=JobPage)
    def job_index(pid: str, after: str | None = Query(default=None, max_length=2048),
                  limit: int = Query(default=50, ge=1, le=100), kind: str | None = Query(default=None, max_length=40), s=Depends(session)):
        return reads.job_index(s, ReadScope(pid), after=after, limit=limit, kind=kind)

    @app.get("/api/v1/projects/{pid}/jobs/{jid}", dependencies=protected, response_model=JobDetail)
    def get_job(pid: str, jid: str, s=Depends(session)):
        return reads.job(s, ReadScope(pid), jid)

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

    @app.get("/api/v1/projects/{pid}/artifacts", dependencies=protected, response_model=list[IntakeArtifact])
    def artifacts(pid: str, s=Depends(session)):
        project(s, pid)
        resolver = ArtifactResolver(s, pid)
        values = [
            resolver.resolve(a.id)
            for a in s.scalars(
                select(ArtifactRow)
                .where(ArtifactRow.project_id == pid)
                .order_by(ArtifactRow.created_at)
            )
        ]
        from .evaluation import expose_artifact
        for value in values:
            expose_artifact(s, pid, value, via="artifact_list")
        s.commit()  # Exposure must be durable before any result leaves the server.
        return values

    @app.get("/api/v1/projects/{pid}/artifacts/{aid}", dependencies=protected, response_model=IntakeArtifact)
    def get_artifact(pid: str, aid: str, s=Depends(session)):
        value = reads.artifact(s, ReadScope(pid), aid)
        s.commit()
        return value

    @app.post(
        "/api/v1/projects/{pid}/datasets", dependencies=protected, status_code=201, response_model=IntakeDataset
    )
    async def upload(
        pid: str,
        request: Request,
        x_filename: str = Header(default="dataset.csv"),
        x_source: str | None = Header(default=None),
        s=Depends(session),
    ):
        if x_source is None:
            return intake.dataset(s, store, settings, pid, await request.body(), x_filename)
        try:
            source = Source.model_validate_json(x_source)
        except ValueError as exc:
            raise DomainError(
                "X-Source must contain valid source metadata JSON"
            ) from exc
        return upload_csv(
            s, store, settings, pid, await request.body(), x_filename, source
        )

    def material_json(value):
        return {field: getattr(value, field) for field in MaterialResponse.model_fields}

    @app.post("/api/v1/projects/{pid}/research-materials", dependencies=protected,
              status_code=201, response_model=MaterialResponse)
    async def attach(pid: str, request: Request, x_filename: str = Header(),
                     content_type: str = Header(), idempotency_key: str = Header(),
                     x_source: str | None = Header(default=None), s=Depends(session)):
        try:
            source = SourceDeclarations.model_validate_json(x_source) if x_source is not None else None
        except ValueError as exc:
            raise DomainError("X-Source must contain valid source declarations JSON") from exc
        value = intake.attach(s, store, settings, pid, await request.body(), x_filename,
                              content_type.split(";", 1)[0].strip().lower(), source, idempotency_key)
        return material_json(value)

    @app.get("/api/v1/projects/{pid}/research-materials", dependencies=protected,
             response_model=list[MaterialResponse])
    def materials(pid: str, s=Depends(session)):
        project(s, pid)
        return [material_json(intake.material(s, pid, value.id)) for value in s.scalars(select(MaterialRow).where(MaterialRow.project_id == pid))]

    @app.get("/api/v1/projects/{pid}/research-materials/{mid}/download", dependencies=protected)
    def download_material(pid: str, mid: str, s=Depends(session)):
        value = reads.download(s, ReadScope(pid), mid, material=True)
        raw = store.get(value.key)
        s.commit()
        return Response(raw, media_type=value.media_type,
                        headers={"Content-Disposition": f'attachment; filename="{value.filename}"'})

    @app.post("/api/v1/projects/{pid}/research-materials/{mid}/ingest", dependencies=protected,
              status_code=202, response_model=JobResponse, response_model_exclude_unset=True)
    def ingest_material(pid: str, mid: str, idempotency_key: str = Header()):
        return queue(pid, "evidence", {"material_id": mid}, idempotency_key)

    def queue(pid, kind, payload, key):
        return job_json(submissions.submit(SubmissionScope(pid), kind, payload, request_key=key))

    @app.post("/api/v1/projects/{pid}/audit", dependencies=protected, status_code=202, response_model=JobResponse, response_model_exclude_unset=True)
    def audit(
        pid: str,
        payload: AuditInput,
        idempotency_key: str = Header(),
    ):
        return queue(pid, "audit", payload.model_dump(), idempotency_key)

    @app.post("/api/v1/projects/{pid}/split", dependencies=protected, status_code=202, response_model=JobResponse, response_model_exclude_unset=True)
    def split(
        pid: str,
        payload: SplitInput,
        idempotency_key: str = Header(),
    ):
        return queue(pid, "split", payload.model_dump(), idempotency_key)

    @app.post(
        "/api/v1/projects/{pid}/benchmark", dependencies=protected, status_code=202, response_model=JobResponse, response_model_exclude_unset=True
    )
    def benchmark(
        pid: str,
        payload: BenchmarkInput,
        idempotency_key: str = Header(),
    ):
        return queue(pid, "benchmark", payload.model_dump(), idempotency_key)

    @app.post("/api/v1/projects/{pid}/failure", dependencies=protected, status_code=202, response_model=JobResponse, response_model_exclude_unset=True)
    def failure(
        pid: str,
        payload: FailureInput,
        idempotency_key: str = Header(),
    ):
        return queue(pid, "failure", payload.model_dump(), idempotency_key)

    @app.post(
        "/api/v1/projects/{pid}/evidence", dependencies=protected, status_code=202, response_model=JobResponse, response_model_exclude_unset=True
    )
    async def evidence(
        pid: str,
        request: Request,
        x_title: str = Header(),
        idempotency_key: str = Header(),
    ):
        raw = await request.body()
        job = await run_in_threadpool(submissions.submit_pdf, SubmissionScope(pid), raw, x_title, request_key=idempotency_key)
        return job_json(job)

    @app.post("/api/v1/projects/{pid}/report", dependencies=protected, status_code=202, response_model=JobResponse, response_model_exclude_unset=True)
    def report(pid: str, idempotency_key: str = Header()):
        return queue(pid, "report", {}, idempotency_key)

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
    def download(pid: str, aid: str, representation: Literal["default", "original", "bundle"] = "default", s=Depends(session)):
        value = reads.download(s, ReadScope(pid), aid, representation=representation)
        raw = store.get(value.key)
        s.commit()
        return Response(
            raw,
            media_type=value.media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{value.filename}"'
            },
        )

    from .agent_runs import RunService
    from .agent_api import router as agent_router
    from .agent_runtime import admission
    app.state.runs = RunService(admission=admission)
    app.include_router(agent_router(app.state.runs, session, protected, settings=settings))
    return app

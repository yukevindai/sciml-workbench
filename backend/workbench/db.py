from sqlalchemy import (
    JSON,
    DateTime,
    BigInteger,
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    event,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from .contracts import now, uid
from .request_identity import request_digest


class Base(DeclarativeBase):
    pass


class ProjectRow(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(default="")
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), default=now)


class ArtifactRow(Base):
    __tablename__ = "artifacts"
    __table_args__ = (UniqueConstraint("project_id", "id", name="uq_artifacts_project_id_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    kind: Mapped[str] = mapped_column(String(24), index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), default=now)


class MaterialRow(Base):
    __tablename__ = "research_materials"
    __table_args__ = (
        UniqueConstraint("project_id", "request_key", name="uq_materials_project_request"),
        ForeignKeyConstraint(["project_id", "dataset_id"], ["artifacts.project_id", "artifacts.id"], name="fk_materials_scoped_dataset"),
        CheckConstraint("media_type IN ('text/csv', 'application/pdf')", name="ck_materials_media_type"),
        CheckConstraint("blob_key = sha256 AND length(sha256) = 64", name="ck_materials_digest"),
        CheckConstraint("(media_type = 'text/csv' AND dataset_id IS NOT NULL) OR (media_type = 'application/pdf' AND dataset_id IS NULL)", name="ck_materials_dataset"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    request_key: Mapped[str] = mapped_column(String(100))
    request_digest: Mapped[str] = mapped_column(String(64))
    filename: Mapped[str] = mapped_column(String(200))
    media_type: Mapped[str] = mapped_column(String(32))
    blob_key: Mapped[str] = mapped_column(String(64))
    sha256: Mapped[str] = mapped_column(String(64))
    dataset_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class JobRow(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        UniqueConstraint("project_id", "request_key", name="uq_jobs_project_request"),
        UniqueConstraint("project_id", "id", name="uq_jobs_project_id_id"),
        ForeignKeyConstraint(["project_id", "result_id"], ["artifacts.project_id", "artifacts.id"], name="fk_jobs_scoped_result"),
        ForeignKeyConstraint(["project_id", "retry_of_job_id"], ["jobs.project_id", "jobs.id"], name="fk_jobs_scoped_retry"),
        CheckConstraint("state IN ('queued', 'running', 'succeeded', 'failed')", name="ck_jobs_state"),
        CheckConstraint("claim_token >= 0", name="ck_jobs_claim_token"),
        CheckConstraint("length(request_digest) = 64", name="ck_jobs_request_digest"),
        CheckConstraint("retry_of_job_id IS NULL OR retry_of_job_id <> id", name="ck_jobs_not_self_retry"),
        CheckConstraint("(claim_token = 0 AND worker_id IS NULL AND deadline_at IS NULL) OR "
                        "(claim_token > 0 AND worker_id IS NOT NULL AND started_at IS NOT NULL "
                        "AND deadline_at IS NOT NULL AND deadline_at > started_at)", name="ck_jobs_claim_metadata"),
        CheckConstraint("state <> 'running' OR claim_token > 0", name="ck_jobs_running_claim"),
        Index("ix_jobs_claim_queue", "state", "created_at", "id"),
        Index("ix_jobs_expiry", "state", "deadline_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    request_key: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(24))
    payload: Mapped[dict] = mapped_column(JSON)
    request_digest: Mapped[str] = mapped_column(String(64), default=lambda ctx: request_digest(
        ctx.get_current_parameters()["kind"], ctx.get_current_parameters()["payload"]))
    claim_token: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    worker_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    deadline_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    retry_of_job_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    state: Mapped[str] = mapped_column(String(24), default="queued", index=True)
    result_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    error: Mapped[str | None] = mapped_column(nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), default=now)
    started_at: Mapped[object | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[object | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class ExternalProjectRow(Base):
    __tablename__ = "external_projects"
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), primary_key=True)
    external_project_id: Mapped[str] = mapped_column(String(160), unique=True)


class ExternalOperationRow(Base):
    __tablename__ = "external_operations"
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "job_id"], ["jobs.project_id", "jobs.id"], name="fk_external_job"),
        ForeignKeyConstraint(["project_id", "artifact_id"], ["artifacts.project_id", "artifacts.id"], name="fk_external_artifact"),
        CheckConstraint("state IN ('prepared', 'unknown', 'confirmed')", name="ck_external_state"),
        CheckConstraint("length(body_sha256) = 64 AND length(request_sha256) = 64", name="ck_external_digest"),
        CheckConstraint("attempts >= 0", name="ck_external_attempts"),
        CheckConstraint("(state = 'confirmed' AND receipt IS NOT NULL) OR (state <> 'confirmed' AND receipt IS NULL AND artifact_id IS NULL)", name="ck_external_receipt"),
        CheckConstraint("state = 'prepared' OR (external_project_id IS NOT NULL AND attempts > 0)", name="ck_external_submitted"),
    )
    job_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), index=True)
    connector: Mapped[str] = mapped_column(String(40), default="sciml-workbench")
    body: Mapped[str] = mapped_column(Text)
    body_sha256: Mapped[str] = mapped_column(String(64))
    request_sha256: Mapped[str] = mapped_column(String(64))
    state: Mapped[str] = mapped_column(String(24), default="prepared")
    attempts: Mapped[int] = mapped_column(BigInteger, default=0)
    external_project_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    receipt: Mapped[dict | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    artifact_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), default=now)
    submitted_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Database:
    def __init__(self, url):
        self.engine = create_engine(url, pool_pre_ping=True)
        if self.engine.dialect.name == "sqlite":
            event.listen(self.engine, "connect", sqlite_foreign_keys)
        self.session = sessionmaker(self.engine, expire_on_commit=False)


def sqlite_foreign_keys(connection, _):
    cursor = connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


for field in ("id", "project_id", "kind"):
    value = ArtifactRow.__table__.c.payload[field].as_string()
    ArtifactRow.__table__.append_constraint(CheckConstraint(
        value.is_not(None) & (value == ArtifactRow.__table__.c[field]),
        name=f"ck_artifacts_payload_{field}",
    ))


@event.listens_for(Base.metadata, "after_create")
def install_metadata_guards(metadata, connection, **kwargs):
    # create_all is used by ephemeral test databases. Production uses Alembic.
    from .metadata_guards_v2 import install, uninstall
    uninstall(connection)
    install(connection)
    from .material_guards_v3 import install as install_materials
    install_materials(connection)
    from .external_guards_v4 import install as install_external
    install_external(connection)

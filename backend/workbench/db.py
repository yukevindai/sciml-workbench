from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from .contracts import now, uid


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
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    kind: Mapped[str] = mapped_column(String(24), index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), default=now)


class JobRow(Base):
    __tablename__ = "jobs"
    __table_args__ = (UniqueConstraint("project_id", "request_key"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    request_key: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(24))
    payload: Mapped[dict] = mapped_column(JSON)
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


class Database:
    def __init__(self, url):
        self.engine = create_engine(url, pool_pre_ping=True)
        self.session = sessionmaker(self.engine, expire_on_commit=False)

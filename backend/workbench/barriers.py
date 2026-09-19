"""Project publication/capture lock. Acquire before any job publication lock."""
from sqlalchemy import select, update
from .db import ProjectRow
from .errors import DomainError


def lock_project(session, pid):
    if session.bind.dialect.name == "sqlite":
        found = session.execute(update(ProjectRow).where(ProjectRow.id == pid).values(name=ProjectRow.name)).rowcount
    else:
        found = session.scalar(select(ProjectRow.id).where(ProjectRow.id == pid).with_for_update())
    if not found:
        raise DomainError("Project not found", 404, "PROJECT_NOT_FOUND")

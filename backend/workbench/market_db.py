"""Workspace-scoped catalog; the deployment's existing operator login owns it."""
from sqlalchemy import ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class MarketEntryRow(Base):
    __tablename__ = 'agent_market_entries'
    id: Mapped[str] = mapped_column(String(160), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), index=True)
    payload: Mapped[dict] = mapped_column(JSON)


class ProjectAgentSelectionRow(Base):
    __tablename__ = 'project_agent_selections'
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id'), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)

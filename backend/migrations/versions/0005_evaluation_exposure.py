"""Immutable evidence anchors, sealed comparisons and holdout exposure history."""
import json
from datetime import datetime, timezone
from uuid import uuid4

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = depends_on = None


def upgrade():
    op.create_table("evidence_spans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("source_artifact_id", sa.String(36), nullable=False),
        sa.Column("reference", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("project_id", "id", name="uq_evidence_spans_project_id"),
        sa.ForeignKeyConstraint(["project_id", "source_artifact_id"], ["artifacts.project_id", "artifacts.id"], name="fk_evidence_span_source"))
    op.create_index("ix_evidence_spans_project_id", "evidence_spans", ["project_id"])
    op.create_table("evaluations",
        sa.Column("protocol_id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("run_id", sa.String(160), nullable=True),
        sa.Column("dataset_sha256", sa.String(64), nullable=False),
        sa.Column("split_sha256", sa.String(64), nullable=False),
        sa.Column("requests", sa.JSON(), nullable=False),
        sa.Column("exploratory", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("project_id", "protocol_id", name="uq_evaluations_project_protocol"),
        sa.ForeignKeyConstraint(["project_id", "protocol_id"], ["artifacts.project_id", "artifacts.id"], name="fk_evaluation_protocol"))
    op.create_index("ix_evaluations_project_id", "evaluations", ["project_id"])
    op.create_table("evaluation_jobs",
        sa.Column("protocol_id", sa.String(36), primary_key=True),
        sa.Column("candidate_id", sa.String(160), primary_key=True),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("job_id", sa.String(36), nullable=False, unique=True),
        sa.ForeignKeyConstraint(["project_id", "protocol_id"], ["evaluations.project_id", "evaluations.protocol_id"], name="fk_evaluation_job_protocol"),
        sa.ForeignKeyConstraint(["project_id", "job_id"], ["jobs.project_id", "jobs.id"], name="fk_evaluation_job_source"))
    exposures = op.create_table("test_exposures",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("dataset_sha256", sa.String(64), nullable=False),
        sa.Column("split_sha256", sa.String(64), nullable=False),
        sa.Column("artifact_id", sa.String(160), nullable=False),
        sa.Column("via", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("project_id", "dataset_sha256", "split_sha256", "artifact_id", "via", name="uq_exposure_access"))
    op.create_index("ix_test_exposures_project_id", "test_exposures", ["project_id"])
    # Historical reads were not audited. Never invent an unexposed baseline.
    for row in op.get_bind().execute(sa.text("SELECT id, project_id, payload FROM artifacts WHERE kind = 'dataset'")):
        payload = json.loads(row.payload) if isinstance(row.payload, str) else row.payload
        op.get_bind().execute(exposures.insert().values(id=str(uuid4()), project_id=row.project_id,
            dataset_sha256=payload["sha256"], split_sha256="*", artifact_id=row.id,
            via="legacy_unknown", created_at=datetime.now(timezone.utc)))
    from workbench.evaluation_guards_v5 import install
    install(op.get_bind())


def downgrade():
    for table in ("test_exposures", "evaluation_jobs", "evaluations", "evidence_spans"):
        if op.get_bind().scalar(sa.text(f"SELECT count(*) FROM {table}")):
            raise RuntimeError("cannot downgrade: evaluation and exposure history must be retained")
    for table in ("test_exposures", "evaluation_jobs", "evaluations", "evidence_spans"):
        op.drop_table(table)
        if op.get_bind().dialect.name == "postgresql":
            op.execute(f"DROP FUNCTION IF EXISTS wb_{table}_v5()")

"""Durable external import identities and receipt linkage."""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = depends_on = None


def upgrade():
    op.create_table("external_projects",
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), primary_key=True),
        sa.Column("external_project_id", sa.String(160), nullable=False, unique=True))
    op.create_table("external_operations",
        sa.Column("job_id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("connector", sa.String(40), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("body_sha256", sa.String(64), nullable=False),
        sa.Column("request_sha256", sa.String(64), nullable=False),
        sa.Column("state", sa.String(24), nullable=False),
        sa.Column("attempts", sa.BigInteger(), nullable=False),
        sa.Column("external_project_id", sa.String(160), nullable=True),
        sa.Column("receipt", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("artifact_id", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id", "job_id"], ["jobs.project_id", "jobs.id"], name="fk_external_job"),
        sa.ForeignKeyConstraint(["project_id", "artifact_id"], ["artifacts.project_id", "artifacts.id"], name="fk_external_artifact"),
        sa.CheckConstraint("state IN ('prepared', 'unknown', 'confirmed')", name="ck_external_state"),
        sa.CheckConstraint("length(body_sha256) = 64 AND length(request_sha256) = 64", name="ck_external_digest"),
        sa.CheckConstraint("attempts >= 0", name="ck_external_attempts"),
        sa.CheckConstraint("(state = 'confirmed' AND receipt IS NOT NULL) OR (state <> 'confirmed' AND receipt IS NULL AND artifact_id IS NULL)", name="ck_external_receipt"),
        sa.CheckConstraint("state = 'prepared' OR (external_project_id IS NOT NULL AND attempts > 0)", name="ck_external_submitted"))
    op.create_index("ix_external_operations_project_id", "external_operations", ["project_id"])
    from workbench.external_guards_v4 import install
    install(op.get_bind())


def downgrade():
    for table in ("external_operations", "external_projects"):
        if op.get_bind().scalar(sa.text(f"SELECT count(*) FROM {table}")):
            raise RuntimeError("cannot downgrade: external identities must be retained")
    op.drop_table("external_operations")
    op.drop_table("external_projects")
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP FUNCTION IF EXISTS wb_guard_external_v4()")
        op.execute("DROP FUNCTION IF EXISTS wb_guard_binding_v4()")

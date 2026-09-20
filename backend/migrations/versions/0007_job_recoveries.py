"""Bounded scientific recovery ledger."""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = depends_on = None


def upgrade():
    op.create_table("job_recoveries",
        sa.Column("job_id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("policy", sa.JSON(), nullable=False),
        sa.Column("state", sa.String(24), nullable=False),
        sa.Column("attempts", sa.BigInteger(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lease_token", sa.String(36), nullable=True),
        sa.Column("lease_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retry_job_id", sa.String(36), nullable=True),
        sa.Column("history", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["project_id", "job_id"], ["jobs.project_id", "jobs.id"], name="fk_recovery_job"),
        sa.ForeignKeyConstraint(["project_id", "retry_job_id"], ["jobs.project_id", "jobs.id"], name="fk_recovery_retry"),
        sa.CheckConstraint("state IN ('pending', 'running', 'completed', 'exhausted')", name="ck_recovery_state"),
        sa.CheckConstraint("attempts >= 0", name="ck_recovery_attempts"))
    op.create_index("ix_job_recoveries_project_id", "job_recoveries", ["project_id"])


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM job_recoveries")):
        raise RuntimeError("cannot downgrade: recovery history must be retained")
    op.drop_table("job_recoveries")

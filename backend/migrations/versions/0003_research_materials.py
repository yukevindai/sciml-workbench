"""Project-owned immutable-byte attachment bindings; no legacy data rewrite."""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = depends_on = None


def upgrade():
    op.create_table("research_materials",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("request_key", sa.String(100), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("filename", sa.String(200), nullable=False),
        sa.Column("media_type", sa.String(32), nullable=False),
        sa.Column("blob_key", sa.String(64), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("dataset_id", sa.String(36), nullable=True),
        sa.UniqueConstraint("project_id", "request_key", name="uq_materials_project_request"),
        sa.ForeignKeyConstraint(["project_id", "dataset_id"], ["artifacts.project_id", "artifacts.id"], name="fk_materials_scoped_dataset"),
        sa.CheckConstraint("media_type IN ('text/csv', 'application/pdf')", name="ck_materials_media_type"),
        sa.CheckConstraint("blob_key = sha256 AND length(sha256) = 64", name="ck_materials_digest"),
        sa.CheckConstraint("(media_type = 'text/csv' AND dataset_id IS NOT NULL) OR (media_type = 'application/pdf' AND dataset_id IS NULL)", name="ck_materials_dataset"))
    op.create_index("ix_research_materials_project_id", "research_materials", ["project_id"])
    from workbench.material_guards_v3 import install
    install(op.get_bind())


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM research_materials")):
        raise RuntimeError("Cannot discard attachment bindings; restore a coordinated backup instead")
    op.drop_table("research_materials")
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP FUNCTION IF EXISTS wb_guard_material_v3()")

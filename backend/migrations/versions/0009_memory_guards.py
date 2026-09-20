"""Preserve E09 memory corrections and source provenance."""
from alembic import op
import sqlalchemy as sa

revision = '0009'
down_revision = '0008'
branch_labels = depends_on = None


def upgrade():
    from workbench.memory_guards_v9 import install
    install(op.get_bind())


def downgrade():
    if op.get_bind().scalar(sa.text('SELECT count(*) FROM project_memory')):
        raise RuntimeError('cannot downgrade: memory revisions must be retained')
    from workbench.memory_guards_v9 import uninstall
    uninstall(op.get_bind())

"""Retain E05 reservation identity and settled usage."""
from alembic import op
import sqlalchemy as sa

revision = '0008'
down_revision = '0007'
branch_labels = depends_on = None


def upgrade():
    from workbench.budget_guards_v8 import install
    install(op.get_bind())


def downgrade():
    if op.get_bind().scalar(sa.text('SELECT count(*) FROM usage_reservations')):
        raise RuntimeError('cannot downgrade: budget reservations must be retained')
    from workbench.budget_guards_v8 import uninstall
    uninstall(op.get_bind())

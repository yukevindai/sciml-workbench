"""Durable research authority, history and operation ledgers."""
from alembic import op
import sqlalchemy as sa
from workbench.agent_schema_v6 import tables, NAMES

revision = '0006'
down_revision = '0005'
branch_labels = depends_on = None


def upgrade():
    metadata = sa.MetaData()
    metadata.reflect(op.get_bind())
    tables(metadata)
    metadata.create_all(op.get_bind(), tables=[metadata.tables[name] for name in NAMES])
    from workbench.agent_guards_v6 import install
    install(op.get_bind())


def downgrade():
    for name in NAMES:
        if op.get_bind().scalar(sa.text(f'SELECT count(*) FROM {name}')):
            raise RuntimeError('cannot downgrade: agent authority and resumable history must be retained')
    from workbench.agent_guards_v6 import uninstall
    uninstall(op.get_bind())
    for name in reversed(NAMES):
        op.drop_table(name)

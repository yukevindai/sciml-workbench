"""Frozen finalization candidates and resumable export identity."""
from alembic import op
import sqlalchemy as sa
from workbench.finalization_schema_v11 import table, versions_table, install

revision = '0011'
down_revision = '0010'
branch_labels = depends_on = None


def upgrade():
    metadata = sa.MetaData()
    sa.Table('agent_runs', metadata, sa.Column('project_id', sa.String(36)), sa.Column('id', sa.String(160)))
    table(metadata).create(op.get_bind())
    versions_table(metadata).create(op.get_bind())
    install(op.get_bind())


def downgrade():
    if (op.get_bind().scalar(sa.text('SELECT count(*) FROM agent_finalizations'))
            or op.get_bind().scalar(sa.text('SELECT count(*) FROM agent_runtime_versions'))):
        raise RuntimeError('cannot downgrade: finalization history must be retained')
    op.drop_table('agent_finalizations')
    op.drop_table('agent_runtime_versions')
    if op.get_bind().dialect.name == 'postgresql':
        op.execute('DROP FUNCTION wb_finalization_v11()')
        op.execute('DROP FUNCTION wb_runtime_versions_v11()')

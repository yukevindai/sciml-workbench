"""Durable agent advancement leases and committed checkpoint pointers."""
from alembic import op
import sqlalchemy as sa
from workbench.scheduler_schema_v10 import table

revision = '0010'
down_revision = '0009'
branch_labels = depends_on = None


def upgrade():
    metadata = sa.MetaData()
    sa.Table('agent_runs', metadata, sa.Column('project_id', sa.String(36)),
             sa.Column('id', sa.String(160)))
    table(metadata).create(op.get_bind())


def downgrade():
    if op.get_bind().scalar(sa.text('SELECT count(*) FROM agent_leases')):
        raise RuntimeError('cannot downgrade: scheduler recovery history must be retained')
    op.drop_table('agent_leases')

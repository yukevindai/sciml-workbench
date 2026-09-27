"""Durable serverless blob and opaque upstream-state storage."""
from alembic import op
import sqlalchemy as sa
revision = '0012'
down_revision = '0011'
branch_labels = depends_on = None

def upgrade():
    op.create_table('stored_blobs', sa.Column('key', sa.String(64), primary_key=True), sa.Column('data', sa.LargeBinary(), nullable=False))
    op.create_table('connector_states', sa.Column('name', sa.String(80), primary_key=True), sa.Column('data', sa.LargeBinary(), nullable=False), sa.Column('sha256', sa.String(64), nullable=False))

def downgrade():
    bind = op.get_bind()
    if bind.scalar(sa.text('SELECT count(*) FROM stored_blobs')) or bind.scalar(sa.text('SELECT count(*) FROM connector_states')):
        raise RuntimeError('Export durable storage before downgrading')
    op.drop_table('connector_states')
    op.drop_table('stored_blobs')

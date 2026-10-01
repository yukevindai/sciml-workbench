"""Private agent catalog, reusable teams and project defaults."""
from alembic import op
import sqlalchemy as sa

revision = '0013'
down_revision = '0012'
branch_labels = depends_on = None


def upgrade():
    op.create_table('agent_market_entries',
        sa.Column('id', sa.String(160), primary_key=True),
        sa.Column('kind', sa.String(16), nullable=False),
        sa.Column('payload', sa.JSON, nullable=False))
    op.create_index('ix_agent_market_entries_kind', 'agent_market_entries', ['kind'])
    op.create_table('project_agent_selections',
        sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id'), primary_key=True),
        sa.Column('payload', sa.JSON, nullable=False))


def downgrade():
    if op.get_bind().scalar(sa.text('SELECT count(*) FROM agent_market_entries')) or op.get_bind().scalar(sa.text('SELECT count(*) FROM project_agent_selections')):
        raise RuntimeError('Cannot downgrade: saved agents and teams must be retained')
    op.drop_table('project_agent_selections')
    op.drop_index('ix_agent_market_entries_kind', table_name='agent_market_entries')
    op.drop_table('agent_market_entries')

"""Frozen D11 scheduler metadata; checkpoint contents live in PostgresSaver."""
import sqlalchemy as sa


def table(metadata):
    return sa.Table('agent_leases', metadata,
        sa.Column('run_id', sa.String(160), primary_key=True),
        sa.Column('project_id', sa.String(36), nullable=False),
        sa.Column('token', sa.BigInteger, nullable=False),
        sa.Column('worker_id', sa.String(160), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_claimed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('checkpoint', sa.JSON, nullable=True),
        sa.Column('recoveries', sa.BigInteger, nullable=False),
        sa.ForeignKeyConstraint(['project_id', 'run_id'], ['agent_runs.project_id', 'agent_runs.id']),
        sa.CheckConstraint('token >= 0 AND recoveries >= 0'))

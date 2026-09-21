"""Durable candidate and export cursor; accepted candidate identity is immutable."""
import sqlalchemy as sa


def table(metadata):
    return sa.Table('agent_finalizations', metadata,
        sa.Column('run_id', sa.String(160), primary_key=True),
        sa.Column('project_id', sa.String(36), nullable=False),
        sa.Column('control_revision', sa.BigInteger, nullable=False),
        sa.Column('candidate_sha256', sa.String(64), nullable=False),
        sa.Column('candidate', sa.JSON, nullable=False),
        sa.Column('versions', sa.JSON, nullable=False),
        sa.Column('state', sa.String(24), nullable=False),
        sa.Column('result', sa.JSON, nullable=False),
        sa.Column('execution_id', sa.String(160)),
        sa.Column('claim_set_id', sa.String(160)),
        sa.Column('report_job_id', sa.String(36)),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['project_id', 'run_id'], ['agent_runs.project_id', 'agent_runs.id']),
        sa.CheckConstraint("state IN ('review','capture','export','verified','failed')"))


def versions_table(metadata):
    return sa.Table('agent_runtime_versions', metadata,
        sa.Column('run_id', sa.String(160), primary_key=True),
        sa.Column('sha256', sa.String(64), primary_key=True),
        sa.Column('project_id', sa.String(36), nullable=False),
        sa.Column('payload', sa.JSON, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['project_id', 'run_id'], ['agent_runs.project_id', 'agent_runs.id']))


def install(connection):
    fields = ('run_id', 'project_id', 'control_revision', 'candidate_sha256', 'candidate', 'versions', 'created_at')
    pg = connection.dialect.name == 'postgresql'
    for name, target in (('wb_finalization_v11', 'agent_finalizations'),
                         ('wb_runtime_versions_v11', 'agent_runtime_versions')):
        if pg:
            connection.exec_driver_sql(f'DROP TRIGGER IF EXISTS {name} ON {target}')
            connection.exec_driver_sql(f'DROP FUNCTION IF EXISTS {name}()')
        else:
            for operation in ('update', 'delete'):
                connection.exec_driver_sql(f'DROP TRIGGER IF EXISTS {name}_{operation}')
    comparisons = []
    for field in fields:
        cast = '::text' if pg and field in {'candidate', 'versions'} else ''
        comparisons.append(f"NEW.{field}{cast} {'IS DISTINCT FROM' if pg else 'IS NOT'} OLD.{field}{cast}")
    condition = ' OR '.join(comparisons) + " OR OLD.state IN ('verified','failed')"
    if pg:
        connection.exec_driver_sql(f"""CREATE FUNCTION wb_finalization_v11() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
            IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Finalization history is retained' USING ERRCODE = '23514'; END IF;
            IF {condition} THEN RAISE EXCEPTION 'Finalization identity is immutable' USING ERRCODE = '23514'; END IF;
            RETURN NEW; END $$""")
        connection.exec_driver_sql('CREATE TRIGGER wb_finalization_v11 BEFORE UPDATE OR DELETE ON agent_finalizations FOR EACH ROW EXECUTE FUNCTION wb_finalization_v11()')
    else:
        connection.exec_driver_sql(f"CREATE TRIGGER wb_finalization_v11_update BEFORE UPDATE ON agent_finalizations WHEN {condition} BEGIN SELECT RAISE(ABORT, 'Finalization identity is immutable'); END")
        connection.exec_driver_sql("CREATE TRIGGER wb_finalization_v11_delete BEFORE DELETE ON agent_finalizations BEGIN SELECT RAISE(ABORT, 'Finalization history is retained'); END")
    if pg:
        connection.exec_driver_sql("""CREATE FUNCTION wb_runtime_versions_v11() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'Runtime version history is immutable' USING ERRCODE = '23514'; END $$""")
        connection.exec_driver_sql('CREATE TRIGGER wb_runtime_versions_v11 BEFORE UPDATE OR DELETE ON agent_runtime_versions FOR EACH ROW EXECUTE FUNCTION wb_runtime_versions_v11()')
    else:
        for operation in ('UPDATE', 'DELETE'):
            connection.exec_driver_sql(f"CREATE TRIGGER wb_runtime_versions_v11_{operation.lower()} BEFORE {operation} ON agent_runtime_versions BEGIN SELECT RAISE(ABORT, 'Runtime version history is immutable'); END")

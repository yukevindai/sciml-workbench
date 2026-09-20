"""Retain memory revisions; corrections only supersede immutable records."""

def install(connection):
    uninstall(connection)
    pg = connection.dialect.name == 'postgresql'
    fields = ('id', 'project_id', 'revision', 'kind', 'value', 'attribution', 'source_run_id', 'source_artifact_ids', 'exposure')
    checks = []
    for field in fields:
        cast = '::text' if pg and field in {'value', 'source_artifact_ids'} else ''
        checks.append(f"NEW.{field}{cast} {'IS DISTINCT FROM' if pg else 'IS NOT'} OLD.{field}{cast}")
    condition = ' OR '.join(checks) + " OR (NEW.status != OLD.status AND NOT (OLD.status = 'valid' AND NEW.status = 'superseded'))"
    if pg:
        connection.exec_driver_sql(f"""CREATE FUNCTION wb_memory_v9() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF {condition} THEN RAISE EXCEPTION 'Memory revisions are immutable' USING ERRCODE = '23514'; END IF;
            RETURN NEW; END $$""")
        connection.exec_driver_sql('CREATE TRIGGER wb_memory_v9 BEFORE UPDATE ON project_memory FOR EACH ROW EXECUTE FUNCTION wb_memory_v9()')
    else:
        connection.exec_driver_sql(f"CREATE TRIGGER wb_memory_v9 BEFORE UPDATE ON project_memory WHEN {condition} BEGIN SELECT RAISE(ABORT, 'Memory revisions are immutable'); END")


def uninstall(connection):
    if connection.dialect.name == 'postgresql':
        connection.exec_driver_sql('DROP TRIGGER IF EXISTS wb_memory_v9 ON project_memory')
        connection.exec_driver_sql('DROP FUNCTION IF EXISTS wb_memory_v9()')
    else:
        connection.exec_driver_sql('DROP TRIGGER IF EXISTS wb_memory_v9')

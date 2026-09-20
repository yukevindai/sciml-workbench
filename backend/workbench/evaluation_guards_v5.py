"""Frozen revision-0005 exposure retention and sealed-comparison guards."""


def install(connection):
    pg = connection.dialect.name == "postgresql"
    for table in ("test_exposures", "evaluation_jobs", "evaluations", "evidence_spans"):
        if table == "evaluations":
            fields = ("protocol_id", "project_id", "run_id", "dataset_sha256", "split_sha256", "requests", "exploratory", "created_at")
            def changed(field):
                cast = "::text" if pg and field == "requests" else ""
                return f"NEW.{field}{cast} {'IS DISTINCT FROM' if pg else 'IS NOT'} OLD.{field}{cast}"
            condition = " OR ".join(changed(f) for f in fields)
            condition += f" OR (OLD.released_at IS NOT NULL AND ({changed('released_at')}))"
            condition += " OR (NEW.released_at IS NOT NULL AND NEW.released_at < OLD.created_at)"
        else:
            condition = "TRUE" if pg else "1"
        name = "wb_" + table + "_v5"
        if pg:
            connection.exec_driver_sql(f"""CREATE OR REPLACE FUNCTION {name}() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Evaluation history is retained' USING ERRCODE = '23514'; END IF;
                IF {condition} THEN RAISE EXCEPTION 'Sealed evaluation history is immutable' USING ERRCODE = '23514'; END IF;
                RETURN NEW; END $$""")
            connection.exec_driver_sql(f"DROP TRIGGER IF EXISTS {name} ON {table}")
            connection.exec_driver_sql(f"CREATE TRIGGER {name} BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION {name}()")
        else:
            connection.exec_driver_sql(f"CREATE TRIGGER IF NOT EXISTS {name}_update BEFORE UPDATE ON {table} WHEN {condition} BEGIN SELECT RAISE(ABORT, 'Sealed evaluation history is immutable'); END")
            connection.exec_driver_sql(f"CREATE TRIGGER IF NOT EXISTS {name}_delete BEFORE DELETE ON {table} BEGIN SELECT RAISE(ABORT, 'Evaluation history is retained'); END")

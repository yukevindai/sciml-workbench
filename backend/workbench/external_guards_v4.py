"""Frozen revision-0004 import identity/monotonic receipt guards."""


def install(connection):
    pg = connection.dialect.name == "postgresql"
    def changed(field):
        cast = "::text" if pg and field == "receipt" else ""
        return f"NEW.{field}{cast} {'IS DISTINCT FROM' if pg else 'IS NOT'} OLD.{field}{cast}"
    immutable = " OR ".join(changed(f) for f in (
        "job_id", "project_id", "connector", "body", "body_sha256", "request_sha256", "created_at"))
    invalid = f"""({immutable})
        OR (OLD.external_project_id IS NOT NULL AND ({changed('external_project_id')}))
        OR (OLD.artifact_id IS NOT NULL AND ({changed('artifact_id')}))
        OR (OLD.state = 'confirmed' AND (NEW.state <> 'confirmed' OR ({changed('receipt')}) OR ({changed('attempts')}) OR ({changed('submitted_at')})))
        OR (OLD.state <> 'prepared' AND NEW.state = 'prepared')
        OR NEW.attempts < OLD.attempts OR NEW.attempts > OLD.attempts + 1"""
    if pg:
        connection.exec_driver_sql(f"""CREATE OR REPLACE FUNCTION wb_guard_external_v4() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
            IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'External journal is retained' USING ERRCODE = '23514'; END IF;
            IF {invalid} THEN RAISE EXCEPTION 'External journal identity is immutable' USING ERRCODE = '23514'; END IF;
            RETURN NEW; END $$""")
        connection.exec_driver_sql("DROP TRIGGER IF EXISTS wb_guard_external_v4 ON external_operations")
        connection.exec_driver_sql("CREATE TRIGGER wb_guard_external_v4 BEFORE UPDATE OR DELETE ON external_operations FOR EACH ROW EXECUTE FUNCTION wb_guard_external_v4()")
        connection.exec_driver_sql("""CREATE OR REPLACE FUNCTION wb_guard_binding_v4() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'External binding is immutable' USING ERRCODE = '23514'; END $$""")
        connection.exec_driver_sql("DROP TRIGGER IF EXISTS wb_guard_binding_v4 ON external_projects")
        connection.exec_driver_sql("CREATE TRIGGER wb_guard_binding_v4 BEFORE UPDATE OR DELETE ON external_projects FOR EACH ROW EXECUTE FUNCTION wb_guard_binding_v4()")
    else:
        connection.exec_driver_sql(f"CREATE TRIGGER IF NOT EXISTS wb_guard_external_v4_update BEFORE UPDATE ON external_operations WHEN {invalid} BEGIN SELECT RAISE(ABORT, 'External journal identity is immutable'); END")
        connection.exec_driver_sql("CREATE TRIGGER IF NOT EXISTS wb_guard_external_v4_delete BEFORE DELETE ON external_operations BEGIN SELECT RAISE(ABORT, 'External journal is retained'); END")
        for action in ("UPDATE", "DELETE"):
            connection.exec_driver_sql(f"CREATE TRIGGER IF NOT EXISTS wb_guard_binding_v4_{action.lower()} BEFORE {action} ON external_projects BEGIN SELECT RAISE(ABORT, 'External binding is immutable'); END")

"""E05 immutable reservation identity and monotonic settlement lifecycle."""


def install(connection):
    uninstall(connection)
    pg = connection.dialect.name == 'postgresql'
    identity = ('id', 'project_id', 'run_id', 'assignment_id', 'request_id', 'created_at')
    if pg:
        changed = ' OR '.join(f'NEW.{k} IS DISTINCT FROM OLD.{k}' for k in identity)
        changed += " OR NEW.payload->>'intent' IS DISTINCT FROM OLD.payload->>'intent'"
        condition = f"({changed}) OR (OLD.payload->>'state' IN ('settled','released')) OR (OLD.payload->>'state' = 'unknown' AND NEW.payload->>'state' <> 'settled')"
        connection.exec_driver_sql(f"""CREATE OR REPLACE FUNCTION wb_budget_v8() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
        IF OLD.payload->'intent'->>'version' = 'e05.v1' AND ({condition}) THEN
          RAISE EXCEPTION 'Budget reservation identity or lifecycle is immutable' USING ERRCODE = '23514';
        END IF;
        RETURN NEW; END $$""")
        connection.exec_driver_sql('CREATE TRIGGER wb_budget_v8 BEFORE UPDATE ON usage_reservations FOR EACH ROW EXECUTE FUNCTION wb_budget_v8()')
    else:
        changed = ' OR '.join(f'NEW.{k} IS NOT OLD.{k}' for k in identity)
        changed += " OR json_extract(NEW.payload, '$.intent') IS NOT json_extract(OLD.payload, '$.intent')"
        connection.exec_driver_sql(f"""CREATE TRIGGER wb_budget_v8 BEFORE UPDATE ON usage_reservations
        WHEN json_extract(OLD.payload, '$.intent.version') = 'e05.v1' AND (
          {changed} OR json_extract(OLD.payload, '$.state') IN ('settled','released') OR
          (json_extract(OLD.payload, '$.state') = 'unknown' AND json_extract(NEW.payload, '$.state') <> 'settled'))
        BEGIN SELECT RAISE(ABORT, 'Budget reservation identity or lifecycle is immutable'); END""")


def uninstall(connection):
    suffix = ' ON usage_reservations' if connection.dialect.name == 'postgresql' else ''
    connection.exec_driver_sql('DROP TRIGGER IF EXISTS wb_budget_v8' + suffix)
    if suffix:
        connection.exec_driver_sql('DROP FUNCTION IF EXISTS wb_budget_v8()')

"""Frozen revision-0003 attachment binding immutability."""


def install(connection):
    if connection.dialect.name == "postgresql":
        connection.exec_driver_sql("""CREATE OR REPLACE FUNCTION wb_guard_material_v3() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'Attachment bindings are immutable' USING ERRCODE = '23514'; END $$""")
        connection.exec_driver_sql("DROP TRIGGER IF EXISTS wb_guard_material_v3 ON research_materials")
        connection.exec_driver_sql("CREATE TRIGGER wb_guard_material_v3 BEFORE UPDATE OR DELETE ON research_materials FOR EACH ROW EXECUTE FUNCTION wb_guard_material_v3()")
    else:
        for action in ("UPDATE", "DELETE"):
            connection.exec_driver_sql(f"CREATE TRIGGER IF NOT EXISTS wb_guard_material_v3_{action.lower()} BEFORE {action} ON research_materials BEGIN SELECT RAISE(ABORT, 'Attachment bindings are immutable'); END")

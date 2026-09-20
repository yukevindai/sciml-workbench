"""Retention and immutable intent, independent of graph checkpoints."""
from .agent_schema_v6 import NAMES


IMMUTABLE = {'server_policies', 'project_policies', 'research_messages', 'agent_run_amendments',
             'agent_plans', 'agent_events', 'usage_entries', 'agent_evaluation_links'}


def install(connection):
    uninstall(connection)
    pg = connection.dialect.name == 'postgresql'
    for table in NAMES:
        def changed(field, json=False):
            cast = '::text' if pg and json else ''
            return f"NEW.{field}{cast} {'IS DISTINCT FROM' if pg else 'IS NOT'} OLD.{field}{cast}"
        condition = 'TRUE' if table in IMMUTABLE else 'FALSE'
        if table == 'agent_runs':
            condition = ' OR '.join([changed(f, f == 'original_request') for f in
                ('id', 'project_id', 'request_key', 'request_digest', 'original_request', 'created_at')])
            condition += " OR NEW.control_revision < OLD.control_revision OR NEW.claim_token < OLD.claim_token OR NEW.event_sequence < OLD.event_sequence OR NEW.plan_revision < OLD.plan_revision"
            condition += " OR (OLD.state IN ('completed','partially_completed','failed','cancelled'))"
        if table == 'agent_actions':
            condition = ' OR '.join(changed(f, f == 'request') for f in
                ('id', 'project_id', 'run_id', 'action_key', 'attempt', 'request_digest', 'request', 'assignment_id', 'control_revision', 'claim_token'))
            condition += " OR OLD.state IN ('completed','failed','cancelled')"
        name = 'wb_' + table + '_v6'
        if pg:
            connection.exec_driver_sql(f"""CREATE OR REPLACE FUNCTION {name}() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Agent history is retained' USING ERRCODE = '23514'; END IF;
                IF {condition} THEN RAISE EXCEPTION 'Agent authority or intent is immutable' USING ERRCODE = '23514'; END IF;
                RETURN NEW; END $$""")
            connection.exec_driver_sql(f'CREATE TRIGGER {name} BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION {name}()')
        else:
            connection.exec_driver_sql(f"CREATE TRIGGER {name}_update BEFORE UPDATE ON {table} WHEN {condition} BEGIN SELECT RAISE(ABORT, 'Agent authority or intent is immutable'); END")
            connection.exec_driver_sql(f"CREATE TRIGGER {name}_delete BEFORE DELETE ON {table} BEGIN SELECT RAISE(ABORT, 'Agent history is retained'); END")


def uninstall(connection):
    for table in NAMES:
        name = 'wb_' + table + '_v6'
        if connection.dialect.name == 'postgresql':
            connection.exec_driver_sql(f'DROP TRIGGER IF EXISTS {name} ON {table}')
            connection.exec_driver_sql(f'DROP FUNCTION IF EXISTS {name}()')
        else:
            for op in ('update', 'delete'):
                connection.exec_driver_sql(f'DROP TRIGGER IF EXISTS {name}_{op}')

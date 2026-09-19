"""Frozen revision-0002 database guards, shared by Alembic and test create_all.

Do not edit these semantics in later tickets: introduce a new migration instead.
"""

IDENTITY = ("id", "project_id", "request_key", "kind", "payload", "request_digest", "retry_of_job_id", "created_at")
CLAIM = ("worker_id", "started_at", "deadline_at")
ARTIFACT = ("id", "project_id", "kind", "payload", "created_at")


def install(connection):
    if connection.dialect.name == "postgresql":
        changed = lambda names: " OR ".join(
            f"NEW.{n}{'::text' if n == 'payload' else ''} IS DISTINCT FROM OLD.{n}{'::text' if n == 'payload' else ''}"
            for n in names)
        connection.exec_driver_sql(f"""
            CREATE FUNCTION wb_guard_job_v2() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF {changed(IDENTITY)} THEN
                    RAISE EXCEPTION 'Accepted job request is immutable' USING ERRCODE = '23514';
                END IF;
                IF NEW.claim_token < OLD.claim_token OR
                   (OLD.claim_token > 0 AND ({changed(CLAIM)})) OR
                   (OLD.state = 'queued' AND NEW.state = 'succeeded') OR
                   (OLD.state = 'running' AND NEW.state = 'queued') OR
                   (OLD.state IN ('succeeded', 'failed') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)) THEN
                    RAISE EXCEPTION 'Invalid job lifecycle mutation' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END $$
        """)
        connection.exec_driver_sql("CREATE TRIGGER wb_guard_job_v2 BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION wb_guard_job_v2()")
        connection.exec_driver_sql(f"""
            CREATE FUNCTION wb_guard_artifact_v2() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF {changed(ARTIFACT)} THEN
                    RAISE EXCEPTION 'Published artifact is immutable' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END $$
        """)
        connection.exec_driver_sql("CREATE TRIGGER wb_guard_artifact_v2 BEFORE UPDATE ON artifacts FOR EACH ROW EXECUTE FUNCTION wb_guard_artifact_v2()")
    elif connection.dialect.name == "sqlite":
        changed = lambda names: " OR ".join(f"NEW.{n} IS NOT OLD.{n}" for n in names)
        all_job = IDENTITY + CLAIM + ("claim_token", "state", "result_id", "error", "error_code", "finished_at")
        connection.exec_driver_sql(f"""
            CREATE TRIGGER wb_guard_job_v2 BEFORE UPDATE ON jobs
            WHEN {changed(IDENTITY)} OR NEW.claim_token < OLD.claim_token OR
                 (OLD.claim_token > 0 AND ({changed(CLAIM)})) OR
                 (OLD.state = 'queued' AND NEW.state = 'succeeded') OR
                 (OLD.state = 'running' AND NEW.state = 'queued') OR
                 (OLD.state IN ('succeeded', 'failed') AND ({changed(all_job)}))
            BEGIN SELECT RAISE(ABORT, 'Immutable request or invalid job lifecycle mutation'); END
        """)
        connection.exec_driver_sql(f"""
            CREATE TRIGGER wb_guard_artifact_v2 BEFORE UPDATE ON artifacts
            WHEN {changed(ARTIFACT)}
            BEGIN SELECT RAISE(ABORT, 'Published artifact is immutable'); END
        """)


def uninstall(connection):
    for table, trigger in (("jobs", "wb_guard_job_v2"), ("artifacts", "wb_guard_artifact_v2")):
        suffix = f" ON {table}" if connection.dialect.name == "postgresql" else ""
        connection.exec_driver_sql(f"DROP TRIGGER IF EXISTS {trigger}{suffix}")
        if connection.dialect.name == "postgresql":
            connection.exec_driver_sql(f"DROP FUNCTION IF EXISTS {trigger}()")

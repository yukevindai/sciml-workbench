from alembic import context
from sqlalchemy import create_engine
from workbench.config import load_settings
from workbench.db import Base

def run(connection):
    if connection.dialect.name == "sqlite":
        if connection.in_transaction():
            raise RuntimeError("SQLite migrations require a connection without an active transaction")
        raw = connection.connection.driver_connection
        enabled = raw.execute("PRAGMA foreign_keys").fetchone()[0]
        # Batch rebuilding a table with a self-FK needs enforcement disabled.
        # Validate every FK before committing, then restore the connection setting.
        raw.execute("PRAGMA foreign_keys=OFF")
        try:
            with connection.begin():
                connection.exec_driver_sql("BEGIN IMMEDIATE")
                context.configure(connection=connection, target_metadata=Base.metadata, transactional_ddl=True)
                with context.begin_transaction():
                    context.run_migrations()
                if connection.exec_driver_sql("PRAGMA foreign_key_check").first():
                    raise RuntimeError("Migration left an invalid foreign key; transaction rolled back")
        finally:
            raw.execute(f"PRAGMA foreign_keys={int(enabled)}")
        return
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()


supplied = context.config.attributes.get("connection")
if supplied is not None:
    run(supplied)
else:
    engine = create_engine(load_settings().database_url)
    with engine.connect() as connection:
        run(connection)
    engine.dispose()

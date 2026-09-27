"""Serialize the upstream SQLite database as opaque bytes between invocations.

Only the public app/CLI touches scientific records. SQLite's public backup API
captures committed pages, including WAL. PostgreSQL publishes the snapshot before
an import receipt can escape. Crashes roll back the snapshot transaction; retries
use the original external ID against the last committed upstream state.
"""
from contextlib import closing, contextmanager
from pathlib import Path
import hashlib
import os
import sqlite3
import subprocess
import sys
import tempfile
from sqlalchemy import create_engine, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.pool import NullPool
from .db import ConnectorStateRow
from .storage import StorageIntegrityError

NAME = 'failure-memory'
LOCK = 739410121

def snapshot(path):
    with tempfile.TemporaryDirectory() as temp:
        target = Path(temp) / 'snapshot.sqlite'
        with closing(sqlite3.connect(path)) as source, closing(sqlite3.connect(target)) as dest:
            source.backup(dest)
        return target.read_bytes()

@contextmanager
def failure_workspace(settings):
    engine = create_engine(settings.database_url, poolclass=NullPool)
    try:
        with engine.begin() as conn:
            conn.execute(text("SET LOCAL lock_timeout = '10s'"))
            conn.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': LOCK})
            row = conn.execute(select(ConnectorStateRow).where(ConnectorStateRow.name == NAME)).mappings().first()
            with tempfile.TemporaryDirectory(prefix='wb-efm-') as temp:
                root = Path(temp)
                database = root / 'failure-memory.sqlite'
                if row:
                    raw = bytes(row['data'])
                    if hashlib.sha256(raw).hexdigest() != row['sha256']:
                        raise StorageIntegrityError('Failure Memory snapshot failed integrity verification.')
                    database.write_bytes(raw)
                else:
                    base = [sys.executable, '-m', 'failure_memory.cli', '--database', str(database)]
                    subprocess.run(base + ['init'], check=True, capture_output=True, timeout=30)
                    subprocess.run(base + ['create-user', settings.efm_username, '--display-name', 'SciML Workbench', '--password-env', 'WB_PROVISION_PASSWORD'],
                        env=dict(os.environ, WB_PROVISION_PASSWORD=settings.efm_password.get_secret_value()),
                        check=True, capture_output=True, timeout=30)
                yield root
                raw = snapshot(database)
                values = dict(name=NAME, data=raw, sha256=hashlib.sha256(raw).hexdigest())
                conn.execute(insert(ConnectorStateRow).values(**values).on_conflict_do_update(
                    index_elements=['name'], set_={'data': raw, 'sha256': values['sha256']}))
    finally:
        engine.dispose()

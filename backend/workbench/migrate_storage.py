"""Import an offline local volume into already-restored PostgreSQL metadata.

Never mutates the source. Existing different connector state is never replaced.
Safe to repeat while ALL old and new writers remain stopped.
"""
import argparse
import hashlib
import json
from pathlib import Path
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from .config import load_settings
from .connector_state import LOCK, NAME, snapshot
from .db import ArtifactRow, ConnectorStateRow, Database, JobRow, MaterialRow
from .postgres_storage import PostgresStore
from .storage import LocalStore, StorageIntegrityError


def references(value):
    if isinstance(value, dict):
        for name, item in value.items():
            if name in {'blob_key', 'bundle_key', 'pdf_key'} and item is not None:
                yield item
            else:
                yield from references(item)
    elif isinstance(value, list):
        for item in value:
            yield from references(item)


def migrate(settings, root, *, writers_stopped=False):
    if not writers_stopped:
        raise ValueError('Stop every old and new API, worker and cron before --writers-stopped.')
    settings.validate_secrets()
    if settings.storage_backend != 'postgres':
        raise ValueError('Destination must use WB_STORAGE_BACKEND=postgres.')
    root = Path(root)
    database = root / 'failure-memory.sqlite'
    if root.is_symlink() or (root / 'blobs').is_symlink() or not (root / 'blobs').is_dir():
        raise ValueError('Source must contain a regular local blobs directory.')
    if database.is_symlink() or not database.is_file():
        raise ValueError('Source must contain a regular Failure Memory database.')
    source = LocalStore(root)
    target = PostgresStore(settings.database_url)
    db = Database(settings.database_url)
    try:
        # Include queued evidence and frozen reports as well as published artifacts.
        with db.session() as session:
            needed = set(session.scalars(select(MaterialRow.blob_key)))
            for model in (ArtifactRow, JobRow):
                for payload in session.scalars(select(model.payload)):
                    needed.update(references(payload))
        keys = {p.name for p in source.root.iterdir() if not p.name.startswith('.')}
        if not needed <= keys:
            raise StorageIntegrityError('Source volume is missing blobs referenced by restored metadata.')
        # Preflight every source before publishing anything.
        for key in keys:
            source.get(key)
        raw = snapshot(database)
        digest = hashlib.sha256(raw).hexdigest()
        with db.engine.begin() as conn:
            conn.execute(text("SET LOCAL lock_timeout = '10s'"))
            conn.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': LOCK})
            prior = conn.execute(select(ConnectorStateRow).where(ConnectorStateRow.name == NAME)).mappings().first()
            if prior and (prior['sha256'] != digest or bytes(prior['data']) != raw):
                raise StorageIntegrityError('Destination Failure Memory differs; restore to a fresh destination.')
            for key in sorted(keys):
                if target.put(source.get(key)) != key:
                    raise StorageIntegrityError('Transferred blob digest mismatch.')
                target.get(key)
            if not prior:
                conn.execute(insert(ConnectorStateRow).values(name=NAME, data=raw, sha256=digest))
        return {'blobs_verified': len(keys), 'referenced_blobs_verified': len(needed),
                'failure_memory_sha256': digest, 'source_unchanged': True}
    finally:
        db.engine.dispose()
        target.engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--from-root', type=Path, required=True)
    parser.add_argument('--writers-stopped', action='store_true')
    args = parser.parse_args()
    try:
        result = migrate(load_settings(), args.from_root, writers_stopped=args.writers_stopped)
    except Exception:
        # Connection and CLI failures can contain operator credentials.
        parser.exit(1, 'Storage transfer failed. Check source integrity, destination migrations and stopped writers; no existing connector state was overwritten.\n')
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()

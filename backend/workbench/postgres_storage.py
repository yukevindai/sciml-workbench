"""Database-backed immutable blobs for ephemeral compute; no public object URLs."""
import hashlib
from sqlalchemy import create_engine, select
from sqlalchemy.pool import NullPool
from sqlalchemy.exc import SQLAlchemyError
from .db import BlobRow
from .storage import StorageError, StorageIntegrityError

class PostgresStore:
    def __init__(self, url):
        self.engine = create_engine(url, poolclass=NullPool, pool_pre_ping=True)

    @staticmethod
    def validate_key(key):
        if not isinstance(key, str) or len(key) != 64 or any(c not in '0123456789abcdef' for c in key):
            raise StorageIntegrityError('Invalid blob key')

    def put(self, raw):
        if not isinstance(raw, bytes):
            raise TypeError('Blob input must be immutable bytes')
        key = hashlib.sha256(raw).hexdigest()
        from sqlalchemy.dialects.postgresql import insert
        try:
            with self.engine.begin() as conn:
                conn.execute(insert(BlobRow).values(key=key, data=raw).on_conflict_do_nothing(index_elements=['key']))
                existing = conn.scalar(select(BlobRow.data).where(BlobRow.key == key))
                if bytes(existing) != raw:
                    raise StorageIntegrityError('Stored blob differs from the requested bytes.')
        except SQLAlchemyError:
            raise StorageError('Durable blob publication failed.') from None
        return key

    def get(self, key):
        self.validate_key(key)
        try:
            with self.engine.connect() as conn:
                value = conn.scalar(select(BlobRow.data).where(BlobRow.key == key))
        except SQLAlchemyError:
            raise StorageError('Durable blob read failed.') from None
        if value is None:
            raise StorageIntegrityError('Stored blob is missing.')
        raw = bytes(value)
        if hashlib.sha256(raw).hexdigest() != key:
            raise StorageIntegrityError('Stored blob failed integrity verification.')
        return raw

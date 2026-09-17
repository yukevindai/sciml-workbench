import hashlib
import os
from pathlib import Path
from typing import Protocol
from uuid import uuid4


class BlobStore(Protocol):
    def put(self, raw: bytes) -> str: ...
    def get(self, key: str) -> bytes: ...


class LocalStore:
    """Content-addressed immutable blobs. Adapters use temporary local workspaces.

    An S3 implementation needs only put/get; no adapter relies on a blob path.
    """

    def __init__(self, root: Path):
        self.root = root / "blobs"
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, key):
        if len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
            raise ValueError("Invalid blob key")
        return self.root / key

    def put(self, raw):
        key = hashlib.sha256(raw).hexdigest()
        dest = self.path(key)
        temp = self.root / f".{uuid4()}.tmp"
        try:
            with temp.open("xb") as f:
                f.write(raw)
                f.flush()
                os.fsync(f.fileno())
            os.replace(temp, dest)
        finally:
            temp.unlink(missing_ok=True)
        return key

    def get(self, key):
        raw = self.path(key).read_bytes()
        if hashlib.sha256(raw).hexdigest() != key:
            raise ValueError("Stored artifact failed integrity verification")
        return raw

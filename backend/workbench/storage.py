import hashlib
import os
import stat
import tempfile
from pathlib import Path
from typing import Protocol


class StorageError(ValueError):
    """Safe, value-free storage failure for API and worker consumers."""

    error_code = "STORAGE_UNAVAILABLE"


class StorageIntegrityError(StorageError):
    error_code = "INTEGRITY_FAILED"


class BlobStore(Protocol):
    """Publish complete immutable bytes or fail; reads verify their digest.

    There is deliberately no rollback/delete operation: keys can be shared by
    committed artifacts in other transactions or projects.
    """

    def put(self, raw: bytes) -> str: ...
    def get(self, key: str) -> bytes: ...


class LocalStore:
    """Content-addressed immutable blobs. Adapters use temporary local workspaces.

    An S3 implementation needs only put/get; no adapter relies on a blob path.
    The managed directory must be private to trusted workbench processes. The
    production filesystem must support hard links and directory fsync (Linux).
    """

    def __init__(self, root: Path):
        try:
            self.root = Path(root).resolve() / "blobs"
            self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
            self._check_root()
        except OSError:
            raise StorageError("Blob storage is unavailable. Check the storage volume and permissions.") from None

    @staticmethod
    def _redirected(info):
        # Reparse points also cover Windows junctions, not only symlinks.
        return stat.S_ISLNK(info.st_mode) or bool(
            getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
        )

    def _check_root(self):
        info = self.root.lstat()
        if self._redirected(info) or not stat.S_ISDIR(info.st_mode):
            raise StorageIntegrityError("Blob storage directory must be a real directory.")

    def path(self, key: str) -> Path:
        """Diagnostic path only. Application consumers must use put/get."""
        if not isinstance(key, str) or len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
            raise StorageIntegrityError("Invalid blob key")
        return self.root / key

    def _sync_directory(self):
        # Windows development tests cannot fsync directories. Linux is the
        # supported durable runtime; do not silently ignore its fsync failures.
        if os.name == "posix":
            fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)

    def put(self, raw: bytes) -> str:
        if not isinstance(raw, bytes):
            raise TypeError("Blob input must be immutable bytes")
        key = hashlib.sha256(raw).hexdigest()
        dest = self.path(key)
        try:
            self._check_root()
            # Own only this private staging directory, on the blob filesystem.
            # Cleanup can never unlink a final digest, even after publication.
            with tempfile.TemporaryDirectory(prefix=".put-", dir=self.root) as tmp:
                with tempfile.NamedTemporaryFile(mode="w+b", dir=tmp, delete=False) as staged:
                    staged.write(raw)
                    staged.flush()
                    os.fsync(staged.fileno())
                    staged.seek(0)
                    if hashlib.file_digest(staged, "sha256").hexdigest() != key:
                        raise StorageIntegrityError("Staged blob failed integrity verification.")
                    temp = Path(staged.name)
                try:
                    # Atomic create-if-absent, with no replacement window.
                    os.link(temp, dest)
                except FileExistsError:
                    # A concurrent winner may have just published this key.
                    # Never repair/overwrite a corrupt existing blob silently.
                    if self.get(key) != raw:
                        raise StorageIntegrityError("Stored blob differs from the requested bytes.")
            # Also sync after deduplication: the winner may not have synced yet.
            self._sync_directory()
        except OSError:
            raise StorageError(
                "Blob publication failed. Check volume permissions, free space and hard-link support."
            ) from None
        return key

    def get(self, key: str) -> bytes:
        path = self.path(key)
        try:
            self._check_root()
            info = path.lstat()
            if self._redirected(info) or not stat.S_ISREG(info.st_mode):
                raise StorageIntegrityError("Stored blob must be a regular file, not a link or special file.")
            flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
            with os.fdopen(os.open(path, flags), "rb") as source:
                opened = os.fstat(source.fileno())
                if not stat.S_ISREG(opened.st_mode) or not os.path.samestat(info, opened):
                    raise StorageIntegrityError("Stored blob changed while opening it.")
                raw = source.read()
        except FileNotFoundError:
            raise StorageIntegrityError("Stored blob is missing.") from None
        except OSError:
            raise StorageError("Blob read failed. Check the storage volume and permissions.") from None
        if hashlib.sha256(raw).hexdigest() != key:
            raise StorageIntegrityError("Stored blob failed integrity verification.")
        return raw

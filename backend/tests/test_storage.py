"""D02 immutable bytes, competing publishers, and rollback acceptance."""

from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
import hashlib
import multiprocessing
import os
from pathlib import Path
import stat
from threading import Event

import pytest

from workbench.storage import LocalStore, StorageError, StorageIntegrityError


def _initialize_publishers(barrier):
    global _publication_barrier
    _publication_barrier = barrier


def _publish_in_process(root, raw):
    store = LocalStore(Path(root))
    _publication_barrier.wait(timeout=30)
    key = store.put(raw)
    assert store.get(key) == raw
    return key


def _stop_before_publication(root, ready):
    import time

    def pause(*args):
        ready.set()
        time.sleep(60)
        raise RuntimeError("Test parent did not stop the staged writer")

    os.link = pause
    LocalStore(Path(root)).put(b"interrupted publication")


@pytest.mark.parametrize("raw", [b"", b"\xef\xbb\xbfa,b\r\n1,2\r\n", bytes(range(256)) * 1024], ids=["empty", "bom-crlf", "binary"])
def test_exact_bytes_and_existing_object_are_preserved(tmp_path, raw):
    store = LocalStore(tmp_path)
    key = store.put(raw)
    assert key == hashlib.sha256(raw).hexdigest()
    before = store.path(key).stat()
    assert LocalStore(tmp_path).put(raw) == key
    after = store.path(key).stat()
    assert (before.st_ino, before.st_mtime_ns) == (after.st_ino, after.st_mtime_ns)
    assert store.get(key) == raw
    assert list(store.root.iterdir()) == [store.path(key)]
    if os.name == "posix":
        assert stat.S_IMODE(after.st_mode) == 0o600


def test_competing_processes_publish_one_complete_object(tmp_path):
    raw = bytes(range(256)) * 4096
    context = multiprocessing.get_context("spawn")
    with ProcessPoolExecutor(
        max_workers=4, mp_context=context, initializer=_initialize_publishers,
        initargs=(context.Barrier(4),),
    ) as pool:
        keys = list(pool.map(_publish_in_process, [str(tmp_path)] * 4, [raw] * 4))
    assert keys == [hashlib.sha256(raw).hexdigest()] * 4
    store = LocalStore(tmp_path)
    assert store.get(keys[0]) == raw
    assert list(store.root.iterdir()) == [store.path(keys[0])]


def test_concurrent_distinct_objects_do_not_share_staging(tmp_path):
    payloads = [f"independent-{i}".encode() * 1000 for i in range(16)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        keys = list(pool.map(lambda raw: LocalStore(tmp_path).put(raw), payloads))
    store = LocalStore(tmp_path)
    assert [store.get(key) for key in keys] == payloads
    assert sorted(p.name for p in store.root.iterdir()) == sorted(keys)


def test_interrupted_writer_cannot_expose_partial_bytes(tmp_path):
    store = LocalStore(tmp_path)
    committed = store.put(b"existing")
    context = multiprocessing.get_context("spawn")
    ready = context.Event()
    child = context.Process(target=_stop_before_publication, args=(str(tmp_path), ready))
    child.start()
    try:
        assert ready.wait(15)
    finally:
        child.terminate()
        child.join(10)
        if child.is_alive():
            child.kill()
            child.join(10)
    raw = b"interrupted publication"
    key = hashlib.sha256(raw).hexdigest()
    with pytest.raises(StorageIntegrityError, match="missing"):
        store.get(key)
    orphans = list(store.root.glob(".put-*"))
    assert len(orphans) == 1  # A killed process cannot run its normal cleanup.
    assert store.put(raw) == key
    assert store.get(key) == raw and store.get(committed) == b"existing"
    assert orphans[0].exists()  # No unsafe sweep of another operation's staging.


def test_file_sync_precedes_publication_and_directory_sync_follows(tmp_path, monkeypatch):
    store = LocalStore(tmp_path)
    events = []
    fsync, link = os.fsync, os.link

    def record_sync(fd):
        events.append("directory" if stat.S_ISDIR(os.fstat(fd).st_mode) else "file")
        return fsync(fd)

    def record_link(*args):
        events.append("publish")
        return link(*args)

    monkeypatch.setattr(os, "fsync", record_sync)
    monkeypatch.setattr(os, "link", record_link)
    store.put(b"durable ordering")
    assert events == ["file", "publish"] + (["directory"] if os.name == "posix" else [])


@pytest.mark.parametrize("key", [
    "../outside", "/etc/passwd", "C:\\private", "a" * 63, "a" * 65,
    "A" * 64, "g" * 64, "." * 64, "a" * 63 + "\n", "a" * 63 + "\x00",
    "a" * 63 + ":", "a" * 63 + "\\", "a" * 63 + "/", "ａ" * 64,
    None, 1, b"a" * 64, Path("a" * 64),
])
def test_invalid_keys_fail_without_filesystem_access(tmp_path, monkeypatch, key):
    store = LocalStore(tmp_path)
    monkeypatch.setattr(store, "_check_root", lambda: pytest.fail("key must be checked first"))
    with pytest.raises(StorageIntegrityError, match="Invalid blob key"):
        store.get(key)


def test_missing_and_corrupt_objects_fail_without_repair(tmp_path):
    store = LocalStore(tmp_path)
    raw = b"original"
    key = hashlib.sha256(raw).hexdigest()
    with pytest.raises(StorageIntegrityError, match="missing"):
        store.get(key)
    store.path(key).write_bytes(b"corrupted")
    for operation in (lambda: store.get(key), lambda: store.put(raw)):
        with pytest.raises(StorageIntegrityError, match="integrity"):
            operation()
    assert store.path(key).read_bytes() == b"corrupted"
    assert list(store.root.iterdir()) == [store.path(key)]


@pytest.mark.parametrize("raw", [bytearray(b"mutable"), memoryview(b"view"), "text", None])
def test_put_rejects_non_bytes(tmp_path, raw):
    store = LocalStore(tmp_path)
    with pytest.raises(TypeError, match="immutable bytes"):
        store.put(raw)
    assert not list(store.root.iterdir())


def test_readers_cannot_see_staged_bytes(tmp_path, monkeypatch):
    store = LocalStore(tmp_path)
    raw = b"complete-only" * 10000
    key = hashlib.sha256(raw).hexdigest()
    ready, release = Event(), Event()
    link = os.link

    def paused_link(source, destination):
        assert Path(source).read_bytes() == raw
        ready.set()
        assert release.wait(10)
        return link(source, destination)

    monkeypatch.setattr(os, "link", paused_link)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(store.put, raw)
        try:
            assert ready.wait(10)
            with pytest.raises(StorageIntegrityError, match="missing"):
                LocalStore(tmp_path).get(key)
        finally:
            release.set()
        assert future.result() == key
    assert store.get(key) == raw


def test_staging_corruption_is_detected_before_publication(tmp_path, monkeypatch):
    store = LocalStore(tmp_path)

    def corrupt(fd):
        os.lseek(fd, 0, os.SEEK_SET)
        os.write(fd, b"changed")

    monkeypatch.setattr(os, "fsync", corrupt)
    with pytest.raises(StorageIntegrityError, match="Staged blob"):
        store.put(b"original")
    assert not list(store.root.iterdir())


@pytest.mark.parametrize("failure_point", ["file_sync", "link", "directory_sync"])
def test_failed_publication_cleans_only_its_own_staging(tmp_path, monkeypatch, failure_point):
    store = LocalStore(tmp_path)
    existing = store.put(b"committed elsewhere")
    other = store.root / ".put-other-process"
    other.mkdir()
    (other / "private-work").write_bytes(b"leave alone")
    raw = b"new object"
    key = hashlib.sha256(raw).hexdigest()

    def fail(*args, **kwargs):
        raise OSError("private-path-or-credential-must-not-escape")

    with monkeypatch.context() as patch:
        if failure_point == "file_sync":
            patch.setattr(os, "fsync", fail)
        elif failure_point == "link":
            patch.setattr(os, "link", fail)
        else:
            patch.setattr(store, "_sync_directory", fail)
        with pytest.raises(StorageError) as error:
            store.put(raw)
        assert error.value.error_code == "STORAGE_UNAVAILABLE"
        assert "private-path" not in str(error.value)
    assert store.get(existing) == b"committed elsewhere"
    assert (other / "private-work").read_bytes() == b"leave alone"
    # A post-publication failure leaves a complete object, never deletes it.
    if failure_point == "directory_sync":
        assert store.get(key) == raw
    else:
        assert not store.path(key).exists()
    assert store.put(raw) == key
    assert {p.name for p in store.root.iterdir()} == {existing, key, other.name}


def _symlink(source, destination, *, directory=False):
    try:
        destination.symlink_to(source, target_is_directory=directory)
    except OSError:
        if os.name != "nt":
            raise
        pytest.skip("Symlink creation needs platform permission; required on Linux CI")


def test_blob_symlinks_never_read_or_overwrite_outside_bytes(tmp_path):
    store = LocalStore(tmp_path / "managed")
    raw = b"outside content"
    outside = tmp_path / "outside"
    outside.write_bytes(raw)
    key = hashlib.sha256(raw).hexdigest()
    _symlink(outside, store.path(key))
    for operation in (lambda: store.get(key), lambda: store.put(raw)):
        with pytest.raises(StorageIntegrityError, match="regular file"):
            operation()
    assert outside.read_bytes() == raw
    assert store.path(key).is_symlink()


def test_blob_root_cannot_redirect_to_another_directory(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    _symlink(outside, tmp_path / "blobs", directory=True)
    with pytest.raises(StorageIntegrityError, match="real directory"):
        LocalStore(tmp_path)
    assert not list(outside.iterdir())


@pytest.mark.parametrize("special", ["directory", "fifo"])
def test_non_regular_blobs_fail_without_blocking(tmp_path, special):
    store = LocalStore(tmp_path)
    raw = b"special"
    key = hashlib.sha256(raw).hexdigest()
    if special == "fifo":
        if not hasattr(os, "mkfifo"):
            pytest.skip("FIFO requires POSIX")
        os.mkfifo(store.path(key))
    else:
        store.path(key).mkdir()
    for operation in (lambda: store.get(key), lambda: store.put(raw)):
        with pytest.raises(StorageIntegrityError, match="regular file"):
            operation()


@pytest.fixture(params=["sqlite", "postgresql"])
def metadata(request, tmp_path):
    from uuid import uuid4
    from sqlalchemy import create_engine
    from workbench.db import Base, Database, ProjectRow

    admin = None
    if request.param == "postgresql":
        url = os.environ.get("TEST_DATABASE_URL")
        if not url:
            pytest.skip("Set TEST_DATABASE_URL for PostgreSQL rollback acceptance")
        admin = create_engine(url)
        schema = "d02_" + uuid4().hex
        with admin.begin() as connection:
            connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
        db = Database(url)
        db.engine.dispose()
        db.engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
        db.session.configure(bind=db.engine)
    else:
        db = Database(f"sqlite:///{tmp_path}/metadata.sqlite")
    try:
        Base.metadata.create_all(db.engine)
        with db.session.begin() as session:
            session.add_all([ProjectRow(id="p", name="Committed"), ProjectRow(id="q", name="Other project")])
        yield db
    finally:
        db.engine.dispose()
        if admin is not None:
            with admin.begin() as connection:
                connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
            admin.dispose()


@pytest.mark.parametrize("shared", [True, False])
def test_metadata_rollback_never_removes_published_bytes(metadata, tmp_path, shared):
    import json
    from sqlalchemy import select
    from sqlalchemy.exc import IntegrityError
    from workbench.config import Settings
    from workbench.contracts import Source
    from workbench.db import ArtifactRow, ProjectRow
    from workbench.services import upload_csv

    store = LocalStore(tmp_path)
    settings = Settings(_env_file=None, database_url="sqlite://", api_token="a" * 48, efm_password="b" * 24)
    source = Source(**json.loads((Path(__file__).resolve().parents[2] / "examples/source.json").read_text()))
    original = b"\xef\xbb\xbfx,y\r\n1,2\r\n3,4\r\n5,6\r\n"
    with metadata.session.begin() as session:
        committed = upload_csv(session, store, settings, "p", original, "../../original.csv", source)
    raw = original if shared else original.replace(b"5,6", b"7,8")
    with pytest.raises(IntegrityError):
        with metadata.session.begin() as session:
            doomed = upload_csv(session, store, settings, "q", raw, "other.csv", source)
            session.add(ProjectRow(id="p", name="Deliberate duplicate"))
            session.flush()
    with metadata.session() as session:
        assert session.get(ArtifactRow, committed.id).payload["blob_key"] == committed.blob_key
        assert session.get(ArtifactRow, doomed.id) is None
        assert not session.scalars(select(ArtifactRow).where(ArtifactRow.project_id == "q")).all()
    assert store.get(committed.blob_key) == original
    assert store.get(doomed.blob_key) == raw  # Shared object or safe unreferenced orphan.
    assert not list(store.root.glob(".put-*"))

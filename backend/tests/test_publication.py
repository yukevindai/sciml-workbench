"""B08 publication commits, cancellation races, and durable output preflight."""
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from sqlalchemy import event, func, select

from workbench import publication
from workbench.contracts import Report
from workbench.db import ArtifactRow, JobRow
from workbench.errors import DomainError
from workbench.execution import TaskFailure, TaskResult
from workbench.job_metadata import claim_next, fail_claim, StaleClaim
from workbench.processes import ProcessInterrupted
from workbench.services import execute
from workbench.storage import LocalStore, StorageIntegrityError
from workbench.submission import SubmissionScope, SubmissionService
from workbench.worker import prepare_claim
from test_worker import runtime, queue, result_for


def prepared(runtime):
    db, _, _ = runtime
    queue(runtime)
    claimed = claim_next(db, 60, "publisher")
    work, _ = prepare_claim(db, claimed)
    return claimed, work, result_for(work)


def counts(db):
    with db.session() as session:
        return session.scalar(select(func.count()).select_from(ArtifactRow))


def test_cancelled_claim_cannot_publish_or_overwrite_cancellation(runtime):
    db, _, _ = runtime
    claimed, work, result = prepared(runtime)
    before = counts(db)
    with db.session.begin() as session:
        assert publication.fence_cancelled(session, "p", claimed)
    with pytest.raises(StaleClaim):
        publication.publish_result(db, claimed, work, result)
    assert not fail_claim(db, claimed, error="Late error", error_code="INTERNAL_ERROR")
    with db.session.begin() as session:
        assert not publication.fence_cancelled(session, "p", claimed)
    with db.session() as session:
        job = session.get(JobRow, claimed.job_id)
        assert job.state == "failed" and job.error_code == "RUN_CANCELLED"
        assert job.claim_token == claimed.token + 1 and job.result_id is None
    assert counts(db) == before


def test_success_wins_before_late_cancel_error_and_duplicate_result(runtime):
    db, _, _ = runtime
    claimed, work, result = prepared(runtime)
    before = counts(db)
    publication.publish_result(db, claimed, work, result)
    with db.session.begin() as session:
        assert not publication.fence_cancelled(session, "p", claimed)
    assert not fail_claim(db, claimed, error="Late", error_code="INTERNAL_ERROR")
    with pytest.raises(StaleClaim):
        publication.publish_result(db, claimed, work, result)
    with db.session() as session:
        job = session.get(JobRow, claimed.job_id)
        assert job.state == "succeeded" and job.result_id == work.result_id and job.error is None
        provenance = session.scalars(select(ArtifactRow).where(ArtifactRow.kind == "provenance")).all()
        assert sum(work.result_id in row.payload["outputs"] for row in provenance) == 1
    assert counts(db) == before + 2


def test_commit_failure_rolls_back_artifact_provenance_and_job(runtime):
    db, _, _ = runtime
    claimed, work, result = prepared(runtime)
    before = counts(db)
    def reject_commit(session):
        # Observe the pending terminal state, not merely an exception before writes.
        session.flush()
        assert session.get(JobRow, claimed.job_id).state == "succeeded"
        assert session.get(ArtifactRow, work.result_id) is not None
        raise RuntimeError("Injected commit failure")
    event.listen(db.session, "before_commit", reject_commit)
    try:
        with pytest.raises(RuntimeError, match="commit failure"):
            publication.publish_result(db, claimed, work, result)
    finally:
        event.remove(db.session, "before_commit", reject_commit)
    assert counts(db) == before
    with db.session() as session:
        job = session.get(JobRow, claimed.job_id)
        assert job.state == "running" and job.result_id is None and job.finished_at is None


def test_tampered_detached_inputs_are_not_authority(runtime):
    db, _, _ = runtime
    claimed, work, result = prepared(runtime)
    work.artifacts[work.payload["dataset_id"]]["rows"] += 1
    with pytest.raises(TaskFailure, match="authoritative"):
        publication.publish_result(db, claimed, work, result)
    with db.session() as session:
        assert session.get(ArtifactRow, work.result_id) is None


@pytest.mark.parametrize("shutdown", [False, True])
def test_publication_rechecks_cancel_and_shutdown_after_project_lock(runtime, monkeypatch, shutdown):
    db, _, _ = runtime
    if db.engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL lock ordering")
    from workbench import barriers
    claimed, work, result = prepared(runtime)
    started, stopping = Event(), Event()
    original = barriers.lock_project
    def observe(session, pid):
        started.set()
        return original(session, pid)
    with ThreadPoolExecutor(max_workers=1) as pool:
        with db.session.begin() as session:
            if shutdown:
                original(session, "p")
            else:
                assert publication.fence_cancelled(session, "p", claimed)
            monkeypatch.setattr(barriers, "lock_project", observe)
            future = pool.submit(publication.publish_result, db, claimed, work, result, stopped=stopping.is_set)
            assert started.wait(5) and not future.done()
            if shutdown:
                stopping.set()
        with pytest.raises(ProcessInterrupted if shutdown else StaleClaim):
            future.result(timeout=10)
    with db.session() as session:
        assert session.get(ArtifactRow, work.result_id) is None
        assert session.get(JobRow, claimed.job_id).result_id is None


@pytest.mark.parametrize("fault", ["missing", "corrupt", "no-store", "valid"])
def test_output_bytes_verified_without_metadata_transaction(runtime, fault):
    db, settings, _ = runtime
    store = LocalStore(settings.storage_root)
    service = SubmissionService(db, store, settings)
    service.submit(SubmissionScope("p"), "report", {}, request_key="report")
    claimed = claim_next(db, 60, "publisher")
    work, _ = prepare_claim(db, claimed)
    value = execute(store, settings, work)
    if fault == "missing":
        value = value.model_copy(update={"blob_key": "f" * 64, "sha256": "f" * 64})
    elif fault == "corrupt":
        store.path(value.blob_key).write_bytes(b"damaged fixture")
    reads = []
    class CheckedStore:
        def get(self, key):
            assert db.engine.pool.checkedout() == 0
            reads.append(key)
            return store.get(key)
    def publish():
        publication.publish_result(db, claimed, work, TaskResult(artifact=value.model_dump(mode="json")),
                                   store=None if fault == "no-store" else CheckedStore())
    if fault == "valid":
        publish()
        assert reads == [value.blob_key]
    else:
        with pytest.raises(TaskFailure if fault == "no-store" else StorageIntegrityError):
            publish()
        with db.session() as session:
            assert session.get(ArtifactRow, value.id) is None
            assert session.get(JobRow, claimed.job_id).state == "running"


def test_cancel_scope_and_claim_identity_are_required(runtime):
    db, _, _ = runtime
    from workbench.db import ProjectRow
    claimed, _, _ = prepared(runtime)
    with db.session.begin() as session:
        session.add(ProjectRow(id="q", name="Other"))
    with pytest.raises(DomainError), db.session.begin() as session:
        publication.fence_cancelled(session, "q", claimed)
    with pytest.raises(TypeError), db.session.begin() as session:
        publication.fence_cancelled(session, "p", claimed.job_id)

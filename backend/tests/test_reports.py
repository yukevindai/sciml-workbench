"""B06 committed snapshots, scope, retry and PostgreSQL publication races."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import io
import json
from threading import Event
import zipfile

import pytest
from sqlalchemy import event, select, update
from sqlalchemy.exc import IntegrityError

from workbench.contracts import Audit, uid
from workbench.db import ArtifactRow, JobRow, ProjectRow
from workbench.execution import TaskResult
from workbench.job_metadata import claim_next, fail_claim, finish_claim, lock_claim
from workbench.barriers import lock_project
from workbench.reports import ReportSelection, read_snapshot
from workbench.services import DomainError, execute, prepare_execution, save, upload_csv
from workbench.storage import LocalStore
from workbench.submission import SubmissionScope, SubmissionService
from workbench.worker import prepare_claim, publish_result
from workbench.intake import attach
from test_worker import runtime


def service(runtime):
    db, settings, _ = runtime
    return SubmissionService(db, LocalStore(settings.storage_root), settings)


def scope(data, *, jobs=(), artifacts=None, revision=1, cutoff=3):
    return SubmissionScope("p", artifacts if artifacts is not None else {data.id}, set(), "run-one",
                           ReportSelection({data.id}, set(jobs), revision, cutoff))


def submit(runtime, selected=None, key="report", retry=None):
    identity = {"action_id": key, "attempt_id": "one"} if selected else {"request_key": key}
    return service(runtime).submit(selected or SubmissionScope("p"), "report", {},
                                   retry_of_job_id=retry, **identity)


def error(code, fn):
    with pytest.raises(DomainError) as caught:
        fn()
    assert caught.value.error_code == code


def test_request_time_capture_survives_later_upload_and_metadata_change(runtime):
    db, settings, data = runtime
    accepted = submit(runtime)
    original = deepcopy(accepted.payload)
    with db.session.begin() as s:
        s.get(ProjectRow, "p").name = "Changed later"
        later = upload_csv(s, LocalStore(settings.storage_root), settings, "p", b"x,y\n2,3\n4,5\n6,7\n",
                           "later.csv", data.source)
    # New active work cannot invalidate replay or enter its old snapshot.
    service(runtime).submit(SubmissionScope("p"), "audit", {"dataset_id": later.id}, request_key="later")
    replay = submit(runtime)
    assert replay.id == accepted.id and replay.payload == original
    with db.session() as s:
        work = prepare_execution(s, s.get(JobRow, accepted.id))
    assert work.report["project"]["name"] == "Runtime"
    assert later.id not in {a["id"] for a in work.report["artifacts"]}
    value = execute(LocalStore(settings.storage_root), settings, work)
    with zipfile.ZipFile(io.BytesIO(LocalStore(settings.storage_root).get(value.blob_key))) as archive:
        assert json.loads(archive.read("snapshot.json")) == original["snapshot"]
        assert json.loads(archive.read("jobs.json")) == []
    # PostgreSQL and SQLite enforce the frozen capture through the accepted payload guard.
    with pytest.raises(IntegrityError), db.session.begin() as s:
        s.execute(update(JobRow).where(JobRow.id == accepted.id).values(payload={}))


def test_run_capture_ignores_unrelated_work_and_checks_selected_jobs(runtime):
    db, _, data = runtime
    active = service(runtime).submit(SubmissionScope("p"), "audit", {"dataset_id": data.id}, request_key="active")
    report = submit(runtime, scope(data))
    assert report.payload["snapshot"]["jobs"] == []
    assert [a["id"] for a in report.payload["snapshot"]["artifacts"]] == [data.id]
    error("PROJECT_BUSY", lambda: submit(runtime, scope(data, jobs={active.id}), key="selected"))
    error("PROJECT_BUSY", lambda: submit(runtime, key="manual"))
    error("JOB_NOT_FOUND", lambda: submit(runtime, scope(data, jobs={"missing"}), key="missing"))
    error("POLICY_DENIED", lambda: submit(runtime, scope(data, artifacts=set()), key="denied"))
    error("IDEMPOTENCY_CONFLICT", lambda: submit(runtime, scope(data, revision=2)))
    error("IDEMPOTENCY_CONFLICT", lambda: submit(runtime, scope(data, cutoff=4)))
    error("POLICY_DENIED", lambda: submit(runtime, scope(data, artifacts=set())))


def test_selected_failed_job_inputs_and_safe_outcomes_are_captured(runtime):
    db, _, data = runtime
    job = service(runtime).submit(SubmissionScope("p"), "audit", {"dataset_id": data.id}, request_key="audit")
    claimed = claim_next(db, 60, "worker")
    fail_claim(db, claimed, error="private-worker-canary", error_code="INTERNAL_ERROR")
    accepted = submit(runtime, scope(data, jobs={job.id}))
    snapshot = read_snapshot(accepted.payload)
    assert snapshot["jobs"][0]["state"] == "failed"
    assert "private-worker-canary" not in json.dumps(snapshot)
    assert snapshot["scope"]["execution_cutoff"] == 3
    assert snapshot["scope"]["export_status_at_cutoff"] == "pending"
    error("POLICY_DENIED", lambda: submit(runtime, scope(data, jobs={job.id}, artifacts=set()), key="no-inputs"))


def test_report_retry_reuses_capture_after_new_active_work(runtime):
    db, _, data = runtime
    first = submit(runtime)
    claim = claim_next(db, 60, "worker")
    fail_claim(db, claim, error="archive interrupted", error_code="WORKER_INTERRUPTED")
    service(runtime).submit(SubmissionScope("p"), "audit", {"dataset_id": data.id}, request_key="later")
    second = submit(runtime, key="retry", retry=first.id)
    assert second.id != first.id and second.payload == first.payload
    assert submit(runtime, key="retry", retry=first.id).id == second.id
    error("PROJECT_BUSY", lambda: submit(runtime, key="recapture"))


def test_worker_rejects_changed_capture_and_corrupt_digest(runtime):
    db, settings, _ = runtime
    accepted = submit(runtime)
    bad = deepcopy(accepted.payload)
    bad["snapshot"]["project"]["name"] = "Tampered"
    error("INTEGRITY_FAILED", lambda: read_snapshot(bad))
    claimed = claim_next(db, 60, "worker")
    work, _ = prepare_claim(db, claimed)
    work.report["project"]["name"] = "Changed detached work"
    value = execute(LocalStore(settings.storage_root), settings, work)
    with pytest.raises(ValueError, match="differs from its accepted capture"):
        publish_result(db, claimed, work, TaskResult(artifact=value.model_dump(mode="json")), store=LocalStore(settings.storage_root))
    with db.session() as s:
        assert s.get(JobRow, accepted.id).state == "running"
        assert s.get(ArtifactRow, value.id) is None


def test_legacy_report_job_fails_closed_without_execution_time_recapture(runtime):
    db, _, _ = runtime
    with db.session.begin() as s:
        old = JobRow(project_id="p", kind="report", request_key="legacy", payload={})
        s.add(old)
    assert submit(runtime, key="legacy").id == old.id
    with db.session() as s:
        error("INTEGRITY_FAILED", lambda: prepare_execution(s, s.get(JobRow, old.id)))


def test_repeated_exports_do_not_embed_prior_report_or_capture_payload(runtime):
    db, settings, _ = runtime
    first = submit(runtime)
    claimed = claim_next(db, 60, "worker")
    work, _ = prepare_claim(db, claimed)
    result = execute(LocalStore(settings.storage_root), settings, work)
    publish_result(db, claimed, work, TaskResult(artifact=result.model_dump(mode="json")), store=LocalStore(settings.storage_root))
    second = submit(runtime, key="next")
    assert second.payload["snapshot"]["artifacts"] == first.payload["snapshot"]["artifacts"]
    with db.session() as s:
        provenance = s.scalar(select(ArtifactRow).where(ArtifactRow.kind == "provenance",
            ArtifactRow.payload["activity"].as_string() == "report"))
        assert "snapshot" not in provenance.payload["parameters"]


def test_capture_waits_for_selected_publication_and_sees_atomic_result(runtime):
    db, _, data = runtime
    if db.engine.dialect.name != "postgresql":
        pytest.skip("Observe the PostgreSQL publication barrier")
    job = service(runtime).submit(SubmissionScope("p"), "audit", {"dataset_id": data.id}, request_key="producer")
    claimed = claim_next(db, 60, "publisher")
    result_id = uid()
    selected = scope(data, jobs={job.id}, artifacts={data.id, result_id})
    published, release, attempted = Event(), Event(), Event()

    def publisher():
        with db.session.begin() as s:
            lock_project(s, "p")
            lock_claim(s, claimed)
            save(s, Audit(id=result_id, project_id="p", parents=[data.id], dataset_id=data.id, config={}, result={}))
            finish_claim(s, claimed, state="succeeded", result_id=result_id)
            published.set()
            assert release.wait(15)

    def observe(conn, cursor, statement, parameters, context, executemany):
        if published.is_set() and "FOR UPDATE" in statement and "projects" in statement:
            attempted.set()

    event.listen(db.engine, "before_cursor_execute", observe)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            pending = pool.submit(publisher)
            try:
                assert published.wait(15)
                capture = pool.submit(submit, runtime, selected)
                assert attempted.wait(15)
                assert not capture.done()
            finally:
                release.set()
            pending.result(15)
            report = capture.result(15)
        with db.session() as s:
            snapshot = read_snapshot(s.get(JobRow, report.id).payload)
        assert {a["id"] for a in snapshot["artifacts"]} == {data.id, result_id}
        assert snapshot["jobs"][0]["result_id"] == result_id
        assert snapshot["jobs"][0]["state"] == "succeeded"
    finally:
        event.remove(db.engine, "before_cursor_execute", observe)


def test_selected_materials_are_distinct_from_allowed_materials(runtime):
    db, settings, data = runtime
    with db.session.begin() as s:
        first = attach(s, LocalStore(settings.storage_root), settings, "p", b"%PDF-first", "first.pdf", "application/pdf", None, "first")
        second = attach(s, LocalStore(settings.storage_root), settings, "p", b"%PDF-second", "second.pdf", "application/pdf", None, "second")
    selected = SubmissionScope("p", {data.id}, {first.id, second.id}, "run-one",
                               ReportSelection({data.id}, set(), 1, 3, {first.id}))
    report = submit(runtime, selected)
    assert [m["id"] for m in report.payload["snapshot"]["materials"]] == [first.id]
    narrowed = SubmissionScope("p", {data.id}, {second.id}, "run-one", selected.report_selection)
    error("POLICY_DENIED", lambda: submit(runtime, narrowed))
    error("POLICY_DENIED", lambda: submit(runtime, narrowed, key="new"))


def test_selected_output_includes_transitive_dependencies_and_producer(runtime):
    db, _, data = runtime
    job = service(runtime).submit(SubmissionScope("p"), "audit", {"dataset_id": data.id}, request_key="producer")
    claim = claim_next(db, 60, "publisher")
    work, _ = prepare_claim(db, claim)
    value = Audit(id=work.result_id, project_id="p", parents=[data.id], dataset_id=data.id, config={}, result={})
    publish_result(db, claim, work, TaskResult(artifact=value.model_dump(mode="json")))
    selected = SubmissionScope("p", {data.id, value.id}, set(), "run-one", ReportSelection({value.id}, set(), 1, 3))
    snapshot = submit(runtime, selected).payload["snapshot"]
    assert {a["id"] for a in snapshot["artifacts"]} == {value.id, data.id}
    assert [j["id"] for j in snapshot["jobs"]] == [job.id]
    assert snapshot["jobs"][0]["state"] == "succeeded"


def test_capture_commit_failure_leaves_no_accepted_job(runtime):
    db, _, _ = runtime
    def reject(connection):
        raise RuntimeError("simulated commit failure")
    event.listen(db.engine, "commit", reject)
    try:
        with pytest.raises(RuntimeError, match="simulated commit failure"):
            submit(runtime)
    finally:
        event.remove(db.engine, "commit", reject)
    with db.session() as s:
        assert s.scalar(select(JobRow.id)) is None
    assert submit(runtime).state == "queued"


def test_concurrent_same_key_returns_one_committed_capture(runtime):
    db, _, _ = runtime
    from threading import Barrier
    barrier = Barrier(4)
    def submit_at_once(_):
        barrier.wait(timeout=15)
        return submit(runtime)
    with ThreadPoolExecutor(max_workers=4) as pool:
        reports = list(pool.map(submit_at_once, range(4)))
    assert len({r.id for r in reports}) == 1
    assert len({r.payload["snapshot_digest"] for r in reports}) == 1
    with db.session() as s:
        assert len(s.scalars(select(JobRow)).all()) == 1
        assert read_snapshot(s.get(JobRow, reports[0].id).payload) == reports[0].payload["snapshot"]


def test_foreign_job_and_artifact_cannot_enter_capture(runtime):
    db, _, data = runtime
    with db.session.begin() as s:
        s.add(ProjectRow(id="q", name="Foreign"))
        s.flush()
        foreign = JobRow(project_id="q", kind="audit", request_key="foreign", payload={})
        s.add(foreign)
    error("JOB_NOT_FOUND", lambda: submit(runtime, scope(data, jobs={foreign.id})))
    selected = SubmissionScope("q", {data.id}, set(), "run-one", ReportSelection({data.id}, set(), 1, 3))
    error("ARTIFACT_NOT_FOUND", lambda: submit(runtime, selected))

"""C12 sealed comparisons and exposure across supported read boundaries."""
from dataclasses import replace
import json

import pytest
from sqlalchemy import select, update, delete
from sqlalchemy.exc import IntegrityError

from workbench.contracts import Audit, Split, Benchmark, BenchmarkInput, uid
from workbench.db import ArtifactRow, JobRow, EvaluationRow, ExposureRow, EvaluationJobRow
from workbench.errors import DomainError
from workbench.evaluation import (seal_evaluation, submit_candidate, release_evaluation, evaluation_status,
                                 split_fingerprint, record_exposure)
from workbench.job_metadata import claim_next, finish_claim
from workbench.projections import ReadService, ReadScope
from workbench.references import check_metric
from workbench.services import save, artifact
from workbench.storage import LocalStore
from workbench.submission import SubmissionService, SubmissionScope
from workbench.worker import process_job
from test_worker import runtime
from test_workflow import env, create, upload, run, fixture


@pytest.fixture
def comparison(runtime):
    """Metadata security fixture; scientific integration below runs real adapters."""
    db, settings, data = runtime
    with db.session.begin() as session:
        audit = save(session, Audit(project_id="p", dataset_id=data.id, config={}, result={}))
        split = save(session, Split(project_id="p", dataset_id=data.id, audit_id=audit.id,
                                   config={}, assignments=["train", "validation", "test"], result={}))
    request = BenchmarkInput(**{**fixture("benchmark"), "dataset_id": data.id, "split_id": split.id,
        "target": "y", "numeric_features": ["x"], "categorical_features": []}).model_dump(mode="json")
    scope = SubmissionScope("p", {data.id, audit.id, split.id}, set(), "owner")
    protocol = seal_evaluation(db, scope, {"mean": {**request, "model": "mean"}, "ridge": request})
    scope = replace(scope, artifact_ids=scope.artifact_ids | {protocol.id})
    service = SubmissionService(db, LocalStore(settings.storage_root), settings)
    return service, scope, protocol


def finish_candidate(service, scope, protocol, candidate="mean"):
    job = submit_candidate(service, scope, protocol.id, candidate, action_id=candidate, attempt_id="one")
    claimed = claim_next(service.db, 120, "fixture")
    with service.db.session.begin() as session:
        p = job.payload
        bench = save(session, Benchmark(project_id=scope.project_id, parents=[p["dataset_id"], p["split_id"]],
            dataset_id=p["dataset_id"], split_id=p["split_id"], model=p["model"], seed=p["seed"], config=p,
            status="succeeded", bundle_key=service.store.put(b"quarantined-test-predictions"),
            result={"metrics": {"validation": {"rmse": 1.25, "secret_test": 999}, "test": {"rmse": 987654321}},
                    "test_predictions": [987654321], "diagnostic": "test-canary"}))
        session.flush()
        finish_claim(session, claimed, state="succeeded", result_id=bench.id)
    return job, bench


def read_scope(service, scope, protocol):
    with service.db.session() as session:
        ids = frozenset(session.scalars(select(ArtifactRow.id).where(ArtifactRow.project_id == scope.project_id)))
        jobs = frozenset(session.scalars(select(JobRow.id).where(JobRow.project_id == scope.project_id)))
    return ReadScope(scope.project_id, "agent", scope.run_id, ids, jobs, protocol.id)


def test_selection_projection_and_every_raw_route_fail_closed(comparison):
    service, scope, protocol = comparison
    job, bench = finish_candidate(service, scope, protocol)
    reads = ReadService("test-secret")
    agent = read_scope(service, scope, protocol)
    with service.db.session.begin() as session:
        projected = reads.artifact(session, agent, bench.id)
        assert projected["metrics"] == {"validation": {"rmse": 1.25}}
        assert not projected["test_visible"] and "987654321" not in json.dumps(projected)
        assert "canary" not in json.dumps(projected) and "bundle_key" not in projected
        for identifier in (bench.id, protocol.dataset_id, protocol.id):
            with pytest.raises(DomainError):
                reads.download(session, agent, identifier)
        with pytest.raises(DomainError):
            reads.artifact(session, agent, protocol.dataset_id)
        with pytest.raises(DomainError):
            reads.artifact(session, replace(agent, purpose="final"), bench.id)
        reference = {"artifact_id": bench.id, "partition": "test", "field_path": "/result/metrics/test/rmse", "value": 987654321}
        with pytest.raises(DomainError):
            check_metric(session, agent, reference)
        assert not list(session.scalars(select(ExposureRow)))
        assert reads.job(session, agent, job.id).result_id == bench.id
    from workbench.evaluation import search_failure_memory
    with pytest.raises(DomainError, match="prose"):
        search_failure_memory(service.db, service.settings, agent)


def test_upgrade_retains_prior_unknown_exposure_and_refuses_erasure(tmp_path):
    from workbench.db import Database, ProjectRow
    from test_metadata import migrate
    db = Database(f"sqlite:///{tmp_path}/legacy.sqlite")
    try:
        migrate(db, "0004")
        with db.session.begin() as session:
            session.add(ProjectRow(id="p", name="Legacy project"))
            session.flush()
            session.add(ArtifactRow(id="old", project_id="p", kind="dataset", payload={
                "id": "old", "project_id": "p", "kind": "dataset", "sha256": "a" * 64}))
        migrate(db)
        with db.session() as session:
            event = session.scalar(select(ExposureRow))
            assert event.dataset_sha256 == "a" * 64 and event.split_sha256 == "*" and event.via == "legacy_unknown"
        db.engine.dispose()
        restored = Database(db.engine.url)
        try:
            with restored.session() as session:
                assert session.scalar(select(ExposureRow)).id == event.id
            with pytest.raises(RuntimeError, match="retained"):
                migrate(restored, "0004", downgrade=True)
        finally:
            restored.engine.dispose()
    finally:
        db.engine.dispose()


def test_release_requires_all_candidates_then_final_access_records_exposure(comparison):
    service, scope, protocol = comparison
    _, bench = finish_candidate(service, scope, protocol)
    with pytest.raises(DomainError, match="Every predeclared"):
        release_evaluation(service.db, scope, protocol.id)
    job = submit_candidate(service, scope, protocol.id, "ridge", action_id="ridge", attempt_id="one")
    with pytest.raises(DomainError, match="settle"):
        release_evaluation(service.db, scope, protocol.id)
    claimed = claim_next(service.db, 120, "failed-fixture")
    with service.db.session.begin() as session:
        finish_claim(session, claimed, state="failed", error="Fixture rejection", error_code="ADMISSION_REJECTED")
    assert release_evaluation(service.db, scope, protocol.id)["state"] == "released"
    agent = read_scope(service, scope, protocol)
    with service.db.session.begin() as session:
        reads = ReadService("test-secret")
        assert not reads.artifact(session, agent, bench.id)["test_visible"]
        final = reads.artifact(session, replace(agent, purpose="final"), bench.id)
        assert final["metrics"]["test"]["rmse"] == 987654321
        assert final["evaluation"]["exposure_status"] == "exposed"
        assert not final["evaluation"]["clean_holdout_eligible"]
    with pytest.raises(DomainError, match="Released"):
        submit_candidate(service, scope, protocol.id, "mean", action_id="new", attempt_id="two")


def test_exposure_cannot_be_reset_by_new_run_upload_or_split_ids(comparison):
    service, scope, protocol = comparison
    _, bench = finish_candidate(service, scope, protocol)
    with service.db.session.begin() as session:
        ReadService("secret").artifact(session, ReadScope("p"), bench.id)
        data = artifact(session, "p", protocol.dataset_id)
        split = artifact(session, "p", protocol.split_id)
        duplicate = save(session, data.model_copy(update={"id": uid(), "parents": []}))
        audit = save(session, Audit(project_id="p", dataset_id=duplicate.id, config={}, result={}))
        other_split = save(session, split.model_copy(update={"id": uid(), "dataset_id": duplicate.id,
            "audit_id": audit.id, "parents": [duplicate.id, audit.id]}))
        assert split_fingerprint(split) == split_fingerprint(other_split)
    with pytest.raises(DomainError, match="Exposure changed"):
        submit_candidate(service, scope, protocol.id, "ridge", action_id="ridge", attempt_id="one")
    request = {**bench.config, "dataset_id": duplicate.id, "split_id": other_split.id}
    new_scope = SubmissionScope("p", {duplicate.id, audit.id, other_split.id}, set(), "new-run")
    with pytest.raises(DomainError, match="exposed"):
        seal_evaluation(service.db, new_scope, {"candidate": request})
    exploratory = seal_evaluation(service.db, new_scope, {"candidate": request}, exploratory=True)
    assert exploratory.exposure_status == "exposed"
    with service.db.session() as session:
        assert list(session.scalars(select(ExposureRow)))


def test_seal_freezes_configuration_capability_and_authority(comparison):
    service, scope, protocol = comparison
    with service.db.session() as session:
        request = session.get(EvaluationRow, protocol.id).requests["mean"]
    with pytest.raises(DomainError, match="validation-only"):
        seal_evaluation(service.db, scope, {"a": request}, selection_rule="validation")
    with pytest.raises(DomainError, match="frozen features"):
        seal_evaluation(service.db, scope, {"a": request, "b": {**request, "numeric_features": ["other"]}})
    with pytest.raises(DomainError):
        submit_candidate(service, replace(scope, run_id="other-run"), protocol.id, "mean", action_id="a", attempt_id="one")
    with pytest.raises(DomainError):
        submit_candidate(service, scope, protocol.id, "unplanned", action_id="a", attempt_id="one")
    with pytest.raises(DomainError):
        submit_candidate(service, replace(scope, artifact_ids={protocol.id}), protocol.id, "mean", action_id="a", attempt_id="one")
    job = submit_candidate(service, scope, protocol.id, "mean", action_id="a", attempt_id="one")
    assert submit_candidate(service, scope, protocol.id, "mean", action_id="a", attempt_id="one").id == job.id
    with pytest.raises(DomainError, match="accepted attempt"):
        submit_candidate(service, scope, protocol.id, "mean", action_id="a", attempt_id="two")


def test_database_guards_preserve_seals_bindings_and_exposure(comparison):
    service, scope, protocol = comparison
    finish_candidate(service, scope, protocol)
    with service.db.session.begin() as session:
        row = record_exposure(session, "p", protocol.dataset_sha256, "*", protocol.id, "raw_fixture")
    for statement in (
        update(ExposureRow).values(via="erased"), delete(ExposureRow),
        update(EvaluationRow).values(requests={}), delete(EvaluationRow),
        update(EvaluationJobRow).values(candidate_id="different"), delete(EvaluationJobRow),
    ):
        with pytest.raises(IntegrityError), service.db.session.begin() as session:
            session.execute(statement)


def test_failure_import_records_exposure_before_upstream_io(comparison):
    from workbench.worker import prepare_claim
    from workbench.db import ExternalOperationRow
    service, scope, protocol = comparison
    _, bench = finish_candidate(service, scope, protocol)
    job = service.submit(SubmissionScope("p"), "failure", {"benchmark_id": bench.id,
        "reason": "Manual assessment", "uncertainty_notes": "Synthetic fixture"}, request_key="import")
    claimed = claim_next(service.db, 120, "import")
    prepare_claim(service.db, claimed)
    with service.db.session() as session:
        assert session.get(ExternalOperationRow, job.id).state == "prepared"
        assert session.scalar(select(ExposureRow)).via == "failure_import"
        assert not evaluation_status(session, scope, protocol.id)["clean_holdout_eligible"]


def test_http_exposure_commit_failure_returns_no_result(comparison):
    from fastapi.testclient import TestClient
    from sqlalchemy import event
    from workbench.api import create_app
    service, scope, protocol = comparison
    _, bench = finish_candidate(service, scope, protocol)
    app = create_app(service.settings)
    def fail_commit(session):
        raise RuntimeError("Synthetic exposure commit failure")
    event.listen(app.state.db.session.class_, "before_commit", fail_commit)
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            client.headers["Authorization"] = "Bearer " + service.settings.api_token.get_secret_value()
            for path in (f"artifacts/{bench.id}", "artifacts", "artifact-previews", f"artifacts/{bench.id}/download"):
                response = client.get(f"/api/v1/projects/p/{path}")
                assert response.status_code == 500
                assert "987654321" not in response.text and "quarantined-test-predictions" not in response.text
        with service.db.session() as session:
            assert not list(session.scalars(select(ExposureRow)))
    finally:
        event.remove(app.state.db.session.class_, "before_commit", fail_commit)
        app.state.db.engine.dispose()


def test_c07_multi_candidate_criterion_and_report_capture(comparison):
    from workbench.outcomes import submit_outcome
    from workbench.reports import capture
    from workbench.services import report_bundle
    from test_outcomes import CRITERION, HUMAN
    import io
    import zipfile
    service, scope, _ = comparison
    with service.db.session() as session:
        original = session.scalar(select(EvaluationRow))
        requests = original.requests
    protocol = seal_evaluation(service.db, scope, requests, criterion=CRITERION)
    scope = replace(scope, artifact_ids=scope.artifact_ids | {protocol.id})
    job, bench = finish_candidate(service, scope, protocol)
    payload = {"source_job_id": job.id, "benchmark_id": bench.id, "reason": "Missed declared threshold",
        "uncertainty_notes": "Synthetic metadata fixture", "observation": {
        "kind": "criterion_missed", "protocol_id": protocol.id, "protocol_revision": 1, "criterion_id": "quality",
        "metric": {"artifact_id": bench.id, "partition": "validation", "field_path": "/result/metrics/validation/rmse", "value": 1.25},
        "success_comparison": "lt", "threshold": 0.0}}
    outcome = submit_outcome(service, SubmissionScope("p"), payload, actor=HUMAN, request_key="outcome")
    assert outcome.kind == "failure"
    # Capture only the settled comparison inputs, not the queued import.
    from workbench.reports import ReportSelection
    with service.db.session.begin() as session:
        ids = frozenset(session.scalars(select(ArtifactRow.id)))
        report_scope = SubmissionScope("p", ids, set(), "owner",
            ReportSelection(artifact_ids=frozenset([protocol.id, bench.id]), job_ids=frozenset([job.id]), revision=1, execution_cutoff=1))
        snapshot = capture(session, "p", report_scope)
        assert snapshot["evaluation_states"][0]["protocol_id"] == protocol.id
        assert snapshot["evaluation_states"][0]["state"] == "sealed"
        assert snapshot["test_exposures"] == []
        # The read-boundary canary is deliberately not a scientific ZIP bundle.
        with pytest.raises(zipfile.BadZipFile):
            report_bundle(snapshot, service.store)


def test_real_upstream_full_result_is_quarantined_until_release(env):
    client, db, settings = env
    pid = create(client)
    data = upload(client, pid)
    audit = run(env, pid, "audit", {"dataset_id": data["id"], "config": fixture("audit")})
    split = run(env, pid, "split", {"dataset_id": data["id"], "audit_id": audit["id"], "config": fixture("split")})
    request = {**fixture("benchmark"), "dataset_id": data["id"], "split_id": split["id"]}
    scope = SubmissionScope(pid, {data["id"], audit["id"], split["id"]}, set(), "real-run")
    protocol = seal_evaluation(db, scope, {"ridge": request})
    scope = replace(scope, artifact_ids=scope.artifact_ids | {protocol.id})
    service = SubmissionService(db, LocalStore(settings.storage_root), settings)
    job = submit_candidate(service, scope, protocol.id, "ridge", action_id="baseline", attempt_id="one")
    process_job(settings, claim_next(db, 120, "real-evaluation"), db=db)
    with db.session() as session:
        completed = session.get(JobRow, job.id)
        assert completed.state == "succeeded", completed.error
        bench = artifact(session, pid, completed.result_id)
        assert set(bench.result["metrics"]) == {"validation", "test"}
    agent = read_scope(service, scope, protocol)
    with db.session.begin() as session:
        view = ReadService("secret").artifact(session, agent, bench.id)
        assert set(view["metrics"]) == {"validation"}
        from workbench.evaluation import SCALAR_METRICS
        assert view["metrics"]["validation"] == {k: v for k, v in bench.result["metrics"]["validation"].items() if k in SCALAR_METRICS}
    release_evaluation(db, scope, protocol.id)
    with db.session.begin() as session:
        final = ReadService("secret").artifact(session, replace(agent, purpose="final"), bench.id)
        assert final["metrics"]["test"] == {k: v for k, v in bench.result["metrics"]["test"].items() if k in SCALAR_METRICS}
    preview = next(v for v in client.get(f"/api/v1/projects/{pid}/artifact-previews").json() if v["id"] == bench.id)
    assert preview["kind"] == "benchmark_preview" and preview["test_results"] == "withheld"
    assert preview["validation_metrics"] == view["metrics"]["validation"] and preview["protocol_ids"] == [protocol.id]
    assert preview["method"]["validation_search"] and preview["method"]["name"] == "ridge"
    assert "run_id" not in preview and "prediction_sha256" not in json.dumps(preview)
    # Every legacy manual path retains compatibility and persists disclosure.
    for path in (f"artifacts/{bench.id}", "artifacts", f"artifacts/{bench.id}/download", f"evaluations/{protocol.id}"):
        response = client.get(f"/api/v1/projects/{pid}/{path}")
        assert response.status_code == 200, response.text
    with db.session() as session:
        assert {e.via for e in session.scalars(select(ExposureRow))} >= {"agent_final", "artifact_detail", "artifact_list", "artifact_download"}


def manual_client(service):
    from fastapi.testclient import TestClient
    from workbench.api import create_app
    client = TestClient(create_app(service.settings))
    client.headers["Authorization"] = "Bearer " + service.settings.api_token.get_secret_value()
    return client


def exposures(service):
    with service.db.session() as session:
        return [row.via for row in session.scalars(select(ExposureRow))]


def test_manual_previews_withhold_test_output_until_explicit_reveal(comparison):
    service, scope, protocol = comparison
    _, bench = finish_candidate(service, scope, protocol)
    with manual_client(service) as client:
        response = client.get("/api/v1/projects/p/artifact-previews")
        assert response.status_code == 200, response.text
        assert "987654321" not in response.text and "canary" not in response.text and "bundle_key" not in response.text
        preview = next(v for v in response.json() if v["id"] == bench.id)
        assert preview["kind"] == "benchmark_preview" and preview["test_results"] == "withheld"
        assert preview["validation_metrics"] == {"rmse": 1.25} and preview["method"] is None
        assert preview["protocol_ids"] == [protocol.id] and preview["holdout_exposure"] == "unexposed"
        assert preview["bundle_available"] and preview["config"]["model"] == "mean"
        assert exposures(service) == []
        with service.db.session() as session:
            assert evaluation_status(session, scope, protocol.id)["clean_holdout_eligible"]
        # The complete detail is the explicit reveal and records exposure before returning.
        revealed = client.get(f"/api/v1/projects/p/artifacts/{bench.id}")
        assert revealed.status_code == 200 and "987654321" in revealed.text
        assert exposures(service) == ["artifact_detail"]
        again = next(v for v in client.get("/api/v1/projects/p/artifact-previews").json() if v["id"] == bench.id)
        assert again["holdout_exposure"] == "exposed" and again["test_results"] == "withheld"
        assert exposures(service) == ["artifact_detail"]


def test_previews_keep_failed_runs_honest_and_expose_outcome_records(comparison):
    from workbench.contracts import Failure
    service, scope, protocol = comparison
    _, bench = finish_candidate(service, scope, protocol)
    with service.db.session.begin() as session:
        failed = save(session, Benchmark(project_id="p", parents=bench.parents, dataset_id=bench.dataset_id,
            split_id=bench.split_id, model="ridge", seed=0, config=bench.config, status="failed",
            error="Admission rejected: undeclared unit"))
    with manual_client(service) as client:
        values = {v["id"]: v for v in client.get("/api/v1/projects/p/artifact-previews").json()}
        assert values[failed.id]["test_results"] == "not_produced" and values[failed.id]["validation_metrics"] is None
        assert values[failed.id]["error"] == "Admission rejected: undeclared unit" and values[failed.id]["protocol_ids"] == []
        assert exposures(service) == []
        with service.db.session.begin() as session:
            save(session, Failure(project_id="p", parents=[bench.id], benchmark_id=bench.id, external_project_id="x",
                external_record_id="y", reason="Missed objective", record={"test_rmse": 987654321}))
        response = client.get("/api/v1/projects/p/artifact-previews")
        assert response.status_code == 200 and "987654321" in response.text
        assert exposures(service) == ["artifact_preview_list"]


def test_agent_scope_cannot_use_manual_previews(comparison):
    service, scope, protocol = comparison
    finish_candidate(service, scope, protocol)
    with service.db.session() as session:
        with pytest.raises(DomainError) as error:
            ReadService("secret").artifact_previews(session, read_scope(service, scope, protocol))
        assert error.value.status == 403

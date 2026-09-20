"""C07 actor truth, objective references, predeclaration and real imports."""
import io
import json
import zipfile

import pytest
from sqlalchemy import select
from pydantic import ValidationError

from workbench.bootstrap import main as provision
from workbench.contracts import Audit, Split, Benchmark, BenchmarkInput
from workbench.db import ArtifactRow, JobRow, ExternalOperationRow
from workbench.errors import DomainError
from workbench.job_metadata import claim_next, finish_claim, submit_job
from workbench.outcomes import seal_outcome_protocol, submit_outcome, runtime_benchmark_id
from workbench.services import save, artifact, report_bundle
from workbench.storage import LocalStore
from workbench.submission import SubmissionScope, SubmissionService
from workbench.worker import prepare_claim, publish_result, process_job
from workbench.external_operations import run_import
from workbench.reports import capture
from test_external_operations import public_runner
from test_worker import runtime
from test_workflow import env, create, upload, run, fixture

HUMAN = {"kind": "human", "operator_session_reference": "opaque-audit-reference"}
AGENT = {"kind": "agent", "run_id": "run", "action_id": "action", "provider": "fixture-provider",
         "model": "fixture-model", "prompt_version": "v1", "policy_rule_id": "objective-only",
         "policy": {"policy_id": "policy", "revision": 1, "sha256": "a" * 64}}
CRITERION = {"id": "quality", "metric": "rmse", "partition": "validation", "comparison": "lt",
             "threshold": 0.0, "declaration_reference": {"kind": "operator_assertion", "id": "declaration"}}


@pytest.fixture
def outcome(runtime):
    """Metadata-only fixtures; real scientific execution is tested below."""
    db, settings, data = runtime
    with db.session.begin() as session:
        audit = save(session, Audit(project_id="p", dataset_id=data.id, config={}, result={}))
        split = save(session, Split(project_id="p", dataset_id=data.id, audit_id=audit.id,
                                   config={}, assignments=["train", "validation", "test"], result={}))
    request = BenchmarkInput(**{**fixture("benchmark"), "dataset_id": data.id, "split_id": split.id}).model_dump(mode="json")
    scope = SubmissionScope(project_id="p")
    protocol = seal_outcome_protocol(db, scope, request, CRITERION)
    with db.session.begin() as session:
        source = submit_job(session, "p", "benchmark", request, "source")
    claim = claim_next(db, 120, "test")
    with db.session.begin() as session:
        bench = save(session, Benchmark(project_id="p", parents=[data.id, split.id], dataset_id=data.id,
            split_id=split.id, model=request["model"], seed=request["seed"], config=request,
            status="succeeded", result={"metrics": {"validation": {"rmse": 2.5}}}))
        session.flush()
        finish_claim(session, claim, state="succeeded", result_id=bench.id)
    service = SubmissionService(db, LocalStore(settings.storage_root), settings)
    payload = {"benchmark_id": bench.id, "source_job_id": source.id, "reason": "Missed declared quality threshold",
        "uncertainty_notes": "Synthetic metadata fixture", "causal_hypotheses": ["Possible model underfit"],
        "observation": {"kind": "criterion_missed", "protocol_id": protocol.id, "protocol_revision": 1,
            "criterion_id": "quality", "metric": {"artifact_id": bench.id,
                "field_path": "/result/metrics/validation/rmse", "partition": "validation", "value": 2.5},
            "success_comparison": "lt", "threshold": 0.0}}
    return service, scope, payload, protocol


def test_confirmed_actor_outcome_publication_and_report(outcome):
    service, scope, payload, protocol = outcome
    provision(service.settings)
    with service.db.session() as session:
        allowed = frozenset(session.scalars(select(ArtifactRow.id)))
    scope = SubmissionScope(project_id="p", run_id="run", artifact_ids=allowed, material_ids=frozenset())
    job = submit_outcome(service, scope, payload, actor=AGENT, action_id="action", attempt_id="attempt")
    assert submit_outcome(service, scope, payload, actor=AGENT, action_id="action", attempt_id="attempt").id == job.id
    claimed = claim_next(service.db, 120, "outcome")
    work, deadline = prepare_claim(service.db, claimed)
    result = run_import(service.db, service.settings, work, deadline, lambda: False, public_runner)
    changed = result.model_copy(deep=True)
    changed.artifact["actor"]["model"] = "invented"
    with pytest.raises(DomainError):
        publish_result(service.db, claimed, work, changed)
    changed = result.model_copy(deep=True)
    changed.artifact["receipt"]["request_sha256"] = "b" * 64
    with pytest.raises(DomainError):
        publish_result(service.db, claimed, work, changed)
    publish_result(service.db, claimed, work, result)
    with service.db.session.begin() as session:
        saved = artifact(session, "p", result.artifact["id"])
        assert saved.schema_version == "2.0" and saved.actor.kind == "agent"
        assert saved.observation.metric.value == 2.5
        assert session.get(ExternalOperationRow, job.id).artifact_id == saved.id
        raw, _ = report_bundle(capture(session, "p"), service.store)
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        report = archive.read("report.md").decode()
        assert "agent observation (criterion_missed)" in report
        assert "Researcher assessment:" not in report
        assert "Causal hypotheses (unverified)" in report
        assert "contracts/v2/failure.json" in archive.namelist()
    with service.db.session() as session:
        body = json.loads(session.get(ExternalOperationRow, job.id).body)
    assert json.loads(body["record"]["source"]["notes"])["actor"] == saved.actor.model_dump(mode="json")


@pytest.mark.parametrize("change", [
    {"threshold": 1.0}, {"criterion_id": "invented"}, {"protocol_revision": 2},
    {"metric": {"value": 2.6}}, {"metric": {"partition": "test"}},
    {"metric": {"field_path": "/result/metrics/validation/mae"}},
    {"metric": {"units": "invented"}},
])
def test_fabricated_criteria_rejected(outcome, change):
    service, scope, payload, _ = outcome
    if "metric" in change:
        payload["observation"]["metric"].update(change["metric"])
    else:
        payload["observation"].update(change)
    with pytest.raises((DomainError, ValidationError)):
        submit_outcome(service, scope, payload, actor=HUMAN, request_key="bad")


def test_posthoc_protocol_and_actor_spoof_rejected(outcome):
    service, scope, payload, protocol = outcome
    with service.db.session() as session:
        source = session.get(JobRow, payload["source_job_id"])
        request = source.payload
    late = seal_outcome_protocol(service.db, scope, request, CRITERION)
    payload["observation"]["protocol_id"] = late.id
    with pytest.raises(DomainError, match="before job"):
        submit_outcome(service, scope, payload, actor=HUMAN, request_key="late")
    payload["actor"] = HUMAN
    with pytest.raises(DomainError, match="trusted context"):
        submit_outcome(service, scope, payload, actor=HUMAN, request_key="spoof")
    del payload["actor"]
    with pytest.raises(DomainError, match="identity"):
        submit_outcome(service, scope, payload, actor=AGENT, request_key="agent")


@pytest.mark.parametrize("code", ["JOB_TIMED_OUT", "WORKER_INTERRUPTED", "ADMISSION_REJECTED", "INTEGRITY_FAILED",
                                  "RUN_CANCELLED", "PROVIDER_UNAVAILABLE", "POLICY_DENIED"])
def test_runtime_error_artifacts_and_operational_exclusions(outcome, code):
    service, scope, payload, _ = outcome
    with service.db.session.begin() as session:
        original = session.get(JobRow, payload["source_job_id"])
        job = submit_job(session, "p", "benchmark", original.payload, "runtime")
    claim = claim_next(service.db, 120, "runtime")
    with service.db.session.begin() as session:
        finish_claim(session, claim, state="failed", error="Recorded execution error", error_code=code)
    payload.update(source_job_id=job.id, benchmark_id=runtime_benchmark_id(job.id),
                   observation={"kind": "execution_failure", "error_code": code, "observed_error": "Recorded execution error"})
    if code in {"RUN_CANCELLED", "PROVIDER_UNAVAILABLE", "POLICY_DENIED"}:
        with pytest.raises(ValidationError):
            submit_outcome(service, scope, payload, actor=HUMAN, request_key="record")
        payload["observation"]["error_code"] = "JOB_TIMED_OUT"
        with pytest.raises(DomainError, match="recorded objective"):
            submit_outcome(service, scope, payload, actor=HUMAN, request_key="invented-code")
        with service.db.session() as session:
            assert session.get(ArtifactRow, payload["benchmark_id"]) is None
        return
    payload["observation"]["observed_error"] = "An invented scientific explanation"
    with pytest.raises(DomainError, match="recorded error"):
        submit_outcome(service, scope, payload, actor=HUMAN, request_key="invented-error")
    with service.db.session() as session:
        assert session.get(ArtifactRow, payload["benchmark_id"]) is None
    payload["observation"]["observed_error"] = "Recorded execution error"
    recorded = submit_outcome(service, scope, payload, actor=HUMAN, request_key="record")
    with service.db.session() as session:
        bench = artifact(session, "p", payload["benchmark_id"])
        assert bench.result == {} and bench.bundle_key is None
        assert session.get(JobRow, job.id).result_id is None
    assert submit_outcome(service, scope, payload, actor=HUMAN, request_key="record").id == recorded.id
    if code == "JOB_TIMED_OUT":
        from workbench.reports import ReportSelection
        provision(service.settings)
        process_job(service.settings, claim_next(service.db, 120, "runtime-import"), db=service.db)
        with service.db.session.begin() as session:
            imported = session.get(JobRow, recorded.id)
            assert imported.state == "succeeded", imported.error
            allowed = frozenset(session.scalars(select(ArtifactRow.id)))
            report_scope = SubmissionScope(project_id="p", run_id="run", artifact_ids=allowed, material_ids=[],
                report_selection=ReportSelection(artifact_ids=frozenset([imported.result_id]), job_ids=frozenset(),
                                                 revision=1, execution_cutoff=1))
            snapshot = capture(session, "p", report_scope)
            assert job.id in {item["id"] for item in snapshot["jobs"]}


def test_human_judgment_separate_and_agent_judgment_denied(outcome):
    service, scope, payload, _ = outcome
    payload["observation"] = {"kind": "researcher_assessment", "statement": "Not useful for my research question"}
    assert submit_outcome(service, scope, payload, actor=HUMAN, request_key="human").payload["actor"] == HUMAN
    with service.db.session() as session:
        allowed = frozenset(session.scalars(select(ArtifactRow.id)))
    agent_scope = SubmissionScope(project_id="p", run_id="run", artifact_ids=allowed, material_ids=[])
    with pytest.raises(DomainError, match="researcher assessment"):
        submit_outcome(service, agent_scope, payload, actor=AGENT, action_id="action", attempt_id="attempt")


def test_missing_metric_never_becomes_zero(outcome):
    service, scope, payload, _ = outcome
    with service.db.session.begin() as session:
        original = session.get(JobRow, payload["source_job_id"])
        old = artifact(session, "p", payload["benchmark_id"])
        source = submit_job(session, "p", "benchmark", original.payload, "missing-metric")
    claimed = claim_next(service.db, 120, "missing-metric")
    with service.db.session.begin() as session:
        value = save(session, Benchmark(project_id="p", dataset_id=old.dataset_id, split_id=old.split_id,
            model=old.model, seed=old.seed, config=old.config, status="succeeded", result={"metrics": {"validation": {}}}))
        session.flush()
        finish_claim(session, claimed, state="succeeded", result_id=value.id)
    payload.update(source_job_id=source.id, benchmark_id=value.id)
    payload["observation"]["metric"].update(artifact_id=value.id, value=0.0)
    with pytest.raises(DomainError, match="stored metric"):
        submit_outcome(service, scope, payload, actor=HUMAN, request_key="missing")


def test_scoped_protocol_and_source_job_references(outcome):
    service, scope, payload, _ = outcome
    with service.db.session() as session:
        allowed = frozenset(session.scalars(select(ArtifactRow.id).where(ArtifactRow.kind != "evaluation_protocol")))
    restricted = SubmissionScope(project_id="p", artifact_ids=allowed)
    with pytest.raises(DomainError, match="authorized input scope"):
        submit_outcome(service, restricted, payload, actor=HUMAN, request_key="outside")
    payload["source_job_id"] = "nonexistent"
    with pytest.raises(DomainError, match="source"):
        submit_outcome(service, scope, payload, actor=HUMAN, request_key="wrong-source")


def test_unknown_import_and_cancellation_do_not_publish_outcome(outcome):
    from workbench.external_operations import result_from_receipt
    from workbench.publication import fence_cancelled
    from workbench.job_metadata import StaleClaim
    service, scope, payload, _ = outcome
    provision(service.settings)
    job = service.submit_outcome(scope, payload, actor=HUMAN, request_key="lost")
    claimed = claim_next(service.db, 120, "lost")
    work, deadline = prepare_claim(service.db, claimed)
    receipt = None
    def lose_response(settings, work, deadline, stopped):
        nonlocal receipt
        result = public_runner(settings, work, deadline, stopped)
        if result.receipt:
            receipt = result.receipt
            raise TimeoutError("Response lost after actual upstream import")
        return result
    with pytest.raises(TimeoutError):
        run_import(service.db, service.settings, work, deadline, lambda: False, lose_response)
    from workbench.scientific_contracts import FailureReceipt
    result = result_from_receipt(work, FailureReceipt.model_validate(receipt))
    with pytest.raises(DomainError, match="confirmed"):
        publish_result(service.db, claimed, work, result)
    with service.db.session.begin() as session:
        assert session.get(ExternalOperationRow, job.id).state == "unknown"
        assert session.get(ArtifactRow, result.artifact["id"]) is None
        assert fence_cancelled(session, "p", claimed)
    with pytest.raises(StaleClaim):
        publish_result(service.db, claimed, work, result)
    with service.db.session() as session:
        assert session.get(JobRow, job.id).error_code == "RUN_CANCELLED"


def test_real_completed_baseline_criterion_and_admission_outcome(env):
    client, db, settings = env
    pid = create(client)
    data = upload(client, pid)
    audited = run(env, pid, "audit", {"dataset_id": data["id"], "config": fixture("audit")})
    split = run(env, pid, "split", {"dataset_id": data["id"], "audit_id": audited["id"], "config": fixture("split")})
    request = {**fixture("benchmark"), "dataset_id": data["id"], "split_id": split["id"]}
    scope = SubmissionScope(project_id=pid)
    protocol = seal_outcome_protocol(db, scope, request, CRITERION)
    bench = run(env, pid, "benchmark", request)
    assert bench["status"] == "succeeded"
    with db.session() as session:
        source = session.scalar(select(JobRow).where(JobRow.result_id == bench["id"]))
    service = SubmissionService(db, LocalStore(settings.storage_root), settings)
    payload = {"benchmark_id": bench["id"], "source_job_id": source.id, "reason": "Missed predeclared criterion",
        "uncertainty_notes": "Synthetic integration data", "observation": {"kind": "criterion_missed",
        "protocol_id": protocol.id, "protocol_revision": 1, "criterion_id": "quality",
        "metric": {"artifact_id": bench["id"], "field_path": "/result/metrics/validation/rmse",
            "partition": "validation", "value": bench["result"]["metrics"]["validation"]["rmse"]},
        "success_comparison": "lt", "threshold": 0.0}}
    job = submit_outcome(service, scope, payload, actor=HUMAN, request_key="criterion")
    process_job(settings, claim_next(db, 120, "real-outcome"), db=db)
    with db.session() as session:
        done = session.get(JobRow, job.id)
        assert done.state == "succeeded", done.error
    response = client.get(f"/api/v1/projects/{pid}/artifacts/{done.result_id}")
    assert response.status_code == 200 and response.json()["schema_version"] == "2.0"
    assert client.get(f"/api/v1/projects/{pid}/artifacts").status_code == 200
    failed = run(env, pid, "benchmark", {**request, "numeric_features": [request["row_id"]]})
    assert failed["status"] == "failed" and failed["result"] == {}
    with db.session() as session:
        source = session.scalar(select(JobRow).where(JobRow.result_id == failed["id"]))
    payload.update(benchmark_id=failed["id"], source_job_id=source.id,
                   observation={"kind": "execution_failure", "error_code": "ADMISSION_REJECTED", "observed_error": source.error})
    job = submit_outcome(service, scope, payload, actor=HUMAN, request_key="admission")
    process_job(settings, claim_next(db, 120, "real-outcome"), db=db)
    with db.session() as session:
        done = session.get(JobRow, job.id)
        assert done.state == "succeeded", done.error
        saved = artifact(session, pid, done.result_id)
        assert saved.observation.observed_error == source.error

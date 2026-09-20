"""C12 sealed predeclared comparisons and one shared result exposure boundary.

Pinned upstream computes both partitions in one call. This is visibility control,
not validation-only training or a physically separate final-test execution.
"""
import math
from sqlalchemy import select, or_

from .artifacts import ArtifactResolver
from .barriers import lock_project
from .contracts import BenchmarkInput, now
from .db import ArtifactRow, EvaluationRow, EvaluationJobRow, ExposureRow, JobRow
from .errors import DomainError
from .request_identity import request_digest
from .scientific_contracts import EvaluationProtocol, SuccessCriterion


LIMITATION = "Pinned upstream returns validation and test together; only sealed predeclared comparisons are supported, not validation-only selection or separate final-test execution."
SCALAR_METRICS = {"mae", "rmse", "r2", "group_mae", "group_rmse", "rows", "groups"}


def denied(message):
    raise DomainError(message, 403, "DATA_EXPOSURE_DENIED")


def split_fingerprint(split):
    # Equivalent uploads/splits cannot erase history by changing artifact IDs,
    # author timestamps, software labels or split-generator metadata.
    return request_digest("holdout_assignments", {"assignments": split.assignments})


def exposure_history(session, pid, dataset_sha256, split_sha256):
    return list(session.scalars(select(ExposureRow).where(ExposureRow.project_id == pid,
        ExposureRow.dataset_sha256 == dataset_sha256,
        or_(ExposureRow.split_sha256 == "*", ExposureRow.split_sha256 == split_sha256)).order_by(ExposureRow.created_at, ExposureRow.id)))


def record_exposure(session, pid, dataset_sha256, split_sha256, artifact_id, via):
    lock_project(session, pid)
    fields = dict(project_id=pid, dataset_sha256=dataset_sha256, split_sha256=split_sha256,
                  artifact_id=artifact_id, via=via)
    old = session.scalar(select(ExposureRow).filter_by(**fields))
    if old is None:
        old = ExposureRow(**fields)
        session.add(old)
        session.flush()
    return old


def expose_artifact(session, pid, value, *, via, raw=False):
    """Traverse typed dependencies, never inspect arbitrary JSON for guessed IDs."""
    resolver = ArtifactResolver(session, pid)
    values = resolver.closure([value.id])
    for item in values:
        if item.kind == "benchmark" and item.status == "succeeded":
            data = resolver.resolve(item.dataset_id, "dataset")
            split = resolver.resolve(item.split_id, "split")
            record_exposure(session, pid, data.sha256, split_fingerprint(split), value.id, via)
        if raw and item.kind == "dataset":
            record_exposure(session, pid, item.sha256, "*", value.id, via)


def seal_evaluation(db, scope, candidates, *, primary_metric="group_mae", criterion=None,
                    selection_rule="predeclared_comparison", exploratory=False):
    from .submission import SubmissionScope
    from .services import save
    if not isinstance(scope, SubmissionScope):
        denied("A trusted submission scope is required")
    if selection_rule != "predeclared_comparison":
        raise DomainError(LIMITATION, 422, "UNSUPPORTED_CAPABILITY")
    if not isinstance(candidates, dict) or not 1 <= len(candidates) <= 16:
        raise DomainError("Seal between one and sixteen named candidates")
    requests = {key: BenchmarkInput.model_validate(value).model_dump(mode="json") for key, value in candidates.items()}
    if type(exploratory) is not bool:
        raise DomainError("Exploratory eligibility must be explicit")
    first = next(iter(requests.values()))
    base = {k: v for k, v in first.items() if k not in {"model", "seed"}}
    if any({k: v for k, v in p.items() if k not in {"model", "seed"}} != base for p in requests.values()):
        raise DomainError("Candidates must share frozen features, target, split and scientific configuration")
    success = SuccessCriterion.model_validate(criterion) if criterion is not None else None
    if primary_metric not in SCALAR_METRICS or (success is not None and success.metric not in SCALAR_METRICS):
        raise DomainError("Evaluation requires a supported scalar metric", 422, "UNSUPPORTED_CAPABILITY")
    with db.session.begin() as session:
        lock_project(session, scope.project_id)
        resolver = ArtifactResolver(session, scope.project_id, scope.artifact_ids)
        data = resolver.resolve(first["dataset_id"], "dataset")
        split = resolver.resolve(first["split_id"], "split")
        from .adapters import benchmark_source
        try:
            benchmark_source(data)
        except ValueError:
            raise DomainError("Evaluation requires resolved source declarations", 422, "ADMISSION_REJECTED") from None
        if split.dataset_id != data.id:
            raise DomainError("Evaluation split belongs to another dataset", 422, "LINEAGE_MISMATCH")
        features = first["numeric_features"] + first["categorical_features"]
        if first["target"] not in data.columns or not set(features) <= set(data.columns) or len(features) != len(set(features)):
            raise DomainError("Sealed target and distinct features must match exact dataset columns", 422, "ADMISSION_REJECTED")
        fingerprint = split_fingerprint(split)
        history = exposure_history(session, scope.project_id, data.sha256, fingerprint)
        if history and not exploratory:
            denied("Holdout was exposed or its prior exposure is unknown; explicitly seal an exploratory comparison")
        # Earlier unbound computations are not retrospectively certified clean.
        prior = list(session.scalars(select(ArtifactRow).where(ArtifactRow.project_id == scope.project_id, ArtifactRow.kind == "benchmark")))
        for row in prior:
            benchmark = resolver._load(row.id) if scope.artifact_ids is None else ArtifactResolver(session, scope.project_id).resolve(row.id)
            parent = ArtifactResolver(session, scope.project_id).resolve(benchmark.dataset_id, "dataset")
            if parent.sha256 == data.sha256 and not exploratory:
                denied("Prior benchmark computations require an explicitly exploratory new comparison")
        stamp = now()
        digests = {key: request_digest("benchmark", p) for key, p in requests.items()}
        protocol = save(session, EvaluationProtocol(project_id=scope.project_id, created_at=stamp,
            parents=[data.id, split.id], revision=1, dataset_id=data.id, dataset_sha256=data.sha256,
            split_id=split.id, split_sha256=request_digest("split_artifact", split.model_dump(mode="json")),
            configuration_sha256=next(iter(digests.values())) if len(digests) == 1 else request_digest("evaluation_candidates", requests),
            target=first["target"], features=first["numeric_features"] + first["categorical_features"],
            preprocessing="Pinned benchmark task-card preprocessing",
            independent_unit={"name": first["independence_unit"], "group_columns": first["group_columns"], "rationale": first["independence_rationale"]},
            candidates=[{"id": key, "model": p["model"], "seed": p["seed"], "configuration_sha256": digests[key]} for key, p in requests.items()],
            primary_metric=primary_metric, selection_rule=selection_rule, success_criterion=success,
            state="sealed", sealed_at=stamp, exposure_status="exposed" if any(h.via != "legacy_unknown" for h in history) else "unknown" if history or exploratory else "unexposed",
            exposure_event_ids=[h.id for h in history]))
        session.flush()
        session.add(EvaluationRow(protocol_id=protocol.id, project_id=scope.project_id, run_id=scope.run_id,
            dataset_sha256=data.sha256, split_sha256=fingerprint, requests=requests, exploratory=exploratory, created_at=stamp))
        return protocol


def evaluation_row(session, scope, protocol_id):
    row = session.get(EvaluationRow, protocol_id)
    if row is None or row.project_id != scope.project_id:
        raise DomainError("Sealed evaluation not found in this project", 404)
    if scope.run_id is not None and row.run_id != scope.run_id:
        denied("Evaluation belongs to another trusted run")
    if scope.artifact_ids is not None and protocol_id not in scope.artifact_ids:
        denied("Evaluation is outside the authorized artifact scope")
    return row


def submit_candidate(service, scope, protocol_id, candidate_id, *, request_key=None, action_id=None, attempt_id=None):
    from .submission import SubmissionScope, identity_key
    from .job_metadata import submit_job
    if not isinstance(scope, SubmissionScope):
        denied("A trusted submission scope is required")
    key = identity_key(scope, request_key, action_id, attempt_id)
    with service.db.session.begin() as session:
        lock_project(session, scope.project_id)
        row = evaluation_row(session, scope, protocol_id)
        if row.released_at is not None:
            denied("Released comparisons cannot submit or tune candidates")
        if candidate_id not in row.requests:
            raise DomainError("Candidate was not predeclared")
        from .artifacts import operation_inputs
        operation_inputs(session, scope.project_id, "benchmark", row.requests[candidate_id], allowed_ids=scope.artifact_ids)
        service._admit(session, scope, "benchmark", row.requests[candidate_id], None)
        existing = session.get(EvaluationJobRow, (protocol_id, candidate_id))
        if existing is not None:
            job = session.get(JobRow, existing.job_id)
            if job.request_key != key:
                raise DomainError("Candidate already has its accepted attempt", 409, "IDEMPOTENCY_CONFLICT")
            return job
        if not row.exploratory and exposure_history(session, scope.project_id, row.dataset_sha256, row.split_sha256):
            denied("Exposure changed after sealing; further clean-comparison submissions are blocked")
        job = submit_job(session, scope.project_id, "benchmark", row.requests[candidate_id], key)
        # A previous arbitrary job may not become a predeclared candidate by reuse.
        from .outcomes import utc
        if utc(job.created_at) < utc(row.created_at):
            denied("A prior job cannot be attached to a later sealed comparison")
        if session.scalar(select(EvaluationJobRow).where(EvaluationJobRow.job_id == job.id)) is not None:
            raise DomainError("Job is already bound to an accepted candidate", 409, "IDEMPOTENCY_CONFLICT")
        session.add(EvaluationJobRow(protocol_id=protocol_id, candidate_id=candidate_id,
                                     project_id=scope.project_id, job_id=job.id))
        return job


def release_evaluation(db, scope, protocol_id):
    from .submission import SubmissionScope
    if not isinstance(scope, SubmissionScope):
        denied("A trusted submission scope is required")
    with db.session.begin() as session:
        lock_project(session, scope.project_id)
        row = evaluation_row(session, scope, protocol_id)
        bindings = list(session.scalars(select(EvaluationJobRow).where(EvaluationJobRow.protocol_id == protocol_id)))
        if {b.candidate_id for b in bindings} != set(row.requests):
            raise DomainError("Every predeclared candidate must have an accepted job before release", 409)
        if any(session.get(JobRow, b.job_id).state not in {"succeeded", "failed"} for b in bindings):
            raise DomainError("Wait for every accepted candidate to settle", 409, "PROJECT_BUSY")
        if row.released_at is None:
            row.released_at = now()
        session.flush()
        return evaluation_status(session, scope, protocol_id)


def evaluation_status(session, scope, protocol_id):
    from .read_contracts import EvaluationStatusView
    row = evaluation_row(session, scope, protocol_id)
    history = exposure_history(session, scope.project_id, row.dataset_sha256, row.split_sha256)
    return EvaluationStatusView(**{"protocol_id": protocol_id, "state": "released" if row.released_at else "sealed",
        "exploratory": row.exploratory, "clean_holdout_eligible": not row.exploratory and not history,
        "exposure_status": "exposed" if any(h.via != "legacy_unknown" for h in history) else "unknown" if history else "unexposed",
        "exposure_event_ids": [h.id for h in history if getattr(scope, "audience", "manual") != "agent"
                               or h.artifact_id in scope.artifact_ids], "limitation": LIMITATION}).model_dump(mode="json")


def bound_evaluation(session, scope, benchmark):
    if not scope.protocol_id:
        denied("Agent benchmark reads require their sealed comparison")
    row = evaluation_row(session, scope, scope.protocol_id)
    bindings = list(session.scalars(select(EvaluationJobRow).where(EvaluationJobRow.protocol_id == row.protocol_id)))
    if not any(session.get(JobRow, b.job_id).result_id == benchmark.id for b in bindings):
        denied("Benchmark is not an accepted result of this comparison")
    return row


def authorize_metric(session, scope, benchmark, partition):
    if scope.audience == "agent":
        row = bound_evaluation(session, scope, benchmark)
        if partition == "test":
            if scope.purpose != "final" or row.released_at is None:
                denied("Test outputs are quarantined from selection and unreleased contexts")
            expose_artifact(session, scope.project_id, benchmark, via="agent_final")
        elif partition != "validation":
            denied("Only validation projections are available during selection")
    elif partition == "test":
        expose_artifact(session, scope.project_id, benchmark, via="metric_reference")


def evaluation_view(session, scope, benchmark):
    from .read_contracts import EvaluationView
    row = bound_evaluation(session, scope, benchmark)
    partitions = ["validation"]
    if scope.purpose == "final":
        authorize_metric(session, scope, benchmark, "test")
        partitions.append("test")
    metrics = benchmark.result.get("metrics", {})
    # Build an allowlist projection. Never return bundles, predictions, arbitrary
    # result dictionaries, configuration, diagnostics or free-form error strings.
    safe = {}
    for partition in partitions:
        values = metrics.get(partition, {}) if isinstance(metrics, dict) else {}
        safe[partition] = {key: value for key, value in values.items()
            if key in SCALAR_METRICS and type(value) in (int, float) and math.isfinite(value)} if isinstance(values, dict) else {}
    return EvaluationView(**{"artifact_id": benchmark.id, "protocol_id": row.protocol_id, "status": benchmark.status,
            "model": benchmark.model, "seed": benchmark.seed, "metrics": safe,
            "test_visible": "test" in partitions, "evaluation": evaluation_status(session, scope, row.protocol_id)}).model_dump(mode="json")


def search_failure_memory(db, settings, scope, query="", **filters):
    """The egress wrapper for live upstream retrieval, whose prose is untyped.

    Low-level FailureMemory is an internal IO adapter, not an agent tool. Until
    typed per-record exposure lineage exists, no agent can retrieve its prose.
    """
    from .projections import authorize
    from .services import project
    from .failure_memory import FailureMemory
    with db.session.begin() as session:
        authorize(session, scope)
        if scope.audience == "agent":
            denied("Live Failure Memory prose has no safe holdout projection")
        proj = project(session, scope.project_id)
        lock_project(session, scope.project_id)
        for row in session.scalars(select(ArtifactRow).where(ArtifactRow.project_id == scope.project_id, ArtifactRow.kind == "dataset")):
            data = ArtifactResolver(session, scope.project_id).resolve(row.id)
            record_exposure(session, scope.project_id, data.sha256, "*", "live-failure-memory", "failure_search")
    return FailureMemory(settings).search(proj, query, **filters)

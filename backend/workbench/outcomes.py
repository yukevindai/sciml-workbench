"""C07 trusted outcome admission. Callers supply authenticated actor context.

No provider argument may choose its actor. Run ownership/policy enforcement and
test exposure remain the responsibility of the eventual dispatcher (E03/C12).
"""
from datetime import timezone
from uuid import NAMESPACE_URL, uuid5

from pydantic import Field, TypeAdapter

from .contract_core import ContractModel, Identifier, Text
from .contracts import Benchmark, BenchmarkInput, now
from .scientific_contracts import (AssessmentActor, FailureObservation, FailureV2,
    EvaluationProtocol, SuccessCriterion)
from .db import ArtifactRow, JobRow
from .errors import DomainError
from .request_identity import request_digest


class OutcomeInput(ContractModel):
    benchmark_id: Identifier
    source_job_id: Identifier
    reason: Text
    uncertainty_notes: Text
    actor: AssessmentActor
    observation: FailureObservation
    causal_hypotheses: list[Text] = Field(default_factory=list)


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def reject(message):
    raise DomainError(message, 422, "REFERENCE_INVALID")


def runtime_benchmark_id(job_id):
    return str(uuid5(NAMESPACE_URL, f"sciml-workbench:runtime-outcome:{job_id}"))


def validate_outcome(session, pid, payload, resolver):
    """Recheck authoritative facts at admission, execution and publication."""
    p = OutcomeInput.model_validate(payload)
    run = resolver.resolve(p.benchmark_id, "benchmark")
    job = session.get(JobRow, p.source_job_id)
    if job is None or job.project_id != pid or job.kind != "benchmark":
        reject("Outcome source must be a benchmark job in this project")
    if job.state not in {"succeeded", "failed"}:
        reject("Outcome source must be terminal")
    if job.result_id != run.id:
        if (job.result_id is not None or job.state != "failed" or run.id != runtime_benchmark_id(job.id)
                or run.config != job.payload or run.status != "failed" or run.error != job.error
                or run.result or run.bundle_key is not None):
            reject("Benchmark does not represent the source job")
    if p.actor.kind == "agent" and p.observation.kind == "researcher_assessment":
        reject("An agent cannot make a researcher assessment")
    obs = p.observation
    if obs.kind == "execution_failure":
        # Legacy benchmark admission jobs used VALIDATION_FAILED. Only their
        # actual failed, empty scientific artifact supports this mapping.
        code = job.error_code
        if code == "VALIDATION_FAILED" and job.result_id == run.id and run.status == "failed":
            code = "ADMISSION_REJECTED"
        if (job.state != "failed" or run.status != "failed" or code != obs.error_code
                or not job.error or obs.observed_error != job.error or run.error != job.error
                or run.result or run.bundle_key is not None):
            reject("Execution observation must cite the recorded error, without metrics")
    elif obs.kind == "criterion_missed":
        protocol = resolver.resolve(obs.protocol_id, "evaluation_protocol")
        row = session.get(ArtifactRow, protocol.id)
        criterion = protocol.success_criterion
        config_digest = request_digest("benchmark", job.payload)
        from .db import EvaluationRow, EvaluationJobRow
        from sqlalchemy import select
        evaluation = session.get(EvaluationRow, protocol.id)
        if evaluation is None:
            config_matches = protocol.configuration_sha256 == config_digest
        else:
            binding = session.scalar(select(EvaluationJobRow).where(EvaluationJobRow.protocol_id == protocol.id,
                                                                   EvaluationJobRow.job_id == job.id))
            config_matches = binding is not None and evaluation.requests.get(binding.candidate_id) == job.payload
        split = resolver.resolve(run.split_id, "split")
        data = resolver.resolve(run.dataset_id, "dataset")
        if (job.state != "succeeded" or run.status != "succeeded" or job.result_id != run.id
                or protocol.state == "draft" or criterion is None
                or utc(row.created_at) >= utc(job.created_at)
                or protocol.sealed_at >= utc(job.created_at)
                or protocol.revision != obs.protocol_revision
                or protocol.dataset_id != run.dataset_id or protocol.split_id != run.split_id
                or protocol.dataset_sha256 != data.sha256
                or protocol.split_sha256 != request_digest("split_artifact", split.model_dump(mode="json"))
                or not config_matches
                or protocol.target != job.payload.get("target")
                or protocol.features != job.payload.get("numeric_features", []) + job.payload.get("categorical_features", [])
                or not any(c.model == run.model and c.seed == run.seed and c.configuration_sha256 == config_digest
                           for c in protocol.candidates)):
            reject("Criterion requires a matching protocol persisted before job submission")
        path = f"/result/metrics/{criterion.partition}/" + criterion.metric.replace("~", "~0").replace("/", "~1")
        metrics = run.result.get("metrics")
        partition = metrics.get(criterion.partition) if isinstance(metrics, dict) else None
        metric = partition.get(criterion.metric) if isinstance(partition, dict) else None
        if (obs.criterion_id != criterion.id or obs.success_comparison != criterion.comparison
                or obs.threshold != criterion.threshold or obs.metric.artifact_id != run.id
                or obs.metric.partition != criterion.partition or obs.metric.field_path != path
                or obs.metric.units is not None or type(metric) not in (int, float) or metric != obs.metric.value):
            reject("Criterion observation must match the declared threshold and stored metric")
    return p


def seal_outcome_protocol(db, scope, benchmark_request, criterion):
    """Persist a predeclared comparison, not a test-exposure authorization.

    Call before submitting the benchmark. Configuration fingerprints use the
    existing canonical request identity; split fingerprints include exact payload.
    """
    from .artifacts import ArtifactResolver
    from .barriers import lock_project
    from .services import save
    from .submission import SubmissionScope
    if not isinstance(scope, SubmissionScope):
        raise DomainError("A trusted submission scope is required", 403)
    request = BenchmarkInput.model_validate(benchmark_request).model_dump(mode="json")
    criterion = SuccessCriterion.model_validate(criterion)
    with db.session.begin() as session:
        lock_project(session, scope.project_id)
        resolver = ArtifactResolver(session, scope.project_id, scope.artifact_ids)
        data = resolver.resolve(request["dataset_id"], "dataset")
        split = resolver.resolve(request["split_id"], "split")
        if split.dataset_id != data.id:
            reject("Protocol split belongs to another dataset")
        digest = request_digest("benchmark", request)
        stamp = now()
        return save(session, EvaluationProtocol(project_id=scope.project_id, created_at=stamp,
            parents=[data.id, split.id], revision=1, dataset_id=data.id, dataset_sha256=data.sha256,
            split_id=split.id, split_sha256=request_digest("split_artifact", split.model_dump(mode="json")),
            configuration_sha256=digest, target=request["target"],
            features=request["numeric_features"] + request["categorical_features"],
            preprocessing="Pinned benchmark task-card preprocessing",
            independent_unit={"name": request["independence_unit"], "group_columns": request["group_columns"],
                              "rationale": request["independence_rationale"]},
            candidates=[{"id": "candidate", "model": request["model"], "seed": request["seed"],
                         "configuration_sha256": digest}], primary_metric=criterion.metric,
            selection_rule="predeclared_comparison", success_criterion=criterion,
            state="sealed", sealed_at=stamp, exposure_status="unknown"))


def submit_outcome(service, scope, payload, *, actor, request_key=None, action_id=None, attempt_id=None, session=None):
    """Trusted actor-aware entry point; actor is never accepted in payload.

    Runtime-only benchmark snapshots preserve objective errors and absent metrics;
    they do not rewrite the failed source job or claim scientific invalidity.
    """
    from .artifacts import ArtifactResolver
    from .barriers import lock_project
    from .job_metadata import submit_job
    from .services import save
    from .submission import SubmissionScope, identity_key
    if not isinstance(scope, SubmissionScope):
        raise DomainError("A trusted submission scope is required", 403)
    actor = TypeAdapter(AssessmentActor).validate_python(actor)
    if (actor.kind == "agent" and (actor.run_id != scope.run_id or actor.action_id != action_id)
            or actor.kind == "human" and scope.run_id is not None):
        raise DomainError("Actor differs from trusted submission identity", 403)
    if "actor" in payload:
        reject("Actor must come from trusted context")
    p = OutcomeInput.model_validate(dict(payload, actor=actor.model_dump(mode="json")))
    if p.actor.kind == "agent" and p.observation.kind == "criterion_missed" and p.observation.metric.partition == "test":
        raise DomainError("Selection agents cannot record outcomes from quarantined test metrics", 403, "DATA_EXPOSURE_DENIED")
    if len(p.model_dump_json().encode("utf-8")) > service.settings.max_upload_bytes:
        raise DomainError("Request exceeds configured byte limit", 413)
    key = identity_key(scope, request_key, action_id, attempt_id)
    from contextlib import nullcontext
    with (nullcontext(session) if session is not None else service.db.session.begin()) as session:
        lock_project(session, scope.project_id)
        resolver = ArtifactResolver(session, scope.project_id, scope.artifact_ids)
        job = session.get(JobRow, p.source_job_id)
        if job is None or job.project_id != scope.project_id or job.kind != "benchmark":
            reject("Outcome source must be a benchmark job in this project")
        if scope.artifact_ids is not None and p.benchmark_id not in scope.artifact_ids:
            raise DomainError("Artifact is outside the authorized input scope", 403)
        if job.result_id is None and p.benchmark_id == runtime_benchmark_id(job.id):
            if (job.state != "failed" or p.observation.kind != "execution_failure"
                    or job.error_code != p.observation.error_code or not job.error):
                reject("Runtime outcome requires a recorded objective execution error")
            if session.get(ArtifactRow, p.benchmark_id) is None:
                config = BenchmarkInput.model_validate(job.payload)
                resolver.resolve(config.dataset_id, "dataset")
                resolver.resolve(config.split_id, "split")
                save(session, Benchmark(id=p.benchmark_id, project_id=scope.project_id,
                    parents=[config.dataset_id, config.split_id], dataset_id=config.dataset_id,
                    split_id=config.split_id, model=config.model, seed=config.seed, config=job.payload,
                    status="failed", error=job.error))
                session.flush()
        canonical = p.model_dump(mode="json")
        validate_outcome(session, scope.project_id, canonical, resolver)
        return submit_job(session, scope.project_id, "failure", canonical, key)


def artifact_from_receipt(work, receipt, software):
    p = OutcomeInput.model_validate(work.payload)
    return FailureV2(id=work.result_id, project_id=work.project_id, software=software,
                     parents=[p.benchmark_id], receipt=receipt, **p.model_dump(mode="json"))

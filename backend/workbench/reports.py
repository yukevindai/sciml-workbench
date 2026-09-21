"""Immutable report capture; trusted run selections are supplied by the caller.

B11 must derive selections/revisions/cutoffs from its persisted authorized run.
No HTTP/provider argument can construct a run selection through this module.
"""
from copy import deepcopy
from dataclasses import dataclass

from sqlalchemy import select

from .artifacts import ArtifactResolver, integrity, resolve_material, operation_inputs
from .barriers import lock_project
from .db import ArtifactRow, JobRow, MaterialRow, ProjectRow
from .errors import DomainError
from .job_metadata import database_now
from .request_identity import request_digest


@dataclass(frozen=True)
class ReportSelection:
    artifact_ids: frozenset[str]
    job_ids: frozenset[str]
    revision: int
    execution_cutoff: int
    material_ids: frozenset[str] = frozenset()

    def __post_init__(self):
        for field in ("artifact_ids", "job_ids", "material_ids"):
            ids = getattr(self, field)
            if not isinstance(ids, (set, frozenset, list, tuple)) or any(not isinstance(i, str) or not i for i in ids):
                raise DomainError("Invalid report selection")
            object.__setattr__(self, field, frozenset(ids))
        if any(type(n) is not int or n < 0 for n in (self.revision, self.execution_cutoff)) or self.revision == 0:
            raise DomainError("Invalid report revision or cutoff")


def report_request(scope):
    selection = scope.report_selection
    if selection is None:
        return {}
    return {"run_id": scope.run_id, "artifact_ids": sorted(selection.artifact_ids),
            "job_ids": sorted(selection.job_ids), "material_ids": sorted(selection.material_ids),
            "revision": selection.revision, "execution_cutoff": selection.execution_cutoff}


def authorize_snapshot(snapshot, scope):
    if scope.run_id != snapshot["scope"]["run_id"]:
        raise DomainError("Report belongs to another run scope", 403)
    for field, allowed in (("artifacts", scope.artifact_ids), ("materials", scope.material_ids)):
        if allowed is not None and any(item["id"] not in allowed for item in snapshot[field]):
            raise DomainError("Report is outside the authorized input scope", 403)


def read_snapshot(payload):
    try:
        snapshot = payload["snapshot"]
        if payload["snapshot_digest"] != request_digest("report_snapshot_v1", snapshot):
            raise integrity("Report snapshot digest is inconsistent")
        if snapshot["schema_version"] != "1.0":
            raise integrity("Unsupported report snapshot version")
        for field in ("artifacts", "jobs", "materials"):
            if not isinstance(snapshot[field], list):
                raise integrity("Invalid report snapshot")
        if not isinstance(snapshot["project"], dict) or not isinstance(snapshot["scope"], dict):
            raise integrity("Invalid report snapshot")
        return deepcopy(snapshot)
    except (KeyError, TypeError, ValueError):
        raise integrity("Report has no valid frozen capture; submit a new report request") from None


def capture(session, pid, scope=None):
    """Metadata only. Caller commits snapshot and accepted job atomically."""
    lock_project(session, pid)
    project = session.get(ProjectRow, pid)
    selection = scope.report_selection if scope else None
    resolver = ArtifactResolver(session, pid, scope.artifact_ids if scope else None)
    all_jobs = session.scalars(select(JobRow).where(JobRow.project_id == pid).order_by(JobRow.id)).all()
    if selection is None:
        jobs = [j for j in all_jobs if j.kind != "report"]
        roots = list(session.scalars(select(ArtifactRow.id).where(
            ArtifactRow.project_id == pid, ArtifactRow.kind != "report").order_by(ArtifactRow.id)))
        # Validate old report provenance too, but don't recursively archive past exports.
        values = [resolver.resolve(aid) for aid in roots]
        values = [a for a in values if not (a.kind == "provenance" and a.activity == "report")]
        roots = [a.id for a in values]
        resolver = ArtifactResolver(session, pid)
        mids = list(session.scalars(select(MaterialRow.id).where(MaterialRow.project_id == pid).order_by(MaterialRow.id)))
    else:
        roots = sorted(selection.artifact_ids)
        requested = {j.id: j for j in all_jobs if j.id in selection.job_ids}
        if len(requested) != len(selection.job_ids):
            raise DomainError("Selected job not found in this project", 404, "JOB_NOT_FOUND")
        if any(j.kind == "report" for j in requested.values()):
            raise DomainError("A report cannot include report producer jobs", 422, "UNSUPPORTED_CAPABILITY")
        roots += [j.result_id for j in requested.values() if j.result_id]
        for job in requested.values():
            inputs = operation_inputs(session, pid, job.kind, job.payload,
                                      allowed_ids=scope.artifact_ids, material_ids=scope.material_ids)
            roots.extend(inputs)
        mids = set(selection.material_ids)
        mids.update(j.payload["material_id"] for j in requested.values() if j.kind == "evidence" and j.payload.get("material_id"))
        mids = sorted(mids)
        # Explicit selected materials contribute their dataset to the closure.
        for mid in mids:
            material = resolve_material(session, pid, mid, allowed_ids=scope.material_ids, artifact_ids=scope.artifact_ids)
            if material.dataset_id:
                roots.append(material.dataset_id)
        jobs = list(requested.values())
    values = resolver.closure(roots)
    if any(a.kind == "report" or (a.kind == "provenance" and a.activity == "report") for a in values):
        raise DomainError("Nested report captures are unsupported", 422, "UNSUPPORTED_CAPABILITY")
    ids = {a.id for a in values}
    # Include every producer of the dependency closure, not only explicitly named jobs.
    outcome_jobs = {a.source_job_id for a in values if a.kind == "failure" and a.schema_version == "2.0"}
    jobs = {j.id: j for j in jobs + [j for j in all_jobs if j.result_id in ids or j.id in outcome_jobs]}
    if any(j.state not in {"succeeded", "failed"} for j in jobs.values()):
        raise DomainError("Wait for selected producer jobs before exporting a report", 409, "PROJECT_BUSY")
    materials = [resolve_material(session, pid, mid, artifact_ids=scope.artifact_ids if scope else None) for mid in mids]
    from .db import EvaluationRow, ExposureRow, EvidenceSpanRow
    from .artifacts import named_span_ids
    from .evaluation import evaluation_status
    from .projections import ReadScope
    dataset_hashes = {a.sha256 for a in values if a.kind == "dataset"}
    span_ids = {identifier for a in values for identifier in named_span_ids(a)}
    evidence_spans = [{"id": row.id, "source_artifact_id": row.source_artifact_id, "reference": row.reference}
                     for row in session.scalars(select(EvidenceSpanRow).where(EvidenceSpanRow.project_id == pid,
                                                                            EvidenceSpanRow.id.in_(span_ids)))]
    evaluation_states = [evaluation_status(session, ReadScope(pid), row.protocol_id) for row in
        session.scalars(select(EvaluationRow).where(EvaluationRow.project_id == pid, EvaluationRow.protocol_id.in_(ids)))]
    exposure_events = [{"id": row.id, "dataset_sha256": row.dataset_sha256, "split_sha256": row.split_sha256,
                        "artifact_id": row.artifact_id, "via": row.via, "created_at": row.created_at.isoformat()}
        for row in session.scalars(select(ExposureRow).where(ExposureRow.project_id == pid,
            ExposureRow.dataset_sha256.in_(dataset_hashes)).order_by(ExposureRow.created_at, ExposureRow.id))]
    from .archive import environment
    from .services import software
    snapshot = {
        "environment": environment(), "software": software(),
        "evaluation_states": evaluation_states, "test_exposures": exposure_events, "evidence_spans": evidence_spans,
        "schema_version": "1.0", "captured_at": database_now(session).isoformat(),
        "scope": {"kind": "run" if selection else "project", "run_id": scope.run_id if selection else None,
                  "revision": selection.revision if selection else None,
                  "execution_cutoff": selection.execution_cutoff if selection else None,
                  "export_status_at_cutoff": "pending", "selected_artifact_ids": sorted(set(roots)),
                  "selected_job_ids": sorted(selection.job_ids) if selection else sorted(jobs)},
        "project": {"id": project.id, "name": project.name, "description": project.description},
        "artifacts": [a.model_dump(mode="json") for a in sorted(values, key=lambda a: a.id)],
        "materials": [{key: getattr(m, key) for key in
                       ("id", "project_id", "filename", "media_type", "blob_key", "sha256", "dataset_id")} for m in materials],
        # Free-form worker errors, request keys, credentials and payloads are not job export fields.
        "jobs": [{"id": j.id, "kind": j.kind, "state": j.state, "result_id": j.result_id,
                  "created_at": j.created_at.isoformat(),
                  "error_code": j.error_code, "error": "Job failed; see error_code" if j.state == "failed" else None}
                 for j in sorted(jobs.values(), key=lambda j: j.id)],
    }
    if selection and scope.run_id:
        from .agent_db import finalization_for, RuntimeVersionRow
        finalization = finalization_for(session, scope.run_id)
        if finalization and finalization.project_id == pid:
            snapshot['agent_finalization'] = {
                'candidate_sha256': finalization.candidate_sha256,
                'execution_record_id': finalization.execution_id,
                'claim_set_id': finalization.claim_set_id,
                'review': finalization.result.get('review'),
                'runtime_versions': [r.payload for r in session.scalars(select(RuntimeVersionRow)
                    .where(RuntimeVersionRow.run_id == scope.run_id).order_by(RuntimeVersionRow.created_at, RuntimeVersionRow.sha256))],
                'gaps': finalization.result.get('issues', []),
                'export_status_at_cutoff': 'pending', 'scientific_replay': 'not_run'}
    return deepcopy(snapshot)


def freeze(session, scope, request):
    snapshot = capture(session, scope.project_id, scope)
    return {"request": request, "snapshot": snapshot,
            "snapshot_digest": request_digest("report_snapshot_v1", snapshot)}

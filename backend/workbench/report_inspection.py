"""A08 manual report inspection: reverify stored archive bytes, project frozen identities only.

No scientific values (metrics, predictions, text, assignments) leave this read, so it records
no holdout exposure. Scientific replay is never executed here and is always reported as not run.
"""
import io
import json
import zipfile

from .artifacts import ArtifactResolver
from .contracts import now
from .errors import DomainError
from .storage import StorageError, StorageIntegrityError

VERIFY_ERRORS = (ValueError, KeyError, TypeError, RecursionError)


def label(a):
    match a.kind:
        case "dataset":
            return f"{a.filename} · {a.rows} rows"
        case "audit":
            return f"Audit of dataset {a.dataset_id}"
        case "split":
            strategy = a.config.get("strategy") if isinstance(a.config, dict) else None
            return f"Split{f' ({strategy})' if isinstance(strategy, str) else ''} of dataset {a.dataset_id}"
        case "benchmark":
            return f"{a.model} baseline · seed {a.seed} · {a.status}"
        case "evidence":
            return a.title
        case "failure":
            return a.reason
        case "claim_set":
            return f"{len(a.claims)} claim{'s' if len(a.claims) != 1 else ''} · run {a.run_id} revision {a.revision}"
        case "evaluation_protocol":
            return f"Sealed comparison on split {a.split_id}"
        case "agent_execution":
            return a.objective
        case "provenance":
            return a.activity.replace("_", " ")
    return a.kind


def report_summary(session, store, scope, report_id):
    from .projections import authorize
    authorize(session, scope)
    if scope.audience == "agent":
        raise DomainError("Report archives are quarantined; use typed projections", 403, "DATA_EXPOSURE_DENIED")
    report = ArtifactResolver(session, scope.project_id).resolve(report_id, "report")
    checked_at = now()
    base = {"report_id": report.id, "sha256": report.sha256, "size_bytes": 0, "verification": None,
            "manifest_version": None, "captured_at": None, "scope": None, "file_count": 0, "inputs": [], "jobs": [],
            "materials": [], "software": {}, "python": None, "platform": None, "upstream_commits": {},
            "agent_executions": [], "finalization": None}

    def failed(reason):
        return {**base, "verification": {"status": "failed", "checked_at": checked_at, "reason": reason}}
    try:
        raw = store.get(report.blob_key)
    except StorageIntegrityError:
        return failed("Stored archive bytes do not match their recorded digest")
    except StorageError:
        raise
    base["size_bytes"] = len(raw)
    if report.sha256 != report.blob_key:
        return failed("Report digest disagrees with its stored archive")
    from .archive import verify_archive
    try:
        files, values = verify_archive(io.BytesIO(raw))
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            manifest = json.loads(archive.read("manifest.json"))
        snapshot = json.loads(files["snapshot.json"])
    except (*VERIFY_ERRORS, zipfile.BadZipFile) as exc:
        # Verifier messages describe structure, never archive content.
        return failed(f"Structural verification failed: {str(exc)[:300] or type(exc).__name__}")
    if {a.id for a in values} != set(report.artifact_ids) or snapshot["project"]["id"] != scope.project_id:
        return failed("Archive inventory disagrees with the report record")
    environment = snapshot.get("environment") or {}
    frozen = snapshot.get("scope")
    final = snapshot.get("agent_finalization")
    review = final.get("review") if final else None
    return {**base,
        "verification": {"status": "verified", "checked_at": checked_at},
        "manifest_version": manifest["schema_version"],
        "captured_at": snapshot.get("captured_at"),
        "scope": {key: frozen.get(key) for key in ("kind", "run_id", "revision", "execution_cutoff", "export_status_at_cutoff")} if frozen else None,
        "file_count": len(files) + 1,
        "inputs": [{"id": a.id, "kind": a.kind, "schema_version": a.schema_version, "created_at": a.created_at,
                    "label": str(label(a))[:300], "parents": list(a.parents)} for a in sorted(values, key=lambda a: (a.created_at, a.id))],
        "jobs": [{key: j.get(key) for key in ("id", "kind", "state", "result_id", "error_code")} for j in snapshot.get("jobs", [])],
        "materials": [{key: m[key] for key in ("id", "filename", "media_type", "sha256")} for m in snapshot.get("materials", [])],
        "software": {k: str(v) for k, v in (snapshot.get("software") or {}).items()},
        "python": environment.get("python"), "platform": environment.get("platform"),
        "upstream_commits": dict(environment.get("upstream_commits") or {}),
        "agent_executions": [{"execution_record_id": a.id, "run_id": a.run_id, "objective": a.objective,
                              "versions": a.versions, "policy": a.policy, "state_at_cutoff": a.state_at_cutoff,
                              "event_cutoff": a.event_cutoff, "captured_at": a.captured_at,
                              "pending_finalization_action_ids": a.pending_finalization_action_ids}
                             for a in values if a.kind == "agent_execution"],
        "finalization": {"execution_record_id": final.get("execution_record_id"), "claim_set_id": final.get("claim_set_id"),
                         "review_status": review.get("status") if isinstance(review, dict) and isinstance(review.get("status"), str) else None,
                         "runtime_version_count": len(final.get("runtime_versions") or []),
                         "gaps": [str(g)[:4000] for g in final.get("gaps") or []]} if final else None,
    }

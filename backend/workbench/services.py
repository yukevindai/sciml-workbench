import hashlib
import io
import json
import zipfile
from importlib.metadata import version, distributions
import platform
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from sqlalchemy import select
from . import adapters
from .config import PINS
from .contracts import (
    Audit,
    Benchmark,
    BenchmarkInput,
    Dataset,
    Evidence,
    Failure,
    Provenance,
    Report,
    Split,
    uid,
)
from .db import ArtifactRow, JobRow, ProjectRow, MaterialRow
from .contract_registry import read_artifact
from .storage import StorageError
from .execution import Work
from .errors import DomainError
from .artifacts import ArtifactResolver, operation_inputs, resolve_material


def software():
    return {**{k: version(k) + "@" + v for k, v in PINS.items()}, "workbench": "0.1.0"}


def project(session, project_id):
    row = session.get(ProjectRow, project_id)
    if not row:
        raise DomainError("Project not found", 404, "PROJECT_NOT_FOUND")
    return row


def artifact(session, project_id, artifact_id, kind=None):
    return ArtifactResolver(session, project_id).resolve(artifact_id, kind)


def save(session, value):
    checked = ArtifactResolver(session, value.project_id).validate(value)
    session.add(
        ArtifactRow(
            id=checked.id,
            project_id=checked.project_id,
            kind=checked.kind,
            payload=checked.model_dump(mode="json"),
        )
    )
    return checked


def upload_csv(session, store, settings, project_id, raw, filename, source):
    project(session, project_id)
    from .intake import inspect_csv, filename as checked_filename
    header, count = inspect_csv(raw, settings)
    filename = checked_filename(filename)
    key = store.put(raw)
    data = save(
        session,
        Dataset(
            project_id=project_id,
            filename=Path(filename).name[:200],
            blob_key=key,
            sha256=key,
            rows=count,
            columns=header,
            source=source,
            software=software(),
        ),
    )
    save(
        session,
        Provenance(
            project_id=project_id,
            activity="upload",
            inputs=[],
            outputs=[data.id],
            parameters={"source": source.model_dump()},
            software=software(),
        ),
    )
    return data


def ensure_lineage(session, pid, kind, payload):
    """Validate project boundaries and immutable parent chains before queuing."""
    project(session, pid)
    return operation_inputs(session, pid, kind, payload)


def capture_report(session, pid):
    proj = project(session, pid)
    rows = session.scalars(
        select(ArtifactRow)
        .where(ArtifactRow.project_id == pid)
        .order_by(ArtifactRow.created_at, ArtifactRow.id)
    ).all()
    resolver = ArtifactResolver(session, pid)
    artifacts = [resolver.resolve(x.id).model_dump(mode="json") for x in rows if x.kind != "report"]
    jobs = session.scalars(select(JobRow).where(JobRow.project_id == pid)).all()
    materials = [resolve_material(session, pid, mid) for mid in session.scalars(
        select(MaterialRow.id).where(MaterialRow.project_id == pid).order_by(MaterialRow.id))]
    return deepcopy({
        "materials": [{key: getattr(m, key)
                       for key in ("id", "project_id", "filename", "media_type", "blob_key", "sha256", "dataset_id")}
                      for m in materials],
        "artifacts": artifacts,
        "project": {"id": proj.id, "name": proj.name, "description": proj.description},
        "jobs": [
                {
                    "id": j.id,
                    "kind": j.kind,
                    "state": j.state,
                    "error": j.error,
                    "result_id": j.result_id,
                }
                for j in jobs
                if j.kind != "report"
            ],
    })


def report_bundle(snapshot, store):
    artifacts = snapshot["artifacts"]
    proj = SimpleNamespace(**snapshot["project"])
    files = {
        "materials.json": adapters.encoded(snapshot.get("materials", [])),
        "artifacts.json": adapters.encoded(artifacts),
        "project.json": adapters.encoded(snapshot["project"]),
        "jobs.json": adapters.encoded(snapshot["jobs"]),
        "software.json": adapters.encoded(software()),
    }
    files["environment.json"] = adapters.encoded(
        {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "packages": {d.metadata["Name"]: d.version for d in distributions()},
            "upstream_commits": PINS,
        }
    )
    for a in artifacts:
        for field in ("blob_key", "bundle_key", "pdf_key"):
            if a.get(field):
                files[f"blobs/{a[field]}"] = store.get(a[field])
    for material in snapshot.get("materials", []):
        files[f"blobs/{material['blob_key']}"] = store.get(material["blob_key"])
    from .scientific_contracts import DatasetV2
    files["contracts/v2/dataset.json"] = adapters.encoded(DatasetV2.model_json_schema())
    from . import contracts

    for model in (
        contracts.Dataset,
        contracts.Audit,
        contracts.Split,
        contracts.Benchmark,
        contracts.Evidence,
        contracts.Failure,
        contracts.Provenance,
        contracts.Report,
    ):
        files[f"contracts/{model.__name__.lower()}.json"] = adapters.encoded(
            model.model_json_schema()
        )
    files["README.md"] = (
        "# Reproducible SciML Workbench report\n\n"
        "All results are local task results; no official leaderboard admission is implied.\n"
        "Dataset declarations may be unresolved; supplied declarations are assertions. Audit findings do not certify validity.\n"
        "Failed runs are retained; software failure is not an experimental outcome.\n\n"
        "## Replay\nInstall the workbench backend at version 0.1.0 using its pinned dependencies.\n"
        "Run `python -m workbench.replay /path/to/report.zip /new/output-directory`.\n"
        "This verifies every manifest digest and reruns audits, partitions and successful baselines.\n"
        "It never reimports Failure Memory records. Each benchmark bundle also contains the upstream\n"
        "task card, input, frozen partitions, prepared files, predictions and metrics.\n"
        "Keep this archive private: it contains the uploaded data and evidence.\n"
    ).encode()
    summary = [f"# {proj.name}", proj.description, "## Artifacts"]
    for a in artifacts:
        summary.append(
            f"- {a['kind']} `{a['id']}`; parents: {', '.join(a['parents']) or 'none'}"
        )
        if a["kind"] == "audit":
            summary.append(f"  Findings: {len(a['result'].get('findings', []))}")
        if a["kind"] == "benchmark":
            summary.append(
                f"  Status: {a['status']}; metrics: {json.dumps(a['result'].get('metrics', {}))}; error: {a['error']}"
            )
        if a["kind"] == "failure":
            summary.append(f"  Researcher assessment: {a['reason']}")
    files["report.md"] = "\n\n".join(summary).encode()
    files["manifest.json"] = adapters.encoded(
        {
            "schema_version": "1.0",
            "files": {k: hashlib.sha256(v).hexdigest() for k, v in files.items()},
        }
    )
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for key, raw in sorted(files.items()):
            z.writestr(key, raw)
    return out.getvalue(), [a["id"] for a in artifacts]


def prepare_execution(session, job):
    """Detach immutable metadata in a short transaction; no blob or adapter IO."""
    pid, p = job.project_id, deepcopy(job.payload)
    resolved = ensure_lineage(session, pid, job.kind, p)
    work = Work(job_id=job.id, result_id=uid(), project_id=pid, kind=job.kind, payload=p)

    def include(aid, kind):
        value = resolved[aid]
        work.artifacts[aid] = value.model_dump(mode="json")
        return value

    if job.kind in {"audit", "split", "benchmark"}:
        include(p["dataset_id"], "dataset")
    if job.kind == "benchmark":
        part = include(p["split_id"], "split")
        include(part.audit_id, "audit")
    elif job.kind == "failure":
        include(p["benchmark_id"], "benchmark")
        proj = project(session, pid)
        work.project = {"id": proj.id, "name": proj.name, "description": proj.description}
    elif job.kind == "report":
        work.report = capture_report(session, pid)
    return work


def execute(store, settings, work):
    """Compute from a detached snapshot. No session, engine or metadata writes."""
    pid, p = work.project_id, work.payload
    common = {"id": work.result_id, "project_id": pid, "software": software()}
    inputs = {key: read_artifact(value) for key, value in work.artifacts.items()}
    if work.kind in {"audit", "split", "benchmark"}:
        data = inputs[p["dataset_id"]]
        raw = store.get(data.blob_key)
    if work.kind == "audit":
        value = Audit(
            **common,
            parents=[data.id],
            dataset_id=data.id,
            config=p["config"],
            result=adapters.run_audit(raw, p["config"]),
        )
    elif work.kind == "split":
        assignments, result = adapters.run_split(raw, p["config"])
        value = Split(
            **common,
            parents=[data.id, p["audit_id"]],
            dataset_id=data.id,
            audit_id=p["audit_id"],
            config=p["config"],
            assignments=assignments,
            result=result,
        )
    elif work.kind == "benchmark":
        part = inputs[p["split_id"]]
        audited = inputs[part.audit_id]
        value = Benchmark(
            **common,
            parents=[data.id, part.id],
            dataset_id=data.id,
            split_id=part.id,
            model=p["model"],
            seed=p["seed"],
            status="failed",
            config=p,
        )
        try:
            value.result, bundle = adapters.run_benchmark(
                raw, data, part, BenchmarkInput(**p), audited.config
            )
            value.bundle_key = store.put(bundle)
            value.status = "succeeded"
        except StorageError:
            # Storage failure is operational, not a scientific admission result.
            raise
        except (ValueError, TypeError, KeyError) as exc:
            value.error = safe_error(exc, settings)
    elif work.kind == "evidence":
        raw = store.get(p["pdf_key"])
        result, bundle = adapters.ingest_pdf(raw, p["title"])
        value = Evidence(
            **common,
            title=p["title"],
            pdf_key=p["pdf_key"],
            sha256=p["pdf_key"],
            result=result,
            bundle_key=store.put(bundle),
        )
    elif work.kind == "failure":
        run = inputs[p["benchmark_id"]]
        record = {
            "title": f"Unsuccessful {run.model} benchmark",
            "performed_at": run.created_at.isoformat(),
            "status": "failed",
            "summary": p["reason"],
            "outcomes": run.error or json.dumps(run.result.get("metrics", {})),
            "uncertainty_notes": p["uncertainty_notes"],
            "tags": ["computational-run", "sciml-workbench"],
            "procedure": [
                f"Run {run.model} with seed {run.seed}",
                f"Dataset {run.dataset_id}; split {run.split_id}",
            ],
            "source": {
                "kind": "file",
                "reference": f"workbench:{pid}/artifacts/{run.id}",
                "notes": "Computational run; unsuccessful is a researcher assessment, not a physical experiment.",
            },
        }
        external_pid, result = adapters.FailureMemory(settings).save(
            SimpleNamespace(**work.project), work.job_id, record
        )
        value = Failure(
            **common,
            parents=[run.id],
            benchmark_id=run.id,
            external_project_id=external_pid,
            external_record_id=result["id"],
            reason=p["reason"],
            record=result,
        )
    elif work.kind == "report":
        raw, ids = report_bundle(work.report, store)
        key = store.put(raw)
        value = Report(
            **common, parents=ids, blob_key=key, sha256=key, artifact_ids=ids
        )
    else:
        raise DomainError("Unsupported job kind")
    return value


def safe_error(exc, settings):
    if isinstance(exc, httpx_error_types()):
        return "Failure Memory request failed. Check its server account and logs; credentials are never included in errors."
    if isinstance(exc, (ValueError, TypeError, KeyError, DomainError)):
        msg = str(exc)
        for name in ("api_token", "efm_password", "database_url"):
            secret = getattr(settings, name, None)
            if hasattr(secret, "get_secret_value"):
                secret = secret.get_secret_value()
            if secret:
                msg = msg.replace(secret, "[redacted]")
        return msg[:1500]
    return "Task could not complete. Check server logs using the job ID."


def httpx_error_types():
    import httpx

    return httpx.HTTPError

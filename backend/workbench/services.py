import csv
import hashlib
import io
import json
import zipfile
from importlib.metadata import version, distributions
import platform
from pathlib import Path
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
    artifact_adapter,
)
from .db import ArtifactRow, JobRow, ProjectRow


class DomainError(Exception):
    def __init__(self, message, status=422):
        self.message, self.status = message, status
        super().__init__(message)


def software():
    return {**{k: version(k) + "@" + v for k, v in PINS.items()}, "workbench": "0.1.0"}


def project(session, project_id):
    row = session.get(ProjectRow, project_id)
    if not row:
        raise DomainError("Project not found", 404)
    return row


def artifact(session, project_id, artifact_id, kind=None):
    row = session.get(ArtifactRow, artifact_id)
    if not row or row.project_id != project_id:
        raise DomainError("Artifact not found in this project", 404)
    result = artifact_adapter.validate_python(row.payload)
    if kind and result.kind != kind:
        raise DomainError(f"Expected a {kind} artifact")
    return result


def save(session, value):
    checked = artifact_adapter.validate_python(value.model_dump(mode="json"))
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
    try:
        rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig")), strict=True))
    except (UnicodeError, csv.Error) as e:
        raise DomainError("Upload a valid UTF-8 CSV") from e
    if len(rows) < 4 or len(rows) > settings.max_rows + 1:
        raise DomainError(f"CSV must contain 3–{settings.max_rows} data rows")
    header = rows[0]
    if (
        not header
        or len(header) > 200
        or any(not x.strip() for x in header)
        or len(set(header)) != len(header)
    ):
        raise DomainError("CSV needs 1–200 unique, nonblank column names")
    if any(len(row) != len(header) for row in rows[1:]):
        raise DomainError("CSV has ragged or blank rows")
    key = store.put(raw)
    data = save(
        session,
        Dataset(
            project_id=project_id,
            filename=Path(filename).name[:200],
            blob_key=key,
            sha256=key,
            rows=len(rows) - 1,
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
    if kind in {"audit", "split", "benchmark"}:
        data = artifact(session, pid, payload["dataset_id"], "dataset")
        if kind == "split":
            audit = artifact(session, pid, payload["audit_id"], "audit")
            if audit.dataset_id != data.id:
                raise DomainError("Audit belongs to another dataset")
        if kind == "benchmark":
            part = artifact(session, pid, payload["split_id"], "split")
            if part.dataset_id != data.id:
                raise DomainError("Split belongs to another dataset")
    elif kind == "failure":
        artifact(session, pid, payload["benchmark_id"], "benchmark")


def report_bundle(session, store, pid):
    proj = project(session, pid)
    rows = session.scalars(
        select(ArtifactRow)
        .where(ArtifactRow.project_id == pid)
        .order_by(ArtifactRow.created_at, ArtifactRow.id)
    ).all()
    artifacts = [x.payload for x in rows if x.kind != "report"]
    jobs = session.scalars(select(JobRow).where(JobRow.project_id == pid)).all()
    files = {
        "artifacts.json": adapters.encoded(artifacts),
        "project.json": adapters.encoded(
            {"id": proj.id, "name": proj.name, "description": proj.description}
        ),
        "jobs.json": adapters.encoded(
            [
                {
                    "id": j.id,
                    "kind": j.kind,
                    "state": j.state,
                    "error": j.error,
                    "result_id": j.result_id,
                }
                for j in jobs
                if j.kind != "report"
            ]
        ),
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
        "Dataset provenance is user supplied. Audit findings do not certify validity.\n"
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


def execute(session, store, settings, job):
    pid, p = job.project_id, job.payload
    common = {"project_id": pid, "software": software()}
    ensure_lineage(session, pid, job.kind, p)
    if job.kind in {"audit", "split", "benchmark"}:
        data = artifact(session, pid, p["dataset_id"], "dataset")
        raw = store.get(data.blob_key)
    if job.kind == "audit":
        value = Audit(
            **common,
            parents=[data.id],
            dataset_id=data.id,
            config=p["config"],
            result=adapters.run_audit(raw, p["config"]),
        )
    elif job.kind == "split":
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
    elif job.kind == "benchmark":
        part = artifact(session, pid, p["split_id"], "split")
        audited = artifact(session, pid, part.audit_id, "audit")
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
        except (ValueError, TypeError, KeyError) as exc:
            value.error = safe_error(exc, settings)
    elif job.kind == "evidence":
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
    elif job.kind == "failure":
        run = artifact(session, pid, p["benchmark_id"], "benchmark")
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
        # Serialize remote provisioning/imports across workers using a PG advisory lock.
        if session.bind.dialect.name == "postgresql":
            from sqlalchemy import text

            session.execute(text("SELECT pg_advisory_xact_lock(7314201)"))
        external_pid, result = adapters.FailureMemory(settings).save(
            project(session, pid), job.id, record
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
    elif job.kind == "report":
        raw, ids = report_bundle(session, store, pid)
        key = store.put(raw)
        value = Report(
            **common, parents=ids, blob_key=key, sha256=key, artifact_ids=ids
        )
    else:
        raise DomainError("Unsupported job kind")
    value = save(session, value)
    save(
        session,
        Provenance(
            **common,
            parents=value.parents,
            activity=job.kind,
            inputs=value.parents,
            outputs=[value.id],
            parameters=p,
        ),
    )
    return value


def safe_error(exc, settings):
    if isinstance(exc, httpx_error_types()):
        return "Failure Memory request failed. Check its server account and logs; credentials are never included in errors."
    if isinstance(exc, (ValueError, TypeError, KeyError, DomainError)):
        msg = str(exc)[:1500]
        for secret in (
            settings.api_token.get_secret_value(),
            settings.efm_password.get_secret_value(),
            settings.database_url,
        ):
            msg = msg.replace(secret, "[redacted]")
        return msg
    return "Task could not complete. Check server logs using the job ID."


def httpx_error_types():
    import httpx

    return httpx.HTTPError

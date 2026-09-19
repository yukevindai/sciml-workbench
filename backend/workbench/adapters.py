"""Only public package APIs and documented exchange formats belong here."""

import asyncio
import hashlib
import io
import json
import os
import tempfile
import zipfile
from pathlib import Path
import httpx
import pandas as pd
from chemdata_auditor import AuditConfig, SplitConfig, audit, split
from cheme_benchmarks import prepare, run_baseline
from scientific_evidence_engine import ingest_paper
from .config import PINS


def encoded(value):
    return json.dumps(value, sort_keys=True, indent=2, allow_nan=False).encode()


def zipped(root):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for path in sorted(Path(root).rglob("*")):
            if path.is_file():
                z.writestr(str(path.relative_to(root)), path.read_bytes())
    return out.getvalue()


def frame(raw):
    return pd.read_csv(io.BytesIO(raw), dtype=str, keep_default_na=False)


def run_audit(raw, config):
    return audit(frame(raw), AuditConfig(**config)).to_dict()


def run_split(raw, config):
    result = split(frame(raw), SplitConfig(**config))
    return result.assignments(), result.to_dict()


def run_benchmark(raw, dataset, partition, req, audit_config):
    """Build the documented admission card and frozen partitions; upstream owns
    admission, preprocessing, fitting, prediction and all metric computation.
    User tasks are local tasks, never claims of admission to the official suite.
    """
    df = frame(raw)
    cfg = partition.config
    frozen = {
        "schema_version": "1.0",
        "dataset_sha256": dataset.sha256,
        "split_config": cfg,
        "generator": {"name": "SciSplit", "commit": PINS["chemdata-auditor"]},
        "assignments": [
            {"row_id": str(r), "partition": p}
            for r, p in zip(df[req.row_id], partition.assignments)
        ],
    }
    frozen_raw = encoded(frozen)
    source = dataset.source
    spec = {
        "schema_version": "1.0",
        "id": "local-" + dataset.id,
        "version": "1.0.0",
        "title": dataset.filename,
        "domain": req.domain,
        "data_kind": source.data_kind,
        "task": "regression",
        "protocol": "cheme-tabular-v1",
        "data": {
            "path": "data.csv",
            "sha256": dataset.sha256,
            "row_id": req.row_id,
            "rows": dataset.rows,
        },
        "features": {
            "numeric": req.numeric_features,
            "categorical": req.categorical_features,
        },
        "target": req.target,
        "units": req.units,
        "source": {
            "url": source.url,
            "citation": source.citation,
            "license": source.license,
            "retrieved": dataset.created_at.date().isoformat(),
            "raw_sha256": dataset.sha256,
            "transformations": source.transformations,
        },
        "independence": {
            "columns": req.group_columns,
            "unit": req.independence_unit,
            "status": req.independence_status,
            "rationale": req.independence_rationale,
        },
        "generalization": {
            "supports": req.generalization,
            "does_not_establish": "; ".join(req.limitations),
        },
        "limitations": req.limitations,
        "split": cfg,
        "partitions": {
            "path": "partitions.json",
            "sha256": hashlib.sha256(frozen_raw).hexdigest(),
        },
        "audit": {
            **audit_config,
            "target_column": req.target,
            "feature_columns": req.numeric_features + req.categorical_features,
        },
        "accepted_warnings": req.accepted_warnings,
        "model_seeds": [req.seed],
        "primary_metric": "group_mae",
    }
    with tempfile.TemporaryDirectory(prefix="wb-benchmark-") as tmp:
        root = Path(tmp)
        (root / "data.csv").write_bytes(raw)
        (root / "partitions.json").write_bytes(frozen_raw)
        (root / "benchmark.json").write_bytes(encoded(spec))
        prepare(root / "benchmark.json", root / "prepared")
        result = run_baseline(root / "prepared", req.model, root / "run", seed=req.seed)
        return result, zipped(root)


def ingest_pdf(raw, title):
    with tempfile.TemporaryDirectory(prefix="wb-evidence-") as tmp:
        root = Path(tmp)
        (root / "input.pdf").write_bytes(raw)
        result = ingest_paper(root / "input.pdf", root / "evidence", {"title": title})
        return result, zipped(root / "evidence")


class FailureMemory:
    """Embedded upstream ASGI application accessed exclusively by its JSON API.

    It keeps its own supported SQLite store and authorization, unchanged. The
    workbench never reads upstream tables or calls its private service functions.
    """

    def __init__(self, settings):
        from failure_memory.app import create_app

        self.settings = settings
        self.app = create_app(
            settings.storage_root / "failure-memory.sqlite", "http://localhost", False
        )

    async def save_async(self, project, external_id, record):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.app),
            base_url="http://localhost",
            timeout=30,
        ) as client:
            client.headers["X-EFM-Request"] = "1"
            login = await client.post(
                "/api/login",
                json={
                    "username": self.settings.efm_username,
                    "password": self.settings.efm_password.get_secret_value(),
                },
            )
            login.raise_for_status()
            client.headers["X-CSRF-Token"] = login.json()["csrf"]
            try:
                labs = await client.get("/api/labs")
                labs.raise_for_status()
                lab = next(
                    (x for x in labs.json() if x["name"] == "SciML Workbench"), None
                )
                if not lab:
                    res = await client.post(
                        "/api/labs", json={"name": "SciML Workbench"}
                    )
                    res.raise_for_status()
                    lab = res.json()
                projects = await client.get("/api/projects")
                projects.raise_for_status()
                name = f"{project.name[:100]} [{project.id}]"
                remote = next(
                    (
                        x
                        for x in projects.json()
                        if x["name"] == name and x["lab_id"] == lab["id"]
                    ),
                    None,
                )
                if not remote:
                    res = await client.post(
                        f"/api/labs/{lab['id']}/projects",
                        json={"name": name, "description": project.description},
                    )
                    res.raise_for_status()
                    remote = res.json()
                res = await client.post(
                    f"/api/projects/{remote['id']}/import",
                    json={
                        "schema_version": "1.0",
                        "connector": "sciml-workbench",
                        "external_id": external_id,
                        "record": record,
                    },
                )
                res.raise_for_status()
                return remote["id"], res.json()["record"]
            finally:
                await client.post("/api/logout")

    def save(self, project, external_id, record):
        # Local upstream SQLite is shared by the single-backend topology.
        # Serialize its public provisioning/import calls without holding a
        # workbench database transaction or connection across external IO.
        with (self.settings.storage_root / ".failure-memory.lock").open("a+b") as lock:
            if os.name == "posix":
                import fcntl
                fcntl.flock(lock, fcntl.LOCK_EX)
            else:
                # Development-only Windows byte-range lock; production is Linux.
                import msvcrt
                if lock.tell() == 0:
                    lock.write(b"\0")
                    lock.flush()
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
            return asyncio.run(self.save_async(project, external_id, record))

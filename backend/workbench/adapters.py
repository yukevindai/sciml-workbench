"""Only public package APIs and documented exchange formats belong here."""

import hashlib
import io
import json
import tempfile
import zipfile
from copy import deepcopy
from dataclasses import asdict
from importlib.util import find_spec
from pathlib import Path
import pandas as pd
from pydantic import JsonValue
from pypdfium2 import PdfiumError
from chemdata_auditor import AuditConfig, SplitConfig, audit, split
from cheme_benchmarks import prepare, run_baseline
from scientific_evidence_engine import ingest_paper
from .config import PINS
from .failure_memory import FailureMemory
from .audit_contracts import AuditInputError, AuditOutput, AuditReport
from .evidence_integrity import EvidenceInputError, verify_evidence
from .split_integrity import (
    SplitCapabilityError, SplitInputError, SplitIntegrityError, validate_split, validate_exchange,
)


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


def run_audit(raw: bytes, config: dict[str, JsonValue]) -> AuditOutput:
    """Run configured checks without interpreting completion as acceptance.

    Callers resolve/scoped-read CSV bytes before invoking this boundary. Keep
    requested options separate from the effective defaults in upstream metadata.
    Its dataframe fingerprint is not the digest of the uploaded file.
    """
    requested = deepcopy(config)
    try:
        result = audit(frame(raw), AuditConfig(**deepcopy(requested))).to_dict()
    except (TypeError, ValueError) as exc:
        raise AuditInputError(str(exc)) from exc
    return AuditOutput(
        source_sha256=hashlib.sha256(raw).hexdigest(), config=requested,
        result=AuditReport.model_validate(result),
    )


def run_split(raw, config):
    supported = {"random", "formulation", "composition", "publication", "laboratory",
                 "time", "temporal", "cluster", "extrapolation", "scaffold"}
    if not isinstance(config.get("strategy"), str) or config["strategy"] not in supported:
        raise SplitCapabilityError("Unsupported split strategy")
    if (config["strategy"] == "scaffold" or config.get("group_smiles_column")
            or config.get("group_molecular_similarity")) and find_spec("rdkit") is None:
        raise SplitCapabilityError("Molecular splits require the unavailable RDKit chemistry extra")
    data = frame(raw)
    try:
        cfg = SplitConfig(**deepcopy(config))
        result = split(data, cfg)
    except (TypeError, ValueError) as exc:
        raise SplitInputError(str(exc)) from exc
    report = result.to_dict()
    # Surface malformed positions as integrity failures, including overlaps that
    # assignments() alone would hide by overwriting labels.
    try:
        assignments = result.assignments()
    except (IndexError, TypeError) as exc:
        raise SplitIntegrityError("SciSplit returned invalid row positions") from exc
    validate_split(assignments, report, len(data))
    if report.get("metadata", {}).get("config") != asdict(cfg):
        raise SplitIntegrityError("SciSplit report configuration differs from requested configuration")
    return assignments, report


def benchmark_source(dataset):
    """Project resolved declarations without inventing an upstream source card."""
    source = dataset.source
    if dataset.schema_version == "2.0":
        from types import SimpleNamespace
        required = ("citation", "url", "license", "data_kind", "transformations")
        unresolved = [name for name in required if getattr(source, name).origin not in {"user_supplied", "source_derived"}]
        if unresolved:
            raise ValueError("Benchmark requires resolved source declarations: " + ", ".join(unresolved))
        source = SimpleNamespace(**{name: getattr(source, name).value for name in required})
        source.transformations = "; ".join(source.transformations)
    return source


def run_benchmark(raw, dataset, partition, req, audit_config):
    """Build the documented admission card and frozen partitions; upstream owns
    admission, preprocessing, fitting, prediction and all metric computation.
    User tasks are local tasks, never claims of admission to the official suite.
    """
    df = frame(raw)
    if req.dataset_id != dataset.id or req.split_id != partition.id:
        raise SplitIntegrityError("Benchmark request differs from its dataset/split inputs")
    assignments = validate_exchange(raw, dataset, partition, df, req.row_id)
    cfg = partition.config
    frozen = {
        "schema_version": "1.0",
        "dataset_sha256": dataset.sha256,
        "split_config": cfg,
        "generator": {"name": "SciSplit", "commit": PINS["chemdata-auditor"]},
        "assignments": assignments,
    }
    frozen_raw = encoded(frozen)
    source = benchmark_source(dataset)
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
        # prepare() replaces unit rules with constant task-card labels. Preserve
        # checks of the user's original unit columns before that replacement.
        if audit_config.get("units"):
            rules = deepcopy(audit_config["units"])
            for column, rule in rules.items():
                rule["expected"] = req.units.get(column, rule["expected"])
            unit_report = audit(df, AuditConfig(
                units=rules, unit_aliases=deepcopy(audit_config.get("unit_aliases", {})),
            )).to_dict()
            blocked = [f for f in unit_report["findings"] if f["severity"] == "error"
                       or (f["code"] == "unit_conversion" and f["columns"][0] in req.units)]
            if blocked:
                raise ValueError("Original-unit admission failed: " + ", ".join(sorted({f["code"] for f in blocked}))
                                 + ". Supply a deliberately curated dataset in its declared units; input bytes were not converted.")
            (root / "original-units-audit.json").write_bytes(encoded(unit_report))
        prepare(root / "benchmark.json", root / "prepared")
        result = run_baseline(root / "prepared", req.model, root / "run", seed=req.seed)
        return result, zipped(root)


def ingest_pdf(raw, title):
    with tempfile.TemporaryDirectory(prefix="wb-evidence-") as tmp:
        root = Path(tmp)
        (root / "input.pdf").write_bytes(raw)
        try:
            result = ingest_paper(root / "input.pdf", root / "evidence", {"title": title})
        except (PdfiumError, ValueError) as exc:
            raise EvidenceInputError("PDF ingestion failed: provide a readable PDF and valid metadata. "
                                     "No evidence was extracted; no OCR is performed.") from exc
        verify_evidence(root / "evidence", raw, result)
        return result, zipped(root / "evidence")

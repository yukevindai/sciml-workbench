"""Advertise only the reviewed, pinned, integrated public scientific surface."""
import importlib
from importlib.metadata import distribution
import json
from typing import get_args

from .config import PINS
from .artifacts import KINDS
from .contract_registry import ARTIFACT_READERS
from .contracts import BenchmarkInput
from .errors import DomainError
from .read_contracts import Capabilities, CapabilityLimits

PUBLIC_EXPORTS = {
    "chemdata-auditor": ("chemdata_auditor", ("AuditConfig", "SplitConfig", "audit", "split")),
    "cheme-ml-benchmarks": ("cheme_benchmarks", ("prepare", "run_baseline")),
    "scientific-evidence-engine": ("scientific_evidence_engine", ("ingest_paper",)),
    "experiment-failure-memory": ("failure_memory.app", ("create_app",)),
}


def capabilities(settings):
    try:
        for package, pin in PINS.items():
            info = json.loads(distribution(package).read_text("direct_url.json") or "{}")
            vcs = info.get("vcs_info", {})
            if vcs.get("vcs") != "git" or vcs.get("commit_id") != pin:
                raise ValueError()
            module, names = PUBLIC_EXPORTS[package]
            public = importlib.import_module(module)
            if any(not callable(getattr(public, name, None)) for name in names):
                raise ValueError()
    except Exception:
        raise DomainError("Scientific installation does not match the verified public capability surface", 503,
                          "DEPENDENCY_UNAVAILABLE") from None
    readers = {}
    for kind, version in ARTIFACT_READERS:
        # Registration of a future schema does not enable runtime lineage reads.
        if kind in KINDS and (version == "1.0" or (kind, version) == ("dataset", "2.0")):
            readers.setdefault(kind, []).append(version)
    writers = {kind: ["1.0"] for kind in ("dataset", "audit", "split", "benchmark", "evidence", "failure", "provenance", "report")}
    writers["dataset"].append("2.0")
    return Capabilities(
        operations=["audit", "split", "benchmark", "evidence", "failure", "report"],
        benchmark_models=list(get_args(BenchmarkInput.model_fields["model"].annotation)),
        split_strategies=["random", "formulation", "composition", "publication", "laboratory",
                          "time", "temporal", "cluster", "extrapolation"],
        artifact_read_versions=readers, artifact_write_versions=writers, dependency_pins=PINS,
        limits=CapabilityLimits(max_upload_bytes=settings.max_upload_bytes, max_rows=settings.max_rows,
                                job_timeout_seconds=settings.job_timeout_seconds),
        limitations=["C12/B11 evaluation protocols and exposure history are not implemented; agent reads are blocked.",
                     "Manual results may contain test metrics; clean-holdout exposure is not tracked yet.",
                     "Upstream baseline execution returns validation and test outputs together.",
                     "Scaffold and molecular options are not advertised without an accepted chemistry integration.",
                     "OCR and automated digitization are not integrated.",
                     "Cluster diagnostics have an outstanding exact-replay regression; do not assume bitwise replay."],
    )

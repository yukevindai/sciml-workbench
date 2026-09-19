"""Verify installed Git provenance/constraints and snapshot public interfaces.

Run after a constrained install; this is an offline developer check, not an API.
"""
import argparse
from dataclasses import MISSING, fields
import importlib
from importlib.metadata import distribution, PackageNotFoundError, version
import inspect
import json
from pathlib import Path
import tempfile
import tomllib

from packaging.requirements import Requirement
from workbench.config import PINS

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "docs" / "scientific-public-surface.json"
EXPORTS = {
    "chemdata-auditor": ("chemdata_auditor", ["AuditConfig", "SplitConfig", "audit", "split"]),
    "cheme-ml-benchmarks": ("cheme_benchmarks", ["prepare", "load_prepared", "run_baseline", "submit", "score_predictions", "leaderboard"]),
    "scientific-evidence-engine": ("scientific_evidence_engine", ["ingest_paper", "render_figure", "digitize", "export_dataset", "verify_export"]),
    "experiment-failure-memory": ("failure_memory.app", ["create_app"]),
}


def verify_install():
    declared = tomllib.loads((ROOT / "backend/pyproject.toml").read_text())["project"]["dependencies"]
    requirements = {r.name: r for r in map(Requirement, declared)}
    for name, commit in PINS.items():
        info = json.loads(distribution(name).read_text("direct_url.json") or "{}")
        vcs = info.get("vcs_info", {})
        expected_url = requirements[name].url
        if (not expected_url or not expected_url.endswith("@" + commit)
                or info.get("url") != expected_url.removeprefix("git+").rsplit("@", 1)[0]
                or vcs.get("vcs") != "git" or vcs.get("commit_id") != commit):
            raise ValueError(f"Pinned Git provenance mismatch: {name}")
    for line in (ROOT / "backend/constraints.txt").read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        req = Requirement(line)
        try:
            installed = version(req.name)
        except PackageNotFoundError:
            # Constraints restrict packages selected by dependency/platform markers;
            # they do not require every package on every platform. pip check checks closure.
            continue
        if installed not in req.specifier:
            raise ValueError(f"Constraint mismatch: {req.name} {installed}")


def surface():
    packages = {}
    for name, (module_name, exports) in EXPORTS.items():
        module = importlib.import_module(module_name)
        packages[name] = {"commit": PINS[name], "version": version(name), "entry_points": {
            f"{module_name}.{key}": str(inspect.signature(getattr(module, key))) for key in exports
        }}
    from chemdata_auditor import AuditConfig, SplitConfig
    configs = {}
    for config in (AuditConfig, SplitConfig):
        configs[config.__name__] = {
            f.name: {"required": f.default is MISSING and f.default_factory is MISSING,
                     "default": f.default if f.default is not MISSING else
                         f.default_factory() if f.default_factory is not MISSING else None}
            for f in fields(config)
        }
    from failure_memory.app import create_app
    with tempfile.TemporaryDirectory(prefix="c01-surface-") as tmp:
        schema = create_app(Path(tmp) / "memory.sqlite", "http://localhost", False).openapi()
    paths = ["/api/login", "/api/logout", "/api/labs", "/api/projects",
             "/api/search", "/api/records/{record_id}", "/api/projects/{project_id}/import"]
    routes = {path: {method: {"parameters": operation.get("parameters", []),
                             "requestBody": operation.get("requestBody")}
                    for method, operation in schema["paths"][path].items()} for path in paths}
    return {"packages": packages, "configs": configs, "failure_memory_routes": routes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Regenerate the reviewed interface snapshot")
    args = parser.parse_args()
    verify_install()
    value = json.dumps(surface(), indent=2, sort_keys=True) + "\n"
    if args.write:
        SNAPSHOT.write_text(value, encoding="utf-8")
    elif SNAPSHOT.read_text(encoding="utf-8") != value:
        raise SystemExit("Public surface drift: review pins/interfaces before using --write")
    print("Scientific Git pins, installed constraints and public interface snapshot verified.")


if __name__ == "__main__":
    main()

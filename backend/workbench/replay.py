"""Verify a report and compare real scientific replay; no external side effects."""
import argparse
import io
import json
import math
from pathlib import Path

from .adapters import encoded, frame, run_audit, run_benchmark, run_split
from .archive import ATOL, RTOL, compatible, verify_archive, zip_contents
from .contracts import BenchmarkInput
from .config import PINS
from .split_integrity import validate_dataset, validate_split


def compare(expected, actual, path="result"):
    if isinstance(expected, bool) or expected is None or isinstance(expected, str):
        equal = type(expected) is type(actual) and expected == actual
    elif isinstance(expected, int):
        equal = type(actual) is int and expected == actual
    elif isinstance(expected, float):
        equal = (type(actual) in (int, float) and math.isfinite(expected) and math.isfinite(actual)
                 and math.isclose(expected, actual, rel_tol=RTOL, abs_tol=ATOL))
    elif isinstance(expected, dict):
        equal = isinstance(actual, dict) and expected.keys() == actual.keys()
        if equal:
            for key in expected:
                compare(expected[key], actual[key], path + "/" + key)
    elif isinstance(expected, list):
        equal = isinstance(actual, list) and len(expected) == len(actual)
        if equal:
            for i, (left, right) in enumerate(zip(expected, actual)):
                compare(left, right, path + "/" + str(i))
    else:
        equal = False
    if not equal:
        raise ValueError(f"Scientific replay mismatch: {path}")


def compare_predictions(old, new):
    import pandas as pd
    left = pd.read_csv(io.BytesIO(old), dtype=str, keep_default_na=False)
    right = pd.read_csv(io.BytesIO(new), dtype=str, keep_default_na=False)
    if list(left.columns) != list(right.columns) or left.shape != right.shape:
        raise ValueError("Prediction inventory differs")
    for column in left.columns:
        if column == "prediction":
            compare(left[column].astype(float).tolist(), right[column].astype(float).tolist(), "predictions")
        elif left[column].tolist() != right[column].tolist():
            raise ValueError("Prediction row identity or partition differs")


def replay(archive, destination):
    raw, artifacts = verify_archive(archive)
    compatible(json.loads(raw["environment.json"]))
    for a in artifacts:
        packages = ({"chemdata-auditor", "cheme-ml-benchmarks"} if a.kind == "benchmark" and a.status == "succeeded"
                    else {"chemdata-auditor"} if a.kind in {"audit", "split"} else set())
        if any(not a.software.get(name, "").endswith("@" + PINS[name]) for name in packages):
            raise ValueError("Artifact scientific source pins are absent or incompatible")
    out = Path(destination)
    out.mkdir(parents=True, exist_ok=False)
    lookup = {a.id: a for a in artifacts}
    comparisons = []
    status = {"schema_version": "1.0", "status": "running", "rtol": RTOL, "atol": ATOL,
              "agent_execution": "not_replayed", "failure_memory": "not_mutated", "comparisons": comparisons}
    try:
        for a in artifacts:
            if a.kind not in {"audit", "split", "benchmark"}:
                continue
            if a.kind == "benchmark" and a.status != "succeeded":
                comparisons.append({"artifact_id": a.id, "status": "skipped_failed_benchmark"})
                continue
            data = lookup[a.dataset_id]
            csv = raw[f"blobs/{data.blob_key}"]
            validate_dataset(csv, data, frame(csv))
            if a.kind == "audit":
                result = run_audit(csv, a.config).result.model_dump(mode="json")
                compare(a.result, result)
            elif a.kind == "split":
                validate_split(a.assignments, a.result, data.rows, a.config)
                assignments, result = run_split(csv, a.config)
                if assignments != a.assignments:
                    raise ValueError("Replayed split assignments differ")
                compare(a.result, result)
            else:
                part = lookup[a.split_id]
                result, bundle = run_benchmark(csv, data, part, BenchmarkInput(**a.config), lookup[part.audit_id].config)
                compare(a.result["metrics"], result["metrics"], "metrics")
                compare(a.result["method"], result["method"], "method")
                compare(a.result["benchmark_id"], result["benchmark_id"], "benchmark_id")
                old = zip_contents(io.BytesIO(raw[f"blobs/{a.bundle_key}"]))
                new = zip_contents(io.BytesIO(bundle))
                compare_predictions(old["run/predictions.csv"], new["run/predictions.csv"])
                (out / f"{a.id}.zip").write_bytes(bundle)
            (out / f"{a.id}.json").write_bytes(encoded(result))
            comparisons.append({"artifact_id": a.id, "status": "matched", "kind": a.kind})
        status["status"] = "matched" if any(c["status"] == "matched" for c in comparisons) else "no_supported_computations"
    except Exception:
        status["status"] = "failed"
        raise
    finally:
        (out / "replay-comparison.json").write_bytes(encoded(status))
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive")
    parser.add_argument("destination", nargs="?")
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    if args.verify_only:
        verify_archive(args.archive)
        print("Report structure verified; scientific replay not run.")
    elif args.destination:
        destination = replay(args.archive, args.destination)
        status = json.loads((destination / "replay-comparison.json").read_bytes())["status"]
        print(f"Report verified; scientific replay status: {status}.")
    else:
        parser.error("destination is required for scientific replay")


if __name__ == "__main__":
    main()

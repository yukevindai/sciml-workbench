"""Verify a combined report and rerun computations without remote side effects."""

import hashlib
import json
import sys
import zipfile
from pathlib import Path
from .adapters import encoded, frame, run_audit, run_benchmark, run_split
from .contracts import BenchmarkInput
from .contract_registry import read_artifact
from .split_integrity import validate_dataset, validate_split


def replay(archive, destination):
    out = Path(destination)
    out.mkdir(parents=True, exist_ok=False)
    with zipfile.ZipFile(archive) as z:
        if sum(i.file_size for i in z.infolist()) > 512 * 1024 * 1024:
            raise ValueError("Report exceeds expanded budget")
        names = z.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate archive members")
        manifest = json.loads(z.read("manifest.json"))
        if manifest["schema_version"] != "1.0" or set(names) != {
            *manifest["files"],
            "manifest.json",
        }:
            raise ValueError("Invalid manifest")
        raw = {}
        for name, expected in manifest["files"].items():
            raw[name] = z.read(name)
            if hashlib.sha256(raw[name]).hexdigest() != expected:
                raise ValueError(f"Digest mismatch: {name}")
    artifacts = [
        read_artifact(a) for a in json.loads(raw["artifacts.json"])
    ]
    lookup = {a.id: a for a in artifacts}
    for a in artifacts:
        if a.kind in {"audit", "split", "benchmark"}:
            data = lookup[a.dataset_id]
            csv = raw[f"blobs/{data.blob_key}"]
            if a.kind == "audit":
                result = run_audit(csv, a.config).result.model_dump(mode="json")
            elif a.kind == "split":
                validate_dataset(csv, data, frame(csv))
                validate_split(a.assignments, a.result, data.rows, a.config)
                assignments, result = run_split(csv, a.config)
                if assignments != a.assignments:
                    raise ValueError("Replayed split differs")
            elif a.status == "succeeded":
                part = lookup[a.split_id]
                result, bundle = run_benchmark(
                    csv,
                    data,
                    part,
                    BenchmarkInput(**a.config),
                    lookup[part.audit_id].config,
                )
                (out / f"{a.id}.zip").write_bytes(bundle)
            else:
                continue
            (out / f"{a.id}.json").write_bytes(encoded(result))
    return out


if __name__ == "__main__":
    replay(sys.argv[1], sys.argv[2])
    print("Report hashes verified; computations replayed.")

"""Offline, bounded report verification shared by publication and replay.

Hashes establish internal integrity, not authorship or scientific validity.
Nothing in this module extracts archive paths or opens a metadata database.
"""
import hashlib
import io
import json
import platform
import re
import stat
import zipfile
from importlib.metadata import distribution, distributions
from types import SimpleNamespace

from .artifacts import references
from .config import PINS
from .contract_registry import read_artifact
from .references import evidence_text, verify_captured_references

MAX_BYTES = 512 * 1024 * 1024
MAX_FILES = 20000
RTOL, ATOL = 1e-9, 1e-12


def environment():
    return {"python": platform.python_version(), "platform": platform.platform(),
            "packages": {d.metadata["Name"]: d.version for d in distributions()},
            "upstream_commits": dict(PINS)}


def compatible(record):
    """Require real installed Git provenance, not just a version label."""
    if record.get("upstream_commits") != PINS:
        raise ValueError("Incompatible upstream source pins")
    current = environment()
    if record.get("python", "").split(".")[:2] != current["python"].split(".")[:2]:
        raise ValueError("Incompatible Python major/minor version")
    for name, commit in PINS.items():
        info = json.loads(distribution(name).read_text("direct_url.json") or "{}")
        if info.get("vcs_info", {}).get("commit_id") != commit:
            raise ValueError(f"Installed source pin mismatch: {name}")
    # Scientific numerical dependencies must match the captured environment.
    normalize = lambda name: re.sub(r"[-_.]+", "-", name).lower()
    recorded = {normalize(k): v for k, v in record.get("packages", {}).items()}
    installed = {normalize(k): v for k, v in current["packages"].items()}
    for name in (*PINS, "numpy", "pandas", "scipy", "scikit-learn"):
        if not recorded.get(name) or recorded[name] != installed.get(name):
            raise ValueError(f"Incompatible scientific package: {name}")


def safe_path(name):
    if (not isinstance(name, str) or not name or len(name) > 240
            or any(c in name for c in '\\:\x00<>"|?*') or name.startswith("/")
            or any(ord(c) < 32 for c in name)
            or any(p in {"", ".", ".."} or p.endswith((".", " ")) for p in name.split("/"))):
        raise ValueError("Unsafe archive path")
    if any(p.split(".")[0].upper() in {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(10)),
                                       *(f"LPT{i}" for i in range(10))} for p in name.split("/")):
        raise ValueError("Reserved archive path")


def zip_contents(source):
    with zipfile.ZipFile(source) as z:
        entries = z.infolist()
        if len(entries) > MAX_FILES or sum(i.file_size for i in entries) > MAX_BYTES:
            raise ValueError("Archive exceeds expanded budget")
        names = set()
        for item in entries:
            safe_path(item.orig_filename)
            safe_path(item.filename)
            if item.filename.casefold() in names:
                raise ValueError("Duplicate archive members")
            names.add(item.filename.casefold())
            if item.is_dir() or stat.S_ISLNK(item.external_attr >> 16) or item.flag_bits & 1:
                raise ValueError("Unsupported archive member type")
        return {item.filename: z.read(item) for item in entries}


class BlobReader:
    def __init__(self, files):
        self.files = files

    def get(self, key):
        if not re.fullmatch(r"[a-f0-9]{64}", key):
            raise ValueError("Invalid blob key")
        raw = self.files[f"blobs/{key}"]
        if hashlib.sha256(raw).hexdigest() != key:
            raise ValueError("Blob digest mismatch")
        return raw


def verify_snapshot(snapshot, store):
    reject_credentials(snapshot)
    values = [read_artifact(a) for a in snapshot["artifacts"]]
    lookup = {a.id: a for a in values}
    if len({a.id.casefold() for a in values}) != len(values) or len(values) > 10000:
        raise ValueError("Duplicate or excessive artifact inventory")
    pid = snapshot["project"]["id"]
    anchors = {a["id"]: SimpleNamespace(**a, project_id=pid) for a in snapshot.get("evidence_spans", [])}
    session = SimpleNamespace(get=lambda model, identifier: anchors.get(identifier))
    jobs = {j["id"]: j for j in snapshot.get("jobs", [])}
    if len(jobs) != len(snapshot.get("jobs", [])) or len(anchors) != len(snapshot.get("evidence_spans", [])):
        raise ValueError("Duplicate job or source anchor")
    for job in jobs.values():
        if job["state"] not in {"succeeded", "failed"} or (job.get("result_id") and job["result_id"] not in lookup):
            raise ValueError("Unsettled or unresolved captured job")
    edges = {}
    for a in values:
        safe_path(a.id)
        if "/" in a.id or a.id.casefold() == "replay-comparison" or a.project_id != pid or a.kind == "report" or (a.kind == "provenance" and a.activity == "report"):
            raise ValueError("Invalid artifact identity or nested report")
        edges[a.id] = references(a, session)
        for target, kind in edges[a.id]:
            if target not in lookup or (kind and lookup[target].kind != kind):
                raise ValueError("Unresolved or mistyped artifact dependency")
        for field in ("blob_key", "pdf_key", "bundle_key"):
            if key := getattr(a, field, None):
                store.get(key)
        if a.kind == "evidence":
            zip_contents(io.BytesIO(store.get(a.bundle_key)))
            evidence_text(store, a)
        if a.kind == "benchmark" and a.status == "succeeded":
            if not a.bundle_key:
                raise ValueError("Successful benchmark is missing its output bundle")
            verify_benchmark_bundle(a, lookup, store)
        if a.kind == "split" and lookup[a.audit_id].dataset_id != a.dataset_id:
            raise ValueError("Split/audit dataset mismatch")
        if a.kind in {"benchmark", "evaluation_protocol"} and lookup[a.split_id].dataset_id != a.dataset_id:
            raise ValueError("Split/dataset mismatch")
        if a.kind == "failure" and a.schema_version == "2.0":
            verify_outcome(a, lookup, jobs)
    complete = set()
    for root in lookup:
        active, stack = set(), [(root, False)]
        while stack:
            aid, leaving = stack.pop()
            if leaving:
                active.remove(aid)
                complete.add(aid)
            elif aid in active:
                raise ValueError("Cyclic artifact graph")
            elif aid not in complete:
                if len(active) >= 256:
                    raise ValueError("Artifact graph exceeds depth budget")
                active.add(aid)
                stack.append((aid, True))
                stack.extend((target, False) for target, _ in edges[aid])
    for m in snapshot.get("materials", []):
        if m["project_id"] != pid or m["sha256"] != m["blob_key"]:
            raise ValueError("Invalid material identity")
        store.get(m["blob_key"])
        if m.get("dataset_id") and (m["dataset_id"] not in lookup or
                                    lookup[m["dataset_id"]].blob_key != m["blob_key"]):
            raise ValueError("Invalid material dataset binding")
    verify_captured_references(snapshot, store)
    return values


def verify_outcome(value, lookup, jobs):
    from .references import verify_metric
    from .outcomes import runtime_benchmark_id
    run = lookup[value.benchmark_id]
    job = jobs.get(value.source_job_id)
    if not job or job["kind"] != "benchmark":
        raise ValueError("Unresolved outcome source job")
    if job["result_id"] != run.id and not (job["result_id"] is None and job["state"] == "failed"
                                           and run.id == runtime_benchmark_id(job["id"])):
        raise ValueError("Outcome/job identity mismatch")
    observation = value.observation
    if observation.kind == "criterion_missed":
        protocol = lookup[observation.protocol_id]
        criterion = protocol.success_criterion
        verify_metric(run, observation.metric)
        if (not criterion or protocol.revision != observation.protocol_revision or job["state"] != "succeeded"
                or protocol.dataset_id != run.dataset_id or protocol.split_id != run.split_id
                or criterion.id != observation.criterion_id or criterion.threshold != observation.threshold
                or criterion.comparison != observation.success_comparison or criterion.partition != observation.metric.partition
                or observation.metric.field_path != "/result/metrics/" + criterion.partition + "/" + criterion.metric.replace("~", "~0").replace("/", "~1")):
            raise ValueError("Outcome criterion differs from captured protocol")
        if job.get("created_at"):
            from datetime import datetime, timezone
            created = datetime.fromisoformat(job["created_at"])
            if protocol.sealed_at is None or protocol.sealed_at >= created.replace(tzinfo=created.tzinfo or timezone.utc):
                raise ValueError("Outcome protocol was not predeclared")
    elif observation.kind == "execution_failure":
        if job["state"] != "failed" or run.status != "failed" or run.result or run.bundle_key or run.error != observation.observed_error:
            raise ValueError("Outcome execution failure disagrees with recorded benchmark")


def reject_credentials(value):
    """Refuse recognizable credentials; do not silently rewrite scientific records."""
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower() in {"password", "api_key", "api_token", "access_token", "authorization",
                                   "refresh_token", "client_secret", "database_url"} and child:
                raise ValueError("Report contains a credential field; remove it from the source record")
            reject_credentials(child)
    elif isinstance(value, list):
        for child in value:
            reject_credentials(child)
    elif isinstance(value, str) and (re.search(r"(?i)\bBearer\s+[A-Za-z0-9._~-]{16,}", value)
                                   or re.search(r"\w+://[^\s/:]+:[^\s/@]+@", value)
                                   or "-----BEGIN PRIVATE KEY-----" in value):
        raise ValueError("Report contains recognizable credentials")


def reject_configured_secrets(raw, settings):
    """Worker-side check: credentials are never sent into the compute process."""
    from sqlalchemy.engine import make_url
    secrets = [getattr(settings, name).get_secret_value() for name in ("api_token", "efm_password")]
    if password := make_url(settings.database_url).password:
        secrets.append(password)
    needles = [secret.encode() for secret in secrets if secret]
    files = zip_contents(io.BytesIO(raw))
    for body in files.values():
        members = zip_contents(io.BytesIO(body)).values() if body.startswith(b"PK\x03\x04") else (body,)
        for member in members:
            if any(secret in member for secret in needles):
                raise ValueError("Report contains a configured credential")


def verify_benchmark_bundle(value, lookup, store):
    files = zip_contents(io.BytesIO(store.get(value.bundle_key)))
    required = {"data.csv", "partitions.json", "benchmark.json", "prepared/spec.json",
                "prepared/dataset.csv", "prepared/partitions.json", "prepared/audit.json",
                "prepared/scisplit.json", "prepared/manifest.json", "run/run.json",
                "run/predictions.csv", "run/manifest.json"}
    if not required <= files.keys() or files.keys() - required - {"original-units-audit.json"}:
        raise ValueError("Invalid benchmark bundle inventory")
    for directory in ("prepared", "run"):
        manifest = json.loads(files[directory + "/manifest.json"])
        expected = {name.removeprefix(directory + "/") for name in files
                    if name.startswith(directory + "/") and name != directory + "/manifest.json"}
        if set(manifest["files"]) != expected:
            raise ValueError("Invalid benchmark manifest inventory")
        for name, digest in manifest["files"].items():
            if hashlib.sha256(files[directory + "/" + name]).hexdigest() != digest:
                raise ValueError("Benchmark bundle digest mismatch")
    data, part = lookup[value.dataset_id], lookup[value.split_id]
    from .adapters import frame
    from .split_integrity import validate_exchange
    exchange = validate_exchange(files["data.csv"], data, part, frame(files["data.csv"]), value.config["row_id"])
    if (files["data.csv"] != store.get(data.blob_key) or files["prepared/dataset.csv"] != files["data.csv"]
            or files["partitions.json"] != files["prepared/partitions.json"]
            or json.loads(files["partitions.json"])["assignments"] != exchange
            or json.loads(files["run/run.json"]) != value.result
            or hashlib.sha256(files["run/predictions.csv"]).hexdigest() != value.result["prediction_sha256"]):
        raise ValueError("Benchmark bundle disagrees with captured science")


def verify_archive(source):
    files = zip_contents(source)
    manifest = json.loads(files.pop("manifest.json"))
    if manifest.get("schema_version") not in {"1.0", "2.0"} or set(manifest.get("files", {})) != set(files):
        raise ValueError("Invalid manifest inventory or version")
    for name, raw in files.items():
        if hashlib.sha256(raw).hexdigest() != manifest["files"][name]:
            raise ValueError(f"Digest mismatch: {name}")
    snapshot = json.loads(files["snapshot.json"])
    for key, filename in (("artifacts", "artifacts.json"), ("project", "project.json"),
                          ("materials", "materials.json"), ("jobs", "jobs.json"),
                          ("evaluation_states", "evaluation-states.json"),
                          ("test_exposures", "test-exposures.json"), ("evidence_spans", "evidence-spans.json")):
        if key in snapshot and json.loads(files[filename]) != snapshot[key]:
            raise ValueError("Archive projection disagrees with frozen snapshot")
    values = verify_snapshot(snapshot, BlobReader(files))
    from .contract_registry import LEGACY_MODELS
    allowed = {"snapshot.json", "artifacts.json", "project.json", "jobs.json", "materials.json", "software.json",
               "environment.json", "README.md", "report.md", "evaluation-states.json", "test-exposures.json",
               "evidence-spans.json", "contracts/v2/dataset.json", "contracts/v2/failure.json",
               "contracts/evaluation_protocol.json", "contracts/claim_set.json"}
    allowed.update(f"contracts/{m.model_fields['kind'].default}.json" for m in LEGACY_MODELS)
    allowed.update(f"blobs/{key}" for a in values for field in ("blob_key", "pdf_key", "bundle_key")
                   if (key := getattr(a, field, None)))
    allowed.update(f"blobs/{m['blob_key']}" for m in snapshot.get("materials", []))
    if set(files) - allowed or not {"README.md", "report.md", "environment.json", "software.json"} <= files.keys():
        raise ValueError("Unexpected or missing report files")
    for a in values:
        path = f"contracts/{'v2/' if a.schema_version == '2.0' else ''}{a.kind}.json"
        if json.loads(files[path]) != type(a).model_json_schema():
            raise ValueError("Incompatible archived contract schema")
    if manifest["schema_version"] == "2.0":
        if json.loads(files["environment.json"]) != snapshot["environment"]:
            raise ValueError("Environment differs from frozen capture")
        if "software" in snapshot and json.loads(files["software.json"]) != snapshot["software"]:
            raise ValueError("Software differs from frozen capture")
        if manifest.get("verification") != "structural" or manifest.get("scientific_replay") != "not_run":
            raise ValueError("Invalid verification claim")
    return files, values

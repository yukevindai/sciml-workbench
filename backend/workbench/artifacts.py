"""Typed, project-scoped resolution of the currently published artifact graph.

Opaque upstream result/config dictionaries are not interpreted as arbitrary ID
containers. Only explicit workbench reference fields grant graph relationships.
"""
from dataclasses import dataclass
import re

from .contract_registry import read_artifact
from .db import ArtifactRow, MaterialRow
from .errors import DomainError

KINDS = {"dataset", "audit", "split", "benchmark", "evidence", "failure", "provenance", "report"}
DIGEST = re.compile(r"^[a-f0-9]{64}$")


def integrity(message="Artifact metadata or lineage is inconsistent"):
    return DomainError(message, 500, "INTEGRITY_FAILED")


def references(value):
    """Return explicit dependency edges, even if legacy parents omitted them."""
    edges = [(aid, None) for aid in value.parents]
    if len(set(value.parents)) != len(value.parents):
        raise integrity("Artifact contains duplicate parents")
    if value.kind not in KINDS or (value.schema_version != "1.0" and value.kind != "dataset"):
        raise integrity("Artifact version has no supported runtime lineage resolver")
    if value.kind in {"audit", "split", "benchmark"}:
        edges.append((value.dataset_id, "dataset"))
    if value.kind == "split":
        edges.append((value.audit_id, "audit"))
    elif value.kind == "benchmark":
        edges.append((value.split_id, "split"))
        for field in ("dataset_id", "split_id"):
            if field in value.config and value.config[field] != getattr(value, field):
                raise integrity("Benchmark configuration disagrees with its lineage")
    elif value.kind == "failure":
        edges.append((value.benchmark_id, "benchmark"))
    elif value.kind == "provenance":
        edges.extend((aid, None) for aid in value.inputs + value.outputs)
    elif value.kind == "report":
        edges.extend((aid, None) for aid in value.artifact_ids)
    elif value.kind == "dataset" and value.schema_version == "2.0":
        for name in type(value.source).model_fields:
            for ref in getattr(value.source, name).supporting_references:
                if ref.kind == "artifact":
                    edges.append((ref.id, None))
                elif ref.kind == "source_span":
                    raise integrity("Source-span resolution is not implemented")
    for field in ("blob_key", "bundle_key", "pdf_key"):
        key = getattr(value, field, None)
        if key is not None and not DIGEST.fullmatch(key):
            raise integrity("Artifact contains an invalid blob reference")
    if value.kind in {"dataset", "report", "evidence"}:
        key = value.pdf_key if value.kind == "evidence" else value.blob_key
        if key != value.sha256:
            raise integrity("Artifact digest disagrees with its original bytes")
    return list(dict.fromkeys(edges))


class ArtifactResolver:
    def __init__(self, session, project_id, allowed_ids=None, *, max_nodes=10000, max_depth=256):
        self.session, self.project_id = session, project_id
        self.allowed_ids = frozenset(allowed_ids) if allowed_ids is not None else None
        self.max_nodes, self.max_depth = max_nodes, max_depth
        self.values, self.complete = {}, set()

    def _load(self, aid, kind=None, *, parent=False):
        if not isinstance(aid, str) or not aid:
            raise integrity() if parent else DomainError("Invalid artifact reference")
        if self.allowed_ids is not None and aid not in self.allowed_ids:
            raise DomainError("Artifact is outside the authorized input scope", 403)
        if aid not in self.values:
            if len(self.values) >= self.max_nodes:
                raise DomainError("Artifact graph exceeds supported resolution limits", 422, "UNSUPPORTED_CAPABILITY")
            row = self.session.get(ArtifactRow, aid)
            if row is None or row.project_id != self.project_id:
                if parent:
                    raise integrity("Artifact dependency is missing from its project")
                raise DomainError("Artifact not found in this project", 404)
            try:
                value = read_artifact(row.payload)
            except (ValueError, TypeError, RecursionError):
                raise integrity("Stored artifact does not match a supported contract") from None
            if (value.id, value.project_id, value.kind) != (row.id, row.project_id, row.kind):
                raise integrity("Artifact payload disagrees with its stored identity")
            self.values[aid] = value
        value = self.values[aid]
        if kind is not None and value.kind != kind:
            if parent:
                raise integrity("Artifact dependency has the wrong kind")
            raise DomainError(f"Expected a {kind} artifact", 422, "LINEAGE_MISMATCH")
        return value

    def resolve(self, aid, kind=None):
        value = self._load(aid, kind)
        self._walk(aid)
        return value

    def validate(self, value):
        """Check an unpublished candidate against persisted/pending dependencies."""
        try:
            value = read_artifact(value.model_dump(mode="json"))
        except (ValueError, TypeError, RecursionError):
            raise integrity("Artifact candidate does not match its contract") from None
        if value.project_id != self.project_id:
            raise integrity("Artifact candidate belongs to another project")
        self.values[value.id] = value
        self._load(value.id)
        self._walk(value.id)
        return value

    def _walk(self, aid):
        # Iterative DFS: cycles and deep graphs cannot exhaust Python's stack.
        visiting, stack = set(), [(aid, False, 0)]
        while stack:
            current, leaving, depth = stack.pop()
            if leaving:
                value = self.values[current]
                if value.kind == "split" and self.values[value.audit_id].dataset_id != value.dataset_id:
                    raise integrity("Split and audit reference different datasets")
                if value.kind == "benchmark" and self.values[value.split_id].dataset_id != value.dataset_id:
                    raise integrity("Benchmark and split reference different datasets")
                visiting.remove(current)
                self.complete.add(current)
                continue
            if current in visiting:
                raise integrity("Artifact dependency graph contains a cycle")
            if current in self.complete:
                continue
            if len(self.values) > self.max_nodes or depth > self.max_depth:
                raise DomainError("Artifact graph exceeds supported resolution limits", 422, "UNSUPPORTED_CAPABILITY")
            visiting.add(current)
            stack.append((current, True, depth))
            for target, kind in reversed(references(self.values[current])):
                self._load(target, kind, parent=True)
                if target in visiting:
                    raise integrity("Artifact dependency graph contains a cycle")
                if target not in self.complete:
                    stack.append((target, False, depth + 1))

    def closure(self, roots):
        for aid in roots:
            self.resolve(aid)
        return list(self.values.values())


def resolve_material(session, pid, mid, *, allowed_ids=None, artifact_ids=None):
    if allowed_ids is not None and mid not in allowed_ids:
        raise DomainError("Attachment is outside the authorized input scope", 403)
    value = session.get(MaterialRow, mid)
    if value is None or value.project_id != pid:
        raise DomainError("Attachment not found in this project", 404)
    if not DIGEST.fullmatch(value.blob_key) or value.sha256 != value.blob_key:
        raise integrity("Attachment digest is inconsistent")
    if value.media_type == "text/csv":
        try:
            data = ArtifactResolver(session, pid, artifact_ids).resolve(value.dataset_id, "dataset")
        except DomainError as exc:
            if exc.status in {404, 422}:
                raise integrity("Attachment dataset binding is inconsistent") from None
            raise
        if data.blob_key != value.blob_key:
            raise integrity("Attachment bytes disagree with its dataset")
    elif value.media_type != "application/pdf" or value.dataset_id is not None:
        raise integrity("Attachment has an invalid media binding")
    return value


def operation_inputs(session, pid, kind, payload, *, allowed_ids=None, material_ids=None):
    """Resolve operation references and the full dependency graph once."""
    resolver = ArtifactResolver(session, pid, allowed_ids)
    if kind in {"audit", "split", "benchmark"}:
        data = resolver.resolve(payload["dataset_id"], "dataset")
        if kind == "split":
            audited = resolver.resolve(payload["audit_id"], "audit")
            if audited.dataset_id != data.id:
                raise DomainError("Audit belongs to another dataset", 422, "LINEAGE_MISMATCH")
        elif kind == "benchmark":
            part = resolver.resolve(payload["split_id"], "split")
            if part.dataset_id != data.id:
                raise DomainError("Split belongs to another dataset", 422, "LINEAGE_MISMATCH")
    elif kind == "failure":
        resolver.resolve(payload["benchmark_id"], "benchmark")
    elif kind == "evidence" and payload.get("material_id"):
        source = resolve_material(session, pid, payload["material_id"], allowed_ids=material_ids, artifact_ids=allowed_ids)
        if source.media_type != "application/pdf" or source.blob_key != payload["pdf_key"]:
            raise DomainError("Evidence input does not match its attachment", 422, "LINEAGE_MISMATCH")
    elif kind == "evidence" and material_ids is not None:
        raise DomainError("Scoped evidence ingestion requires an attachment", 403)
    return resolver.values


def validate_result(value, work):
    """A valid graph cannot substitute other valid inputs for the accepted job."""
    p = work.payload
    expected = {}
    parents = []
    if work.kind in {"audit", "split", "benchmark"}:
        expected["dataset_id"] = p["dataset_id"]
        parents.append(p["dataset_id"])
        expected["config"] = p if work.kind == "benchmark" else p["config"]
    if work.kind == "split":
        expected["audit_id"] = p["audit_id"]
        parents.append(p["audit_id"])
    elif work.kind == "benchmark":
        expected.update(split_id=p["split_id"], model=p["model"], seed=p["seed"])
        parents.append(p["split_id"])
    elif work.kind == "failure":
        expected.update(benchmark_id=p["benchmark_id"], reason=p["reason"])
        parents.append(p["benchmark_id"])
    elif work.kind == "evidence":
        expected.update(pdf_key=p["pdf_key"], sha256=p["pdf_key"], title=p["title"])
    elif work.kind == "report":
        parents = [a["id"] for a in work.report["artifacts"]]
        expected["artifact_ids"] = parents
    if ((value.id, value.project_id, value.kind) != (work.result_id, work.project_id, work.kind)
            or set(value.parents) != set(parents) or len(value.parents) != len(parents)
            or any(getattr(value, field) != accepted for field, accepted in expected.items())):
        raise integrity("Task result lineage does not match its accepted operation")
    if work.kind == "split":
        from .split_integrity import validate_split
        data = read_artifact(work.artifacts[p["dataset_id"]])
        validate_split(value.assignments, value.result, data.rows, value.config)


@dataclass(frozen=True)
class Download:
    key: str
    media_type: str
    filename: str


def download_name(kind, identifier, extension):
    # Legacy contracts permit non-UUID IDs. Never copy controls/Unicode/quotes
    # from stored identifiers into an HTTP header, even for a damaged database.
    token = re.sub(r"[^A-Za-z0-9_-]", "_", identifier)[:160] or "artifact"
    return f"{kind}-{token}.{extension}"


def artifact_download(session, pid, aid, representation="default", *, allowed_ids=None):
    value = ArtifactResolver(session, pid, allowed_ids).resolve(aid)
    if representation == "default":
        representation = "original" if value.kind in {"dataset", "report"} else "bundle"
    if representation == "original" and value.kind in {"dataset", "evidence", "report"}:
        key = value.pdf_key if value.kind == "evidence" else value.blob_key
        ext, media = {"dataset": ("csv", "text/csv"), "evidence": ("pdf", "application/pdf"),
                      "report": ("zip", "application/zip")}[value.kind]
    elif representation == "bundle" and value.kind in {"benchmark", "evidence", "report"}:
        key = value.blob_key if value.kind == "report" else value.bundle_key
        ext, media = "zip", "application/zip"
    else:
        key = None
    if not key:
        raise DomainError("Artifact has no downloadable file for this representation", 404)
    return Download(key, media, download_name(value.kind, value.id, ext))


def material_download(session, pid, mid, *, allowed_ids=None):
    value = resolve_material(session, pid, mid, allowed_ids=allowed_ids)
    ext = "csv" if value.media_type == "text/csv" else "pdf"
    return Download(value.blob_key, value.media_type, download_name("attachment", value.id, ext))

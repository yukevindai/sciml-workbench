"""C11 deterministic grounding against retained bytes, never semantic inference."""
import hashlib
import io
import json
import math
import zipfile

from pydantic import TypeAdapter

from .artifacts import ArtifactResolver
from .contracts import now
from .errors import DomainError
from .request_identity import request_digest
from .scientific_contracts import (AvailableEvidenceReference, UnavailableEvidenceReference,
    MetricReference, Claim, ClaimSet, ReferenceCheck)
from .storage import StorageError


def invalid(message):
    raise DomainError(message, 422, "REFERENCE_INVALID")


def evidence_text(store, evidence, page=None):
    """Bounded, exact UTF-8 representation; no extraction or normalization."""
    try:
        record = evidence.result
        pages = record["pages"]
        prefix = f"papers/paper_{evidence.sha256}/"
        raw = store.get(evidence.pdf_key)
        if (record["sha256"] != evidence.sha256 or record["paper_id"] != "paper_" + evidence.sha256
                or record["page_count"] != len(pages) or not pages):
            invalid("Evidence source or page inventory is inconsistent")
        with zipfile.ZipFile(io.BytesIO(store.get(evidence.bundle_key))) as archive:
            expected = {prefix + "original.pdf", prefix + "paper.json",
                        *(prefix + f"pages/{n:04}.txt" for n in range(1, len(pages) + 1))}
            names = archive.namelist()
            if (len(names) != len(set(names)) or set(names) != expected
                    or sum(info.file_size for info in archive.infolist()) > 128 * 1024 * 1024):
                invalid("Evidence bundle inventory is invalid or exceeds the read budget")
            if archive.read(prefix + "original.pdf") != raw or json.loads(archive.read(prefix + "paper.json")) != record:
                invalid("Evidence bundle does not match retained source metadata")
            texts = []
            for number, item in enumerate(pages, 1):
                path = f"pages/{number:04}.txt"
                if item["page"] != number or item["text_path"] != path or item["extraction"] != "pdfium_text_layer":
                    invalid("Evidence page anchor is inconsistent")
                data = archive.read(prefix + path)
                text = data.decode("utf-8")
                if hashlib.sha256(data).hexdigest() != item["text_sha256"] or bool(text.strip()) != item["has_text"]:
                    invalid("Evidence text digest or availability is inconsistent")
                texts.append(text)
        if page is not None and (type(page) is not int or not 1 <= page <= len(texts)):
            invalid("Evidence page anchor does not exist")
        text = "".join(texts) if page is None else texts[page - 1]
        version = "pdfium_text_layer:" + request_digest("extraction", record["software"])
        if page is None:
            version += ":concatenated-pages-v1"
        return text, hashlib.sha256(text.encode("utf-8")).hexdigest(), version
    except StorageError:
        raise
    except (KeyError, TypeError, ValueError, UnicodeError, zipfile.BadZipFile, RuntimeError):
        invalid("Evidence representation is missing or corrupt")


def resolver_for(session, scope):
    from .projections import authorize
    authorize(session, scope)
    return ArtifactResolver(session, scope.project_id, scope.artifact_ids)


def make_reference(session, store, scope, artifact_id, start, end, *, page=None):
    evidence = resolver_for(session, scope).resolve(artifact_id, "evidence")
    text, digest, version = evidence_text(store, evidence, page)
    if not text.strip():
        return UnavailableEvidenceReference(availability="unavailable", source_artifact_id=evidence.id,
            source_sha256=evidence.sha256, reason="No extracted text is available; OCR is not integrated")
    if type(start) is not int or type(end) is not int or not 0 <= start < end <= len(text) or end - start > 4000:
        invalid("Evidence span is outside its representation or excerpt budget")
    return AvailableEvidenceReference(availability="available", source_artifact_id=evidence.id,
        source_sha256=evidence.sha256, representation_sha256=digest, extraction_version=version,
        locator={"start": start, "end": end}, excerpt_sha256=hashlib.sha256(text[start:end].encode()).hexdigest(), page=page)


def read_span(session, store, scope, reference):
    ref = AvailableEvidenceReference.model_validate(reference)
    evidence = resolver_for(session, scope).resolve(ref.source_artifact_id, "evidence")
    return verify_span(store, evidence, ref)


def verify_span(store, evidence, reference):
    ref = AvailableEvidenceReference.model_validate(reference)
    if evidence.id != ref.source_artifact_id or evidence.kind != "evidence":
        invalid("Evidence span references the wrong source artifact")
    text, digest, version = evidence_text(store, evidence, ref.page)
    start, end = ref.locator.start, ref.locator.end
    if (ref.source_sha256 != evidence.sha256 or ref.representation_sha256 != digest
            or ref.extraction_version != version or not 0 <= start < end <= len(text) or end - start > 4000
            or hashlib.sha256(text[start:end].encode()).hexdigest() != ref.excerpt_sha256):
        invalid("Evidence span does not match its retained source and exact text")
    return {"reference": ref.model_dump(mode="json"), "text": text[start:end]}


def register_reference(session, store, scope, reference):
    """Persist an immutable named anchor for DeclarationReference.source_span."""
    from .barriers import lock_project
    from .db import EvidenceSpanRow
    checked = read_span(session, store, scope, reference)
    lock_project(session, scope.project_id)
    row = EvidenceSpanRow(project_id=scope.project_id,
        source_artifact_id=checked["reference"]["source_artifact_id"], reference=checked["reference"])
    session.add(row)
    session.flush()
    return row


def read_registered_span(session, store, scope, span_id):
    from .db import EvidenceSpanRow
    resolver_for(session, scope)
    row = session.get(EvidenceSpanRow, span_id)
    if row is None or row.project_id != scope.project_id:
        raise DomainError("Evidence anchor not found in this project", 404)
    return read_span(session, store, scope, row.reference)


def check_metric(session, scope, reference):
    ref = MetricReference.model_validate(reference)
    value = resolver_for(session, scope).resolve(ref.artifact_id, "benchmark")
    from .evaluation import authorize_metric
    authorize_metric(session, scope, value, ref.partition)
    return verify_metric(value, ref, agent=scope.audience == "agent")


def verify_metric(value, reference, *, agent=False):
    ref = MetricReference.model_validate(reference)
    if value.kind != "benchmark" or value.id != ref.artifact_id:
        invalid("Metric references the wrong benchmark")
    parts = [p.replace("~1", "/").replace("~0", "~") for p in ref.field_path.split("/")[1:]]
    if len(parts) != 4 or parts[:3] != ["result", "metrics", ref.partition] or ref.units is not None:
        invalid("Metric pointer or units do not match a supported benchmark metric")
    from .evaluation import SCALAR_METRICS
    if agent and parts[3] not in SCALAR_METRICS:
        invalid("Agent metric references require an allowed scalar projection")
    current = value.model_dump(mode="json")
    for part in parts:
        if not isinstance(current, dict) or part not in current:
            invalid("Metric anchor is missing")
        current = current[part]
    if value.status != "succeeded" or type(current) not in (int, float) or not math.isfinite(current) or current != ref.value:
        invalid("Metric value does not match the stored result")
    return ref


def verify_captured_references(snapshot, store):
    """Reverify exact retained sources in an authorized frozen report capture."""
    from .contract_registry import read_artifact
    values = {value["id"]: read_artifact(value) for value in snapshot["artifacts"]}
    try:
        for anchor in snapshot.get("evidence_spans", []):
            verify_span(store, values[anchor["source_artifact_id"]], anchor["reference"])
        for value in values.values():
            if value.kind != "claim_set":
                continue
            for claim in value.claims:
                for ref in claim.source_references:
                    verify_span(store, values[ref.source_artifact_id], ref)
                for ref in claim.metric_references:
                    verify_metric(values[ref.artifact_id], ref)
    except KeyError:
        invalid("Report capture is missing a referenced source")


def validate_claims(session, store, scope, claims):
    """Return checked copies. Valid anchors never establish semantic support."""
    checked = [c.model_copy(deep=True) for c in TypeAdapter(list[Claim]).validate_python(claims)]
    if not 1 <= len(checked) <= 100:
        invalid("Claim set exceeds the supported validation budget")
    if sum(len(c.source_references) + len(c.metric_references) for c in checked) > 1000:
        invalid("Claim references exceed the supported validation budget")
    resolver = resolver_for(session, scope)
    for claim in checked:
        if claim.semantic_review.status != "not_reviewed":
            invalid("Reference checking cannot assert semantic review")
        for ref in claim.source_references:
            read_span(session, store, scope, ref)
        for ref in claim.metric_references:
            check_metric(session, scope, ref)
            benchmark = resolver.resolve(ref.artifact_id, "benchmark")
            if claim.split_id is not None and benchmark.split_id != claim.split_id:
                invalid("Claim split differs from its referenced benchmark")
        if claim.split_id is not None:
            resolver.resolve(claim.split_id, "split")
        claim.reference_check = ReferenceCheck(status="valid", checked_at=now(), issues=[])
    # Reparse to avoid leaving mutable, unvalidated nested dictionaries.
    return TypeAdapter(list[Claim]).validate_python([c.model_dump(mode="json", warnings=False) for c in checked])


def save_claim_set(session, store, scope, *, run_id, revision, claims):
    from .barriers import lock_project
    from .services import save
    if scope.audience == "agent" and scope.run_id != run_id:
        raise DomainError("Claim run differs from trusted scope", 403)
    lock_project(session, scope.project_id)
    checked = validate_claims(session, store, scope, claims)
    parents = sorted({ref.source_artifact_id for c in checked for ref in c.source_references}
                     | {ref.artifact_id for c in checked for ref in c.metric_references}
                     | {c.split_id for c in checked if c.split_id})
    return save(session, ClaimSet(project_id=scope.project_id, parents=parents, run_id=run_id,
                                 revision=revision, claims=checked))

"""C11 exact-source references and deterministic claim validation."""
import hashlib
import io
from copy import deepcopy

import pytest
from reportlab.pdfgen.canvas import Canvas

from workbench import adapters
from workbench.contracts import Evidence
from workbench.errors import DomainError
from workbench.projections import ReadScope
from workbench.references import evidence_text, make_reference, read_span, check_metric, save_claim_set
from workbench.services import save
from workbench.storage import LocalStore
from test_worker import runtime
from test_outcomes import outcome
from test_evidence_adapter import pdf_fixture


@pytest.fixture
def source(runtime):
    db, settings, _ = runtime
    store = LocalStore(settings.storage_root)
    output = io.BytesIO()
    canvas = Canvas(output)
    canvas.drawString(40, 700, "Caf\u00e9 measurement: a source statement, not semantic proof.")
    canvas.showPage()
    canvas.drawString(40, 700, "Second page measurement.")
    canvas.save()
    raw = output.getvalue()
    record, bundle = adapters.ingest_pdf(raw, "Reference fixture")
    key = store.put(raw)
    with db.session.begin() as session:
        evidence = save(session, Evidence(project_id="p", title="Reference fixture", pdf_key=key, sha256=key,
                                         result=record, bundle_key=store.put(bundle)))
    return db, store, evidence


def claim(reference):
    return {"id": "claim", "statement": "The source states a measurement", "classification": "source_supported",
        "source_references": [reference], "metric_references": [], "population": "Synthetic fixture",
        "split_id": None, "limitations": ["Reference validity does not establish support"], "uncertainty": "Unreviewed",
        "reference_check": {"status": "not_checked", "checked_at": None, "issues": []},
        "semantic_review": {"status": "not_reviewed", "reviewed_snapshot_sha256": None,
                            "reviewer_assignment_id": None, "explanation": None}}


def test_exact_unicode_span_and_null_page_remain_distinct(source):
    db, store, evidence = source
    scope = ReadScope("p")
    with db.session.begin() as session:
        text, digest, _ = evidence_text(store, evidence, 1)
        assert "Caf\u00e9" in text
        ref = make_reference(session, store, scope, evidence.id, 0, 4, page=1)
        assert ref.page == 1 and ref.representation_sha256 == digest
        assert ref.excerpt_sha256 == hashlib.sha256("Caf\u00e9".encode()).hexdigest()
        assert read_span(session, store, scope, ref)["text"] == "Caf\u00e9"
        whole = make_reference(session, store, scope, evidence.id, 0, 4)
        assert whole.page is None
        assert read_span(session, store, scope, whole)["reference"]["page"] is None
        assert whole.representation_sha256 != ref.representation_sha256


@pytest.mark.parametrize("fault", ["source_sha256", "representation_sha256", "excerpt_sha256", "extraction_version", "page", "offset"])
def test_false_or_missing_anchors_fail(source, fault):
    db, store, evidence = source
    with db.session.begin() as session:
        ref = make_reference(session, store, ReadScope("p"), evidence.id, 0, 4, page=1).model_dump(mode="json")
        if fault == "page":
            ref["page"] = 999
        elif fault == "offset":
            ref["locator"]["end"] = 999999
        else:
            ref[fault] = "0" * 64 if fault.endswith("sha256") else "invented"
        with pytest.raises(DomainError) as caught:
            read_span(session, store, ReadScope("p"), ref)
        assert caught.value.error_code == "REFERENCE_INVALID"


def test_claim_reference_check_does_not_assert_semantic_support(source):
    db, store, evidence = source
    with db.session.begin() as session:
        ref = make_reference(session, store, ReadScope("p"), evidence.id, 0, 4, page=1)
        payload = claim(ref.model_dump(mode="json"))
        original = deepcopy(payload)
        saved = save_claim_set(session, store, ReadScope("p"), run_id="run", revision=1, claims=[payload])
        assert saved.claims[0].reference_check.status == "valid"
        assert saved.claims[0].semantic_review.status == "not_reviewed"
        assert payload == original
        payload["semantic_review"] = {"status": "supported", "reviewed_snapshot_sha256": "a" * 64,
                                      "reviewer_assignment_id": "reviewer", "explanation": "Model says so"}
        with pytest.raises(DomainError, match="semantic review"):
            save_claim_set(session, store, ReadScope("p"), run_id="run", revision=2, claims=[payload])


def test_scope_and_corrupt_retained_text_fail_closed(source):
    db, store, evidence = source
    with db.session.begin() as session:
        with pytest.raises(DomainError):
            make_reference(session, store, ReadScope("p", "agent", "run", frozenset(), frozenset()), evidence.id, 0, 4)
        ref = make_reference(session, store, ReadScope("p"), evidence.id, 0, 4)
        store.path(evidence.bundle_key).write_bytes(b"corrupt")
        from workbench.storage import StorageIntegrityError
        with pytest.raises(StorageIntegrityError):
            read_span(session, store, ReadScope("p"), ref)


def test_scanned_text_is_unavailable_without_a_fabricated_locator(runtime):
    db, settings, _ = runtime
    store = LocalStore(settings.storage_root)
    raw = pdf_fixture("scanned")
    record, bundle = adapters.ingest_pdf(raw, "Scanned")
    key = store.put(raw)
    with db.session.begin() as session:
        evidence = save(session, Evidence(project_id="p", title="Scanned", pdf_key=key, sha256=key,
                                         result=record, bundle_key=store.put(bundle)))
        ref = make_reference(session, store, ReadScope("p"), evidence.id, 0, 1)
        assert ref.availability == "unavailable" and "locator" not in ref.model_dump()


def test_metric_value_partition_pointer_and_missing_value(outcome):
    service, _, payload, _ = outcome
    ref = payload["observation"]["metric"]
    with service.db.session.begin() as session:
        assert check_metric(session, ReadScope("p"), ref).value == 2.5
        for change in ({"value": 0.0}, {"partition": "test"}, {"field_path": "/result/metrics/validation/missing"}, {"units": "kg"}):
            with pytest.raises(DomainError):
                check_metric(session, ReadScope("p"), {**ref, **change})


def test_named_anchor_resolves_declarations_and_is_retained_in_reports(source):
    from sqlalchemy import select, update
    from sqlalchemy.exc import IntegrityError
    from workbench.db import ArtifactRow, EvidenceSpanRow
    from workbench.artifacts import ArtifactResolver
    from workbench.contract_registry import read_artifact
    from workbench.scientific_contracts import DatasetV2, SourceDeclarations
    from workbench.references import register_reference, read_registered_span
    from workbench.reports import capture
    from workbench.services import report_bundle
    import json
    import zipfile
    db, store, evidence = source
    with db.session.begin() as session:
        ref = make_reference(session, store, ReadScope("p"), evidence.id, 0, 4, page=1)
        anchor = register_reference(session, store, ReadScope("p"), ref)
        assert read_registered_span(session, store, ReadScope("p"), anchor.id)["text"] == "Caf\u00e9"
        original = read_artifact(session.scalar(select(ArtifactRow).where(ArtifactRow.kind == "dataset")).payload)
        source_metadata = SourceDeclarations(citation={"origin": "source_derived", "value": "Anchored citation",
            "supporting_references": [{"kind": "source_span", "id": anchor.id}]})
        derived = save(session, DatasetV2(project_id="p", filename=original.filename, blob_key=original.blob_key,
            sha256=original.sha256, rows=original.rows, columns=original.columns, source=source_metadata,
            unresolved_fields=[name for name in SourceDeclarations.model_fields if name != "citation"]))
        session.flush()
        assert evidence.id in {a.id for a in ArtifactResolver(session, "p").closure([derived.id])}
        with pytest.raises(DomainError):
            ArtifactResolver(session, "p", {derived.id}).resolve(derived.id)
        snapshot = capture(session, "p")
        blob, _ = report_bundle(snapshot, store)
        with zipfile.ZipFile(io.BytesIO(blob)) as archive:
            assert json.loads(archive.read("evidence-spans.json"))[0]["id"] == anchor.id
        corrupt = deepcopy(snapshot)
        corrupt["evidence_spans"][0]["reference"]["excerpt_sha256"] = "0" * 64
        with pytest.raises(DomainError):
            report_bundle(corrupt, store)
    with pytest.raises(IntegrityError), db.session.begin() as session:
        session.execute(update(EvidenceSpanRow).values(reference={}))

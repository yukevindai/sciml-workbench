"""A06 manual evidence inspection routes: exact retained text, never extraction."""
import pytest

from workbench import adapters
from workbench.contracts import Evidence
from workbench.db import ProjectRow
from workbench.projections import ReadScope
from workbench.references import evidence_text, make_reference, register_reference, save_claim_set
from workbench.services import save
from workbench.storage import LocalStore
from test_worker import runtime  # noqa: F401 - fixture
from test_references import claim
from test_evidence_adapter import pdf_fixture


def http(settings):
    from fastapi.testclient import TestClient
    from workbench.api import create_app
    client = TestClient(create_app(settings), raise_server_exceptions=False)
    client.headers["Authorization"] = "Bearer " + settings.api_token.get_secret_value()
    return client


@pytest.fixture
def inspected(runtime):  # noqa: F811
    db, settings, _ = runtime
    store = LocalStore(settings.storage_root)
    from reportlab.pdfgen.canvas import Canvas
    import io
    output = io.BytesIO()
    canvas = Canvas(output)
    canvas.drawString(40, 700, "Café measurement: a source statement, not semantic proof.")
    canvas.showPage()
    canvas.drawString(40, 700, "Second page measurement.")
    canvas.save()
    raw = output.getvalue()
    record, bundle = adapters.ingest_pdf(raw, "Inspection fixture")
    with db.session.begin() as session:
        evidence = save(session, Evidence(project_id="p", title="Inspection fixture", pdf_key=store.put(raw),
                                         sha256=store.put(raw), result=record, bundle_key=store.put(bundle)))
        session.add(ProjectRow(id="q", name="Other"))
    return db, settings, store, evidence


def test_page_text_is_exact_and_bounded_to_the_inventory(inspected):
    db, settings, store, evidence = inspected
    client = http(settings)
    for page in (1, 2):
        body = client.get(f"/api/v1/projects/p/evidence/{evidence.id}/pages/{page}").json()
        text, digest, version = evidence_text(store, evidence, page)
        assert body["text"] == text and body["representation_sha256"] == digest
        assert body["extraction_version"] == version and body["has_text"] is True
        assert body["page"] == page and body["page_count"] == 2
        assert body["text_sha256"] == evidence.result["pages"][page - 1]["text_sha256"]
    missing = client.get(f"/api/v1/projects/p/evidence/{evidence.id}/pages/3")
    assert missing.status_code == 422 and missing.json()["error_code"] == "REFERENCE_INVALID"
    assert client.get(f"/api/v1/projects/p/evidence/{evidence.id}/pages/0").status_code == 422
    assert client.get(f"/api/v1/projects/q/evidence/{evidence.id}/pages/1").status_code == 404


def test_image_only_page_is_reported_unavailable_not_invented(runtime):  # noqa: F811
    db, settings, _ = runtime
    store = LocalStore(settings.storage_root)
    raw = pdf_fixture("mixed")
    record, bundle = adapters.ingest_pdf(raw, "Mixed")
    with db.session.begin() as session:
        evidence = save(session, Evidence(project_id="p", title="Mixed", pdf_key=store.put(raw), sha256=store.put(raw),
                                         result=record, bundle_key=store.put(bundle)))
    client = http(settings)
    first, second = (client.get(f"/api/v1/projects/p/evidence/{evidence.id}/pages/{n}").json() for n in (1, 2))
    assert first["has_text"] is True and "C05 first page" in first["text"]
    assert second["has_text"] is False and not second["text"].strip()


def test_claim_citation_opens_exact_span_with_unmodified_context(inspected):
    db, settings, store, evidence = inspected
    with db.session.begin() as session:
        on_page = make_reference(session, store, ReadScope("p"), evidence.id, 5, 16, page=1)
        whole = make_reference(session, store, ReadScope("p"), evidence.id, 0, 4)
        payload = claim(on_page.model_dump(mode="json"))
        payload["source_references"].append(whole.model_dump(mode="json"))
        saved = save_claim_set(session, store, ReadScope("p"), run_id="run", revision=1, claims=[payload])
    client = http(settings)
    base = f"/api/v1/projects/p/claim-sets/{saved.id}/claims/claim/source-references"
    body = client.get(f"{base}/0").json()
    page_text = evidence_text(store, evidence, 1)[0]
    assert body["text"] == "measurement" == page_text[5:16]
    assert body["before"] == page_text[:5] and body["after"] == page_text[16:16 + 320]
    assert body["reference"]["page"] == 1 and body["span_id"] is None
    assert body["representation_length"] == len(page_text)
    whole_body = client.get(f"{base}/1").json()
    assert whole_body["text"] == "Café" and whole_body["reference"]["page"] is None
    assert whole_body["representation_length"] == len(evidence_text(store, evidence)[0])
    assert client.get(f"{base}/2").status_code == 404
    assert client.get(f"/api/v1/projects/p/claim-sets/{saved.id}/claims/other/source-references/0").status_code == 404
    assert client.get(f"/api/v1/projects/q/claim-sets/{saved.id}/claims/claim/source-references/0").status_code == 404
    # A non-claim artifact cannot be used as a citation container.
    assert client.get(f"/api/v1/projects/p/claim-sets/{evidence.id}/claims/claim/source-references/0").status_code in {404, 422}


def test_named_anchors_list_and_reverify(inspected):
    db, settings, store, evidence = inspected
    with db.session.begin() as session:
        anchor = register_reference(session, store, ReadScope("p"),
                                    make_reference(session, store, ReadScope("p"), evidence.id, 0, 4, page=1))
        anchor_id = anchor.id
    client = http(settings)
    response = client.get("/api/v1/projects/p/evidence-spans")
    assert response.status_code == 200, response.text
    listed = response.json()
    assert [value["id"] for value in listed] == [anchor_id]
    assert listed[0]["source_artifact_id"] == evidence.id and "text" not in listed[0]
    body = client.get(f"/api/v1/projects/p/evidence-spans/{anchor_id}").json()
    assert body["span_id"] == anchor_id and body["text"] == "Café" and body["before"] == ""
    assert client.get("/api/v1/projects/q/evidence-spans").json() == []
    assert client.get(f"/api/v1/projects/q/evidence-spans/{anchor_id}").status_code == 404


def test_corrupt_retained_text_returns_no_span_or_page(inspected):
    db, settings, store, evidence = inspected
    with db.session.begin() as session:
        ref = make_reference(session, store, ReadScope("p"), evidence.id, 0, 4, page=1)
        saved = save_claim_set(session, store, ReadScope("p"), run_id="run", revision=1,
                               claims=[claim(ref.model_dump(mode="json"))])
    store.path(evidence.bundle_key).write_bytes(b"corrupt")
    client = http(settings)
    for path in (f"claim-sets/{saved.id}/claims/claim/source-references/0", f"evidence/{evidence.id}/pages/1"):
        response = client.get(f"/api/v1/projects/p/{path}")
        assert response.status_code >= 500 and "Caf" not in response.text

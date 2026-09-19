"""C05 real PDF ingestion, source preservation and honest text availability."""
import hashlib
import io
import json
import zipfile

from PIL import Image, ImageDraw
import pytest
from reportlab.pdfgen.canvas import Canvas
from scientific_evidence_engine import ingest_paper

from workbench import adapters, services
from workbench.db import JobRow
from workbench.evidence_integrity import EvidenceInputError, EvidenceIntegrityError, verify_evidence
from workbench.worker import claim, process_job
from test_intake import api, attach


def pdf_fixture(kind):
    stream = io.BytesIO()
    canvas = Canvas(stream)
    if kind in {"text", "mixed"}:
        canvas.drawString(40, 700, "C05 first page: measured evidence is not inferred.")
        canvas.showPage()
    if kind in {"scanned", "mixed"}:
        image = Image.new("RGB", (700, 100), "white")
        ImageDraw.Draw(image).text((10, 20), "C05 image-only source; text requires OCR.", fill="black")
        canvas.drawInlineImage(image, 40, 500, width=500, height=72)
        canvas.showPage()
    if kind == "text":
        canvas.drawString(40, 700, "C05 second page: page mapping comes from PDFium.")
        canvas.showPage()
    canvas.save()
    return stream.getvalue()


@pytest.mark.parametrize("kind,availability", [("text", [True, True]), ("scanned", [False]), ("mixed", [True, False])])
def test_public_ingestion_exact_bundle_and_text_availability(tmp_path, kind, availability):
    raw = pdf_fixture(kind)
    record, bundle = adapters.ingest_pdf(raw, "Fixture title")
    original = tmp_path / "input.pdf"
    original.write_bytes(raw)
    expected = ingest_paper(original, tmp_path / "upstream", {"title": "Fixture title"})
    assert record == expected
    assert record["metadata"] == {"title": "Fixture title"}
    assert record["metadata_status"] == "user_supplied_unverified"
    assert record["sha256"] == hashlib.sha256(raw).hexdigest()
    assert record["page_count"] == len(availability)
    assert [page["has_text"] for page in record["pages"]] == availability
    with zipfile.ZipFile(io.BytesIO(bundle)) as archive:
        prefix = f"papers/{record['paper_id']}/"
        assert set(archive.namelist()) == {prefix + "original.pdf", prefix + "paper.json",
                                          *(prefix + page["text_path"] for page in record["pages"])}
        assert archive.read(prefix + "original.pdf") == raw
        assert json.loads(archive.read(prefix + "paper.json")) == record
        for number, page in enumerate(record["pages"], start=1):
            text = archive.read(prefix + page["text_path"])
            assert page["page"] == number and page["extraction"] == "pdfium_text_layer"
            assert hashlib.sha256(text).hexdigest() == page["text_sha256"]
            assert text == (tmp_path / "upstream" / prefix / page["text_path"]).read_bytes()
            assert bool(text.decode("utf-8").strip()) == page["has_text"]
        if kind == "text":
            assert b"first page" in archive.read(prefix + record["pages"][0]["text_path"])
            assert b"second page" in archive.read(prefix + record["pages"][1]["text_path"])


@pytest.mark.parametrize("raw", [b"not a PDF", b"%PDF-1.4\ntruncated", b""])
def test_invalid_pdf_has_classified_failure_not_empty_success(raw):
    with pytest.raises(EvidenceInputError) as caught:
        adapters.ingest_pdf(raw, "Invalid")
    assert caught.value.error_code == "VALIDATION_FAILED"


@pytest.mark.parametrize("fault", ["original", "text", "record", "count", "path", "page", "availability", "missing", "extra"])
def test_inconsistent_bundle_fails_closed(tmp_path, fault):
    raw = pdf_fixture("text")
    original = tmp_path / "input.pdf"
    original.write_bytes(raw)
    root = tmp_path / "bundle"
    record = ingest_paper(original, root, {"title": "Integrity"})
    paper = root / "papers" / record["paper_id"]
    if fault == "original": (paper / "original.pdf").write_bytes(b"changed")
    elif fault == "text": (paper / record["pages"][0]["text_path"]).write_bytes(b"changed")
    elif fault == "record": record["metadata"]["title"] = "Changed"
    elif fault == "count": record["page_count"] += 1
    elif fault == "path": record["pages"][0]["text_path"] = "../../input.pdf"
    elif fault == "page": record["pages"][0]["page"] = 2
    elif fault == "availability": record["pages"][0]["has_text"] = False
    elif fault == "missing": (paper / record["pages"][0]["text_path"]).unlink()
    elif fault == "extra": (paper / "invented-ocr.txt").write_text("not upstream evidence")
    if fault in {"count", "path", "page", "availability"}:
        (paper / "paper.json").write_text(json.dumps(record))
    with pytest.raises(EvidenceIntegrityError):
        verify_evidence(root, raw, record)


@pytest.mark.parametrize("kind", ["mixed", "scanned", "invalid"])
def test_durable_ingestion_original_bundle_and_report_preservation(api, kind):
    client, app, settings, pid = api
    raw = b"%PDF-1.4\nunreadable" if kind == "invalid" else pdf_fixture(kind)
    response = attach(client, pid, raw, **{"Content-Type": "application/pdf", "X-Filename": "evidence.pdf"})
    assert response.status_code == 201, response.text
    material = response.json()
    url = f"/api/v1/projects/{pid}/research-materials/{material['id']}/ingest"
    response = client.post(url, headers={"Idempotency-Key": "ingest"})
    assert response.status_code == 202
    assert client.post(url, headers={"Idempotency-Key": "ingest"}).json() == response.json()
    process_job(settings, claim(app.state.db, 120))
    with app.state.db.session() as session:
        job = session.get(JobRow, response.json()["id"])
        if kind == "invalid":
            assert job.state == "failed" and job.result_id is None
            assert job.error_code == "VALIDATION_FAILED"
        else:
            assert job.state == "succeeded", job.error
            result_id = job.result_id
    assert client.get(f"/api/v1/projects/{pid}/research-materials/{material['id']}/download").content == raw
    evidence = None
    if kind != "invalid":
        path = f"/api/v1/projects/{pid}/artifacts/{result_id}"
        evidence = client.get(path).json()
        assert client.get(path + "/download?representation=original").content == raw
        bundle = client.get(path + "/download?representation=bundle").content
        assert hashlib.sha256(bundle).hexdigest() == evidence["bundle_key"]
        assert [p["has_text"] for p in evidence["result"]["pages"]] == ([True, False] if kind == "mixed" else [False])
    with app.state.db.session() as session:
        report, _ = services.report_bundle(services.capture_report(session, pid), app.state.store)
    with zipfile.ZipFile(io.BytesIO(report)) as archive:
        assert archive.read(f"blobs/{material['sha256']}") == raw
        if evidence:
            assert archive.read(f"blobs/{evidence['bundle_key']}") == bundle

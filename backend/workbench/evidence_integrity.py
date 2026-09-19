"""Verify the pinned public ingestion bundle without extracting new evidence."""
import hashlib
import json
from pathlib import Path


class EvidenceInputError(ValueError):
    error_code = "VALIDATION_FAILED"


class EvidenceIntegrityError(ValueError):
    error_code = "INTEGRITY_FAILED"


def verify_evidence(root: Path, raw: bytes, record: dict):
    """Check byte/record/page correspondence, not scientific or text accuracy."""
    if not isinstance(record, dict):
        raise EvidenceIntegrityError("Evidence ingestion did not return a public paper record")
    digest = hashlib.sha256(raw).hexdigest()
    paper_id = "paper_" + digest
    pages = record.get("pages")
    count = record.get("page_count")
    if (record.get("schema_version") != "1.0" or record.get("paper_id") != paper_id
            or record.get("sha256") != digest or record.get("original") != "original.pdf"
            or type(count) is not int or count < 1 or not isinstance(pages, list) or len(pages) != count
            or not isinstance(record.get("metadata"), dict) or not isinstance(record.get("software"), dict)
            or record.get("metadata_status") != "user_supplied_unverified"):
        raise EvidenceIntegrityError("Evidence record disagrees with the original PDF or page inventory")
    paper = root / "papers" / paper_id
    expected = {paper / "original.pdf", paper / "paper.json"}
    try:
        if (paper / "original.pdf").read_bytes() != raw or json.loads((paper / "paper.json").read_bytes()) != record:
            raise EvidenceIntegrityError("Evidence bundle disagrees with returned record or original bytes")
        for number, page in enumerate(pages, start=1):
            path = f"pages/{number:04}.txt"
            if (not isinstance(page, dict) or type(page.get("page")) is not int or page["page"] != number
                    or page.get("text_path") != path or page.get("extraction") != "pdfium_text_layer"
                    or type(page.get("has_text")) is not bool):
                raise EvidenceIntegrityError("Evidence page locator or extraction metadata is inconsistent")
            text_path = paper / path
            expected.add(text_path)
            text = text_path.read_bytes()
            if (hashlib.sha256(text).hexdigest() != page.get("text_sha256")
                    or bool(text.decode("utf-8").strip()) != page["has_text"]):
                raise EvidenceIntegrityError("Evidence page text disagrees with its digest or availability")
        if {path for path in root.rglob("*") if path.is_file()} != expected:
            raise EvidenceIntegrityError("Evidence bundle has missing or unexpected files")
    except (FileNotFoundError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise EvidenceIntegrityError("Evidence bundle is incomplete or unreadable") from exc

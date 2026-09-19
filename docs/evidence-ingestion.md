# Evidence ingestion and source bundle (C05)

`workbench.adapters.ingest_pdf` uses the pinned public `scientific_evidence_engine.ingest_paper` API in an isolated temporary workspace. The original PDF is stored independently before ingestion; a successful evidence artifact refers separately to that original and the complete upstream bundle. No local extraction, OCR, figure digitization or calibration algorithm is added.

## Preserved evidence

The bundle contains `papers/paper_<original-sha256>/original.pdf`, `paper.json` and one `pages/NNNN.txt` file per upstream page. The returned record retains:

- Original PDF SHA-256 and paper identity.
- Supplied metadata and `metadata_status="user_supplied_unverified"`; the current adapter supplies the requested title, not inferred DOI/authors/license or verified intrinsic PDF metadata.
- Page count, actual 1-based page numbers, text paths and exact UTF-8 text hashes.
- Upstream page dimensions, `extraction="pdfium_text_layer"`, `has_text`, and software metadata.

Before retaining the ZIP, workbench verifies original bytes, returned-record/on-disk-record equality, the complete file inventory, contiguous page records, fixed page paths, extraction method, exact text hashes and agreement between `has_text` and decoded text availability. Unexpected files, missing text, changed originals, unsafe/mismatched paths and inconsistent records fail with `INTEGRITY_FAILED`. These checks establish byte/record correspondence, not scientific truth or extraction accuracy.

Original and bundle downloads use the existing scoped artifact routes (`representation=original` / `bundle`). Attachment downloads remain available independently of extraction. Reports retain original PDF blobs, successful evidence bundles and attachment records.

## Honest limitations

A page with no PDF text layer has `has_text=false` and its actual empty/whitespace text representation; it is not assigned invented text or offsets. An image-only PDF can be successfully ingested while **no page has extractable text**. Mixed documents retain separate availability for each page. A text layer's presence does not establish reading order, completeness, language fidelity, OCR quality or semantic support.

Unreadable PDFs raise `EvidenceInputError` with `VALIDATION_FAILED` and a safe explanation. No evidence artifact is created for a failed extraction. Previously attached original bytes remain downloadable and reportable, including malformed PDFs accepted by the initial structural prefix check. Operational or bundle-integrity failures are not relabeled as successful empty extraction.

The adapter does not perform OCR, render/digitize figures, produce calibrated measurements, or invent page mapping. Upstream supplies the page numbers; generated bundle paths are validated against them. Unicode span references, excerpt digests and claim validation remain C11 work. C05 does not add an agent retrieval tool or change the public Evidence 1.0 schema.

## Acceptance fixtures

`test_evidence_adapter.py` generates a two-page text PDF, a genuinely image-only page containing rasterized text, a mixed PDF, and malformed inputs. Tests compare results and every page-text file with a separate call to the installed public ingestion API, verify original bytes/metadata/page mapping/hashes, and inject bundle corruption to test rejection. These are controlled software fixtures, not an extraction-quality evaluation of arbitrary real scans.

Durable attachment/worker tests cover mixed, image-only and invalid documents, request replay, separate original/bundle downloads, and report preservation. Storage tests verify isolated temporary workspaces and cleanup after success/failure using public-generated fixture bundles. See [C05 acceptance](tickets/C05.md) for executed checks and limitations.

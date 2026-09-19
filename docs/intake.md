# Project input intake

Apply migration `0003` before starting this revision. All routes require the existing operator bearer gate and project scope. Project creation remains `POST /api/v1/projects`; it does not gain request-key deduplication.

## Attachment API

`POST /api/v1/projects/{pid}/research-materials` accepts raw bytes, `X-Filename`, `Content-Type: text/csv` or `application/pdf`, and an `Idempotency-Key` of 1–100 nonblank characters. CSV may include optional `X-Source` containing a `SourceDeclarations` JSON object. Omitted declarations are explicitly unknown. Intake accepts only unknown and attributed user-supplied declarations; source-derived or inferred claims require later reference resolution and are rejected here.

The response contains material ID, project ID, filename, media type, exact-byte SHA-256, and a dataset artifact ID for CSV (null for PDF). Request keys and internal storage keys are not returned. `GET /research-materials` lists the project's bindings; `GET /research-materials/{mid}/download` retrieves exact bytes through that binding. A digest alone is not download authority.

A retry with the same project/key, bytes, normalized filename, media type and default-expanded declarations returns the original binding. A changed payload returns 409 `IDEMPOTENCY_CONFLICT`. A different key deliberately creates a separate material and dataset. Identical bytes in different projects share immutable blob storage while retaining separate metadata ownership. The binding, CSV artifact and upload provenance commit together; losing concurrent requests roll back all their metadata. Complete unreferenced blobs may remain after failure, per the storage contract.

CSV intake checks UTF-8 (optional BOM), 1–200 unique nonblank header names, 3–`WB_MAX_ROWS` data rows, consistent row width, and no NUL bytes. Parsing consumes rows incrementally and stops at the row limit; the standard CSV parser also bounds individual fields (131,072 characters in the supported Python runtime). The configured upload byte limit applies before parsing, including direct service calls. Header spelling, BOM, newline style, quoting and data bytes are never normalized in storage. These checks do not establish scientific validity.

PDF attachment performs only a preliminary `%PDF-` check and preserves the original independently of extraction. It does **not** certify a valid PDF or successful extraction. `POST /research-materials/{mid}/ingest` with its own job `Idempotency-Key` queues the existing bounded evidence worker. Invalid PDFs fail that job safely while retaining the attachment for inspection/export. CSV attachments cannot use this ingestion route. OCR and scientific source validation remain outside B03.

## Compatibility and consumers

The legacy `POST /datasets` route still accepts the legacy `X-Source` shape and produces Dataset 1.0 when supplied. Without that header it produces Dataset 2.0 with unresolved declarations. This compatibility route still creates a separate dataset per request; retry-safe callers must use the attachment route. The legacy PDF `/evidence` route is unchanged.

Artifact list/get/download, detached scientific execution and replay now read Dataset 1.0 and 2.0 explicitly. The frontend validates both versions and uses the attachment route for CSV. Blank source fields remain unknown; synthetic fixture declarations require an explicit choice and reset when another file is selected. A failed upload response retains the request key while the same form remains open; changing the file, declarations or project creates a new key. Refreshing the page does not retain an in-flight key.

Audits and splits can inspect Dataset 2.0 without fabricated source facts. The benchmark projector requires resolved, admissible citation, URL, license, data kind and transformations before producing the upstream source card; it rejects unknown or inferred values. B04's [submission service](submission.md) also checks these source requirements before accepting a new benchmark job. Other scientific admission remains upstream/C01/C11/C12 work. B03 does not add a declaration-amendment workflow; a deliberate new attachment can carry new assertions without rewriting the original dataset.

Reports retain both dataset schemas, `materials.json`, and all original attachment blobs, including unparsed or failed PDFs. The existing manifest 1.0 still hashes every file; new replay reads mixed dataset versions, and old archives remain readable. C08/C09 own expanded archive/replay semantics. B05 owns full nested lineage validation; A02 owns the broader attachment/metadata experience and E03 owns agent tool admission.

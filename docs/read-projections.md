# Capabilities and result projections (B09)

The manual read surface is implemented. B09's C12 prerequisite is not present: evaluation protocols, release authorization and persistent holdout-exposure history are not implemented, so **agent reads are denied**, not approximated by removing a test-metric field. Full B09 agent integration remains gated on C12/B11/E03.

## Authenticated endpoints

| Route | Response |
|---|---|
| `GET /api/v1/capabilities` | Integrated model/strategy options, runtime-readable/writable artifact versions, pinned dependencies, nonsecret configured limits and explicit gaps. |
| `GET /api/v1/projects/{p}/artifact-previews` | Workspace listing with benchmarks as test-withheld `BenchmarkPreview` projections (A05); see [evaluation exposure](evaluation-exposure.md). |
| `GET /api/v1/projects/{p}/evidence/{e}/pages/{n}` | `EvidencePageText`: exact retained PDFium text of one upstream page, reverified against the original and bundle (A06). No OCR; image-only pages return their empty text with `has_text: false`. |
| `GET /api/v1/projects/{p}/claim-sets/{c}/claims/{claim}/source-references/{i}` | `EvidenceSpanView`: a stored claim's own citation, reverified, with up to 320 unmodified code points of context each side (A06). Clients cannot supply the reference. |
| `GET /api/v1/projects/{p}/evidence-spans` and `/evidence-spans/{s}` | `EvidenceAnchor` list (no text) and one named anchor as a reverified `EvidenceSpanView` (A06). |
| `GET /api/v1/projects/{p}/reports/{r}/summary` | `ReportSummary` (A08): current structural reverification of the stored archive, plus frozen scope, artifact identities (no values), settled jobs, attachments, environment, agent execution versions and finalization gaps. A failed check returns `status: failed` with a reason and no contents. `scientific_replay` is always `not_run`. Agent scopes are denied. |
| `GET /api/v1/projects/{p}/artifact-index` | `ArtifactPage`: lightweight identity, kind, schema version and creation time. |
| `GET /api/v1/projects/{p}/job-index` | `JobPage`: safe job details and optional external-receipt projections. `order=desc` (A09) pages newest first; cursors are bound to their order. |
| `GET /api/v1/projects/{p}/jobs/{j}` | One project-scoped `JobDetail`, including a receipt when journaled. |

All routes use the existing server-held operator bearer authentication, `no-store` caching, structured safe errors and request IDs. They do not accept a client-selected audience or provide an agent authentication channel. Existing `/artifacts` and `/jobs` array shapes remain available for compatibility; growing-project clients should use the new bounded indexes. The legacy job array/submission responses now also replace free-form worker error text with a fixed safe message.

Existing artifact detail returns the complete immutable scientific artifact through B05 lineage resolution; it does not remove assignments or metric fields. Detail responses exceeding 32 MiB reject explicitly rather than silently truncating scientific content. Existing artifact/material downloads use the same trusted read-scope gate and preserve byte-level integrity checks. Manual reads can expose test results; no claim of recorded exposure or an untouched holdout is made before C12 exists.

## Pagination

Indexes accept `limit` (1–100, default 50), optional `kind`, and opaque `after`. Responses contain `items` and `next_cursor`; null means the observed page had no successor. Ordering is ascending `(created_at, id)`, with the immutable ID breaking timestamp ties. Pagination is keyset-based, not offset-based, so ordinary later insertions do not repeat or shift previously returned rows.

Cursors are versioned and HMAC-authenticated with a purpose-specific key derived from the existing API token. They bind the project, audience, resource and kind filter. Tampering, cross-project reuse, switching resource/filter or malformed cursors returns 422. Page size may change between requests. Token rotation invalidates outstanding cursors. Cursors are opaque integrity tokens, not encrypted secrets or authorization grants; every request still authenticates and scopes its database reads.

These are live indexes, not a database snapshot. Job state/receipts may advance between pages; rows explicitly backdated behind an already traversed cursor are not retroactively returned. Current writers create timestamps at insertion and there is no public backdating API. Restart from the first page to refresh current state. Artifact indexes select only envelope columns and the schema-version JSON scalar; they do not load scientific payloads. Job indexes omit request payloads, and receipt queries select metadata/record ID without loading the original body or snapshot.

## Receipt and error semantics

For manual reads, `JobDetail.run_links` lists recorded agent-run uses of the job (run, action, `owned`/`shared`/`detached`), and `JobDetail.recovery` projects the D04 decision for a failed job: state, eligibility, attempts, `retry_job_id`, next attempt time and last safe error code (A09). Lease tokens, policy bodies and history text are omitted. Agent-scoped reads return no run links and no recovery decision. An empty `run_links` does not prove a job was manual.

`JobDetail.external_receipt` contains the original external ID, connector, `prepared`/`unknown`/`confirmed` state, body/request digests, submission count/time, external IDs, optional linked artifact ID and `reconciliation_required`. It omits the exact import body and upstream snapshot. The snapshot remains in the unchanged scientific Failure artifact when publication exists.

Unknown outcomes require reconciliation and have no confirmed external record or artifact result. Confirmed receipts require upstream project/record IDs. A failed job with a later confirmed receipt stays failed; its original `result_id` is not replaced by the receipt's independent `artifact_id`. Confirmation without artifact publication is visible as confirmed with a null artifact link.

Only allowlisted job fields are returned. Claim tokens, worker identity, raw request payloads/keys, database configuration, credentials and free-form worker errors are omitted. Known error codes are retained; unknown private error content becomes a fixed generic error. This is operational metadata redaction, not modification of authorized scientific source content.

## Capabilities and agent boundary

Capabilities verify installed Git commit provenance and required public exports before advertising the reviewed C01 integration. A mismatch fails closed with `DEPENDENCY_UNAVAILABLE`. Only `mean` and `ridge` are workbench benchmark choices. The nine accepted base split strategies are exposed; scaffold/molecular options, OCR and automated digitization are not advertised as integrated. The outstanding cluster exact-diagnostics replay limitation is disclosed. Registered future schema shapes do not become runtime-supported artifact versions merely by appearing in the contract catalog.

`ReadService` requires a server-constructed `ReadScope`. Every index, detail, receipt-bearing job and artifact/material download rejects `audience="agent"` with `DATA_EXPOSURE_DENIED` before reading content. There is no caller-supplied bypass callback or release flag. E03 must use this service with an agent scope and never grant the operator bearer token to an agent. Legacy manual arrays are not agent tools.

C12/B11 must supply the durable protocol/exposure service before replacing this gate. Integration must cover artifacts, predictions/bundles, reports, memory/reuse, reviewer context and manual exposure events—not just the new index routes. Current capabilities explicitly set `agent_reads_available=false`, `evaluation_exposure="unavailable_pending_C12"`, and `validation_only_execution=false` because the upstream baseline returns both partitions together.

Six new record schemas and the additive OpenAPI/HTTP catalog entries are exported, with generated TypeScript types and runtime validators. No additional migration, dependency, environment variable or UI workflow change is required; B07's journal still requires revision `0004`.

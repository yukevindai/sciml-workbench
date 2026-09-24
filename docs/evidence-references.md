# Evidence references and claim validation (C11)

`workbench.references` validates references against retained evidence and benchmark results. It performs no new extraction, scientific computation or semantic review.

`make_reference(session, store, read_scope, evidence_id, start, end, page=...)` verifies the original PDF, public ingestion record, exact archive inventory and page text hashes. It returns an available reference with original-source, representation and excerpt SHA-256 values and extraction identity. Offsets are Unicode code points in `[start, end)`, not byte or grapheme offsets. Text and line endings are never normalized. Excerpts are bounded to 4,000 code points.

An explicit page identifies the upstream PDFium page. With no page, the representation concatenates retained pages in order with no added separator, records that representation convention, and keeps `page` null. Image-only text yields an unavailable reference with a reason and no fabricated locator. There is no OCR fallback. `read_span` verifies every anchor again before returning exact text; missing anchors, mismatched digests, unsupported offsets and corrupt bytes fail closed.

`register_reference` stores a verified immutable named anchor in `evidence_spans`. Dataset declarations and criterion declarations can reference its ID with `kind: source_span`. Runtime graph resolution adds the source evidence to their dependency closure and checks project/input scope. `read_registered_span` rechecks the saved reference against the original bytes. An anchor proves a location, not that a citation, license or scientific assertion is correct.

`check_metric` resolves the benchmark and the exact JSON Pointer, including `~0`/`~1` escapes. The partition, numeric finite value and successful result must agree; absent or null fields never become zero. Invented units fail. Agent access goes through C12 before resolving metric content, with only permitted scalar metrics exposed.

`validate_claims` checks up to 100 claims and 1,000 references and returns checked copies. Computed-result, source-supported, interpretation and hypothesis classifications remain distinct. It sets deterministic reference status only. It refuses an asserted semantic review and never promotes a valid anchor to scientific support. `save_claim_set` persists an immutable ClaimSet 1.0 with typed source/metric/split dependencies. E11 owns independent semantic review and exact-review-snapshot attribution.

Reports retain claim sets, source artifacts, named anchors and schemas, and reverify references against frozen captures and retained bytes during assembly. Missing/corrupt sources or false captured metrics block assembly. Original artifacts and earlier reports are not rewritten.

Apply migration **0005** before using these services. It introduces immutable named anchors alongside the C12 evaluation/exposure tables. These are trusted backend entry points: E03 must construct authorized `ReadScope` values; provider arguments cannot choose project/run authority. No new evidence or claim write endpoint is advertised.

## Manual inspection routes (A06)

Four read-only manual routes expose retained evidence for inspection. Each reverifies the original PDF, record, bundle inventory and page hashes through `evidence_text` on every call. None extracts, normalizes or infers text.

- `GET /projects/{p}/evidence/{e}/pages/{n}` returns one page's exact text, digest and extraction version (`EvidencePageText`). Pages outside the inventory fail with `REFERENCE_INVALID`. Pages above 1,000,000 code points are refused.
- `GET /projects/{p}/claim-sets/{c}/claims/{claim}/source-references/{i}` resolves the reference stored in that claim, not one supplied by the client. It returns the excerpt plus at most 320 code points of unmodified context on each side (`EvidenceSpanView`). A reference with a null page is located in the concatenated whole-document representation and keeps `page: null`. No page is derived for it.
- `GET /projects/{p}/evidence-spans` lists named anchors without text. `GET /projects/{p}/evidence-spans/{s}` returns one reverified anchor with context.

Corrupt or mismatched bytes return an error and no text. These routes are project scoped, record no holdout exposure (they return evidence text, not benchmark values), and are not agent tools. Agents keep using the scoped C11 services.

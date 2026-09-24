# Sealed evaluation and exposure boundary (C12)

The pinned ChemE baseline computes validation and test results together. Workbench retains the complete immutable result and bundle server-side, then constructs a separate permitted projection. This does not claim that test computation occurred later. Validation-only execution, validation-driven candidate selection and separate final-test execution remain explicitly unsupported.

## Sealing and execution

`seal_evaluation(db, submission_scope, candidates, ...)` freezes up to 16 named mean/ridge candidates, seeds, target/features, split, scientific configuration, primary scalar metric and optional success criterion. Candidate configuration may differ only in model and seed. Target/features must match exact dataset columns and source declarations must be resolved. This metadata check does not replace public upstream scientific admission.

The service stores an immutable EvaluationProtocol artifact and an authoritative `evaluations` row. Candidate requests are immutable. `submit_candidate` authorizes the full dependency scope, checks the sealed candidate and unchanged exposure eligibility, and atomically binds its accepted job. Replays preserve job identity. Arbitrary agent benchmark submissions and unplanned/replaced candidate attempts are refused. The caller supplies trusted run/action identity; B11/E03 must derive it from their persisted ownership records when implemented.

`release_evaluation` requires every predeclared candidate to have an accepted terminal job. It makes a monotonic release transition; no new candidate submission follows release. Selection readers still receive validation only after release. Only a trusted final-purpose reader can obtain test scalar metrics from a released comparison. There is no API to nominate a test-informed winner.

## Exposure identity and history

Exposure is project-scoped and follows exact dataset SHA-256 plus a digest of partition assignments, independent of upload ID, split ID, run ID, filename, timestamp or generator metadata. Raw dataset access uses a wildcard split marker. Equivalent byte uploads and assignment vectors cannot reset history. Prior computations and exposed/unknown history require an explicitly exploratory new comparison. The service does not claim semantic equivalence for differently encoded or reordered datasets.

Migration **0005** creates `evaluations`, `evaluation_jobs`, `test_exposures` and C11's `evidence_spans`, with database immutability/retention guards. Existing datasets receive a retained `legacy_unknown` exposure marker because historical reads were not audited. Populated history cannot be downgraded away. Apply `alembic -c backend/alembic.ini upgrade head` (or the normal setup command) before starting the updated API/workers; preserve these tables in backups.

## Shared read boundary

`ReadScope` is trusted server context, not a provider argument. Agent scopes require run identity, explicit artifact/job sets and a selection/final purpose. Benchmark access additionally requires its owning registered protocol and accepted candidate binding.

| Path | Behavior |
|---|---|
| Agent benchmark detail / metric references | Only accepted comparison results; allowlisted validation scalars during selection; test scalars only after release to final-purpose readers |
| Agent raw artifact JSON, predictions, bundles, raw datasets, reports | Denied; use typed evaluation/evidence services |
| Agent indexes / job detail | Scoped metadata and fixed safe operational fields; no opaque scientific output or error strings |
| Evidence references | Scoped exact excerpts through C11; no unrestricted artifact/bundle retrieval |
| Manual artifact previews (A05 workspace listing) | Benchmarks as `BenchmarkPreview`: allowlisted validation scalars/method, no test output, no exposure recorded; failure and claim records still expose their dependencies |
| Manual artifact lists/details | Complete compatible artifacts, with exposure recorded for benchmark dependencies |
| Manual original/bundle/report/material downloads | Exposure recorded, including raw-data wildcard exposure |
| Legacy/human Failure Memory imports | Conservative exposure before upstream IO; the independent upstream app is outside the workbench read boundary |
| Live Failure Memory retrieval | `search_failure_memory` records conservative manual exposure before IO; agent prose retrieval is denied until typed record lineage exists |

Manual HTTP reads commit exposure **before returning content**. Commit failure returns an error without result bytes. Trusted service callers must likewise commit their transaction before using the returned projection outside the backend. Internal scientific adapters and `LocalStore` are privileged IO/computation facilities, not model-facing retrieval tools. E03/E09/E14 must consume these scoped services for tool results, memory, reviewer context and traces; no provider runtime is enabled by this ticket.

The scalar projection includes MAE, RMSE, R², group MAE/RMSE and row/group counts when actually present. Arbitrary diagnostics, text, predictions, raw configuration and interval arrays are excluded. Complete upstream uncertainty outputs remain in the original artifact and bundle behind manual exposure tracking. This is a narrower view with its own identity, not a rewritten scientific artifact.

`GET /api/v1/projects/{pid}/evaluations/{protocol_id}` returns current release/exposure status. The original protocol artifact records the **seal-time snapshot**, not mutable current eligibility. Exposure after a valid completed comparison does not change its metrics, but prevents claims of a fresh untouched holdout for subsequent tuning. Agent status views do not reveal out-of-scope exposure event IDs.

Reports capture evaluation status and exposure history at their frozen capture time and include named evidence anchors. Later reads can add exposure; an old report's unexposed snapshot is not current authorization. Claim, outcome, raw report and live-memory access cannot bypass the selection boundary.

Capabilities now use schema version **1.1**, advertise tracked quarantine, and retain `validation_only_execution: false`. Strict clients must use regenerated contracts. B11 run persistence, E03 tool wrappers, E09 memory policy and E14 provider egress remain their respective integration work. A05 moved the manual workspace listing to withheld previews; see below.

## Manual previews and explicit reveal (A05)

`GET /api/v1/projects/{pid}/artifact-previews` is the workspace listing used by the browser. It returns the same artifacts as `/artifacts`, except every benchmark becomes a `BenchmarkPreview`: identity, lineage, status, safe error, submitted task card, bound sealed-comparison IDs, allowlisted finite validation scalars, validation-time method facts (name, seed, selected parameters, validation grid, training description), verification scope, current holdout exposure status and bundle availability. Test metrics, intervals, predictions, the bundle key and upstream run/prediction digests (which are computed over test output) are omitted. Building a preview records no exposure, so polling the workspace no longer marks every holdout as exposed.

Failure and claim-set records can carry holdout values, so the preview listing still exposes their dependencies (`via = artifact_preview_list`) and commits before returning. Other kinds carry no benchmark result values and record nothing. Agent scopes are denied; they keep using the typed evaluation projection.

Test output is available only through the existing complete artifact detail (`artifact_detail`) or download, both of which commit exposure before returning content. The Benchmarks view requires a per-run confirmation before that read and states whether it is the first exposure. Bundle downloads additionally record raw-data exposure because the bundle contains the dataset and predictions. `/artifacts` is unchanged for compatibility and still records exposure for every listed benchmark.

A browser listing that contains a complete benchmark fails generated validation instead of being rendered. The preview is a projection with its own contract (`records/v1/benchmark_preview.json`), not a rewritten scientific artifact.

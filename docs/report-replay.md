# Report verification and scientific replay (C08–C10)

Reports are assembled from the accepted, immutable project/run capture. New captures freeze software versions, Python/platform/package versions, protocol and exposure state, selected terminal jobs, sources and scientific artifacts. Publication verifies the ZIP again against that capture. Repeating assembly of the same new capture produces identical bytes.

Manifest 2.0 inventories every member by SHA-256 and explicitly records `verification: structural` and `scientific_replay: not_run`. Structurally complete legacy manifest 1.0 reports remain readable; incomplete historical archives fail closed. There is no silent contract migration. The verifier checks safe relative paths (including Windows reserved names), duplicate/case-colliding members, symlinks, encrypted entries, file counts and expanded size, contract schemas, project/dependency closure and cycles, frozen projections, content-addressed bytes, evidence locators, and benchmark nested manifests/inputs/assignments/predictions. Prior reports and their provenance cannot enter a new archive.

Selected job exports omit payloads, request keys and raw worker errors. Recognizable credential fields/strings block export instead of changing scientific records. Before publication, the worker checks archive and nested bundle bytes for configured API, Failure Memory and database passwords without passing those credentials to scientific subprocesses. This is not general data-loss prevention: arbitrary secrets inside user-uploaded documents cannot be identified reliably. Archives contain original research inputs and must remain private.

```bash
python -m workbench.replay report.zip --verify-only
python -m workbench.replay report.zip new-output-directory
```

Verification-only does not run science. Replay checks archive structure and environment compatibility before creating the destination. It requires matching source pins on the original scientific artifacts, captured upstream commits, installed Git commit provenance, Python major/minor and captured versions of the four upstream packages plus NumPy, pandas, SciPy and scikit-learn. A mismatch fails; no automatic installation or dependency substitution occurs. For a fresh environment, install Python 3.12 and run `python -m pip install -c backend/constraints.txt -e 'backend[dev]'` from the reviewed source checkout, then `python scripts/check_scientific_surface.py`. CI installs the constrained environment afresh.

Replay uses the public adapters to recompute audits, splits and successful mean/ridge baselines. Original input hashes, row identities, partition assignments, discrete values and field inventories must match exactly. Floating-point audit/split diagnostics, baseline metrics (including intervals), validation search and predictions use relative tolerance **1e-9** and absolute tolerance **1e-12**. Prediction row IDs and partition labels remain exact strings, including leading zeroes. No guarantee of cross-platform equality is inferred from matching package versions; comparisons decide success. The base environment does not add RDKit or enable molecular strategies.

The new output directory contains replayed results/bundles and `replay-comparison.json`. A comparison or computation error leaves `status: failed`; successful completion records `matched` and the per-artifact comparisons. Failed benchmarks are explicitly skipped, never retried as successful science. Structural errors and incompatible environments produce no output directory. Archives with no supported computations record `no_supported_computations`. Existing output directories are refused.

Failure Memory records and receipts are retained snapshots: replay never logs in, imports, searches or modifies the remote/local Failure Memory database. Evidence extraction is structurally checked against original PDF bytes and retained page text; it is not re-extracted or semantically certified. Agent text, causal hypotheses and provider calls are not deterministic scientific replay. Hashes establish internal integrity, not authorship: a fully rewritten self-consistent archive is not authenticated by its own manifest.

Run the focused real integration gate with:

```bash
python scripts/check_scientific_integration.py
```

This checks installed source pins, constraints and public surfaces before running real audit, split, benchmark, evidence, Failure Memory, outcome, grounding, evaluation, report and replay fixtures. Deliberately invalid scientific inputs must be rejected; metadata-only canaries cannot substitute for scientific bundles. `--all` runs all backend regressions behind the same pin gate and is used by CI. PostgreSQL fixture parameters require `TEST_DATABASE_URL`; skipped parameters are not PostgreSQL acceptance evidence.

## Inspecting archives in the workbench (A08)

`GET /api/v1/projects/{p}/reports/{r}/summary` reads the stored report bytes, checks them against the report's digest and runs `verify_archive` on every request. It then returns identities only: frozen scope (project or run, with run ID, capture revision, cutoff and the `pending` export status at capture), artifact kinds, labels, parents and timestamps, settled jobs with error codes, attachments, Python/platform, software and upstream pins, and each archived agent execution record's versions and policy. It returns no metrics, predictions, text or assignments, and records no holdout exposure. Digest mismatches, malformed archives and inventory disagreements return `verification.status: failed` with a reason and an empty summary. Storage outages still return an error. The Reports view checks the three newest archives automatically and the others on request. It always shows scientific replay as not run, because the workbench never executes `workbench.replay`.

A08 also adds `AgentExecutionRecord` to the manual artifact list, detail and preview response types. Previously, once an E13 finalization saved an `agent_execution` artifact, `/artifacts` and `/artifact-previews` failed response validation with a 500. That made the whole workspace unreadable for that project.

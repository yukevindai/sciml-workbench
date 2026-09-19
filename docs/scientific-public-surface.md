# Pinned scientific public-surface inventory (C01)

Verified September 19, 2026 against a fresh constrained Python 3.12.13 installation. This inventories upstream support and the narrower workbench integration; it is not a public capability endpoint or acceptance of dependent tickets. [The generated snapshot](scientific-public-surface.json) records exact public signatures, all audit/split configuration fields and defaults, and the relevant Failure Memory HTTP parameters. [The check script](../scripts/check_scientific_surface.py) compares installed Git provenance with both `PINS` and `pyproject.toml`, checks installed constrained versions, and rejects interface drift. CI runs it after dependency installation and `pip check`.

## Compatible pins and public boundaries

| Distribution | Version / exact Git revision | Public entry points used or inspected |
|---|---|---|
| chemdata-auditor | 0.3.0 / `eff3ed3c43ec71e9ceecabc1f04d1dfb5c91c116` | `chemdata_auditor.AuditConfig`, `audit`, `SplitConfig`, `split`; results expose `to_dict()` and split `assignments()` |
| cheme-ml-benchmarks | 0.1.0 / `db02d8963725a1d406b9b07eb6f4cc3436fbb082` | Root exports `prepare`, `load_prepared`, `run_baseline`, `submit`, `score_predictions`, `leaderboard`; workbench uses prepare/run_baseline |
| scientific-evidence-engine | 0.1.0 / `09f5ec810e8f04bf8d233ec12eb9448342ee5121` | Root `ingest_paper`; `render_figure`, `digitize`, `export_dataset`, `verify_export` exist but are not integrated into workbench |
| experiment-failure-memory | 0.1.0 / `63492787cbbea6d03662db63f2d958a6eec8d804` | `python -m failure_memory.cli`, `failure_memory.app.create_app`, authenticated JSON API |

Benchmark's own ChemData dependency agrees with the workbench pin. Runtime adapters import public exports and exchange files/HTTP JSON; no private science functions or upstream database access are needed. Source inspection informed this inventory; it did not copy algorithms into workbench. The installed metadata verifies package provenance, not tamper-proof local source integrity.

All installed constrained versions match `backend/constraints.txt`. Windows ARM does not select SQLAlchemy's greenlet dependency; its absence is valid for that platform. Windows-only transitive `colorama` and `tzdata` are not constrained by the current Linux-oriented file. Thus this is a compatible constrained set, not an exhaustive cross-platform lock. Existing D01 evidence covers Linux clean installation; C01 reran fresh Windows installation and checks without replacing `.venv` or `outputs/d01-venv`.

## Supported and missing capabilities

| Capability | Upstream at pinned revision | Workbench exposure / missing behavior |
|---|---|---|
| Audit | Configured missing/duplicate, numeric, bounds, units, provenance, identity/conflict, leakage, composition, rules, similarity and density checks; findings, checks run/skipped and metadata | `run_audit` serializes the upstream result. Completion does not establish scientific acceptance. No automatic repairs. Molecular checks need the optional chemistry extra. C02 owns richer adapter-result acceptance. |
| Splits in base installation | `random`, `formulation`, `composition`, `publication`, `laboratory`, `time`, alias `temporal`, `cluster`, `extrapolation` executed successfully through the public API | Config forwarded to upstream. Invalid scientific configurations still fail. No promise that every combination works on every dataset. C03 owns strengthened assignment/cardinality and identity publication checks. |
| Molecular/scaffold splits | `scaffold` is a recognized strategy requiring RDKit; molecular grouping/similarity also need RDKit | **Unavailable in the pinned base environment**: no RDKit pin or chemistry extra is installed. A scaffold request fails explicitly. Do not advertise scaffold or molecular checks as usable base capabilities. |
| Regression baselines | `mean`, `ridge`, `random_forest`, `hist_gradient_boosting` all executed on the same prepared synthetic fixture | HTTP/artifact contracts accept only **mean and ridge**. Other upstream models are not workbench-supported options. No classification or arbitrary estimator/code execution. |
| Baseline model/config selection | Fixed upstream grids and training-only preprocessing; validation selects one grid candidate; no train+validation refit | Workbench passes model and seed, not arbitrary hyperparameters. Benchmark admission owns units, task card, audited data and frozen partitions. Source declarations must be resolved; local tasks are not admission to the official suite. |
| Metric exposure | `run_baseline` returns both `metrics.validation` and `metrics.test` and writes both partitions' predictions in one call | **No validation-only execution or deferred test scoring switch.** C12 must control every downstream representation before agent selection, including raw result, predictions and bundles. C01 does not implement that protection. |
| PDF ingestion | Original bytes, user-supplied metadata status, per-page extracted text, page number, text path/hash, page dimensions, extraction method, `has_text` | Existing adapter preserves the bundle. Textless/image-only pages are explicit; no OCR. Invalid PDFs fail. Workbench ingestion currently supplies title only. C05/C11 own source-reference materialization and admission. |
| Evidence locators | Real 1-based pages and exact UTF-8 text files hashed by upstream | B01 Unicode-codepoint spans must be derived against those exact text representations and tied to their digests. Ingestion does not supply semantic spans, bounding boxes for text, extraction accuracy or calibrated digitization. Never infer a locator for a textless page. |
| Figure/digitization utilities | Public figure rendering, explicitly configured digitization and export verification exist | Not called by workbench and not behaviorally accepted by C01. Their existence does not imply automatic plot extraction or calibration. |
| Failure import | Public authenticated idempotent import with stable record ID; exact replay returns same record; changed payload under same external key returns 409 | Existing save adapter imports. C06/B07/D04 still own typed receipts, durable reconciliation and crash recovery. |
| Failure retrieval | Public `GET /api/search` plus `GET /api/records/{record_id}`; permission-aware lexical search supports explicit project scope | **Available upstream but not yet exposed by the workbench adapter.** C06 should use public scoped search; a fallback is not needed merely because search was presumed missing. Local snapshots must be labeled stale/fallback if used. |

## Configuration and result details

Audit and split constructors validate supplied configuration. The snapshot is the exhaustive field/default inventory, not a replacement validator. Audit defaults enable missing checks and bound pair comparisons to 2,000,000. Units require explicit column/expected rules; similarity scales/tolerances and domain rules remain declarations.

Split defaults are `test_size=0.2`, `validation_size=0`, `seed=0`. Non-random strategies require scientific columns; grouping constraints are separate. Explicit holdout values, temporal cutoffs, extrapolation thresholds/boxes and their validation counterparts replace fraction-based allocation. Temporal/extrapolation crossing policy is `error` or explicit `exclude`; cluster splitting requires a scale for every cluster column. Composition rounding is explicit. Target-dependent splitting requires an explicit override and disclosure. Two-way splitting being supported does not make it sufficient for the benchmark's three-way evaluation protocol.

Each evaluated partition exposes `mae`, `rmse`, nullable `r2`, `group_mae`, `group_rmse`, nullable `group_mae_interval95`, `rows`, `groups`, and `interval_scope`. Group-bootstrap intervals are conditional on the fixed data/model and declared group proxies, not proof of independence or physical uncertainty. `method.validation_search` retains candidate parameters and validation primary scores; `method.parameters` identifies the selected candidate. Run results, prediction CSVs and task/prepared data can reveal test information. Removing one JSON metric key is insufficient exposure control.

PDF metadata accepts title and optional DOI, URL, authors, year, license and notes; it labels them `user_supplied_unverified`. Limits at this upstream revision are 100 MiB input and 1–2,000 pages; workbench upload limits can be stricter. Extraction uses the PDFium text layer, not OCR or an assertion about reading order. Source span offsets should use Unicode codepoints in the decoded exact representation, not PDF byte offsets or UTF-8 byte counts.

Failure Memory setup uses CLI `init` / `create-user --password-env`; independent upstream CLI/browser operation remains available. Login uses `X-EFM-Request: 1`, establishes a cookie session and returns a CSRF token. Mutating requests require `X-CSRF-Token`; logout invalidates the session. Import takes `schema_version`, `connector`, `external_id`, and `record`; identity is scoped by project, connector and external ID. Search takes `q` (up to 1,000 characters), `project_id`, optional `status`, `archived` and `limit` (default 50, maximum 200). Omitted project scope searches all accessible projects, so C06 must supply the resolved project explicitly. Search is lexical, not semantic/vector search, and has no pagination cursor; scopes beyond 10,000 records are rejected. Related-record and pattern routes exist but are not accepted workbench tools.

## Reproduction and source evidence

Use Python 3.12 in a fresh virtual environment:

```text
python -m pip install -c backend/constraints.txt -e "backend[dev]"
python -m pip check
python scripts/check_scientific_surface.py
python -m pytest backend/tests/test_scientific_surface.py -q
```

`--write` regenerates the interface snapshot only after reviewed dependency/interface changes. The snapshot is a developer inventory; HTTP schema references refer to the upstream app's OpenAPI components, not standalone workbench schemas. No upstream private module imports are used by the verifier or behavioral probes.

Sources were read from the locally cached exact Git checkouts and installed source, including these pinned upstream files:

- [ChemData public API and guidance](https://github.com/yukevindai/chemdata-auditor/blob/eff3ed3c43ec71e9ceecabc1f04d1dfb5c91c116/README.md).
- [Benchmark baseline/protocol guidance](https://github.com/yukevindai/ChemE-ML-Benchmarks/blob/db02d8963725a1d406b9b07eb6f4cc3436fbb082/README.md).
- [Evidence ingestion and coordinate guidance](https://github.com/yukevindai/scientific-evidence-engine/blob/09f5ec810e8f04bf8d233ec12eb9448342ee5121/README.md).
- [Failure Memory search limits and independent operation](https://github.com/yukevindai/Experiment-Failure-Memory/blob/63492787cbbea6d03662db63f2d958a6eec8d804/README.md), and [import contract](https://github.com/yukevindai/Experiment-Failure-Memory/blob/63492787cbbea6d03662db63f2d958a6eec8d804/docs/integrations.md).

See [C01 acceptance](tickets/C01.md) for executed checks and remaining ticket boundaries.

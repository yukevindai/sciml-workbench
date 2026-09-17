# Integration inspection and dependency policy

The workbench repository initially contained only its README and license. The following source/API surfaces were inspected before implementation. Exact Git references in `backend/pyproject.toml` are dependencies, not copied source. `backend/constraints.txt` fixes the resolved third-party Python versions and `frontend/package-lock.json` fixes npm dependencies.

| Project | Pinned revision | Public boundary used |
|---|---|---|
| ChemData Auditor / SciSplit | `eff3ed3c43ec71e9ceecabc1f04d1dfb5c91c116` | Package-root `AuditConfig`, `audit`, `SplitConfig`, `split`; documented result serialization and assignments |
| ChemE ML Benchmarks | `db02d8963725a1d406b9b07eb6f4cc3436fbb082` | Package-root `prepare`, `run_baseline`; documented dataset admission card and frozen partition JSON |
| Scientific Evidence Engine | `09f5ec810e8f04bf8d233ec12eb9448342ee5121` | Package-root `ingest_paper`; returned paper record and evidence export files |
| Experiment Failure Memory | `63492787cbbea6d03662db63f2d958a6eec8d804` | Operator CLI `init`, `create-user`; application factory; authenticated `/api/login`, labs/projects, idempotent `/import`, `/logout` JSON API |

## Why this Auditor pin

The Auditor default branch inspected at `038dfd3e301818cba70aff55b43bbb954432ad7a` exposes a different two-way split release. ChemE Benchmarks explicitly depends on `eff3ed3…`, which contains the three-way SciSplit implementation (package version 0.3.0), and checks its source digest before evaluating frozen partitions. The workbench matches that exact upstream requirement. It does not bypass the digest check, edit dependency metadata, or silently substitute another version.

## Dataset admission

The adapter writes the **documented external task-card format**, with byte-identical uploaded CSV and the SciSplit assignments already shown in the interface. It passes this card to `prepare`, then passes the resulting prepared directory to `run_baseline`. It does not call the internal `partition_record`, model, preprocessing, metrics, or source-digest helpers. Configuration discrepancies, unknown units, forbidden features, missing validation rows, group leakage and unaccepted warnings fail through the upstream gate.

A successful audit is not an admission guarantee: the benchmark gate re-audits with its official partition column and explicit unit/feature declarations. Warning acceptance comes only from researcher-provided code-to-justification entries. Target values cannot be used as input features or split criteria under the benchmark protocol.

## Failure Memory

The upstream `create_app` factory hosts the unchanged application in process. The adapter issues HTTP requests through `httpx.ASGITransport`, preserving login, cookies, CSRF checks and permission checks. This avoids a separate service while retaining the supported API boundary. Operator provisioning uses the installed CLI. No imports of its database, authentication internals or record service are used.

A PostgreSQL advisory lock serializes project provisioning/import across workers. Import external IDs are job IDs; repeated delivery of the same job cannot create another upstream record. A user-submitted new job is a new assessment. Failure records identify these as computational runs, not physical experiments. Returned records are immutable workbench snapshots; later edits in the independent Failure Memory application are not automatically synchronized.

## Evidence scope

The evidence view supports PDF ingestion and inspection/download of the original document, page text, hashes and metadata. Digitization/calibration, claim-link editing, OCR and cross-document reasoning are outside this MVP. It does not invent unsupported research-agent endpoints.

## Upgrading

Update pins intentionally. Re-run the actual package integration tests and report replay. For Auditor changes, first obtain a compatible ChemE release rather than disabling its source guard. Publish a new artifact major version for breaking workbench contract changes; never reinterpret stored `1.0` artifacts. Keep upstream results verbatim in their namespaced `result` field and retain package versions and Git revisions.

# SciML Workbench

A unified local web interface for four independent scientific Python projects. Next.js/TypeScript provides the interface; FastAPI orchestrates their public APIs without reimplementing their scientific logic.

**Working MVP:** project → CSV → ChemData Auditor → SciSplit → ChemE baseline → Failure Memory → reproducible report.

For a hosted private workspace, follow the [Render setup walkthrough](docs/render-setup.md).

The [agent-operated release blueprint](sciml-workbench-mvp-design.md) defines the next release's five workstreams and 64 tickets. The [pre-implementation readiness record](docs/implementation-readiness.md) distinguishes existing behavior, pending work, and current validation results. The application currently implements the manual workflow described below.

## Start with Docker Compose

Requires Docker Engine with Compose v2 and network access to GitHub/PyPI/npm during the build. No external model API keys are required.

See [runtime setup and configuration ownership](docs/runtime-setup.md) for clean Python 3.12 installation, startup ordering, the Linux/WSL process boundary, and the reserved agent-worker configuration. Agent execution remains disabled until its provider and scheduler tickets are implemented.

The [scientific worker runtime](docs/scientific-worker.md) describes fixed job deadlines, bounded subprocesses, fenced parent publication and restart behavior implemented in D03.

```bash
cp .env.example .env
# Replace WB_API_TOKEN, WB_EFM_PASSWORD, WB_LOGIN_PASSWORD and POSTGRES_PASSWORD with independent random values.
# Generate each value with: python -c 'import secrets; print(secrets.token_urlsafe(48))'
docker compose up --build -d
```

Open **http://localhost:3000** and sign in with `WB_LOGIN_USERNAME` / `WB_LOGIN_PASSWORD` from your `.env`. Setup applies PostgreSQL migrations and provisions a private Failure Memory service account using the upstream operator CLI. The API, worker, database and files are internal; only the web interface is published, bound to loopback.

This MVP is a **single trusted operator workspace**. All projects are accessible to that operator. The hosted frontend has an HTTP Basic password gate, but does not have separate user accounts or per-user roles. The Render guide keeps the backend private and uses HTTPS for the public password-protected frontend. Inviting independent users requires per-project authorization and proper account management. The independent Failure Memory package retains its own access controls; the workbench service account is server-side only.

## Try the complete workflow

1. **Projects:** create a project and describe its research question.
2. **Dataset audit:** upload `examples/demo.csv`, then explicitly choose **Use bundled synthetic demo declarations** for this fixture. Ordinary uploads start with unknown source metadata and can be audited without a license declaration. Click **Run audit** using the prefilled configuration.
3. **Split designer:** click **Generate partition**. SciSplit produces a 60/20/20 requested train/validation/test split by generated family; actual group-constrained counts are visualized.
4. **Benchmarks:** run the prefilled ridge baseline. All 60 CSV rows are used by the upstream admission and evaluation protocol; the frontend shows test metrics. The complete record includes validation results and model configuration.
5. **Failure memory:** select the run, explain why it was unsuccessful for your research objective, and record uncertainty. For this fixture, a valid example is “The synthetic demonstration cannot establish empirical predictive performance.” This assessment does not change execution status or claim an experimental failure.
6. To exercise an **execution failure**, run another benchmark with `units: {}` in the task card. Upstream admission rejects missing units. Select that failed run and save the reason to Failure Memory.
7. **Evidence:** optionally upload a PDF and title. Scientific Evidence Engine preserves PDF bytes, text-layer extraction, page hashes and metadata. Ingestion is not OCR, figure digitization or automatic claim verification.
8. **Provenance:** inspect linked artifact IDs and configurations.
9. **Reports:** after jobs settle, generate and download the ZIP. It includes original inputs, complete artifacts, nested benchmark bundles with predictions and task cards, source evidence, failure snapshots, schemas, dependency pins, a readable report and SHA-256 manifest.

For other CSVs, change the configuration declarations to match the columns, target, units, provenance and scientific question. The defaults are only for the fixture. The MVP supports upstream **mean and ridge regression** baselines. It does not silently rename features, impute targets, waive audit errors, accept warnings or regenerate a split. Nonempty train/validation/test partitions are mandatory for benchmarking. User datasets are local task cards, not admissions to the public benchmark catalog.

## Local development

Python 3.12, Node 22+, and PostgreSQL 16 are recommended. From the repository root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -c backend/constraints.txt -e 'backend[dev]'
cp .env.example .env
# Set secrets and WB_DATABASE_URL to your PostgreSQL database.
python -m workbench.config
python -m workbench.setup
uvicorn workbench.api:create_app --factory --host 127.0.0.1 --port 8000
```

On Windows, disable Git's CRLF conversion before installing. Git for Windows enables `core.autocrlf` by default, which rewrites the line endings of the upstream sources pip clones from GitHub. The benchmark protocol hashes those source bytes, so a converted checkout fails admission with `Installed ChemData Auditor/SciSplit source differs from the pinned official implementation`. Prefix the install with:

```bash
GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=core.autocrlf GIT_CONFIG_VALUE_0=false GIT_CONFIG_KEY_1=core.eol GIT_CONFIG_VALUE_1=lf pip install -c backend/constraints.txt -e 'backend[dev]'
```

These variables apply only to the clones pip performs; your global Git configuration is unchanged. If the packages are already installed with converted line endings, add `--force-reinstall --no-deps` and the four Git requirements from `backend/pyproject.toml` to reinstall them in place.

In another terminal with the same environment and activated virtualenv:

```bash
python -m workbench.worker
```

For the UI, copy `frontend/.env.example` to `frontend/.env.local`, set the matching backend `WB_API_TOKEN` and independent web login values, then:

```bash
cd frontend
npm ci
npm run dev
```

Use localhost consistently: browser writes are checked against `WB_PUBLIC_ORIGIN`. Nothing uses `NEXT_PUBLIC_` credentials. The Next.js route handler adds the API bearer credential on the server and forwards only allowed headers. Failure Memory and PostgreSQL credentials are not supplied to the frontend container.

### Validate

```bash
pytest backend/tests -q
python scripts/export_schemas.py
git diff --exit-code contracts
npm --prefix frontend run build
cd frontend && npx playwright install chromium && npm run test:e2e
```

The Python tests use temporary SQLite metadata by default, **real pinned upstream packages**, and real Failure Memory HTTP routes via ASGI. For PostgreSQL queue/transaction coverage, set `TEST_DATABASE_URL` to a dedicated test database. Tests create projects but never clear existing data; do not use your research database. Run browser tests against the live API, worker and web processes above. CI runs migrations, the Python suite on PostgreSQL, a frontend production build, browser workflow tests, and a separate Compose startup check.

### Replay an exported report

```bash
python -m workbench.replay /path/to/report.zip /new/output-directory
```

Replay verifies archive structure and source-pin compatibility before comparing audits, exact split assignments, baseline metrics and predictions (rtol=1e-9, atol=1e-12). It writes a structured comparison and never reimports failure records or replays agent text. Use `--verify-only` for structural verification without computation. See [report verification and replay](docs/report-replay.md) for fresh-environment setup, compatibility and limits.

## Architecture and contracts

- [Architecture, trust boundary and limits](docs/architecture.md)
- [Project input intake](docs/intake.md)
- [Durable operation submission](docs/submission.md)
- [Artifact lineage and authenticated downloads](docs/artifact-resolution.md)
- [Frozen project and run report captures](docs/report-capture.md)
- [Inspected public integration points and exact pins](docs/integrations.md)
- [Verified scientific options, public surfaces and limitations (C01)](docs/scientific-public-surface.md)
- [Typed audit integration and acceptance semantics (C02)](docs/audit-integration.md)
- [SciSplit publication and exchange integrity (C03)](docs/split-integrity.md)
- [ChemE baseline admission and complete run bundles (C04)](docs/benchmark-integration.md)
- [PDF ingestion, source bundles and text availability (C05)](docs/evidence-ingestion.md)
- [Failure Memory receipts and scoped live search (C06)](docs/failure-memory-integration.md)
- [Durable external operation journal and reconciliation (B07)](docs/external-operations.md)
- [Fenced result publication and cancellation barrier (B08)](docs/publication.md)
- [Capabilities, bounded reads and receipt projections (B09)](docs/read-projections.md)
- [Scoped typed agent tools and atomic dispatch (E03)](docs/tool-registry.md)
- [Scoped memory, corrections and compatible scientific reuse (E09)](docs/agent-memory-reuse.md)
- [Agent evaluation discipline and final-exposure fences (E12)](docs/agent-evaluation.md)
- [Agent egress and untrusted-content defenses (E14)](docs/agent-egress.md)
- [Operations, backups and troubleshooting](docs/operations.md)
- [Versioned JSON Schemas](contracts/v1/)

No changes are required in any upstream repository. PostgreSQL stores workbench projects, immutable artifact envelopes and the durable job queue. Content-addressed files are stored behind a two-method blob-store interface. Failure Memory keeps its own supported SQLite database; it is deliberately not ported to PostgreSQL or queried by the orchestrator. API and worker are two processes from the same modular backend, not independently deployed scientific microservices.

## Validation status

Subsequent [D01 runtime acceptance](docs/tickets/D01.md) passed a clean Linux Compose build/startup, setup replay, and 118 backend tests with real PostgreSQL (4 SQLite-parameter skips). The following readiness inspection is historical; agent and hosted release acceptance remain separate.

The repository contains eight backend tests and three browser tests. The September 19, 2026 inspection ran the backend suite on the existing Windows/Python 3.13 environment: six passed, the POSIX-only supervisor test failed because Windows lacks `os.killpg`, and the PostgreSQL concurrent-claim test was skipped. Schema generation and frontend typechecking passed. See the [readiness record](docs/implementation-readiness.md#validation-evidence) for build results and checks not run. These results do not establish a clean Python 3.12, PostgreSQL, browser, hosted, or agent-release acceptance run. CI defines PostgreSQL integration/concurrency, browser, and Compose checks; inspect the corresponding run before claiming they pass.

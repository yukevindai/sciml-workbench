# Pre-implementation readiness

Inspected September 19, 2026. This is a repository and planning baseline, not release acceptance or completion of the implementation tickets.

## Synchronized source

- Remote: `https://github.com/yukevindai/sciml-workbench.git`.
- Current branch: `fix/windows-crlf-install-and-python-pin`.
- Fetched all configured remote branches and pruned stale references.
- Merged `origin/main` at `8128559` into the current branch, producing `efea1532fb7edf7ec498ddde2a431eb0a79f6c60` without conflicts. The merge contains the guided forms and Draft 0.3 blueprint, while retaining `bac705e` (Python 3.12 pin and Windows CRLF installation guidance).
- Preserved the existing uncommitted public-testing section in `docs/render-setup.md`. This inspection did not change that edit or any deployment setting.
- No push was performed. Local `main` and the remote fix branch were not advanced; the active branch contains the fetched `origin/main` history.
- Remote branch `origin/claude/brave-clarke-qtk511` has follow-up `d1f61eb`, absent from the synchronized baseline. It addresses target/feature overlap, malformed advanced JSON crashing forms, and inaccessible mobile navigation labels. Review and integrate that commit or equivalent fixes before accepting A01/A03/A05/A10. Its commit message reports earlier checks; those checks are not evidence for this checkout.

## Design and ticket audit

Read the complete [blueprint](../sciml-workbench-mvp-design.md), including all 29 numbered sections and the A–E workstreams. Draft 0.3.1 adds this baseline, corrects the existing report-route description, defines conversation-history reads and revision-bound optional plan acceptance, and makes missing implementation prerequisites explicit.

| Workstream | Tickets | Current starting point |
|---|---:|---|
| A — Frontend and research UX | A01–A12: 12 | Eight guided manual views and three browser tests exist. Research conversations, agent activity, controls, and reconnectable events are new work. |
| B — API and data | B01–B12: 12 | Eight strict 1.0 artifact models, project/artifact/job tables, one migration, scoped routes, and job request keys exist. New contracts, ledgers, fences, and run APIs are pending. |
| C — Scientific integration | C01–C12: 12 | Four pinned integrations and report/replay code exist. Public capability verification, source references, evaluation exposure, stronger replay checks, and automatic outcome semantics remain required. |
| D — Runtime and delivery | D01–D12: 12 | Compose, scientific worker, Render launcher, local storage, CI, and operations guides exist. Durable agent scheduling, coordinated recovery, and fresh hosted/restore evidence are pending. |
| E — Agent orchestration | E01–E16: 16 | No provider adapter, agent runtime, policy engine, typed agent tools, specialist scheduler, or agent evaluation suite is implemented. |

All 64 IDs are unique and assigned to exactly one stage: 24 / 20 / 2 / 11 / 7 tickets. The dependency graph has no unknown references, cycles, or dependencies on a later stage. This structural check does not prove acceptance or complete scientific coverage. No ticket is marked complete by this inspection.

Added prerequisites: B06 → B11; B09 → B07/C12; C08 → C12; C12 → B11; E03 → B08; E06 → E08/E09. These preserve the five stages and ensure consumers wait for run metadata, receipts, exposure controls, fenced publication, and recovery/reuse services.

The IDs are planning identifiers in the blueprint. GitHub CLI could not read issue/PR state because this environment has no authenticated `gh` session; no claim is made that external issues match the plan, and none were created or changed. The historical `SciML_Workbench_Agent_Build_Prompt(1).md` attachment is not tracked here; its contents were not independently reverified.

## Observed gaps to carry into implementation

| Evidence in current source | Consequence and owner |
|---|---|
| `worker.process_job()` executes science inside `db.session.begin()`; `JobRow` has no claim token or fixed deadline. | Short execution/publication transactions and stale-worker fencing are target work, not existing guarantees. B02/B08/D03/D12. |
| The report route checks active jobs before request-key lookup and queues `{}`; `report_bundle()` reads project state when the worker executes. | A queued report has no request-time frozen snapshot; replaying its key can be rejected after newer jobs start. B04/B06/C08. |
| `FailureMemory.save_async()` uses the job ID for imports, but there is no independent durable operation journal or receipt reconciliation service. | Stable IDs alone do not close the lost-response/commit gap. B07/C06/D04/E08. |
| Split publication validates allowed labels through Pydantic but does not check assignment count; the benchmark adapter uses ordinary `zip`. | Explicit cardinality/row-identity validation is needed before publishing or exchanging partitions. C03. |
| `replay()` verifies manifest membership/digests and split assignments, but does not compare reproduced metrics with stored metrics using tolerances. | Numerical equivalence and stronger closure/path/schema checks remain C09 work. Do not label the current replay numerically verified. |
| Artifact list/detail/download routes expose full results; there is no evaluation protocol or exposure ledger. | Apply C12/B09/E12 filtering before agent benchmark selection is enabled. |
| `Source` requires concrete metadata; the audit view initializes bundled synthetic defaults for ordinary uploads. | Dataset 2.0 and explicit demo selection are needed to preserve unknown declarations without inventing metadata. B01/B03/A02. |
| Workflow stages count all project artifacts; selected benchmark runs are project-wide; polling has no stale-project response guard. | Scope progress and selection to the intended dataset/run and reject stale responses. A03–A05/A09/A10. |
| `json()` creates a new request key for each call; pending keys are not retained across refresh. | Backend deduplication exists, but browser retry/reconnect identity still needs A09/A11/A12 integration. |
| `serve.supervise()` calls POSIX `os.killpg`; the native Windows test fails. | D01/D03 must either support Windows process-tree cleanup explicitly or document/test the Linux container/WSL boundary. |
| The local `.venv` is Python 3.13.5; the checked-in runtime pin and CI use 3.12. Installed metadata also differs from constraints for `idna` and `pandas`, and `greenlet` is missing. | Establish a fresh constrained Python 3.12 environment before clean-install acceptance. Preserve the existing environment until deliberately replaced. D01/C01. |
| The existing example is a synthetic 60-row generic regression dataset. | Add the documented electrolyte study, text/scanned evidence cases, predeclared criterion, and a structurally different second dataset for C10/E15/A10. |

## Validation evidence

Application code was not changed during this inspection. Commands were run against the synchronized application baseline; documentation edits are listed separately by Git.

| Check | Observed result |
|---|---|
| Git fetch and merge | Passed; `origin/main` history included; local work preserved. |
| Ticket/stage/dependency inspection | 64 tickets, five stages, no missing/duplicate assignment or dependency cycle; rechecked after dependency edits. |
| `.venv\Scripts\python.exe -m pytest backend/tests -q` | **6 passed, 1 failed, 1 skipped** on Python 3.13.5. Failure: `test_supervisor_stops_peer_when_child_exits`, because Windows lacks `os.killpg`. PostgreSQL competing-worker test skipped without `TEST_DATABASE_URL`. The passing workflow test exercises real upstream integrations and report replay. |
| `.venv\Scripts\python.exe scripts/export_schemas.py` and `git diff --exit-code -- contracts` | Passed; no schema drift in the installed environment. |
| Installed dependency metadata versus committed pins/constraints | All four upstream Git commit IDs match. Third-party differences: `idna` 3.20 versus 3.19, `pandas` 3.0.6 versus 3.0.5, and missing `greenlet` 3.5.6. The existing environment is not a clean constrained-install validation. |
| `npm.cmd ci --no-audit --no-fund` | Passed from the committed lockfile; 33 packages installed. Lockfile unchanged. |
| `npm.cmd run typecheck` | Passed on Node 24.12.0 / npm 11.6.2. CI remains Node 22. |
| `npm.cmd run build` with `NEXT_TELEMETRY_DISABLED=1` | Passed; Next.js 16.3.5 compiled, typechecked, generated pages, and completed production optimization. |
| Browser end-to-end, PostgreSQL concurrency, Compose startup, hosted redeploy, isolated restore, live model evaluation | Not run in this inspection. No Docker command was available on PATH; no fresh live application stack or provider configuration was established. |

The current official references still support persistent checkpoints, restart-aware interrupts, and application-executed client tools: [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence), [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts), and [Claude tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview). Exact SDK/checkpointer pins, account-specific model availability, and prices remain D01/E02 implementation checks; this review does not choose untested versions.

## Starting implementation

Begin Stage 1 with B01, the only dependency-free ticket. Its accepted contracts unlock B02, E01, D01, C01, and A01. Establish the pinned development environment and fold the known UI regressions into their owning tickets before claiming those tickets pass. Subsequent work follows the prerequisite table; Stage 2 scientific automation must consume the recovery and evaluation boundaries.

The blueprint is ready to guide implementation. The current application is **not** the agent release, and the baseline is **not** fully green. Provider/model validation, the Windows runtime decision, clean Python 3.12 checks, PostgreSQL/browser checks, deployment, restore, and live evaluation remain explicit gates. No implementation tickets, public deployment, or paid provider calls were executed by this documentation review.

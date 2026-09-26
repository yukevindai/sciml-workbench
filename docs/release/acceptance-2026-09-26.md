# Acceptance follow-up — September 26, 2026

Candidate: `33f7b0acf179f614ff916abb88aa809d3b4de6bb` on
`fix/release-acceptance-gates`, [PR #5](https://github.com/yukevindai/sciml-workbench/pull/5).

## Changes

- Register the database fixtures required by four scientific adapter suites.
- Preserve PostgreSQL credentials and isolated schema when constructing API pools from the tool fixture.
- Correct Compose's default model/pricing JSON and check resolved JSON in the Compose gate.
- Match the existing error-redaction contract in the failed benchmark test.
- Permit machine-precision K-means inertia roundoff while requiring exact partitions and other diagnostics.
- Wait for persisted event history before outage testing and verify the durable plan-review boundary instead of a transient queue state.

## Evidence

The final candidate's required `integration` and `compose` jobs both succeeded.
GitHub results: **1,081 backend passed / 15 skipped**, **184 strict PostgreSQL
passed**, **35 strict replay/restore passed**, **171 autonomy passed / 2 skipped**,
**88 browser regressions passed**, and **8 separate A10 tests passed**.
Strict PostgreSQL, replay/restore and A10 gates had zero skips.
Local file names below refer to `outputs/acceptance-20260926/`.

| Gate | Result |
|---|---|
| [GitHub candidate CI](https://github.com/yukevindai/sciml-workbench/actions/runs/36248290301) | Both required jobs passed on `33f7b0a` |
| Strict local PostgreSQL | 184 passed, zero skipped; `postgres.json` and `postgres.xml` |
| Strict local replay/restore | 35 passed, zero skipped; `replay-restore.json` and XML |
| Local deterministic autonomy | 171 passed, 2 SQLite variants of PostgreSQL-only tests skipped; `agent-report.json` |
| Local real-stack browser | 8 passed; `a10.xml` (before subsequent test-only timing repairs) |
| Local broader browser | 88 passed, 8 A10 skips (separately run); `browser-regressions.xml` |
| Frontend contracts, boundary and typecheck | Passed |
| Fresh Compose image build/start | Passed on an isolated port-3100 stack |
| Scientific pins, 55 generated schemas, compatibility inventory | Passed |
| Fresh example report | Built, structurally verified and scientifically replayed; `example/verification.json` |
| Local full backend | 1,080 passed, 15 skipped, 1 failed; `backend.xml` |
| Isolated rerun of failed local case | 1 passed; `split-worker-rerun.xml` |

The full local backend failure was
`test_full_excluded_assignments_published_through_worker[sqlite]`:
"Claim expired before publication; retry explicitly." A long session pause
occurred during the run. The failure is retained and is not relabeled as a full
suite pass. Exact individual gate revisions/source digests are in the JSON
receipts; local runs began before the commits were created. Later changes only
repair browser-test timing; GitHub validates the final candidate separately.

Local backend checks used Linux/Python 3.12, PostgreSQL 16.15, constrained
scientific packages and pinned pytest/ReportLab. `images.json` records image IDs.
All newly created test containers, networks and data volumes were removed;
the pre-existing application stack was preserved.

GitHub artifacts for the final candidate:
[integration receipts](https://github.com/yukevindai/sciml-workbench/actions/runs/36248290301/artifacts/10908861920),
[Compose/browser evidence](https://github.com/yukevindai/sciml-workbench/actions/runs/36248290301/artifacts/10908263035),
[agent evaluation](https://github.com/yukevindai/sciml-workbench/actions/runs/36248290301/artifacts/10908309261), and
[release example](https://github.com/yukevindai/sciml-workbench/actions/runs/36248290301/artifacts/10908791891).

Implementation fixes were merged into `main` through PR #5 at `7e30704`.
This documentation follow-up records CI evidence for `33f7b0a`; it does not
change application code or establish hosted deployment acceptance. No candidate
deployment was performed by this acceptance work.

## Open external acceptance

- E02/E15: no Anthropic API key, selected pinned models or approved total spending
  cap is configured. No live model request was made. Deterministic fixtures do
  not measure live model quality or narrative claim support.
- D06/A10: the repository's Render URL still returns HTTP 200 anonymously for
  `/` and `/api/projects`; `/healthz` also returns 200. Only status codes were
  collected (`hosted-anonymous.json`). Hosted private access remains failed.
- D07: local isolated restore passed; no hosted/production backup restore was
  performed. Render administrative access and the target service need confirmation.
- E16/D10: the fresh human-operated live walkthrough and final release acceptance
  remain outstanding. No hosted deployment or release was performed.

Provider configuration/spending and Render target/access remain required before
the external acceptance gates can proceed.

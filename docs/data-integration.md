# Data and API acceptance (B10)

Run from the repository root after installing the constrained backend development
dependencies. Set `TEST_DATABASE_URL` to a dedicated PostgreSQL database whose
test role can create schemas, then run:

```bash
python scripts/check_data_integration.py
```

The runner checks the connection, selects the PostgreSQL parameters from all
13 required suites, and writes `outputs/b10-results.xml`. Missing database
configuration, a non-PostgreSQL URL, missing suite coverage, failures, skips,
expected failures, or unexecuted cases return nonzero. SQLite and unparametrized
tests are explicitly deselected; they cannot satisfy this gate. Test-selection
arguments are not accepted and `PYTEST_ADDOPTS` is cleared for this process.
`--junitxml PATH` and `--basetemp PATH` relocate the evidence and temporary files.
Use a new temporary directory: pytest owns and clears its basetemp directory.

Each database fixture uses a random schema and drops only that schema on teardown.
The shared worker/API fixtures run Alembic upgrades instead of constructing ORM
tables, so publication, intake, reads, and receipt tests exercise deployed DDL.
No application workers should consume the acceptance queues. Failure Memory uses
its real pinned public API with separate temporary persistence; the workbench
does not inspect upstream tables to establish recovery.

| Contract | Suites and committed-state evidence |
|---|---|
| Fresh and populated migrations | `test_metadata`, `test_intake`, `test_budgets`, `test_recovery`: empty upgrade/downgrade, ORM drift, exact legacy payload preservation, retained request identity, unknown reservations and recovery history |
| Lineage and project scope | `test_artifacts`, `test_intake`: typed transitive parents, wrong/missing/foreign inputs, authenticated exact-byte downloads, scoped identical-byte ownership |
| Idempotent submission | `test_submission`, `test_metadata`, `test_data_integration`: concurrent matching requests create one committed job/run; changed payload conflicts; action identity survives restart |
| Atomic snapshots | `test_reports`: selected publication blocks capture until commit; captured terminal job and artifact agree; unrelated work is excluded; replay returns the original capture |
| Fenced publication | `test_publication`: stale/cancelled/expired claims commit no output; injected commit failure rolls back artifacts, provenance and terminal state; late errors cannot overwrite success |
| Bounded projections | `test_projections`: stable pagination, scoped receipt views, claim/credential redaction and evaluation exposure checks |
| Events and run transitions | `test_agent_runs`, `test_agent_scheduler`, `test_data_integration`: competing controls, expected revisions, contiguous persisted sequences/counter, HTTP/SSE reconnect, checkpoint reconciliation, control fences and shared-job detachment |
| Durable resource counters | `test_budgets`, `test_data_integration`: concurrent allowance consumption, unknown usage across API restart and cancellation, settlement replay, reservation counts |
| Receipt recovery | `test_external_operations`, `test_recovery`: real import followed by response loss, original body/ID/attempt counts, receipt reconciliation and rollback/restart without duplicate publication |

The additional `test_data_gate.py` regression exercises the runner with real
pytest pass/skip/xfail/failure reports and rejects absent or SQLite configuration.
Run it through ordinary pytest; synthetic runner probes do not count as database
acceptance.

This gate covers B10 only. It does not establish D09's complete CI, browser,
hosted deployment, live-provider, coordinated restore, or release acceptance.
See [the B10 evidence record](tickets/B10.md) for the tested revision and results.

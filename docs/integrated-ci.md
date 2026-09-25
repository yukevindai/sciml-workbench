# Integrated CI gates

The `Validate workbench` workflow runs on pushes and pull requests. Both
`integration` and `compose` must succeed for D09 acceptance. Repository branch
protection is an operator setting; this change does not configure it.

| Gate | Required evidence and scope |
|---|---|
| Schema drift | Generated JSON Schema/OpenAPI and frontend contracts match source |
| PostgreSQL | B10 runner requires every data/API suite, rejects skipped/xfail cases and unavailable PostgreSQL |
| Scientific integration | C10 verifies installed Git provenance, constraints and public interfaces before all backend regressions; real upstream fixtures are required |
| Replay and restore | Separate strict JUnit gate runs real archive/replay and D07 isolated full-database restore tests, including receipt recovery |
| Agent trajectories | E15 deterministic evaluation retains measured trajectories; no paid model calls |
| Frontend | Contract and private-boundary checks, production build and browser regressions |
| Compose | Fresh image build, repeatable setup, private access and unconfigured agent rejection |
| A10 | Real Compose database/API/scientific worker/web with a scripted coordinator; strict browser JUnit gate |

`scripts/ci_gate.py` writes a receipt before starting a gate and records its exit
status afterward. Receipts include exact Git HEAD, a SHA-256 digest of current
tracked and nonignored untracked file contents (including local changes), UTC
timestamps and CI run/attempt IDs. Environment values and command output are not
copied into receipts. Interrupted receipts remain `incomplete`. Missing receipts
mean the gate did not run; they never count as passing evidence.

For strict gates, an old JUnit report is removed before execution. Missing, empty,
malformed, failed, errored or skipped reports fail the gate even when the command
exits zero. The complete backend run may contain documented SQLite/platform/live
skips; the dedicated PostgreSQL, replay/restore and A10 gates cannot. E15's normal
deterministic report does not establish live model quality.

Artifacts `integration-gate-receipts`, `agent-evaluation` and
`compose-browser-evidence` retain receipts, JUnit and relevant diagnostics even
on failure. A10's synthetic configuration is generated in ignored outputs, uses
placeholder provider credentials and never starts `agent-worker`. Its scientific
worker invokes installed upstream science; scripted model decisions do not
replace scientific calculations. Compose stacks are cleaned up on failure too.

## Separate acceptance evidence

CI success is not hosted, live-provider or production-restore acceptance. For
each separately executed gate, record exact checkout revision and local-change
digest, UTC execution time, command/procedure, environment/runtime versions,
result artifact, outcome, scope and limitations. A historical result at another
revision remains historical. An absent run remains **not run**.

- Live provider: use the bounded opt-in procedure in [autonomy evaluation](autonomy-evaluation.md).
  E15 records revision, diff/source hashes, model outcomes and explicit limits.
- Hosted: follow [external operations](external-operations.md) and
  [Render setup](render-setup.md); record deployed revision and actual HTTPS,
  private access and restart results. Local browser success does not clear D06.
- Restore: follow [backup/restore](backup-restore.md). CI uses small disposable
  synthetic databases and does not prove a production backup's recoverability
  or recovery SLA. Keep a separate revision-specific production drill record.

No external acceptance is silently synthesized by the CI receipt wrapper.

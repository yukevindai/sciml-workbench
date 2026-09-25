# Release handoff — 0.1.0 candidate

This is a reviewable release candidate, **not an accepted hosted or live-agent
release**. D10 assembles the setup, operator, compatibility and reproduction
material. A new operator's live one-request walkthrough, representative model
quality, hosted private access/redeploy/restore, and a successful complete D09 CI
run at the accepted revision remain open.

## Package and compatibility

Use one Git checkout for frontend, backend, contracts and runtime. The generated
[compatibility inventory](release/compatibility.json) records application 0.1.0,
API 1.0.0, all 55 contract file hashes, database migration head 0011, Python 3.12,
Node 22, PostgreSQL 16, exact scientific Git sources, dependency-lock hashes,
LangGraph and checkpointer versions. API, artifact and archive versions are
independent namespaces; equal version strings are not required across them.

From the repository root in the supported Python environment:

```bash
python scripts/release_manifest.py --check
python scripts/check_scientific_surface.py
python scripts/export_schemas.py --check
```

The first command checks the source inventory and rejects mixed frontend/backend
versions, lock drift and mismatched runtime declarations. The other checks prove
installed scientific provenance and source/schema correspondence. None proves a
deployment is running those bytes. Record the full Git SHA, dirty-source digest,
resolved container image IDs/digests and actual package versions when packaging or
deploying. Regenerate the inventory with `python scripts/release_manifest.py`
after intentional compatible source/lock/schema changes, then review its diff.
Do not bump versions merely to disguise a mismatch.

## Reviewer setup and one-request walkthrough

1. Use Linux/Compose and a fresh disposable workspace. Follow
   [runtime setup](runtime-setup.md) for independent secrets, storage ownership,
   migration/setup ordering, private access and manual-mode startup. Keep the
   API and PostgreSQL internal. Native Windows is not a supported worker host.
2. Follow [the agent operator guide](agent-operator-guide.md) sections 1–3 for
   provider/model verification, reviewed bounds/prices, exact input grants and
   the trusted policy installer. Preserve unknowns; placeholder model IDs and
   test policies are not live setup. New attachments require explicit grants.
3. Follow section 4 of that guide exactly. The narrow audit demo requests one
   audit with no training, delegation, report or narrative scientific claims.
   Click **Run research** once with plan review unchecked. Expected evidence is
   one accepted run, persisted plan, one successful scientific audit, completed
   state and resolvable artifact with **zero required intermediate interventions**.
   Refresh must recover that same run. Record every attempt and outcome; an
   incomplete or failed attempt is not replaced by an unreported retry.
4. Save the full source revision, model/bound/price versions, policy revisions,
   synthetic input digest, run/job/artifact IDs, final state, interventions, usage
   and unresolved limitations. Do not store credentials or provider request bodies
   with acceptance artifacts. Use [E15](autonomy-evaluation.md) separately for a
   bounded live pilot; a successful walkthrough alone is not a quality study.

For a **scripted, provider-free rehearsal**, follow [A10](tickets/A10.md) or run
the D09 Compose CI job. It uses real storage/API/scientific execution and tests
reloads, controls and recovery, but substitutes coordinator decisions. Run it
only on a disposable stack: its fixture intentionally restarts services. The
CI helper's `outputs/a10/ci.env` is synthetic, not deployment configuration.

## Example report and scientific reproduction

The checked-in [example archive](../examples/release/report.zip) contains actual
audit, split and baseline outputs from `examples/demo.csv`, with original inputs,
contracts, pins and environment. Its [verification receipt](../examples/release/verification.json)
records the archive/input digests and matched comparisons. This is an offline
synthetic adapter demonstration, not evidence of an autonomous run or useful
scientific generalization. It contains no real research data or provider calls.

In a fresh constrained Python 3.12 environment:

```bash
python -m workbench.replay examples/release/report.zip --verify-only
python -m workbench.replay examples/release/report.zip outputs/reviewer-replay
python scripts/build_example_report.py outputs/reviewer-example
```

Both destinations must be new. Replay requires matching scientific pins and
numerical-package versions; use the archive's `environment.json` and the lock
files to diagnose mismatch. It never installs or substitutes dependencies.
The generator checks actual installed source pins before computing. New example
archives have new IDs/timestamps, so their whole-file digest may differ; scientific
comparisons must match. The archive itself correctly says replay was not run at
export time; the external verification receipt records the subsequent replay.
See [replay semantics and tolerance](report-replay.md). CI builds and retains a
fresh example with its own revision-tagged receipt on every successful gate.

## Recovery walkthrough

For ordinary interruption, use the operator guide's
[recovery table](agent-operator-guide.md#recovery-and-safe-debugging): inspect safe
diagnostics, preserve the request key, restart the matching worker, let persisted
leases/receipts reconcile, and retain paused/input-waiting controls. Check the
recorded run state and committed job/artifact/receipt identities before and after
repeating recovery. No duplicate effect is acceptable. Never clear unknown usage,
budgets, deadlines or checkpoints to force success.

For a full backup drill, use [coordinated backup/restore](backup-restore.md):
stop every writer, capture the exact source revision and configuration reference,
verify the bundle, restore only to a new isolated database and new storage path,
then verify table fingerprints, immutable files, Failure Memory receipts and
scientific replay before resuming eligible work. Keep agents disabled and provider
egress blocked during the drill. Preserve the original stack and data.

The repeatable fixture uses PostgreSQL 16 clients and a **disposable** PostgreSQL
account with CREATEDB. It creates/removes UUID-named test databases:

```bash
python scripts/ci_gate.py --name reviewer-recovery \
  --output outputs/reviewer-recovery.json --junit outputs/reviewer-recovery.xml -- \
  python -m pytest backend/tests/test_backup.py -q \
  --junitxml outputs/reviewer-recovery.xml
```

Set `TEST_BACKUP_DATABASE_URL` privately before running. A missing database or
skipped test fails this strict gate. Record both restore time and time to usable
application recovery; small fixture timings are not a production SLA. Do not
roll back only the application image over a newer database. Restore the matching
code/database/files to an isolated destination and validate before cutover.

## Acceptance and remaining limits

[D10 evidence](tickets/D10.md) and [the local evidence inventory](release/validation.json)
identify what was actually run and its source baseline. Historical A10, B10, C10,
D07, E15 and E16 results retain their original revisions and scopes. They do not
become fresh release acceptance by being linked here.

| Release gate | Current handoff state |
|---|---|
| Compatibility, real synthetic report and local recovery | See D10 measured evidence |
| Complete D09 CI at release revision | Pending; GitHub CLI not authenticated during handoff |
| Fresh human-operated live one-request demonstration | Not run; account/models/bounds/prices and operator required |
| Live model quality and representative claim support | Not run; deterministic trajectories do not establish quality |
| Hosted private access, HTTPS, redeploy recovery | Not revalidated; D06 historical failed access probe remains unresolved |
| Production/hosted coordinated restore | Not run; local synthetic restore is narrower evidence |

Other boundaries: single trusted operator, no multi-user project membership;
manual tools remain available without model credentials; validation-driven adaptive
tuning and generated scientific code are unsupported; RDKit/molecular strategies
are not supplied by the base environment; arbitrary uploaded secrets cannot be
reliably detected; report hashes establish integrity, not authorship; agent prose
and provider calls are not deterministic scientific replay. See the operator,
evaluation, replay and backup guides for the full operational contracts.

Handoff acceptance requires the reviewer to attach revision-specific results for
the open gates or explicitly retain them as blockers. This document does not
publish a release, deploy services or assert branch protection is configured.

# Coordinated backup and isolated restore (D07)

The supported procedure is an offline maintenance window on Linux with PostgreSQL
16. Use the same reviewed application revision for capture and initial restore.
The backend Docker image includes PostgreSQL 16 `pg_dump` and `pg_restore` clients;
native installations must provide matching clients on `PATH`. The commands use
the connection URL from a named environment variable, never a command-line secret.
No provider calls, setup, migrations or workers are launched by backup/restore.

## What is preserved

`python -m workbench.backup create` produces a new private directory containing:

- `metadata.dump`: a full custom-format PostgreSQL database dump, including all
  application tables, checkpoints, checkpoint blobs/writes, leases, policies,
  reservations, usage, exposures, publication and external-operation journals.
- `data/`: the entire stopped storage root, including immutable blobs, upstream
  SQLite files/sidecars, dotfiles and provisioning state. Nothing is garbage-collected.
- `manifest.json`: backup ID/time, application SHA, migration revisions, PostgreSQL
  major version, configuration reference, capture duration, file sizes/SHA-256 and
  every user table's row count/content fingerprint plus sequence values.

Keep a separate versioned password-manager/configuration record with backend/frontend
environment, pinned model IDs and reviewed bounds/prices, independent secret values,
Failure Memory username/password, resource identities, region and storage mount.
Pass only that record's non-secret name/version with `--configuration-ref`; do not
copy credentials into the manifest. Cluster roles, hosting resources, TLS keys and
database/server settings are outside `pg_dump`; provision the restore database/user
separately and recover these from the configuration record. [PostgreSQL pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html).

Bundles contain private research and upstream authentication data. Store them in
operator-restricted encrypted backup storage, separately from the production disk,
and retain their manifest with the matching pair. Checksums detect corruption and
mix-ups; they do not authenticate a maliciously replaced bundle. Restore only trusted
backups, because PostgreSQL dumps contain executable database definitions.

## Capture with all writers stopped

1. Stop new submissions. Let accepted work settle where possible; retain unknown
   provider usage/reservations and uncertain import journals rather than assuming
   they failed. Record unresolved operations and currently eligible/paused runs.
2. Stop the frontend, API, scientific worker, agent worker, setup tasks and any
   separate upstream writer. Confirm shutdown has completed, including task trees.
   PostgreSQL stays available. `--writers-stopped` is an operator attestation, not
   a service-control switch. Before/after content checks detect changes but cannot
   fence a writer that was left running.
3. Capture to a new destination outside the source volume. Do not reuse a backup
   directory. Keep all writers stopped until capture and verification succeed.

Example for a Linux Compose operator (repository root, configured `.env`):

```bash
docker compose --profile agents stop web api worker agent-worker
mkdir -m 700 backups
revision=$(git rev-parse HEAD)
docker compose run --rm --no-deps --user 0 -v "$PWD/backups:/backup" api \
  python -m workbench.backup create /backup/pilot-001 \
  --storage-root /data --revision "$revision" \
  --configuration-ref 'workbench-config/version-1' --writers-stopped
docker compose run --rm --no-deps --user 0 -v "$PWD/backups:/backup:ro" api \
  python -m workbench.backup verify /backup/pilot-001
```

Use a unique backup name and record the exact SHA even for a native deployment.
The helper overrides the API image's command; it does not start the API or workers.
The root helper may be required to read the complete volume; protect and transfer
the resulting root-owned bundle appropriately. Do not run `setup` during capture.
Resume the original deployment only after the bundle verifies and is transferred
to its protected backup destination.

Capture refuses missing upstream/provisioning files, unmigrated/checkpoint-less
metadata, links/reparse points, devices, existing destinations and changing sources.
An interrupted attempt leaves a private `.partial-*` directory for investigation;
it is not a completed backup. No command removes or overwrites previous backups.

## Render maintenance with the disk still mounted

Use a reviewed revision that includes `workbench.maintenance` and the backup tool.
Record the original backend start command and secret/configuration references.
Disable auto-deploy and temporarily change the private backend start command from
`python -m workbench.serve` to `python -m workbench.maintenance`; redeploy. This
replacement serves only constant `/health` liveness and returns `503` for workspace
requests. It imports no database, migration, scientific or agent runtime. Confirm
the old deployment and all its children have stopped, and stop any external writer.
Keep the frontend password gate enabled. This is planned downtime.

In the backend shell, confirm `pg_dump --version` and `pg_restore --version` are 16,
then use `workbench.backup create` with `--storage-root /var/data`. Choose an output
directory outside `/var/data`; ephemeral space must fit the bundle. Download the
completed bundle securely and verify it on the operator host before restoring the
normal start command. The runtime disk is unavailable to Render pre-deploy/one-off
jobs, so those cannot capture this bundle. [Render disk restrictions](https://render.com/docs/disks).
Do not suspend/delete the service or replace its disk as a backup mechanism.

Native Render deployments need PostgreSQL client tools provisioned separately;
if they are unavailable, remain in maintenance until a compatible operator runtime
is ready. Do not infer readiness from the API health response. Actual Render
maintenance/restore has not been exercised by the local acceptance fixture, and
D06's failed live private-access check remains a separate release blocker.

## Restore to an isolated destination

Create a new empty PostgreSQL database of the same major version with an owner
account and a new storage parent directory. Use a separate network/deployment and
credentials; do not point restored workers at the original database or disk. Keep
agents disabled and block paid provider egress during the drill. Initially recover
the original Failure Memory credential from its configuration reference; a new
`WB_EFM_PASSWORD` value alone does not rotate the restored upstream account.

With the matching application revision installed and `RESTORE_DATABASE_URL` set
privately in the environment:

```bash
python -m workbench.backup verify /backup/pilot-001
python -m workbench.backup restore /backup/pilot-001 \
  --database-env RESTORE_DATABASE_URL --storage-root /restore/data \
  --revision RECORDED_40_CHARACTER_SHA --writers-stopped
```

`/restore` must already exist; `/restore/data` must not. The target database must
be dedicated and empty, including user relations/functions/schemas. The restore
checks the full bundle before touching PostgreSQL, stages and verifies files, then
uses `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges`.
All user-table fingerprints and sequences must match before the restored directory
is published. Restore output includes the backup ID and measured `restore_seconds`.
Point the isolated runtime's `WB_STORAGE_ROOT` at that restored directory. For a new
Render disk mounted at `/var/data`, restore into a new child such as `/var/data/restored`
and use that child as the storage root; the existing mount itself is not a new target.
The target account owns restored database objects. [PostgreSQL pg_restore](https://www.postgresql.org/docs/16/app-pgrestore.html).

Nothing starts automatically. Give the restored directory/files to the runtime OS
user (Docker UID 10001) before startup; root-run copying does not preserve source
ownership. If any stage fails, keep the destination offline. A failed database
restore rolls back its transaction; failure after that transaction can leave a
populated isolated database and staged files. Preserve these for investigation and
retry with a fresh destination. There is no cross-filesystem/database atomic commit.

## Application acceptance and recovery time

Record backup ID, source SHA/migration, fixture size, start/end timestamps and each
outcome. The CLI's restore duration measures copying/restoring/verifying; also record
time until application checks and eligible work recovery finish.

1. Confirm restored project/artifact counts, budgets, reservations, exposure history,
   action/job/operation receipts and checkpoints match the backup manifest. The CLI
   compares every table, not only selected ledger counts.
2. Resolve original bytes by digest. Download a representative report and run
   `python -m workbench.replay report.zip --verify-only`, then scientific replay to
   a new directory using the [matching pinned environment](report-replay.md).
3. Access Failure Memory through its supported API with the restored credentials;
   check the original project and record IDs. Do not query or edit upstream tables.
4. In the isolated fixture, resume eligible work with a deterministic provider.
   Retain paused/input-waiting controls. Respect original leases/deadlines; never
   reset them or erase unknown usage to force progress. Check that a published report
   is reconciled without another publication, and a lost import response reconciles
   to its original external record without creating a second import.
5. Repeat the recovery step and verify no further committed effect. Record observed
   total recovery time and remaining limitations. Reconcile actual unknown model
   usage under the existing policy; restore itself grants no retry authority.

The operator chooses backup frequency, retention and acceptable downtime/data loss.
Fixture timings do not define a production SLA. A live source may continue after a
drill snapshot, so an isolated drill must never be promoted over newer production
data without a separate cutover decision and final coordinated capture.

## Reproducible acceptance

Install the constrained backend development dependencies and PostgreSQL 16 clients.
Set `TEST_BACKUP_DATABASE_URL` to a disposable PostgreSQL server account with
`CREATEDB`. Run:

```bash
python -m pytest backend/tests/test_backup.py -q -s
```

The tests create uniquely named source/restore databases and remove only those
databases afterward. They use real PostgreSQL dumps/checkpoints, installed scientific
audit/report/replay code, and the real local Failure Memory public API. Model outputs
are deterministic; no paid provider or production database is involved. CI supplies
this separate opt-in URL so required restore checks cannot silently skip there.

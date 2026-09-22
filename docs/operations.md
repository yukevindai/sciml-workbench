# Operations

## Starting and updating

`docker compose up --build -d` builds pinned dependencies, waits for PostgreSQL, runs migrations/provisioning, then starts the API, worker and Next.js. Never run multiple setup containers concurrently. Named volumes preserve files and metadata across restarts. `docker compose down` preserves volumes; adding `-v` irreversibly removes them.

For code updates, back up first and stop `web api worker` (plus `agent-worker` if explicitly started) before running migrations; old workers must not run alongside a metadata upgrade. Follow the [runtime setup procedure](runtime-setup.md). Keep library pins and resolved constraints together. Do not change the Auditor revision independently of ChemE Benchmarks.

## Backup and restore

Use the [coordinated backup and isolated restore procedure](backup-restore.md).
`python -m workbench.backup` creates and verifies a matched full PostgreSQL dump,
entire data directory and versioned manifest. Stop **all** writers, including the
agent worker and any standalone Failure Memory process. Pausing runs alone does
not stop accepted scientific jobs or upstream writes. Restore only to a new empty
database and new data directory; the command never overwrites an existing target
or automatically starts services.

The bundle includes checkpoints, ledgers, blobs, `failure-memory.sqlite`, SQLite
sidecars and `.efm-provisioned`. It records a non-secret reference to the separately
secured configuration/version. A PostgreSQL dump alone, a disk snapshot alone or
Failure Memory's supported standalone backup CLI is not a complete workbench backup.

## Credentials

Generate `.env` secrets independently and keep it out of Git. Rotating the API token requires restarting both web and backend services. Changing `WB_EFM_PASSWORD` alone does not change the upstream account. Use the installed Failure Memory `reset-password` operator command with `--password-env WB_EFM_PASSWORD` and then restart workers. If setup crashes after creating an account but before the provisioning marker, verify/reset the account using the operator CLI, then restore the marker; do not alter upstream tables.

The Failure Memory CLI can serve the same stopped SQLite store independently for inspection using its normal secure deployment instructions. Avoid editing it independently during a workbench backup or expecting edits to rewrite previously exported workbench snapshots.

## Troubleshooting

Use the [private diagnostics command](diagnostics.md) to correlate run/action/job
IDs, distinguish operator waits from expired leases, inspect independent worker and
model observations, and check queue age, unknown usage and resource alerts. It is
read-only and does not treat public API health as evidence of worker/model health.

| Symptom | Check |
|---|---|
| Backend unavailable | `docker compose ps` and `docker compose logs api setup postgres`; setup must complete and PostgreSQL must be healthy. |
| Cross-origin request rejected | Use the exact URL in `WB_PUBLIC_ORIGIN`, including scheme and port; localhost and 127.0.0.1 are different origins. |
| Jobs remain queued | Start the worker; inspect `docker compose logs worker`. No request process executes scientific jobs. |
| Worker interrupted/deadline error | Investigate data size/configuration and the [worker runtime](scientific-worker.md). There are no silent retries or renewed deadlines. Before retrying Failure Memory, inspect the upstream outcome: an import may have committed before interruption. |
| Benchmark admission failed | Inspect the returned error and audit. Supply correct units, features, independence groups and three nonempty partitions; never disable upstream guards. |
| Source differs from pinned implementation | Reinstall exact pyproject Git references and constraints; do not modify the installed Auditor sources. |
| Failure Memory request failed | Check account provisioning and password rotation. Upstream credentials and raw HTTP responses are intentionally excluded from errors. |
| Report cannot export | Wait for queued/running jobs. Check storage capacity and file integrity. |
| `INTEGRITY_FAILED` while reading/reusing a blob | Missing, corrupt or non-regular stored bytes were rejected. Preserve the affected volume for investigation and recover from a verified coordinated backup; uploading identical bytes does not overwrite the existing entry. |
| `STORAGE_UNAVAILABLE` while publishing | Check free space, volume permissions, hard-link support and directory synchronization. A complete unreferenced object may remain after an error; do not delete digest paths as rollback compensation. See the [storage contract](storage.md). |

## Scope

This implementation is a single-operator MVP with an optional private Render deployment, not a multi-tenant public service. See `render-setup.md` for the hosted access gate and configuration. Production sharing needs identity, project-level authorization across all routes, HTTPS, resource quotas, operational telemetry and a security review. Scientific interpretation remains the researcher's responsibility. Audit findings and group splits do not prove independence that was never documented in the input.

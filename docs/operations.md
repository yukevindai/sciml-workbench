# Operations

## Starting and updating

`docker compose up --build -d` builds pinned dependencies, waits for PostgreSQL, runs migrations/provisioning, then starts the API, worker and Next.js. Never run multiple setup containers concurrently. Named volumes preserve files and metadata across restarts. `docker compose down` preserves volumes; adding `-v` irreversibly removes them.

For code updates, back up first, rebuild, and allow the setup service to apply Alembic migrations. Keep library pins and resolved constraints together. Do not change the Auditor revision independently of ChemE Benchmarks.

## Backup and restore

For a consistent small-workspace backup, stop writes and the worker first:

```bash
docker compose stop web api worker
docker compose exec -T postgres pg_dump -U workbench -d workbench > metadata.sql
# Save the workbench-data named volume using your Docker volume backup tooling.
# It contains blobs/, failure-memory.sqlite and the provisioning marker.
```

Back up the entire stopped file volume, not just blobs. Restore PostgreSQL and the matching file volume together before starting the app. For Failure Memory-only operator backups, use its `failure-memory --database /data/failure-memory.sqlite backup /data/backup.sqlite` CLI through a backend container. This does not back up the workbench's PostgreSQL records or blobs.

## Credentials

Generate `.env` secrets independently and keep it out of Git. Rotating the API token requires restarting both web and backend services. Changing `WB_EFM_PASSWORD` alone does not change the upstream account. Use the installed Failure Memory `reset-password` operator command with `--password-env WB_EFM_PASSWORD` and then restart workers. If setup crashes after creating an account but before the provisioning marker, verify/reset the account using the operator CLI, then restore the marker; do not alter upstream tables.

The Failure Memory CLI can serve the same stopped SQLite store independently for inspection using its normal secure deployment instructions. Avoid editing it independently during a workbench backup or expecting edits to rewrite previously exported workbench snapshots.

## Troubleshooting

| Symptom | Check |
|---|---|
| Backend unavailable | `docker compose ps` and `docker compose logs api setup postgres`; setup must complete and PostgreSQL must be healthy. |
| Cross-origin request rejected | Use the exact URL in `WB_PUBLIC_ORIGIN`, including scheme and port; localhost and 127.0.0.1 are different origins. |
| Jobs remain queued | Start the worker; inspect `docker compose logs worker`. No request process executes scientific jobs. |
| Worker interrupted/deadline error | Investigate data size/configuration, then explicitly submit a new request. There are no silent retries. |
| Benchmark admission failed | Inspect the returned error and audit. Supply correct units, features, independence groups and three nonempty partitions; never disable upstream guards. |
| Source differs from pinned implementation | Reinstall exact pyproject Git references and constraints; do not modify the installed Auditor sources. |
| Failure Memory request failed | Check account provisioning and password rotation. Upstream credentials and raw HTTP responses are intentionally excluded from errors. |
| Report cannot export | Wait for queued/running jobs. Check storage capacity and file integrity. |

## Scope

This implementation is a local MVP, not a multi-tenant public service. Production sharing needs identity, project-level authorization across all routes, HTTPS, resource quotas, operational telemetry and a security review. Scientific interpretation remains the researcher's responsibility. Audit findings and group splits do not prove independence that was never documented in the input.

# Scientific metadata and migrations

B11 adds application migration `0006` and separate explicit runtime checkpoint setup. See [agent persistence](agent-persistence.md) for the maintenance commands, retained ledgers and restore guarantees.

B02 adds database invariants and claim/publication primitives while retaining the existing projects, artifacts, jobs, and four job states. The public job response remains the B01 legacy projection; internal claim tokens, worker identities, request digests, and payloads are not exposed by that response. No new environment variable or scientific artifact version is introduced.

## Upgrade procedure

1. Take the coordinated database/storage backup described in the [operations guide](operations.md).
2. Stop API submission and all scientific workers, including their child processes. Revision 0002 requires a maintenance window; it is not a rolling upgrade alongside old writers.
3. Deploy the matching application code and run `alembic -c backend/alembic.ini upgrade head` from the repository root with the existing backend configuration. On Windows, use `.venv\Scripts\python.exe -m alembic -c backend/alembic.ini upgrade head`.
4. Verify `alembic -c backend/alembic.ini current` reports `0004`, inspect interrupted attempts, then restart the services. A retry is an explicitly authorized new job with a new request key, not a mutation or automatic replay of the old attempt.

Revision 0004 adds `external_operations` and `external_projects` for the [B07 journal](external-operations.md). It preserves existing records, freezes import identities/destinations, and protects confirmed receipts and artifact links. Downgrade refuses to discard populated journals or bindings. Apply it before starting the new workers; no historical external outcome is inferred or backfilled.

Revision 0003 adds `research_materials` for [B03 attachment intake](intake.md). It does not rewrite existing records. Bindings have project-scoped request-key uniqueness and dataset foreign keys, byte-digest/type constraints, and database update/delete guards. Apply it before running the new API or report worker. Downgrade to 0002 is permitted only when the material table is empty; populated bindings require a coordinated backup restore or forward migration.

The migration validates existing artifact identity/project/kind alignment and job project/result references before changing tables. Inconsistent legacy rows abort the migration with a fixed diagnostic; they are not silently reassigned or repaired. PostgreSQL runs the migration transactionally. SQLite uses an explicit transaction for batch table rebuilding, checks foreign keys before commit, and restores the connection's foreign-key setting afterward.

Artifact payloads and job request payloads are preserved as stored, including their JSON text formatting. Existing projects and artifact IDs retain their identity. Queued jobs remain queued; completed jobs retain their result and outcome. Existing running jobs become failed with `WORKER_INTERRUPTED` because their executions predate fencing. Their request, start time, and any existing result reference remain recorded. No worker identity or execution deadline is invented for those attempts.

Only request digests are backfilled. Other new metadata is null or the unclaimed token `0`. An empty job table can downgrade to 0001; a database containing jobs refuses that downgrade because it would discard recorded identity/fencing information. For a populated rollback, use the coordinated pre-upgrade backup and compatible code, or a separately reviewed forward migration.

## Database invariants

- `(project_id, request_key)` remains unique across job kinds. `(project_id, id)` keys support composite foreign keys.
- Non-null results reference an artifact in the same project. Retry references point to another existing job in the same project; self-retries are rejected.
- Artifact JSON identity, project, and kind must match their relational columns. Database triggers prevent changing a published artifact's stored fields.
- An accepted job's ID, project, key, operation kind, payload, digest, retry origin, and creation time are immutable, including through SQL updates outside the ORM.
- Claim tokens cannot decrease. Claimed worker identity, start time, and deadline cannot be changed. Running jobs require a complete claim; terminal jobs cannot be overwritten or requeued. Operational fencing can advance a running claim's token while recording failure.
- Queue and expiry indexes support bounded claim lookups. SQLite connections created by `Database` enable foreign-key enforcement; PostgreSQL remains the concurrency acceptance environment.

JSON parent references and scientific lineage still require application validation. These relational constraints do not replace the B05 publication-lineage work. Deletion/retention policy, external-operation receipts, and agent ledgers remain separate work; this ticket adds no delete endpoint.

## Request identity

Canonical identity v1 hashes UTF-8 JSON containing `identity_version: 1`, the operation `kind`, and the accepted `payload`, using sorted object keys, compact separators, unescaped Unicode, and no non-finite numbers. Arrays retain their order. Numeric representations such as `1` and `1.0` remain distinct; callers should submit the typed, default-expanded request as the current API does. Project/key uniqueness is enforced separately, and a replay must also retain its retry origin.

`submit_job()` is the persistence primitive: it uses a savepoint plus the unique index to arbitrate concurrent inserts under PostgreSQL READ COMMITTED isolation. Compatible replays return the committed original; incompatible requests return an idempotency conflict. Unrelated integrity violations are not mislabeled as successful replays. B04's [shared submission service](submission.md) owns the transaction, project barrier, typed normalization, scoped admission and replay-before-busy ordering for all HTTP operations and future tool callers. B06 stores [frozen report captures](report-capture.md) inside the immutable accepted job payload; no additional migration is required.

The runtime encoder and revision-0002 backfill algorithm have the same fixed identity format. A future identity algorithm needs an explicit migration/version policy; do not recompute stored digests in place. The application computes digests; the database protects accepted values from updates rather than independently reimplementing the Python encoder.

## Claim and publication interfaces

`workbench.job_metadata` exposes internal helpers:

| Helper | Transaction boundary and purpose |
|---|---|
| `submit_job(session, ...)` | Persistence primitive in a caller-owned transaction; external callers use `SubmissionService`. |
| `claim_next(db, timeout_seconds, worker_id)` | Own short transaction; uses `FOR UPDATE SKIP LOCKED` on PostgreSQL, records database start/deadline, increments the token, returns an immutable `JobClaim`. |
| `claim_is_current(session, claim)` | Read-only authority/deadline check before execution; does not substitute for publication fencing. |
| `lock_claim(session, claim)` | Acquires the scientific job lock, then checks the current token, owner, running state, and database time before pending artifacts flush. |
| `finish_claim(session, claim, ...)` | Caller-owned artifact/provenance transaction; locks, flushes, rechecks deadline, and conditionally records the terminal result. A `StaleClaim` must roll back that entire transaction. |
| `fail_claim(db, claim, ...)` | Own conditional terminal transaction; advances the fence and cannot overwrite a newer claim or completed outcome. |

Deadlines are fixed when work is claimed. Queue time does not consume the allowance, changing the configured timeout does not extend an existing attempt, and a new authorized attempt gets its own deadline. Expired claims are terminalized using their saved deadline; they are never silently reclaimed for another execution.

The D03 worker carries these claims through transaction-free subprocess execution. The [B08 publication service](publication.md) verifies output bytes outside metadata transactions, then atomically publishes under project-before-job locks and final claim/deadline checks. Its trusted cancellation primitive uses the existing terminal-state and token guards; B08 adds no migration. B11/D12 retain run ownership and control generations.

## Reproducing acceptance checks

```powershell
.venv\Scripts\python.exe -m pytest backend/tests/test_metadata.py -q
.venv\Scripts\python.exe -m pytest backend/tests/test_workflow.py backend/tests/test_contracts.py -q
.venv\Scripts\python.exe scripts/export_schemas.py --check
```

Set `TEST_DATABASE_URL` to a disposable PostgreSQL database to enable real races. Metadata tests create uniquely named `b02_<uuid>` schemas and drop only those schemas on completion. Workflow tests use the configured database's default schema and should also receive a disposable database. Without PostgreSQL, skipped cases are not concurrency evidence. CI already provides PostgreSQL and runs the full backend test directory.

Migration tests compare stored payload text before/after upgrade and compare the migrated schema to ORM metadata. Race tests inspect committed row counts, claim tokens, artifact visibility, and result ownership rather than relying on response codes alone.

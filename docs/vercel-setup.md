# Vercel deployment and Render migration

Deploy **two Vercel projects from the same Git revision**: Next.js for the web interface and FastAPI for the API and scheduled execution. Use managed PostgreSQL from Vercel Marketplace, such as Neon. All application compute runs on Vercel; PostgreSQL is a managed database partner. There is no Render service, persistent disk, Redis, or external worker requirement in this deployment mode.

This configuration targets **Vercel Hobby with Fluid Compute**. It does not require Pro or Enterprise. Vercel Queues (currently beta, available on all plans) starts work when requests are submitted and delivers durable continuations without a browser tab staying open. Hobby includes a queue allowance; function, database and model quotas still apply. No paid model key is needed for the manual MVP. This is not a promise of unlimited free compute or free model usage.

Functions stay within Hobby's **300-second** limit; scientific tasks have a **240-second** deadline. Large scientific dependencies may require Vercel's large-function beta; `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` is included in the backend template. Successful local tests do not prove the account's bundle, subscriber discovery, subprocess, streaming, or runtime behavior: complete the hosted checks below before moving research data.

## What changes on Vercel

| Component | Deployment |
|---|---|
| Web interface | Next.js project, root `frontend`, Node 22 |
| API and scientific libraries | FastAPI project, repository root, Python 3.12; `app.py` exports the app |
| Durable job delivery | Private Vercel Queues subscriber `queue_consumer.execute`, registered in root `pyproject.toml` |
| Scientific execution | One supervised job per queue invocation |
| Agent coordination | One durable advance per invocation; leases ≤180 seconds, provider timeouts ≤20 seconds |
| Recovery | One bounded recovery attempt per invocation |
| Missed-delivery catch-up | One daily authenticated `/internal/cron/dispatch` call, allowed on Hobby |
| Metadata, leases, checkpoints, artifacts | Managed PostgreSQL |
| Upload and report bytes | SHA-256-addressed PostgreSQL `stored_blobs` rows |
| Failure Memory | Upstream SQLite state, stored as an opaque PostgreSQL snapshot after each operation |
| Temporary scientific workspaces | `/tmp/sciml-workbench`; never authoritative storage |

After a successful API write commits, the API awaits a durable queue wakeup before returning. The subscriber processes scientific work, agent coordination and recovery in separate invocations, then checks PostgreSQL for remaining work. It sends the next durable message before acknowledging the current delivery and stops when the workspace has no runnable or recovering work. Busy lanes defer delivery; existing claims and publication fences prevent duplicate results. Queue messages contain only a version and scheduling phase, never research content or credentials.

A failed queue send returns a sanitized 503 while preserving the committed work. Retry job submissions using the same idempotency key. A process can still die between the database commit and send: the daily catch-up closes this delivery gap, and any later successful API write also starts a sweep. Hobby's daily cron is not a prompt execution guarantee. The dashboard can manually invoke the daily dispatcher when needed. Do not deploy many staggered daily cron entries to imitate per-minute scheduling.

The queue consumer has concurrency one for this single-operator MVP. A killed invocation leaves durable claims and recovery state; redelivery and the next sweep resume eligible work. An uncertain model request is **not** silently replayed. A failed delivery gets at most eight attempts; durable metadata survives queue-message expiration and is found by the daily catch-up. New requests usually dispatch promptly, subject to platform delivery and backlog. There is no persistent worker daemon, browser heartbeat, or work launched after sending an HTTP response.

Failure Memory still runs its pinned public app and CLI. A transaction lock serializes access, restores a snapshot into a temporary SQLite file, then commits a verified snapshot before returning a receipt. SQLite's public backup API includes committed WAL pages. The integration does not depend on private upstream tables. Trusted scientific subprocesses receive the database storage credential through a private temporary input file in this mode; API and model credentials are still excluded, and credentials never reach browser code. This whole-database snapshot approach suits a small, single-operator workspace; larger workloads need a separately designed storage adapter. PostgreSQL blob and snapshot bytes count toward database storage/transfer quotas.


## 1. Prepare the database and secrets

1. Connect the GitHub repository to Vercel and create a managed PostgreSQL database in the backend's region. Retain the existing supported PostgreSQL major (16) for a migration/restore drill; do not combine a hosting migration with a database-major upgrade.
2. Get its **direct PostgreSQL connection URL**, with TLS. Do not use a transaction-pooling endpoint: the scheduler's session advisory locks require a dedicated server connection. The backend disables persistent application pooling in Vercel mode. Set database connection limits appropriate to your plan.
3. Generate independent random secrets locally:

   ```bash
   python -c 'import secrets; print(secrets.token_urlsafe(48))'
   ```

4. Use [the backend environment template](../.env.vercel.example) for backend values and [the frontend template](../frontend/.env.vercel.example) for frontend values. Replace every placeholder. Keep `WB_SCHEDULER_ENABLED=0` until setup or migration is complete. Agents stay disabled until their provider, bounds and policies have been reviewed.

No credentials use `NEXT_PUBLIC_`. Only the API bearer token and web login credentials belong in the Next.js server. Database credentials, Failure Memory credentials, `CRON_SECRET`, and model keys belong only in the backend. Set these in Vercel's environment settings; do not commit populated environment files.

## 2. Create the backend project

Import `yukevindai/sciml-workbench` as, for example, `sciml-workbench-api`.

| Setting | Value |
|---|---|
| Root directory | Repository root (leave blank) |
| Framework preset | FastAPI |
| Production branch | `main`, once this migration is merged |
| Runtime | Python 3.12, Fluid Compute enabled |
| Build/install/start overrides | Leave unset; use the framework, root `pyproject.toml` and committed `uv.lock` |
| Environment | Root `.env.vercel.example` values, Production scope |
| Region | Same region as the database |

Do not configure `workbench.serve`, `workbench.worker`, or `workbench.agent_worker` as a persistent start command. `vercel.json` sets a 300-second function limit and one daily catch-up cron. Root `pyproject.toml` declares the local backend dependency, mirrors its tested constraints and registers the private queue subscriber; it must remain in the backend project root. The pinned `vercel-queue` Python SDK uses Vercel OIDC automatically on deployed functions, so no queue API key is required. Never run setup during import, a build, or every cold start. Vercel prioritizes `pyproject.toml` over `requirements.txt`, so the root manifest must retain its `[project]` table. When dependencies change, update the root constraint list from `backend/constraints.txt`, run `uv lock` with Python 3.12, and commit `uv.lock`. The `vercel-packaging` CI job verifies this deployment installation path independently of the Compose/pip path.

For the first deployment keep scheduling disabled, and do not direct users to the API. Run setup from a trusted Python 3.12 checkout with the backend variables in its root `.env`:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -c backend/constraints.txt -e 'backend[dev]'
python -m workbench.config
python -m workbench.setup
```

Setup applies migration **0012**, creates the LangGraph checkpoint tables, and provisions Failure Memory through the upstream CLI into PostgreSQL. Run one setup process, with other writers stopped. For an existing Render workspace, follow section 5 **instead of provisioning a fresh Failure Memory snapshot first**.

After setup, set `WB_SCHEDULER_ENABLED=1` and redeploy. Verify the private `workbench-wake-v1` queue consumer and one daily cron appear in the backend dashboard. Vercel supplies `Authorization: Bearer <CRON_SECRET>` to the daily catch-up request; queue consumers use platform authentication and have no public URL. A manual request to a cron path without that header must return 401. Create a project and confirm the queue wakes and settles; use the daily cron's dashboard invocation to dispatch work restored during migration.

The API is internet reachable and enforces bearer authentication on research routes. It is no longer a private Render network service. Keep Vercel preview protection enabled. If backend production Deployment Protection is enabled, configure an automation bypass for the frontend as `WB_VERCEL_PROTECTION_BYPASS`, and verify the daily catch-up request also reaches the app. Private queue deliveries do not use the frontend proxy. Alternatively, leave backend production platform protection off and use the app's bearer and cron authentication. The frontend `/healthz` is a constant public health response; the backend `/health` checks database connectivity without exposing research data.

## 3. Create the frontend project

Import the same repository again as, for example, `sciml-workbench`.

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Framework preset | Next.js |
| Node.js | 22.x |
| Install / build | `npm ci` / `npm run build` |
| Production branch | The same branch/revision as the backend |
| `WB_API_URL` | Backend production HTTPS origin, **without** `/api/v1` |
| `WB_API_TOKEN` | Same token as the backend, server-side only |
| `WB_PUBLIC_ORIGIN` | Exact frontend production HTTPS origin, without a trailing slash |
| Login variables | Independent username/password from the frontend template |
| `WB_MAX_UPLOAD_BYTES` | `4194304` |

Keep the frontend's monorepo option to include source files outside its root enabled: contract generation/checks use the repository's `contracts` directory. No database integration or model credentials should be connected to this project. Production always requires the operator login. When assigning a custom domain, update `WB_PUBLIC_ORIGIN` to that origin and redeploy.

The compact **Admin** control on the right of the public navigation opens the operator login form. Set `WB_LOGIN_USERNAME` (for example, `kevin`) and `WB_LOGIN_PASSWORD` (at least 16 characters) in the **frontend project's** Vercel environment settings, then redeploy. The form uses the same signed, expiring session as `/sign-in`; it grants access to the existing operator workspace, not a separate user-role system. Credentials must stay in server environment variables, never in source code or `NEXT_PUBLIC_` variables.

Use a stable backend production domain, not a temporary preview URL. Deploy frontend and backend from the same commit. Disable any ignored-build rule that would skip one project after shared contracts/backend changes; confirm the Git SHA in both deployment pages after every release. Git integration triggers separate builds, so this is not an atomic rollout. Use a maintenance window for incompatible changes.

## 4. Limits and agent setup

- Uploads are capped at **4 MiB** to stay below Vercel's 4.5 MB function payload limit. The existing row limit remains 20,000. The API and proxy enforce configured limits; a larger request may be rejected by Vercel before reaching application code. Direct-to-object-store uploads are not implemented.
- Scientific jobs have a **240-second** deadline, leaving platform time for cleanup and publication within Hobby's 300 seconds. Oversized runs fail with retained inputs and bounded recovery. This is not an unlimited HPC execution service.
- Artifact downloads stream through FastAPI and Next.js. Test a report larger than 4.5 MB on the actual account before relying on large exports. The frontend transport deadline remains 60 seconds; slow/large downloads can require a separately designed download path.
- Keep `WB_AGENTS_ENABLED=0` for the complete manual workflow. To enable automation, follow the [agent operator guide](agent-operator-guide.md) for model verification, bounded provider settings, budgets and policy installation. Then enable agents in the **backend** and redeploy; the same durable queue advances admitted runs. Keep `WB_AGENT_LEASE_SECONDS` at most 180 and `WB_PROVIDER_TIMEOUT_SECONDS` at most 20 so model verification and one advance fit the function budget. No browser tab needs to stay open.
- Use isolated databases, secrets, and origins for previews. Cron handlers reject `VERCEL_ENV=preview`; automatic queue dispatch and consumption are disabled there. Preview APIs can still write when authorized, so **never connect a preview to the production database**.
- Local worker heartbeat files are not cross-function health evidence. Use Vercel Queue delivery metrics, function logs and durable job/run state; existing local diagnostic heartbeat/resource fields may be unknown in this deployment. Monitor database capacity separately from `/tmp` capacity.

## 5. Transfer an existing Render workspace

This repository change does **not** transfer deployed data or delete Render resources.

1. Record the old frontend/backend Git revisions, database version and private configuration reference. Stop all old writers: API, scientific worker, agent worker and any independently running Failure Memory. Disable new Vercel scheduling and block new user submissions. Wait for in-flight work to finish or record its interrupted state.
2. Take and verify the existing [coordinated backup](backup-restore.md), including PostgreSQL metadata/checkpoints and the complete persistent volume. Keep this backup and the stopped Render resources until acceptance passes.
3. Restore the PostgreSQL dump to a **fresh** managed destination of the same major version. Preserve all tables, including checkpoint and agent tables. Extract the matching data volume to a private local directory. Do not mix snapshots taken at different times.
4. Point a trusted checkout's root `.env` at the destination using the Vercel backend template. Preserve the existing `WB_EFM_USERNAME` and `WB_EFM_PASSWORD`: changing an environment variable does not rotate the account stored inside the snapshot. Keep scheduling disabled.
5. Apply only the metadata migration first, then transfer storage:

   ```bash
   python -m alembic -c backend/alembic.ini upgrade head
   python -m workbench.migrate_storage --from-root /private/restored-data --writers-stopped
   python -m workbench.setup
   ```

   The transfer validates every source blob, checks references in restored artifacts/materials/queued job inputs, verifies destination bytes, and preserves upstream project/record IDs. It never replaces differing Failure Memory state. Re-running before any new writes is safe; an interrupted attempt can leave harmless unreferenced immutable blobs. A failed transfer must be resolved before allowing any destination writes. Source files are not deleted.
6. Deploy both Vercel projects at the reviewed commit. Enable scheduling only after setup succeeds. Complete the checks below, compare existing project/artifact IDs and download hashes, and test historical failure-record search.
7. Switch the frontend domain only after acceptance. Keep the old services stopped during the retention window. Do not run old and new deployments as competing writers.

Once new writes occur, rollback is a **data migration**, not merely changing a domain. Restore a coordinated pre-cutover backup only if losing post-cutover changes is explicitly acceptable; otherwise reconcile/export those changes first. Migration 0012 refuses to drop nonempty durable-storage tables.

## 6. Hosted acceptance and ongoing backups

Before retiring Render, record the exact deployed SHA and verify:

- Anonymous frontend access is blocked; API research routes and cron paths reject missing/wrong tokens. The queue subscriber has no public HTTP route. No server credentials appear in browser bundles or network responses.
- A new project, CSV upload, audit, grouped SciSplit partition, successful baseline, unsuccessful baseline saved to Failure Memory, and downloadable verified report all work through automatic queue execution.
- Close the browser while a job is queued. Reopen after queue execution and observe the same durable result.
- Redeploy the backend and frontend. Existing uploads, failure IDs, provenance, runs and report hashes survive.
- Duplicate queue deliveries do not create duplicate results. A timed-out job retains its error and recovery history.
- A fresh isolated database restored from a managed backup can serve existing projects, read verified blobs, search Failure Memory and verify an existing report. Check all three durable layers: workbench/checkpoints, `stored_blobs`, and `connector_states`.

For this mode, take a **complete PostgreSQL backup/PITR snapshot** using the managed provider. All durable application data is in that database; `/tmp` is not a backup source. Record the Git SHA and configuration reference separately. Keep the original complete backup for rollback. Do not use the local-volume backup CLI for a live PostgreSQL-storage deployment. Restore to a fresh database with scheduling disabled, verify it, then enable writers. A provider restore drill and live agent walkthrough remain deployment acceptance tasks, not outcomes claimed by this source change.

## Official platform references

Checked against Vercel documentation on 2026-09-27:

- [FastAPI framework support](https://vercel.com/docs/frameworks/backend/fastapi)
- [Python runtime and dependency packaging](https://vercel.com/docs/functions/runtimes/python)
- [Function limits, duration and large bundles](https://vercel.com/docs/functions/limitations)
- [Vercel Queues on all plans](https://vercel.com/docs/queues)
- [Queue pricing and Hobby allowances](https://vercel.com/docs/queues/pricing)
- [Python subscriber configuration](https://vercel.com/docs/queues/python-sdk)
- [Cron scheduling by plan](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Cron authentication and management](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Streaming Python functions](https://vercel.com/docs/functions/streaming-functions)

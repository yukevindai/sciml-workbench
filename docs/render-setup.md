# Deploy a private workspace on Render

Deploy a reviewed commit from the deployment branch (normally `main`) and record its SHA. The repository does not create Render resources automatically. This setup uses a shared browser password for one trusted operator; it does not provide separate researcher accounts or permissions.

## 1. Prepare three secrets

On your own computer, run this three times and save each result in your password manager:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Use one for `WB_API_TOKEN`, one for `WB_EFM_PASSWORD`, and one for `WB_LOGIN_PASSWORD`. Do not paste them into GitHub, screenshots or chat. Your web login username can be `kevin`.

## 2. Create PostgreSQL

In Render: **New → Postgres**.

- Name: `sciml-db`.
- PostgreSQL version: 16 (tested).
- Region: choose one and use it for every service below.
- Plan: smallest paid database appropriate for your data; review the displayed price before creating it.

After it becomes available, open **Connect → Internal** and copy the internal database URL. The backend accepts Render's `postgresql://...` or `postgres://...` URL directly and selects the installed psycopg3 driver. Keep the entire URL private.

## 3. Create the backend

Choose **New → Private Service**, connect GitHub, and select `yukevindai/sciml-workbench`.

| Setting | Value |
|---|---|
| Name | `sciml-backend` |
| Branch | Reviewed deployment branch / commit |
| Region | Same as PostgreSQL |
| Language/runtime | Python 3 |
| Root directory | Leave blank |
| Build command | `pip install -c backend/constraints.txt ./backend` |
| Start command | `python -m workbench.serve` |
| Compute | Paid; start with at least 2 GB RAM and measure peak usage of API, scientific worker, agent worker and task/guardian processes |
| Instances | One |

Set these environment variables before deploying:

| Variable | Value |
|---|---|
| `PYTHON_VERSION` | `3.12.14` |
| `PORT` | `8000` |
| `WB_DATABASE_URL` | Entire internal PostgreSQL URL |
| `WB_STORAGE_ROOT` | `/var/data` |
| `WB_API_TOKEN` | First generated secret |
| `WB_EFM_USERNAME` | `workbench` |
| `WB_EFM_PASSWORD` | Second generated secret |
| `WB_JOB_TIMEOUT_SECONDS` | `900` |
| `WB_AGENTS_ENABLED` | `0` until agent enablement checks below pass |
| `PYTHONUNBUFFERED` | `1` |

Attach a persistent disk with mount path **`/var/data`** and an initial size such as 1 GB. Select a larger disk if your source documents require it. Attach it before uploading any research data.

Leave the pre-deploy command empty. At runtime, the launcher applies database migrations, initializes PostgreSQL checkpoint tables and provisions Failure Memory. It then starts the API, scientific worker and (when enabled) agent worker in separate process groups. If any child exits, it stops the peers and exits unsuccessfully so Render can restart the service. Platform SIGTERM stops all children, with forced cleanup after ten seconds. You do not need a separate worker service.

A disk belongs to one service instance; separate services cannot share it. This is why the launcher runs these processes in the same private service. Keep this backend at one instance until a shared object-storage adapter is implemented. Disk-backed redeploys stop the old instance before starting its replacement; expect downtime and reconnect afterward. The disk is unavailable to builds, pre-deploy commands and one-off jobs. Keep automatic deploys off during coordinated acceptance. [Render disk restrictions](https://render.com/docs/disks).

After deployment succeeds, copy **Connect → Internal / Service Address**. It will resemble `sciml-backend-xxxx:8000`; use the actual address Render displays.

## 4. Create the frontend

Choose **New → Web Service**, selecting the same GitHub repository.

| Setting | Value |
|---|---|
| Name | `sciml-web` (or another available name) |
| Branch | Same branch as backend |
| Region | Same as backend and database |
| Runtime | Docker |
| Root directory | Leave blank |
| Dockerfile path | `frontend/Dockerfile` |
| Docker build context | Repository root (`.`) |
| Docker command | Leave blank; use the Dockerfile default |
| Compute | A small paid web instance is a practical starting point |
| Health check path | `/healthz` |

This must be a **Web Service**, not a Static Site, because Next.js handles server-side authentication and API requests.

Set:

| Variable | Value |
|---|---|
| `PORT` | `3000` |
| `WB_API_URL` | `http://` followed by the backend's actual internal address, including `:8000` |
| `WB_API_TOKEN` | Same first secret used by the backend |
| `WB_REQUIRE_LOGIN` | `1` |
| `WB_LOGIN_USERNAME` | `kevin` |
| `WB_LOGIN_PASSWORD` | Third generated secret |
| `WB_PUBLIC_ORIGIN` | Exact public site URL, such as `https://sciml-web.onrender.com`, with no trailing slash |

If Render has not yet shown the public URL, initially set `WB_PUBLIC_ORIGIN` to `https://pending.invalid`. After creation, copy the assigned HTTPS URL, update this environment variable and redeploy. The placeholder intentionally blocks writes until the correct origin is configured.

Do not add provider keys, agent settings, database or Failure Memory credentials to the frontend service. Model calls execute in the private agent process. The frontend needs only the variables listed above. Do not use `NEXT_PUBLIC_` names for secrets.

## 5. Open and test

1. Open the frontend's assigned **HTTPS** URL. The browser should display a username/password prompt.
2. Sign in with `WB_LOGIN_USERNAME` and `WB_LOGIN_PASSWORD`, not the API token or Failure Memory password.
3. Create a project, upload `examples/demo.csv`, and follow the README's audit → split → benchmark → failure record → report workflow.
4. Open the site in a fresh private/incognito browser session and confirm that it asks for credentials before exposing projects or files.
5. Redeploy the backend and verify that your project and uploaded data are still present.

HTTP Basic authentication is a single-operator access gate, not a multi-user login system. Browsers can cache these credentials; use a private window and close it when finished. Use a strong unique password and HTTPS. To rotate access, update `WB_LOGIN_PASSWORD` and redeploy the frontend. Rotating `WB_EFM_PASSWORD` is a separate operator action described in `operations.md`.

## 6. Enable the hosted agent runtime

Keep manual mode until account/model validation is available. Deploying this ticket
does not establish live-provider acceptance. Follow [coordinator setup](agent-coordinator.md#runtime-setup)
for reviewed models, bounds, policies and budgets. Set these only on the private backend:

| Variable | Value |
|---|---|
| `WB_AGENTS_ENABLED` | `1` after validation; otherwise `0` |
| `WB_MODEL_PROVIDER` | `anthropic` |
| `ANTHROPIC_API_KEY` | Private account credential |
| `WB_COORDINATOR_MODEL`, `WB_SPECIALIST_MODEL` | Account-verified pinned model IDs |
| `WB_AGENT_MODEL_BOUNDS` | Reviewed JSON ModelBound map for both model IDs |
| `WB_AGENT_MODEL_PRICES` | Reviewed JSON Pricing map, or `{}` for unknown pricing |
| `WB_AGENT_LEASE_SECONDS` | `180` |
| `WB_AGENT_MAX_OUTPUT_TOKENS` | `1024` |
| `WB_PROVIDER_TIMEOUT_SECONDS` | `20` |

Do not treat example bounds or prices as measured. A monetary budget requires known
prices. Run `python -m workbench.config` in the backend shell to validate configuration
without contacting providers. The separate `python -m workbench.model_provider --smoke`
performs bounded synthetic live validation; retain its redacted outcome. Install reviewed
server/project policies with explicit input/model scope and budgets before submitting
work. Enablement neither installs policies nor grants additional data exposure.

Redeploy with `python -m workbench.serve` as the start command. Render needs no Compose
profile. Invalid bounds fail before migrations; unavailable model identity fails the
agent child and therefore restarts the service. To restore manual service while fixing
configuration, set `WB_AGENTS_ENABLED=0` and redeploy. Runs and ledgers remain stored;
agents do not advance while disabled. `/health` checks API liveness, not provider quality
or scientific/agent progress.

Production always requires the password gate, including with `WB_REQUIRE_LOGIN=0`.
Disabling login is supported only in local development.

## 7. Hosted acceptance and redeploy record

Use a disposable acceptance project with synthetic data. Record deployment SHA,
service identities, UTC timestamps and results privately. Do not copy secrets,
raw checkpoints or research content into logs/issues. Observe these checks on Render;
local fixtures are supporting evidence, not hosted acceptance.

1. Verify anonymous requests to `/`, `/api/projects`, a run's `/events` and
   `/stream`, and an existing report download return `401`. `/healthz` stays public
   and constant. Confirm the backend has only its internal service address.
2. Authenticate through the HTTPS frontend. Create the demo project, upload
   `examples/demo.csv` and complete a report. Record project/dataset/report IDs and
   the download's SHA-256; verify it using the [report replay guide](report-replay.md).
3. With provider acceptance and policy in place, submit a bounded agent request.
   Poll `GET /api/projects/{pid}/agent-runs/{rid}` and
   `GET /api/projects/{pid}/agent-runs/{rid}/events?after=0` through the public
   frontend with operator authentication. Verify uncached responses and increasing
   event `sequence` values. Reconnect with `after=<last sequence>`; earlier events
   must not recur. Optional `/stream` returns bounded SSE replay and closes;
   reconnect with `Last-Event-ID`, or poll. Inspect browser requests: provider calls
   and keys must stay server-side.
   The frontend `/api/` proxy adds the backend's `/api/v1/` prefix; do not include
   `/v1` in browser requests.
4. Record an eligible queued/running/waiting-for-job run's ID, revision, event cursor,
   accepted job/action IDs and budget/exposure history. Retain a paused or input-waiting
   run as a negative control. Redeploy the same backend commit with the same PostgreSQL
   URL and disk. Record outage/recovery times. Do not resubmit or clear leases/checkpoints.
5. Verify the completed project's IDs and report checksum are unchanged. Reconnect
   from the saved cursor. Allow the configured agent lease to expire (default 180
   seconds) and accepted scientific jobs to settle under their original deadlines.
   Eligible runs should advance or expose a truthful recoverable/terminal outcome;
   paused/input-waiting runs must retain their state. Verify no duplicate job, import
   or report publication and retained budget/exposure records. Unknown provider usage
   or external effects require reconciliation; redeploy does not authorize retry.
6. Redeploy the frontend separately; repeat polling/downloads and anonymous denial.
   Record pass/fail and cases blocked by missing provider configuration. D06 hosted
   acceptance stays pending until this evidence exists.

Before a version-changing rollout, stop submissions, drain or pause work and capture
a coordinated PostgreSQL/disk backup per [operations](operations.md). A disk snapshot
alone is not a coordinated database/checkpoint/blob backup. If startup fails, inspect
redacted configuration/migration errors; do not repeatedly resubmit work. Roll back code
only when compatible with the applied schema. Restoring an incompatible schema and
matching disk belongs to D07's isolated coordinated restore; do not downgrade blindly.

## Common problems

| Symptom | Fix |
|---|---|
| Frontend says workspace access is not configured | Set a username without `:` and a login password of at least 16 characters; redeploy. |
| Backend unavailable | Check backend is live, all resources share a region, and `WB_API_URL` starts with `http://` and includes its internal port. |
| Unauthorized from API | Backend and frontend `WB_API_TOKEN` values must match exactly. |
| Cross-origin request rejected | Set `WB_PUBLIC_ORIGIN` to the exact HTTPS browser origin, no trailing slash; redeploy. |
| Jobs stay queued | Check backend logs; use `python -m workbench.serve`, not only `uvicorn`. |
| Agent runs do not advance | Check enablement, pinned models, reviewed bounds/policies, agent child logs, lease expiry and run state; do not reset ledgers. |
| Build cannot find pyproject/Dockerfile | Leave root directory blank; paths in this guide are relative to the repository root. |
| Data disappears on restart | Ensure `/var/data` is the persistent disk mount and `WB_STORAGE_ROOT` matches. |
| Out-of-memory/restarts during benchmarks | Increase backend RAM or reduce dataset size. |

## Official references

- [Private services](https://render.com/docs/private-services)
- [Private networking](https://render.com/docs/private-network)
- [PostgreSQL connections](https://render.com/docs/postgresql-creating-connecting)
- [Persistent disks and their restrictions](https://render.com/docs/disks)
- [Next.js web services](https://render.com/docs/deploy-nextjs-app)

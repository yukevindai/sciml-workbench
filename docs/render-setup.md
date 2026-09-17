# Deploy a private workspace on Render

Use the `feat/unified-sciml-mvp` branch, or merge its PR and use `main`. The repository does not create Render resources automatically. This setup uses a shared browser password for one trusted operator; it does not provide separate researcher accounts or permissions.

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
| Branch | `feat/unified-sciml-mvp` (or `main` after merging) |
| Region | Same as PostgreSQL |
| Language/runtime | Python 3 |
| Root directory | Leave blank |
| Build command | `pip install -c backend/constraints.txt ./backend` |
| Start command | `python -m workbench.serve` |
| Compute | Paid; start with at least 2 GB RAM for API + worker + task process |
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

Attach a persistent disk with mount path **`/var/data`** and an initial size such as 1 GB. Select a larger disk if your source documents require it. Attach it before uploading any research data.

Leave the pre-deploy command empty. The launcher applies database migrations, provisions Failure Memory, then supervises the API and worker at runtime, when the disk is available. If either process exits, the whole service exits so Render can restart it. You do not need a separate worker service.

A disk belongs to one service instance; separate API/worker services cannot share it. This is why the launcher runs both processes in the same private service. Keep this backend at one instance until a shared object-storage adapter is implemented.

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

Do not add database or Failure Memory credentials to the frontend service. Do not use `NEXT_PUBLIC_` names for secrets.

## 5. Open and test

1. Open the frontend's assigned **HTTPS** URL. The browser should display a username/password prompt.
2. Sign in with `WB_LOGIN_USERNAME` and `WB_LOGIN_PASSWORD`, not the API token or Failure Memory password.
3. Create a project, upload `examples/demo.csv`, and follow the README's audit → split → benchmark → failure record → report workflow.
4. Open the site in a fresh private/incognito browser session and confirm that it asks for credentials before exposing projects or files.
5. Redeploy the backend and verify that your project and uploaded data are still present.

HTTP Basic authentication is a single-operator access gate, not a multi-user login system. Browsers can cache these credentials; use a private window and close it when finished. Use a strong unique password and HTTPS. To rotate access, update `WB_LOGIN_PASSWORD` and redeploy the frontend. Rotating `WB_EFM_PASSWORD` is a separate operator action described in `operations.md`.

## Common problems

| Symptom | Fix |
|---|---|
| Frontend says workspace access is not configured | Set a username without `:` and a login password of at least 16 characters; redeploy. |
| Backend unavailable | Check backend is live, all resources share a region, and `WB_API_URL` starts with `http://` and includes its internal port. |
| Unauthorized from API | Backend and frontend `WB_API_TOKEN` values must match exactly. |
| Cross-origin request rejected | Set `WB_PUBLIC_ORIGIN` to the exact HTTPS browser origin, no trailing slash; redeploy. |
| Jobs stay queued | Check backend logs; use `python -m workbench.serve`, not only `uvicorn`. |
| Build cannot find pyproject/Dockerfile | Leave root directory blank; paths in this guide are relative to the repository root. |
| Data disappears on restart | Ensure `/var/data` is the persistent disk mount and `WB_STORAGE_ROOT` matches. |
| Out-of-memory/restarts during benchmarks | Increase backend RAM or reduce dataset size. |

## Official references

- [Private services](https://render.com/docs/private-services)
- [Private networking](https://render.com/docs/private-network)
- [PostgreSQL connections](https://render.com/docs/postgresql-creating-connecting)
- [Persistent disks and their restrictions](https://render.com/docs/disks)
- [Next.js web services](https://render.com/docs/deploy-nextjs-app)

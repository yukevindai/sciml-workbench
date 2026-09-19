# Runtime setup (D01)

The manual scientific workflow runs without model credentials. This revision reserves an independent agent-worker process and its private configuration; it does not implement a provider adapter or agent scheduler. E02, B11 and D11 supply those capabilities. Enabling the agent process now exits with a configuration or runtime-unavailable error rather than reporting a healthy agent.

## Supported environment

Use Linux containers with Docker Compose v2, or Linux/WSL2 with Python 3.12, Node 22 and PostgreSQL 16. Run commands from the repository root. Native Windows can run development tests, but `workbench.serve` and `workbench.worker` reject it before spawning children: supervised process-tree shutdown requires POSIX process groups. The Linux supervisor test runs in CI; Windows tests verify the explicit rejection. See the [scientific worker runtime](scientific-worker.md) for D03 deadlines, child cleanup and restart behavior.

The four upstream Git revisions are in `backend/pyproject.toml`; transitive constraints are in `backend/constraints.txt`. The Dockerfile and CI use Python 3.12. Keep the existing `.venv` until an isolated installation passes. For example, inside Linux/WSL:

```bash
python3.12 -m venv outputs/d01-venv
source outputs/d01-venv/bin/activate
GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=core.autocrlf GIT_CONFIG_VALUE_0=false GIT_CONFIG_KEY_1=core.eol GIT_CONFIG_VALUE_1=lf pip install -c backend/constraints.txt -e 'backend[dev]'
pip check
```

The per-command Git settings preserve the source bytes checked by benchmark admission without changing global Git configuration. Node dependencies install with `npm --prefix frontend ci`. No provider SDK, checkpointer version or model ID is claimed as verified by D01.

## Fresh Compose startup

1. Copy `.env.example` to `.env`. Generate four independent secrets for `POSTGRES_PASSWORD`, `WB_API_TOKEN`, `WB_EFM_PASSWORD` and `WB_LOGIN_PASSWORD` using `python -c 'import secrets; print(secrets.token_urlsafe(48))'`. Use URL-safe database passwords because Compose embeds the value in the connection URL. Keep `WB_AGENTS_ENABLED=0` and do not enable the `agents` profile.
2. Run `docker compose config --quiet`. It names missing required Compose variables. Do not publish expanded Compose output: it contains secret values.
3. Run `docker compose up --build -d --wait`. PostgreSQL must become healthy before setup runs; setup validates backend configuration, migrates metadata, then provisions Failure Memory through its public CLI. API and scientific worker wait for successful setup. The web service waits for API health.
4. Inspect `docker compose ps -a` and `docker compose logs setup` if startup fails. The setup container should exit with code 0. Open `http://localhost:3000` and sign in using the web login values.

Only the web port is published, on loopback. Database, storage, API and worker remain internal. Volumes retain metadata and files after `docker compose down`; do not use `down -v` for an existing workspace.

For an update, take the coordinated backup described in [operations](operations.md), then stop `web api worker` before applying migrations. If an agent process has been started, stop `agent-worker` too. Never run two setup processes at once. Run `docker compose run --rm setup`, then `docker compose up --build -d --wait`. Repeated setup on a successfully provisioned volume keeps the existing Failure Memory account. If provisioning failed between account creation and marker publication, follow the existing account-recovery procedure in the operations guide. Editing an environment password does not rotate an existing PostgreSQL or Failure Memory account.

Compose ordering and profiles follow the official [startup-order](https://docs.docker.com/compose/how-tos/startup-order/) and [profile](https://docs.docker.com/compose/how-tos/profiles/) rules. `python scripts/check_compose.py` verifies the resolved configuration without printing its values; it needs the same four secrets and a working Compose CLI, but no running Docker daemon.

## Native Linux/WSL startup

Copy the root environment example and replace the secrets, including the password in `WB_DATABASE_URL` for your existing PostgreSQL database. Percent-encode special characters in a manually assembled URL. The root `.env` is read by backend settings; it is not automatically exported into unrelated shell commands.

```bash
python -m workbench.config
python -m workbench.setup
python -m workbench.serve
```

The configuration check contacts no database or provider and prints no values. The setup command is repeatable after successful provisioning. The launcher also performs setup, then supervises API and scientific worker on their shared disk. If either child exits, the launcher terminates its peer's process group and exits so the host can restart the service. Run a single launcher. For development, API and worker can instead be started separately after setup using the README commands.

Copy `frontend/.env.example` to `frontend/.env.local`; set its API token to the backend's token and its independent web login password. Run `npm --prefix frontend run dev` in a separate terminal. Never copy the root environment file into `frontend/`. Docker excludes all private `.env` files and virtual environments from build context.

## Configuration ownership and errors

| Process | Configuration |
|---|---|
| Setup, API, scientific worker | `WB_DATABASE_URL`, `WB_STORAGE_ROOT`, `WB_API_TOKEN`, `WB_EFM_USERNAME`, `WB_EFM_PASSWORD`, positive scientific limits |
| Reserved agent worker only (Compose) | Backend variables plus `WB_AGENTS_ENABLED`, `WB_MODEL_PROVIDER`, `WB_COORDINATOR_MODEL`, `WB_SPECIALIST_MODEL`, `ANTHROPIC_API_KEY` |
| Next.js server | `WB_API_URL`, server-to-server `WB_API_TOKEN`, `WB_PUBLIC_ORIGIN`, web login settings |
| Browser | No database, upstream, API bearer or provider credentials |

The Next.js server necessarily holds the existing proxy bearer token and web login secret. It receives no database, Failure Memory or model credential. None of these secrets uses `NEXT_PUBLIC_`, build arguments or build secrets. The Compose environment allowlist is checked in CI.

Missing/invalid backend values name the relevant environment variables without echoing their values. API tokens require 32+ characters and Failure Memory passwords 12+; blank values and example placeholders are rejected. Row, upload and timeout limits must be positive. The database URL is required; there is no implicit development password fallback. SQLite is accepted only to support isolated tests and schema generation; the deployed runtime uses PostgreSQL.

`WB_AGENTS_ENABLED=0` permits absent model IDs and keys. Opting in requires the reserved `anthropic` provider, both configured model IDs and a non-placeholder `ANTHROPIC_API_KEY`, then fails with the explicit E02/B11/D11 runtime-unavailable message. No paid call occurs. Other provider names are not advertised as supported. Checkpoints will use the application PostgreSQL database with their schema/pool supplied by B11/D11; this revision creates no checkpoints.

`docker compose --profile agents run --rm agent-worker` exercises this reserved entry point. It exits with code 2, including when disabled, and is not configured to restart repeatedly. Merely setting `WB_AGENTS_ENABLED` does not activate a Compose profile. The hosted launcher checks agent opt-in before any setup or child launch; leave it disabled until the real runtime is integrated.

## Verification

```bash
pytest backend/tests -q
python scripts/export_schemas.py --check
python scripts/check_compose.py
```

The backend suite covers redacted configuration failures, setup ordering and failure propagation, repeated real Alembic/Failure Memory setup, disabled and unavailable agents, and the platform boundary. CI additionally boots the Linux Compose stack, repeats setup with services stopped, checks the reserved agent exit/redaction, and verifies the operator login gate. Consult [D01 evidence](tickets/D01.md) for checks actually run on this revision and remaining acceptance limits.

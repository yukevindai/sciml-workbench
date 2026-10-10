# Development setup and checks

Use **Python 3.12**, **Node 22+**, and **PostgreSQL 16**. The commands below assume a supported Linux/WSL environment.

<details>
<summary><strong>Run the backend and frontend without Compose</strong></summary>

From the repository root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -c backend/constraints.txt -e 'backend[dev]'
cp .env.example .env
# Set private secrets and WB_DATABASE_URL for your PostgreSQL database.
python -m workbench.config
python -m workbench.setup
uvicorn workbench.api:create_app --factory --host 127.0.0.1 --port 8000
```

In a second terminal with the same environment and activated virtualenv:

```bash
python -m workbench.worker
```

For the frontend, copy `frontend/.env.example` to `frontend/.env.local`, set the matching backend API token and independent web login values, then:

```bash
cd frontend
npm ci
npm run dev
```

Use localhost consistently: browser writes are checked against `WB_PUBLIC_ORIGIN`. Never put credentials in `NEXT_PUBLIC_` variables. This sequence starts the manual runtime; agent enablement additionally requires the [operator setup](../docs/agent-operator-guide.md).

</details>

<details>
<summary><strong>Windows: preserve upstream source bytes during installation</strong></summary>

Git for Windows can convert upstream source line endings during pip's Git clones. Since benchmark admission checks the installed source bytes, CRLF conversion can cause `Installed ChemData Auditor/SciSplit source differs from the pinned official implementation`.

For a Git Bash installation, disable conversion for those clones:

```bash
GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=core.autocrlf GIT_CONFIG_VALUE_0=false GIT_CONFIG_KEY_1=core.eol GIT_CONFIG_VALUE_1=lf pip install -c backend/constraints.txt -e 'backend[dev]'
```

These variables do not change your global Git configuration. If already installed with converted bytes, reinstall the four exact Git requirements from `backend/pyproject.toml` with `--force-reinstall --no-deps`.

Native Windows supports tests but is not a supported scientific worker host; use Linux/WSL or the supported container path for process supervision.

</details>

### Checks

From the repository root, with the relevant dependencies and services running:

```bash
pytest backend/tests -q
python scripts/export_schemas.py --check
python scripts/release_manifest.py --check
npm --prefix frontend run build
(cd frontend && npx playwright install chromium && npm run test:e2e)
```

Public product previews are screenshots of the real workspace routes with synthetic example data. After changing those screens, build and start the frontend locally, then run `npm --prefix frontend run preview:capture` with `E2E_BASE_URL` pointing at localhost and `WB_LOGIN_USERNAME` / `WB_LOGIN_PASSWORD` set to that local test login. The capture script intercepts all API reads, rejects mutations, and omits the in-product support launcher. Commit the generated desktop/mobile images for both themes, then rebuild before checking the public page. An optional `CHROMIUM_EXECUTABLE` selects an installed browser.

For strict PostgreSQL data/API acceptance, set `TEST_DATABASE_URL` to a **dedicated test database** and run:

```bash
python scripts/check_data_integration.py
```

The default backend tests use temporary SQLite metadata; PostgreSQL locking and transaction checks require PostgreSQL. Scientific integration tests use real pinned packages. Deterministic agent tests replace provider decisions, not scientific implementations. Browser checks need the documented running stack.

[Integrated CI gates](../docs/integrated-ci.md) · [Scientific integration](../docs/tickets/C10.md) · [Browser acceptance](../docs/tickets/A10.md) · [Agent evaluations](../docs/autonomy-evaluation.md)


[Contribution guide](../CONTRIBUTING.md) · [Project overview](../README.md)

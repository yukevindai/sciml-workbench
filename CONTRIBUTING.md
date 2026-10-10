# Contributing to Colattice

Thanks for helping build an open research workspace. Contributions can be code, a reproducible bug report, a clearer guide, or an example that helps researchers use the tools well.

[Try the demo](https://www.colattice.ca/demo) · [Open issues](https://github.com/yukevindai/colattice/issues) · [Project overview](README.md)

## Find a starting point

Explore the demo, browse existing issues and pull requests, and choose a focused change. For a larger feature or scientific integration, an issue describing the use case and proposed approach can help avoid duplicated work.

Useful first contributions include fixing a setup step, improving keyboard navigation, adding a regression test for a reproducible bug, and documenting a synthetic research example. You do not need to run a live AI provider to work on the demo, documentation, or many of the tests.

## Fork and create a branch

Fork the repository on GitHub, then clone your fork. Replace `YOUR-USERNAME` with your GitHub username:

```bash
git clone https://github.com/YOUR-USERNAME/colattice.git
cd colattice
git remote add upstream https://github.com/yukevindai/colattice.git
git switch -c your-change
```

## Choose your development setup

### Frontend and public demo

Use Node.js 22 or newer. From the repository root:

```bash
cd frontend
npm ci
npm run dev
```

Open **http://localhost:3000/demo**. The demo uses synthetic data and scripted responses; it does not need PostgreSQL, a backend, or an AI key. This is a practical starting point for navigation, accessibility, layout, and demo work. Live research and authenticated backend features require the full setup below.

Read [frontend/AGENTS.md](frontend/AGENTS.md) and the installed Next.js documentation when working with an AI coding assistant; this project uses APIs that may differ from older Next.js releases.

### Backend or full research workspace

Follow [local setup](docs/local-setup.md) for Docker Compose, or [development setup](docs/development.md) for separate frontend, API, and worker processes. The supported stack uses Python 3.12, Node.js 22+, and PostgreSQL 16. Scientific workers run on Linux/WSL or in the supported containers.

Live agent work additionally requires the [operator configuration](docs/agent-operator-guide.md). Keep credentials in local environment files; use synthetic or appropriately licensed data in examples and test fixtures.

## Repository map

| Path | Purpose |
|---|---|
| [`frontend/app/`](frontend/app/) | Product views, public pages, demo, and server-side API proxy. |
| [`frontend/tests/`](frontend/tests/) | Browser tests, contract checks, and authentication tests. |
| [`backend/workbench/`](backend/workbench/) | API, coordinator, scientific adapters, jobs, and reports. |
| [`backend/tests/`](backend/tests/) | Backend regression and integration tests. |
| [`contracts/`](contracts/) | Exported schemas shared by the backend and frontend. |
| [`examples/`](examples/) | Synthetic inputs and reproducible report examples. |
| [`docs/`](docs/) | Architecture, setup, scientific boundaries, and operations. |
| [`scripts/`](scripts/) | Contract generation, verification, and acceptance tooling. |

## Make and check your change

Keep changes focused and explain the user-visible problem they solve. Follow the patterns in the surrounding code. Add regression coverage for behavior changes and include screenshots for visible interface changes.

Run the checks relevant to your change. From the repository root:

```bash
# Frontend build and server-side authentication checks.
npm --prefix frontend run build
npm --prefix frontend run test:boundary

# Backend tests, after installing backend development dependencies.
pytest backend/tests -q
```

For schema or API contract changes, regenerate and verify the shared artifacts:

```bash
python scripts/export_schemas.py
npm --prefix frontend run contracts:generate
python scripts/release_manifest.py
python scripts/export_schemas.py --check
npm --prefix frontend run contracts:check
python scripts/release_manifest.py --check
```

Do not hand-edit generated frontend contract files. Scientific methods belong in the upstream projects; Colattice integrates their supported APIs. See the [integration rules](docs/integrations.md) before extending an adapter.

Browser tests require a running application. PostgreSQL acceptance checks require a dedicated test database. The [development guide](docs/development.md) covers these checks, screenshot capture, and platform-specific setup; [CI](.github/workflows/ci.yml) defines the full integration gates.

If a product screen changes, refresh the shared landing-page/README screenshots in both themes and viewport sizes. The [preview workflow](.github/workflows/product-previews.yml) captures the real interface with synthetic data and uploads artifacts for review; it does not commit them automatically.

## Open a pull request

```bash
git add <changed-files>
git commit -m "Describe your change"
git push -u origin your-change
```

Open a pull request from your branch to `yukevindai/colattice:main`. Include:

- The problem and the resulting behavior.
- Related issues, if any.
- Checks you ran and any remaining limitations.
- Screenshots for UI changes, or reproduction steps for a bug fix.

For scientific changes, distinguish synthetic test results from experimental evidence, and explain any change to assumptions, provenance, evaluation, or reproducibility.

## Report a bug or suggest a feature

Use [GitHub Issues](https://github.com/yukevindai/colattice/issues). For bugs, include the relevant commit or deployment, browser/OS, reproduction steps, expected behavior, and a redacted error message. Do not include passwords, API keys, private datasets, or session cookies.

For feature ideas, describe the research task, who would use it, and what is difficult in the current workflow. A small example is often more helpful than a large specification.

# Run Colattice locally

### 1. Start the local workspace

Use Docker Engine with Compose v2 and network access to GitHub, PyPI, and npm during the build. The supported scientific process boundary is Linux; on Windows, use the documented Docker/WSL path.

From a Linux/WSL shell:

```bash
git clone https://github.com/yukevindai/colattice.git
cd colattice
cp .env.example .env
```

Set independent values for `WB_API_TOKEN`, `WB_EFM_PASSWORD`, `WB_LOGIN_PASSWORD`, and `POSTGRES_PASSWORD` in `.env`. Generate a fresh value for each, for example:

```bash
python -c 'import secrets; print(secrets.token_urlsafe(48))'
```

Keep `WB_AGENTS_ENABLED=0` for the first startup, then run:

```bash
docker compose config --quiet
docker compose up --build -d --wait
```

Open **http://localhost:3000** for the landing page, choose **Get started**, and sign in on the sign-in page with `WB_LOGIN_USERNAME` and `WB_LOGIN_PASSWORD` from `.env`. You land on **Ask**: one prompt box where you attach a CSV or PDF and type what you want to know. The main navigation includes **Ask**, **Projects**, **Workflows**, **Stress test**, **Agent market**, and **Tools**. The **Tools** catalog defines reusable agent instructions and allowed integrated capabilities; scientific results open through their inspection links.

Setup applies migrations and provisions the local Failure Memory service account. Only the web interface is published, bound to loopback; PostgreSQL, the API, and workers stay internal. The scientific APIs need **no model API key**; enable agents below to run research from the product UI.

### 2. Enable agents when configured

**Quick path (DeepSeek with automatic access):** in `.env`, set `DEEPSEEK_API_KEY`, keep `WB_MODEL_PROVIDER=deepseek` and the `deepseek-chat` model IDs, set a reviewed `WB_AGENT_MODEL_BOUNDS` record, and set `WB_AGENTS_ENABLED=1` and `WB_AGENT_AUTO_POLICY=1`. Then:

```bash
docker compose run --rm --no-deps api python -m workbench.model_provider   # checks the key and model IDs
docker compose --profile agents up --build -d --wait
```

With `WB_AGENT_AUTO_POLICY=1`, the first question in a project grants the assistant access to that project's own uploads: column names and summary numbers only, never raw rows, within per-request and per-project limits. Sending the question is the consent to spend. See the [DeepSeek section of the operator guide](../docs/agent-operator-guide.md#deepseek-quick-path).

The coordinator assigns advisory specialists as needed within the shared request,
token and time budgets, with two specialists running at once. Larger batches
continue in checkpointed waves. Coordinator calls and specialist calls share the
same 40-request default allowance; a configured monetary ceiling also applies.

**Reviewed path:** leave `WB_AGENT_AUTO_POLICY=0` and follow the [agent operator guide](../docs/agent-operator-guide.md) to install exact server/project policies with `workbench.operator_policy`. Then only the inputs you granted can be offered to the model. Research activity retains each request’s inputs, policy, limits, and results for inspection.

Start with the guide's narrow audit demonstration before expanding the permitted workflow. Model keys remain in backend configuration, never browser code, goal text, or uploaded files.

**Setup references:** [Runtime and configuration ownership](../docs/runtime-setup.md) · [Vercel deployment and migration](../docs/vercel-setup.md)

**Hosting on Vercel:** deploy the Next.js frontend (`frontend/`) and FastAPI backend (repository root) as two projects from the same commit. The backend uses managed PostgreSQL for metadata, file bytes and Failure Memory snapshots, plus durable Vercel Queues for scientific work, recovery and optional agents. This configuration supports **Vercel Hobby**, caps uploads at **4 MiB** and scientific jobs at **240 seconds**, and preserves the local Compose workflow. Start with the dedicated [backend](../.env.vercel.example) and [frontend](../frontend/.env.vercel.example) environment templates. Existing Render data requires the documented transfer before retiring those services.


## Try the scientific workflow

The included [synthetic CSV](../examples/demo.csv) demonstrates the integrations. It does not establish empirical predictive performance. The current UI starts research through agents; the older standalone scientific entry forms are no longer the product workflow.

With agents configured, create or select a project in **Projects**, open **Ask**, attach the CSV, and send a scoped request such as:

> Audit this synthetic dataset for missing values, duplicates, and unusual values. Do not train a model. Ask me for any source declarations you need; do not infer provenance or units.

Choose a specific agent or team if needed, and optionally select **Review plan**. Follow the elapsed-time panel, answer scientific questions, and open the resulting audit. Then request a supported split and baseline once the required target, units, provenance, and evaluation choices are supplied. Results link to their inspection views; original inputs remain unchanged.

For a paper, attach a PDF and ask for source-linked findings. To challenge the resulting claim, open **Stress test** and select the relevant evidence. Ask for a report after the work settles, then inspect and download the retained report archive.

For a deterministic integration walkthrough without a live provider, use the [scientific integration guide](../docs/tickets/C10.md) and [acceptance fixtures](../docs/tickets/A10.md), rather than the removed manual UI forms.

The agent path uses these same scientific integrations through scoped tools. Its [acceptance fixtures](../docs/agent-coordinator.md#acceptance-evidence) exercise real scientific packages with deterministic provider responses; those fixtures are not evidence of live model quality.

<details>
<summary><strong>Scientific boundaries worth knowing</strong></summary>

- The current baseline options are **mean and ridge regression**. Validation-driven adaptive tuning is unavailable in the pinned API.
- Nonempty train/validation/test partitions are required. User uploads become local task cards, not automatic admissions to the public benchmark catalog.
- For your own CSV, supply the columns, target, units, provenance, and scientific question that actually apply. Demo declarations belong only to the demo.
- Original data is not silently rewritten. Warning acceptance requires the supported mechanism and authorized justification; non-waivable scientific errors remain errors.
- PDF ingestion reads supported text layers. It is not OCR or figure digitization, and ingestion alone does not verify a scientific claim.
- Agent failure recording derives eligible observations and actor identity from trusted records. It does not invent researcher judgments or experimental causes.
- Test metrics are withheld from selection roles. Revealing them is recorded; a new run does not erase prior exposure.

</details>

## Reproduce the result

A report preserves the inputs and execution context needed to inspect the science independently of the conversation.

| Included | Purpose |
|---|---|
| Original CSV/PDF inputs and artifact lineage | Establish what was analyzed and where it came from. |
| Benchmark bundles, predictions, task cards, and splits | Preserve actual scientific inputs and outputs. |
| Evidence sources and failure snapshots | Retain context behind findings and unsuccessful outcomes. |
| Schemas, software pins, environment, and agent-version metadata where applicable | Record the contracts and implementations used. |
| Readable report and SHA-256 manifest | Support human inspection and archive-integrity checks. |

With the compatible pinned Python environment installed:

```bash
# Verify structure, hashes, and compatibility without rerunning science.
python -m workbench.replay examples/release/report.zip --verify-only

# Replay supported science into a NEW output directory.
python -m workbench.replay examples/release/report.zip outputs/reviewer-replay
```

Replace the example archive with your downloaded report to inspect your own run. Replay compares audits, exact split assignments, baseline metrics, and predictions using the documented tolerances (`rtol=1e-9`, `atol=1e-12`). It never reimports failure records or replays agent prose/provider calls.

The UI's archive verification is separate from scientific replay; an export is not labeled replayed merely because its hashes pass.

[Example report](../examples/release/report.zip) · [Example replay receipt](../examples/release/verification.json) · [Verification and replay guide](../docs/report-replay.md)


[Back to the project overview](../README.md) · [Contribute to Colattice](../CONTRIBUTING.md)

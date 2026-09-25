# Agent setup and operational handoff (E16)

Use this guide for the single-operator workspace. Commands below use a Linux/WSL
shell from the repository root and Docker Compose v2. Native Windows supports
tests; scientific process supervision requires Linux. Start with a fresh local
workspace for the demonstration. Existing workspaces require a
[coordinated backup](backup-restore.md) before upgrades.

This guide is operationally ready for configured accounts, but live acceptance is
still gated: E02 has no verified account/model generation evidence, E15 has no live
pilot results, and D06 has no accepted hosted deployment. The E15 deterministic
suite at `b042500` passed 99 tests with 74 PostgreSQL-dependent skips. The local
A10 browser demonstration uses a scripted coordinator, not a live model.

## 1. Prepare the private runtime

Follow [runtime setup](runtime-setup.md#fresh-compose-startup): copy `.env.example`
to private `.env`, generate independent secrets, leave `WB_AGENTS_ENABLED=0`, and
run `docker compose config --quiet` followed by
`docker compose up --build -d --wait`. Setup applies migrations and PostgreSQL
checkpoints; do not apply them concurrently with running writers on an upgrade.
Sign in at `http://localhost:3000` using the independent web credentials.

Keep model keys only in the backend configuration, never the browser/frontend,
Git, a policy file, goal text or uploaded source. Do not share expanded Compose
configuration. Only the web port is published locally.

Create a project and attach `examples/demo.csv` in **Research**. Declare it as
synthetic demonstration data, with no claim of empirical performance. The upload
creates both an attachment and a dataset. It does not grant agent access. Retain
their IDs and the project ID from the authenticated upload/project responses
(the browser's Network response view). The policy needs both attachment and
dataset IDs when the Research input selects both.

## 2. Resolve provider decisions before enabling agents

Only the implemented Anthropic adapter is supported. There is no recommended or
default model ID, current price, or inferred input-token bound in this guide.
Resolve each item below for the actual account and keep a dated private record.

| Decision | Required evidence / gate |
|---|---|
| Coordinator and specialist model | Account-available pinned IDs; both roles may use the same verified ID. Mutable aliases are refused at runtime. |
| Structured generation | Successful bounded smoke result for each distinct configured model; a Models lookup alone is insufficient. |
| Context/output bounds | Reviewed maximum request bytes, conservative billed input tokens including all overhead/cache categories, output cap and active seconds. No byte-to-token assumption is supplied. |
| Pricing | Dated reviewed USD **per-token** rates for every supported category. Divide a per-million quote by 1,000,000 before entering it. A monetary cap refuses unpriced dispatch. |
| Scientific capability | Use the installed `/api/v1/capabilities` response and [scientific public surface](scientific-public-surface.md); do not infer support from a model's proposal. |

Set `ANTHROPIC_API_KEY`, `WB_COORDINATOR_MODEL`, `WB_SPECIALIST_MODEL`,
`WB_AGENT_MODEL_BOUNDS` and `WB_AGENT_MODEL_PRICES` in `.env`. The JSON maps are
keyed by exact model ID. Field definitions are in
[coordinator setup](agent-coordinator.md#runtime-setup) and [budgets](budgets.md).
Use single-quoted JSON values in the Compose interpolation file. Bounds and prices
must cite the operator's actual review; do not copy fixture model IDs or prices.

The implemented defaults are 20 seconds transport timeout, 180 seconds lease and
1,024 maximum output tokens. Each bound must cover at least five transport timeout
intervals and satisfy `max_active_seconds + 10 < agent_lease_seconds`. The output
bound must cover `WB_AGENT_MAX_OUTPUT_TOKENS`. Limits must leave enough ordinary
tokens for `input_tokens + max_output_tokens` after the finalization reserve.
Passing these checks does not validate the scientific quality of a model.

With agents still disabled, use fresh one-off containers so the edited environment
is read (an existing `exec api` process would retain its old environment):

```bash
docker compose run --rm --no-deps api python -m workbench.model_provider
# Explicit paid synthetic check: one request per distinct model, <=256 output tokens each.
docker compose run --rm --no-deps api python -m workbench.model_provider --smoke
```

The first command makes authenticated, non-generating model lookups. The second
uses the raw adapter and is **not** covered by a project's monetary ledger; it is
a bounded account smoke check, not a research run. Save only returned model IDs,
adapter versions, usage and status. If any decision remains unknown, keep agents
disabled and use the manual workflow. Do not substitute a placeholder key or the
A10 scripted coordinator for live acceptance.

## 3. Install one reviewed authority policy

No public policy-write route or UI exists. The trusted backend command
`workbench.operator_policy` accepts a JSON object with `server` and `project`
AuthorityPolicy records. It validates by default, contacts no provider, performs
no migration, and appends both policies atomically only with `--apply`. It rejects
missing/foreign inputs and stale revisions and prints the effective intersection
for review. Reapplying the exact current pair is an unchanged no-op.

For a **new workspace without any policies**, save this recipe as
`outputs/e16-policy-draft.py` (create `outputs` first). Replace all capitalized
identifiers and set the spending allowance deliberately before running it. The
USD 1 cap below is a demonstration allowance, not an estimated run price.

```python
import json
from workbench.agent_policy import AuthorityPolicy, default_limits

limits = default_limits().model_copy(update={
    'model_requests': 12, 'coordinator_iterations': 12, 'scientific_attempts': 1,
    'specialist_assignments': 0, 'specialist_concurrency': 0,
})
policy = AuthorityPolicy(
    policy_id='operator-audit-demo', revision=1, project_ids={'PROJECT_ID'},
    artifact_ids={'DATASET_ID'}, material_ids={'ATTACHMENT_ID'},
    provider_models={'PINNED_COORDINATOR_ID', 'PINNED_SPECIALIST_ID'},
    scientific_models=set(),
    allowed_tools={'inspect_project', 'inspect_dataset', 'list_artifacts',
                   'read_artifact', 'read_job', 'read_memory', 'run_audit'},
    exposure='schema_aggregates', content_classes={'schema', 'aggregates'},
    share_operator_messages=True, limits=limits, spend_ceiling_usd=1,
    allow_reuse=True, automatic_failure_recording=False, verify_reports=True,
)
print(json.dumps({
    'server': policy.model_dump(mode='json'),
    'project': policy.model_dump(mode='json'),
}, indent=2))
```

Generate the policy file using the installed backend image. This reads no database
and makes no provider calls. No provider key belongs in this file:

```bash
docker compose run --rm --no-deps -T api python - < outputs/e16-policy-draft.py > outputs/e16-policy.json
```

Stop all writers during installation:

```bash
docker compose --profile agents stop web api worker agent-worker
docker compose run --rm --no-deps -T api python -m workbench.operator_policy --file - < outputs/e16-policy.json
# Review the complete effective policy, scope, revisions, consent and limits above.
docker compose run --rm --no-deps -T api python -m workbench.operator_policy --file - --apply < outputs/e16-policy.json
```

For an existing workspace, retain the full latest server policy and all projects
it should still cover; construct complete replacement snapshots with each revision
incremented by one. Do not reuse the revision-1 recipe or A10's test-only policy
helper. The installer never merges grants automatically. A new upload needs an
explicit revised grant; it is not covered merely because its project is covered.
Narrowing current policies immediately fences future dispatch; old runs cannot
gain scope or a larger accepted allowance from a broader revision.
To revert a mistaken policy, review the previous contents and append them as new
revisions; do not delete or rewrite historical policy rows.

This narrow demonstration policy cannot train, ingest evidence, export reports or
record failures through agent tools. For broader research, separately review the
needed tool/scientific-model scope, exact inputs, exposure and budgets. The
installed baseline comparison is predeclared; validation-driven adaptive tuning is
unsupported. Missing target/units/source declarations are not facts to guess.

## 4. Run the one-request demonstration

Set `WB_AGENTS_ENABLED=1` in `.env`, then start the matching API and agent worker:

```bash
docker compose --profile agents up --build -d --wait
docker compose ps -a
docker compose exec api python -m workbench.diagnostics
```

The profile and enablement flag are both required. The agent worker verifies pinned
model identities on startup and does not automatically restart after an exit.
Check its status, not just web health. Reload Research, select only the authorized
demo attachment/dataset, and inspect the saved policy summary. The page must show
agents available, the expected policy revision, and authorized inputs.

Enter: **“Audit the attached synthetic dataset once. Do not train, delegate or
export a report. Finish with no narrative scientific claims.”** Leave **Review the
plan before scientific work starts** unchecked, then click **Run research** once.
This click authorizes spending within the displayed limits. Expected success is a
persisted plan, one successful audit job, a completed run and its audit result
link, without an intermediate answer or approval. A reload should recover the same
run. Unknown usage, partial completion, a material question or a failed job is an
observed outcome, not a passed demonstration. Do not silently retry until it passes.

Optional **Review plan** mode pauses after a reviewable plan. Read it, accept its
current revision, then execution proceeds under the same authority. A revised plan
may require renewed acceptance. The review click does not grant new inputs or
increase the budget. Questions appear in one consolidated card; answer all fields
together. The client retains drafts and refreshes on stale revisions. Resume is
not needed after a successful answer to the outstanding questions.

Record the application SHA, runtime/model/bound/price versions, policy references,
input digest, run/job/artifact IDs, intervention count, final state, usage and
remaining uncertainties. [E15's pilot](autonomy-evaluation.md) is a separate opt-in
evaluation with a frozen attempt count; do not call a single successful demo a
general quality result. For a no-provider local rehearsal, follow [A10](tickets/A10.md).

## Exposure and spending rules

The demo sends schema/aggregates and, under separate explicit consent, goal/answer
text. Raw rows are processed by local science but are not granted provider egress.
Selected excerpts require both excerpt-class permission and exact input scope.
Raw project content and specialist-derived prose require their corresponding
authority. Source text and model proposals cannot grant permissions. Test scores
remain quarantined from selection even for a reviewer or after comparison release.
See [egress](agent-egress.md) and [evaluation discipline](agent-evaluation.md).

Budget limits are cumulative across a project's runs and policy revisions, not
per-day allowances. Continuation and Resume do not reset spending. Reservations
precede IO, cost is an estimate from reviewed prices, unknown usage stays charged,
and the finalization reserve is inside the total. A model call may be refused even
when reported token usage looks small because the next conservative reservation
does not fit. Investigate before revising ceilings; never delete ledger rows to
make a request fit. See [budgets](budgets.md).

## Recovery and safe debugging

Use the run card and the read-only private diagnostic command first:

```bash
docker compose exec api python -m workbench.diagnostics --project-id PROJECT_ID --run-id RUN_ID
```

| Situation | Operator action |
|---|---|
| Unconfirmed submission | Use **Resend with the same key**, or inspect history first. Do not create a fresh request key just because a response was lost. |
| Pause | New dispatch stops; accepted scientific jobs drain under their original deadlines. Confirm recorded state and remaining jobs. |
| Cancel | Confirm the UI control. Owned jobs are fenced, shared jobs detached; already committed external effects are not undone. |
| Worker restart / expired lease | Restart the configured worker; let scheduler reconciliation use persisted actions, receipts and checkpoints. Do not erase checkpoints or extend deadlines manually. |
| Unknown model or external outcome | Retain the reservation/operation, inspect diagnostics and the original receipt. A human answer does not refund unknown usage or authorize replay. There is no general UI reconciliation/reset command; obtain actual evidence for a trusted operator reconciliation. |
| Partial/failed result | Read the safe stop/error code and retained artifacts. Correct the underlying cause; a terminal continuation creates a linked new run and rechecks policy. |
| `BUDGET_EXHAUSTED` | Inspect project totals, outstanding reservations, per-call bounds, price coverage and finalization reserve. A new run cannot evade old spending. |
| Policy/exposure refusal | Check current exact input IDs and all authority layers. Do not relabel raw content as aggregates to make dispatch pass. |
| `INTEGRITY_FAILED` | Preserve the affected data volume and investigate; use a verified coordinated restore rather than overwriting digest files. |

Continuation and objective amendments have API support but no dedicated UI.
Use `POST /api/v1/projects/{pid}/agent-runs/{rid}/continue` with a new RunInput and
Idempotency-Key for a terminal run, or start a new request in Research. Preserve
the original run as evidence. The backend API is private; do not expose it to make
an operator command convenient. Detailed [diagnostics](diagnostics.md) use safe
IDs, states, usage and error codes, not prompts, graph checkpoints, provider bodies
or credentials. Keep even these records private.

## Memory correction and handoff

Memory has no public editing UI/API. Confirmed preferences require a trusted human
actor; a provisional finding is not a scientific fact. To correct a retained record,
follow the [operator correction recipe](agent-memory-reuse.md#operator-correction).
It preserves the old revision, requires its expected revision and the same kind,
and publishes a superseding record. It does not rewrite completed runs, scientific
artifacts, Failure Memory receipts or exported reports. Arbitrary saved notes are
withheld from provider projections. Do not update/delete memory tables directly.

Before handing off, give the next operator private configuration access, this guide,
the reviewed bounds/prices/policy references, safe demo/evaluation evidence and the
[backup/restore procedure](backup-restore.md). Carry forward unrun checks explicitly:
live provider quality, representative claim-support scoring, hosted private access,
redeploy recovery and coordinated hosted restore. D06's historical failed anonymous
access probe is not a statement about the current host; verify the accepted revision
using the [Render runbook](render-setup.md) before any hosted acceptance claim.

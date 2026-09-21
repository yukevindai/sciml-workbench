# Adaptive coordinator and runtime

E04, E06, E07, E08 and E10 now have backend runtime integration and acceptance
fixtures. Provider decisions are adaptive proposals checked by trusted services;
the coordinator does not encode a fixed audit/split/baseline pipeline. Live
account/model acceptance (E02) remains pending: the operator confirmed credentials
and model IDs are not configured. Deterministic fixtures do not establish live
model quality or hosted release acceptance.

## Runtime setup

1. Keep `WB_AGENTS_ENABLED=0` for the manual workflow. With writers stopped, run
   `python -m workbench.setup` to apply migration `0011`, initialize PostgreSQL
   checkpoints and provision local Failure Memory. This task did not migrate the
   research database; acceptance databases are disposable.
2. Configure private `ANTHROPIC_API_KEY`, `WB_COORDINATOR_MODEL` and
   `WB_SPECIALIST_MODEL`. Use pinned IDs returned by the Models API, not aliases.
   Run `python -m workbench.model_provider --smoke` for bounded synthetic live
   acceptance before calling the account/model release-validated.
3. Supply `WB_AGENT_MODEL_BOUNDS` as a JSON map keyed by each pinned model ID.
   Each ModelBound needs `model`, `revision`, `source_reference`,
   `max_request_bytes`, `input_tokens`, `max_output_tokens`, and
   `max_active_seconds`. Review the bounds for the entire accepted context,
   including tool/protocol overhead and all billed token categories.
4. Optional `WB_AGENT_MODEL_PRICES` maps IDs to Pricing records with `model`,
   `revision`, `effective_at`, `currency: "USD"`, and per-token `rates` for
   `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, and
   `cache_read_input_tokens`. Unknown prices remain unknown and cannot satisfy a
   monetary ceiling. No tokenizer bounds or prices are guessed.
5. Defaults are a 180-second lease, 20-second transport timeout and 1024 output
   tokens. Bound active time must cover five transport timeout intervals and leave
   more than ten seconds before lease expiry. Slow response trickles are checked
   against an elapsed deadline. Expired leases always fence publication.
6. Install reviewed server/project policies with explicit input/model scope and
   budgets sufficient for those per-call bounds. Runtime enablement creates no
   policies and widens none. Enable `share_operator_messages` on every authority
   layer only when operator goals and answers may be sent to the provider. This
   channel is independent of file exposure: raw rows still require raw authority.
   Model plans, source text and specialist results cannot assert this classification.
7. Enable `WB_AGENTS_ENABLED=1` and the Compose `agents` profile together, with
   matching API/agent configuration. The worker verifies pinned model identities
   before generation and closes provider/database/checkpoint resources on exit.
   The hosted supervisor starts an independent agent child when enabled. Native
   Windows supports tests; scientific process supervision requires Linux.

HTTP admission rejects disabled or invalid runtime configuration. Terminal
continuation uses `POST /api/v1/projects/{pid}/agent-runs/{rid}/continue` with
RunInput and an Idempotency-Key. It creates a newly admitted linked run without
changing the original run or accounting.

## Scientific execution and clarification

One bounded proposal is checkpointed before its effect. Backend action keys,
current policy, revisions and leases govern dispatch; provider IDs confer no
authority. Every advance reconciles jobs and external receipts. Plans and
consolidated questions use expected revisions. Amendments invalidate pending
proposals and require a revised plan. Operator answers are not silently promoted
into scientific source declarations.

Installed tools execute audits, admissible splits, sealed predeclared baselines,
filtered evaluations, evidence ingestion/exact spans, and eligible failure
recording. Identical normalized deterministic rejections do not trigger another
scientific attempt. `record_outcome` derives actor identity and objective errors
from trusted records, accepting only an eligible linked failed benchmark with a
retained output. It cannot invent human assessments, causal explanations or
test-informed thresholds. Errors without retained outputs remain operational
failures and are not imported as scientific records.

Finalization enters exact-candidate review, freezes execution records, exports
and verifies a report, or returns factual partial completion. Export retries retain
the frozen capture. Test metrics stay quarantined from selection roles.
Validation-driven tuning remains unavailable in the pinned scientific API.

## Specialists and recovery

Assignments record objectives, completion criteria, scope, deadlines and shared
allocations. Batches of at most four independent assignments are further bounded
by current run/project concurrency and budgets. They execute concurrently, receive
no tools and cannot delegate. Results remain advisory and conservatively raw
scoped prose; a narrower exposure policy can prevent delegation without preventing
local scientific tools. Scientific review runs only through finalization.

An interrupted dispatched specialist with unknown usage becomes waiting; its
reservation remains charged and no replacement call is made. Settled or unissued
abandoned work becomes failed and unused allocations close. Completed results
survive checkpoint loss. Controls and lease changes fence late publication.
Unknown external effects retain their authoritative operation status. An answer
alone cannot erase unknown usage.

## Acceptance evidence

`test_agent_acceptance.py` exercises installed audit, split, mean baseline and
verified report construction without intermediate approvals, exact PDF spans,
and actor-aware failure recording through real local Failure Memory imports.
Two provider calls synchronize concurrently to verify shared accounting.
A PostgreSQL worker-restart case reopens PostgresSaver and executes a committed
proposal without another provider call. Coordinator/scheduler tests cover
questions, amendments, deterministic rejection, replay, controls and recovery.

Generation uses deterministic provider or HTTPX transport fixtures. These establish
orchestration and real scientific integration, not live model quality. Ticket
files record verification counts. E02 remains open until private live configuration
is available; hosted rollout and backup/restore remain D06/D07 responsibilities.


Final September 21 verification:

- Linux/PostgreSQL regression: **157 passed, 1 skipped**; all 49 contracts matched.
- Final Linux/PostgreSQL acceptance/runtime run after handoff provenance and actual
  failure-import coverage: **19 passed, 1 skipped**. The skip is the SQLite
  parameter of the PostgreSQL-only worker restart test. Both containers exited 0.
- Native Windows runtime/coordinator/acceptance regression: **19 passed, 17 skipped**
  (PostgreSQL and PostgreSQL-only cases); these suites overlap the Linux coverage.
- Compose environment/startup validation and `git diff --check` passed.
- Disposable Linux test resources were removed. No live provider call, research
  database migration, deployment, commit or push was performed.

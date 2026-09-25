# Agent evaluation (E15)

Run from the repository root in the installed backend development environment:

```sh
python scripts/check_agent_evaluation.py
```

The default makes no provider calls. It writes `outputs/e15/report.json` with
revision, source digest (including untracked evaluation code), manifest digest,
platform, test outcomes, and measured paired trajectories. CI retains this report
even when the gate fails. An incomplete report has `exit_code: null`; skipped
PostgreSQL cases are not acceptance evidence. Set `TEST_DATABASE_URL` to a
disposable PostgreSQL service to exercise those cases in isolated schemas.

`backend/tests/fixtures/autonomy/v1.json` freezes two synthetic datasets, objectives,
an outcome rubric, seed, and gate modules. The second task is labelled held-out
orchestration: it is separate from prompt-development examples in this round,
not a secret benchmark or the scientific train/validation/test holdout. Bump the
fixture version for a changed rubric, inputs, or evaluation round after tuning.

Both paired arms use the same input bytes, empty memory, policy tool scope and
resource ceilings. The routing instruction is the treatment difference:
coordinator-only versus one independent schema specialist. The real coordinator,
scheduler, durable services, budget ledger, finalizer and installed audit adapter
execute. Deterministic provider decisions and token counts are scripted. Each arm
must complete one successful audit with zero intermediate interventions, scoped
tools, the expected routing, and no duplicate job references. Read order is not
prescribed. The specialist arm is deliberately requested for the comparison; this
does not recommend specialist routing for ordinary audit-only work.

The gate also runs adversarial scope/credential/injection tests, lost-response and
checkpoint replay recovery, interrupted specialists, quarantine, exact-candidate
review, corrupted reports, budget overruns and real audit/split/baseline/report
acceptance. These tests assert their own outcomes; they are not live quality scores.
A10 browser/hosted evidence and D09 deployment gates remain separate.

Measurements come from persisted rows. A consolidated question counts as one
required intervention even when unanswered; answer submissions are reported
separately without double-counting idempotent retries. Plan approvals, resumption
and amendments are explicit. Initial fixture setup is excluded. Out-of-band manual
configuration edits are unobservable and reported as null, not zero. Events retain
sequence, type and state; action summaries omit arguments and provider prose.

Comparisons include sample sizes, outcome pass counts, token categories, model
requests, elapsed-time samples and estimated/unknown cost, separated by database.
Unknown usage remains visible. The report does not claim specialist improvement.
No narrative claims are requested in these audit pilots, so claim support is null;
E11 grounding regression checks do not substitute for a human-reviewed live
scientific narrative rubric.

## Opt-in live pilot

Configure private credentials, pinned model IDs, reviewed bounds and prices as in
[the coordinator guide](agent-coordinator.md). Freeze attempt count and cost ceiling
before execution. For example, this requests four runs with a total planned ceiling
of USD 1 (one attempt per dataset and routing arm):

```sh
python scripts/check_agent_evaluation.py --live --attempts 1 --per-run-usd 0.25 --output outputs/e15-live/report.json
```

This is a paid opt-in. It uses only the frozen synthetic datasets in disposable
SQLite databases, never a research database. Both configured models must have
reviewed pricing. Each run is bounded by 12 model requests/iterations, 32,000 model
tokens, one scientific attempt, one specialist assignment, existing active-time
limits and the supplied spend ceiling. Bounds reserve resources before dispatch;
insufficient allowance fails the attempt rather than increasing it. Between one
and five attempts per arm are permitted, with at most USD 5 per run. There are no
automatic pilot reruns. The SDK transport retains its runtime deadlines.

The report records exact model identities, runtime/prompt/tool versions, input
digest, bounds, prices, output cap and policy limits. Provider seed control is
unavailable in this adapter, so live seed is null and provider nondeterminism is
explicit. Failed setup remains in the report even when no trajectory exists. Count
those failures when assessing the planned sample; comparison rows alone exclude
attempts that did not reach observation. Live tracebacks are suppressed, and reports
contain no prompts, responses, credentials or source text.

This narrow pilot establishes audit orchestration evidence only. Rich scientific
claim-quality comparisons need a separately frozen task set and human-reviewed
support rubric. Hosted operation, PostgreSQL checkpoint recovery and live model
quality are distinct evidence categories.

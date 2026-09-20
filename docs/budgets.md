# Atomic budgets and usage (E05)

`workbench.budgets.BudgetService` reserves and settles the B11 ledgers under the
project barrier. It uses persisted reservations and usage entries; checkpoints,
browser state and model arguments cannot restore or increase an allowance.
Apply migration `0008` before using the updated agent services. It adds reservation
identity/lifecycle guards to the existing tables without changing public schemas.

## Allowances and identity

Every operation is bounded by the current server/project policy, the accepted run
policy intersected with current restrictions, and any specialist allocation.
Project totals include all runs and policy revisions: a new run, resume or
continuation does not reset spending. Project `limits` are a cumulative allowance,
not a daily allowance. Authorized policy revisions can extend the project ceiling;
an existing run still retains its accepted maximum.

`Resources` accounts for tokens (all supported billed categories), model requests,
tool calls, scientific attempts, active seconds, coordinator iterations, specialist
assignments, review rounds and transient retries. Callers reserve a conservative
upper bound before work. Iteration/review/time instrumentation belongs to their
E03/E04/D11 execution paths; this service does not start a scheduler or timer.
Scientific acceptance now consumes an attempt and tool call atomically in
`RunService.bind_job`; shared jobs consume a tool call without a second scientific
attempt. Retried actions also consume a transient retry.

Each run/request ID binds an immutable intent digest, resource vector, model,
pricing snapshot, assignment, finalization flag and original control fence.
Replaying the same reservation returns it; different input conflicts. `dispatch`
changes `reserved` to `unknown` in the transaction committed **before** IO. Only
the first dispatch may send. A crash before sending can therefore conservatively
consume an uncertain allowance. A crash after sending cannot authorize another
send under that ID. New replacement calls consume a new reservation; they never
erase the old one.

`settle` appends measured usage once and releases unused capacity. All billed
input/output/cache categories count. Dispatched request, tool, scientific and retry
counters cannot be cleared by settlement. A lost response retains its full unknown
reservation until a trusted caller has actual usage evidence. There is no automatic
expiry/refund of unknown spending. `release` applies only to undispatched work or
an allocation without outstanding children. Overruns retain the actual measured
usage and fence further project spending for investigation.

Specialist allocations reserve slices of the run/project allowance; child usage
does not add that allocation twice. Allocation capacity and concurrent specialists
are bounded. Closing an allocation returns unused capacity but retains its spent
resources and the historical assignment count. Specialists cannot draw on the
coordinator's finalization reserve. Ordinary work and finalization each have their
own sub-limit inside the total model/scientific allowance; neither is extra budget.

## Provider boundary and pricing

Agent generation should use `BudgetedProvider`, not the raw E02 adapter. It commits
the reservation, releases the database transaction, calls the provider, and settles
reported usage afterward. Its request digest covers exact classified context,
offered tool schemas, model, maximum output and token-bound configuration, without
persisting prompt text. Assignment tool/material/artifact scope is narrowed before
the provider call. E14 still owns classification and filtering of context content.

The supported usage shape is input/output/cache-read/cache-creation counts.
Unrecognized usage fields fail closed with unknown usage until their accounting
semantics are integrated, including metadata extensions to the provider response.

There is intentionally **no default token bound or price**. Trusted runtime setup
must load reviewed `ModelBound` records keyed by an account-verified concrete model
ID. Aliases and unresolved models are refused. Each record supplies a revision and
source reference, maximum request bytes, conservative maximum billed input tokens
(including protocol/tool overhead and every input/cache category), maximum output,
and maximum active seconds. The input bound must cover the complete accepted
request envelope. A supported counter alone must not be assumed exact without a
reliable conservative allowance. The code does not infer a token bound from byte
length. No deployment/model bound has been verified by the offline tests.

The wrapper validates its request against that configured envelope and reserves
input-bound plus maximum output. The external runtime must enforce total elapsed
deadlines; the wrapper records elapsed time and fences observed overruns, while the
E02 adapter supplies HTTP timeouts. This accounting layer does not terminate a
stalled provider process or scientific worker.

Optional trusted `Pricing` records supply USD-per-token Decimal rates for every
supported billed category, a concrete model, revision and effective date. Rates
must conservatively cover the model's billing modes. Reservations retain the full
pricing snapshot and use the highest category rate for their worst-case token
cost. Settlements calculate an **estimate** from reported categories. No invoice
or current market price is inferred. Unknown rates or unknown billed usage produce
`cost.status = unknown`; they never count as zero-priced calls. Strict monetary
ceilings refuse unpriced dispatch and refuse further spending if earlier project
usage has an unknown cost. Runtime admission should check that required bounds and
pricing are configured before enabling a strict-cap agent run.

## Transactions and reads

All BudgetService methods accepting a session participate in the caller's short
transaction. Acquire the project barrier before scientific submission, then submit
and call `bind_job` in that transaction. B04 already acquires this barrier. On
SQLite, establishing that outer write transaction before a nested submission
savepoint is essential for rollback. Do not call a separately committing HTTP
submission service and expect a later budget failure to undo acceptance.

Active run snapshots/events refresh on budget mutations. Terminal run records stay
immutable; detail/history/reconciliation reads overlay current ledger usage so a
late settlement is visible without changing a cancelled/completed outcome. Terminal
late settlements do not add run events. Use a refreshed run read for current usage.
Unknown reservations, exact entries and control fences are returned to trusted
checkpoint reconciliation independently of graph state.

Legacy B11 reservation placeholders, legacy usage entries, and unaccounted agent
job links block new spending rather than being treated as zero. Historical reads
remain available. Their translation requires an explicit evidence-backed operator
reconciliation; E05 does not invent prior usage or discard history. Downgrade
refuses to remove budget guards while reservations exist.

The bounded tool registry, coordinator and scheduler must call these interfaces
before dispatch. This ticket does not enable D11/E04, make a provider call, add a
pricing-management UI, or introduce an administrative budget-reset endpoint.

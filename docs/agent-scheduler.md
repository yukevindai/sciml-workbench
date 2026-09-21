# Durable scheduling and controls (D11/D12)

Apply application migration `0011` and checkpoint setup through
`python -m workbench.setup` as maintenance before starting an agent worker. Scheduler
metadata and LangGraph checkpoint tables have separate lifecycles. Populated
scheduler history prevents downgrade. SQLite supports isolated development tests;
production checkpoints require PostgreSQL.

The E11/E13 coordinator finalization integration additionally requires migration
`0011` for immutable runtime-version history and the durable finalization cursor.
See [E13](tickets/E13.md) for capture, retry and verification semantics.

`agent_worker.run(settings, step, stopping)` owns an independent database engine
and PostgresSaver connection, closing both on exit. The CLI constructs the trusted
bounded coordinator after validating reviewed bounds and verifying pinned provider
identities. HTTP admission requires enabled, valid runtime configuration. See
[coordinator setup](agent-coordinator.md); live-provider acceptance is still pending.

Each lease advances one run once. Project-before-run locking serializes claim,
control and publication with scientific submission. Leases use database time,
monotonic run claim tokens, an expiry of 60 seconds by default, and worker identity.
Dispatch, budget spending, plan/question publication and finalization require a
RunService bound to the current lease. An expired worker cannot write even before
a replacement starts. Released leases are scheduled fairly by last claim time.

The injected `step(snapshot, previous_state, fenced_runs)` runs outside metadata
transactions. It returns `(checkpoint_state, next_status)` and must use the
provided RunService, including when constructing ToolRegistry or BudgetService.
It must return within the fixed lease, use bounded provider calls, and yield after
scientific submission. Arbitrary Python callback preemption is not provided.
Terminal results must be published through `fenced_runs.finish`, not a returned
state string. Checkpoint state is bounded to 256 KiB of JSON.

The snapshot re-reads authoritative runs, policies, actions, job links, reservations
and usage entries. Checkpoints never supply dispatch authority. Every claim writes
to its own checkpoint namespace; a short fenced transaction commits the accepted
pointer. Stale/orphan checkpoint writes cannot replace it. A missing committed
checkpoint fails closed. Run recovery counters survive restart. E08 still owns
adaptive reconciliation of prepared actions, provider unknown outcomes and graph
continuation decisions.

A linked queued/running scientific job prevents agent advancement but consumes no
agent execution slot. Discovery also recognizes a crash between job submission
and checkpoint publication, retaining the original action/job/budget identities.
When the job settles the run becomes eligible again. The scheduler never retries
scientific imports or unknown model calls under a new identity.

Pause immediately fences dispatch. Accepted scientific work drains under its
original fixed deadline; pause does not discard results. Cancel atomically detaches
the run's consumers and fails solely owned queued/running jobs with `RUN_CANCELLED`.
Jobs with another attached consumer, and jobs attached as shared, keep running.
Unknown external imports retain their journal and unknown action state; previous
external effects may already have committed. Reservations and receipts are retained.

Scientific workers check claim ownership every 0.5 seconds through short independent
reads. Lost authority or a database read failure stops their supervised process
group using the existing five-second cleanup grace. Database publication is already
fenced when cancellation returns; physical exit follows. These timings exclude
database/network stalls and OS scheduling. The fixed task deadline and guardian
remain the upper bound when control delivery is unavailable. Only Linux/WSL process
groups are supported in production. Other workers' PIDs are never killed remotely.

Tests in `test_agent_scheduler.py` cover competing claims, expiry, stale pointers,
scientific waits, submission crashes, cancellation ownership and persistent budget
records. PostgreSQL variants include closing/reopening PostgresSaver. Worker and
publication tests verify interruption and rejection of late results. Hosted
restart/restore and real-provider acceptance remain D06/E04 work.

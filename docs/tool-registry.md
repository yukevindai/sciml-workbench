# Scoped typed tools (E03)

`workbench.tool_registry.ToolRegistry` is the server-only dispatcher for the
coordinator. It is not an HTTP endpoint and does not enable agent execution.
E04/D11 must construct `DispatchContext` from an authenticated project, persisted
run revision and current scheduler claim token. The coordinator assigns a stable
action key before invoking a tool; provider call IDs are not authority.

## Available surface

The registry exposes fifteen versioned descriptors with Pydantic input/result
schemas, role restrictions, prerequisites, artifact versions, resource estimates,
effect/retry classes, expected outputs and response byte limits:

- `inspect_project`, `inspect_dataset`, `list_artifacts`, `read_artifact`, `read_job`
- `run_audit`, `generate_split`, `ingest_evidence`
- `seal_evaluation`, `run_baseline`, `read_evaluation`
- `build_report`
- `read_memory`, `read_failure`, `search_failures` (retained, filtered snapshots)

Definitions are filtered by installed capabilities and current policy. Audit and
split option schemas come from the pinned public configuration dataclasses; the
workbench does not duplicate their scientific algorithms. Unsupported split
strategies and unintegrated molecular split options are rejected before enqueue.
Benchmark execution accepts a sealed candidate ID, never an arbitrary replacement
task card. Sealing currently supports predeclared comparisons without a success
criterion declaration; trusted criterion provenance is a later extension.

Only the coordinator role is enabled. Specialist dispatch requires E10 assignment
authority and is denied today. Evidence excerpt/search, live failure-memory retrieval
and mutation, reconciliation, claim validation, standalone report
verification and scientific replay are not offered through this registry yet.
Unknown names return `UNSUPPORTED_CAPABILITY`; there is no shell, code, SQL,
filesystem path, storage-key or URL-fetch tool. Existing manual services retain
their own interfaces.

## Atomicity and authority

Every call validates finite bounded JSON, strict typed arguments, installed
capabilities, current controls, effective policy and project-scoped input lineage.
New metadata work then runs under the project barrier. Action preparation, job
submission, run/job binding and E05 budget consumption share one transaction.
The existing submission and evaluation services accept an internal session for
this composition; standalone callers still receive their own committed transaction.
No scientific adapter runs inside dispatch.

Concurrent calls with the same stable action key return the same committed
receipt. Changed arguments conflict. Reads are also charged once and their result
is frozen under that identity; use a new action key for another poll. Replaying a
read after its effective policy changes fails closed. Pause, cancellation, stale
control revisions and rotated claim tokens fence dispatch, including replay.
There are no automatic retries or new scientific attempts hidden in a read.
E09 adds [compatible reuse and memory](agent-memory-reuse.md); E12 refreshes
[evaluation exposure](agent-evaluation.md) on read replay. Memory correction
invalidates an earlier cached retrieval instead of returning superseded advice.

`tool_scope.derived_artifacts` reconstructs output authority from accepted E03
actions and linked jobs. A generated artifact becomes accessible only if its
request inputs and immutable parents remain authorized in the same run/project.
This closure is recomputed against current policy; revoking an input revokes its
descendants. Model-supplied IDs and unrelated project outputs cannot expand scope.
Unlinked manually generated artifacts require explicit authorized run inputs.

Reports freeze authorized non-report artifacts, linked non-report jobs and
attachments at the persisted control revision/event cutoff. They wait for selected
jobs to settle, preserve their accepted snapshot on replay and never recursively
include earlier report artifacts.

## Provider-facing results

Results are `completed`, `submitted`, `blocked` or `failed` envelopes with safe
error codes and receipt identities. Successful responses fit both a 16 KB tool
ceiling and the current policy context ceiling. Oversized projections roll back
the transaction instead of silently truncating scientific facts.

Dataset inspection exposes exact column names and declaration origins as
untrusted schema content; it does not expose rows or source declaration values.
Other ordinary artifact reads expose allowlisted counts/status only. Audit
completion explicitly says scientific acceptance has not been assessed.
Benchmark reads use the C12 validation projection; test release is unavailable in
tool arguments. Raw artifacts, predictions, source prose, bundles, free-form
worker errors and report bytes are never returned. `ToolResult.context()` retains
the trusted content classification for E02. Comprehensive E14 filtering remains
required before enabling live model execution.

## Validation

`backend/tests/test_tool_registry.py` covers schemas, unsupported capabilities,
malformed requests, cross-project references, role/control fences, concurrent
idempotency, budget rollback, injected dispatch failure, output bounds, generated
scope revocation, real audit/split workers, sealed candidate submission,
quarantined metric projections and report replay. The metadata suite is
parameterized for SQLite and PostgreSQL. Benchmark projection tests use explicitly
synthetic persisted scores; they do not claim a scientific performance result.

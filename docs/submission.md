# Durable scientific operation submission

`workbench.submission.SubmissionService` is the shared entry point for HTTP operation routes and future trusted tool dispatch. It validates the request, checks scope/admission, owns its database transaction and returns only after commit. HTTP handlers return the existing job projection with 202; they never execute adapters. The independent scientific worker consumes accepted jobs even if the HTTP response is lost.

B04 adds no database revision, environment variable, dependency or HTTP schema. B03's revision 0003 remains required. Existing project creation and CSV attachment semantics are unchanged.

## Identities and scope

Operator routes construct `SubmissionScope(project_id)` after authentication and pass the original `Idempotency-Key`. Keys must contain 1–100 characters and cannot be blank. They remain unique across operation kinds within a project. The namespace `action:v1:` is reserved for tool identities.

Trusted tool dispatch constructs a scope from authorized server records, including a run ID and explicit sets of allowed artifact/material IDs. It passes `action_id` and `attempt_id`, not a browser request key. The service derives a bounded key from version-1 canonical hashing of `(run_id, action_id, attempt_id)` under the reserved prefix. Transport retries keep all three IDs; a new attempt has a new identity. Project uniqueness is enforced independently. The future action ledger must retain the action-to-job association; the hash is not a substitute for that ledger.

```python
scope = SubmissionScope(
    project_id=trusted_project_id,
    artifact_ids=frozenset(authorized_artifact_ids),
    material_ids=frozenset(authorized_material_ids),
    run_id=trusted_run_id,
)
job = service.submit(
    scope, "audit", {"dataset_id": selected_dataset_id, "config": {}},
    action_id=recorded_action_id, attempt_id=recorded_attempt_id,
)
```

Scope, action identities, policy and project identity must never be taken from provider-proposed arguments. B11/E03 must resolve the persisted run, authorize capabilities and policy, and record the action before calling this service. B04 supplies this internal interface; it does not enable a provider, an HTTP tool endpoint or autonomous execution.

Artifact/material allowlists are checked on every call, including replay. Benchmark scope includes the split's parent audit because execution consumes it. Cross-project references fail even when a caller's allowlist contains their IDs. Evidence tools must reference an allowed PDF material; arbitrary blob keys and raw uploads are not tool arguments. Agent failure recording is unavailable until the actor-aware failure service exists, and restricted reports are unavailable until B06 implements run-scoped capture. Neither silently falls back to a broader legacy operation.

## Acceptance transaction

1. Validate a supported operation shape and finite, bounded JSON. Apply the same typed defaults used by HTTP routes. Upstream configuration dictionaries remain upstream-owned; this service does not run science to validate them.
2. Acquire the short project submission barrier: a row lock on PostgreSQL, or a no-op project write to acquire SQLite's writer lock.
3. Enforce input scope and compare any existing request key against the canonical operation/payload digest and retry reference. Exact replay returns the original job before considering newer project activity. Changed content or kind returns `IDEMPOTENCY_CONFLICT`.
4. For new requests, resolve operation references, check lineage and admission, insert the immutable queued job, and commit.
5. Serialize/return the committed job. Losing the response cannot roll back accepted work. A transaction failure returns no accepted job.

The unique database key remains the final arbiter of concurrent inserts. `job_metadata.submit_job` is a lower-level transaction/persistence primitive retained for the shared service and runtime/migration tests; tool and HTTP code must use `SubmissionService`.

Canonical identity version 1 is unchanged. Typed defaults are expanded before hashing, object-key order is insignificant and array order remains significant. Stored requests/digests are never rewritten. For a valid existing request, newer busy state or new admission policy does not create a new operation; scope checks still apply.

New report requests reject active non-report project jobs with `PROJECT_BUSY`. A previously accepted report key returns its existing job even when newer work is active. The barrier serializes submission admission only: B06/B08 still own report snapshot/publication coordination. B04 does not turn execution-time project capture into a request-time immutable snapshot.

For Dataset 2.0, benchmark submission rejects unresolved or inferred source fields required by the upstream source card with `ADMISSION_REJECTED` (422). Descriptive audit and split submission do not require those source facts. Detailed scientific configuration/admission and fitting remain in the bounded worker; later rejection remains a durable job outcome.

## PDF compatibility and retries

The legacy PDF upload route delegates to `submit_pdf`. It checks authentication/scope, byte/type/title/key limits and replay/conflict before publishing bytes. Blob publication occurs outside the metadata transaction; final admission is rechecked under the project barrier. A replay returns its job without another blob write. A racing losing request may leave an unreferenced complete blob, which is safe under D02's storage contract.

The material ingestion route uses the same service and derives the original PDF key/title from the scoped binding. The persisted evidence payload remains compatible with the existing worker and previous accepted requests.

Internal callers may pass `retry_of_job_id` for an explicitly authorized new attempt. The reference must name a failed terminal job in the same project with the same operation and canonical payload. The original row is immutable, and replay of a retry must retain its retry reference. Changed scientific inputs use a distinct new request, not a transport replay. B04 does not automatically retry anything or authorize retry policy; B07/D04 own external-outcome reconciliation and bounded recovery.

The frontend's broader durable request-key/reconnect UX remains A09. Clients uncertain about acceptance must retain and resend the exact key and payload, or read existing jobs; generating a new key deliberately requests another operation.

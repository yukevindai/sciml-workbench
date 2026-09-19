# Fenced result publication (B08)

`workbench.publication.publish_result` is the shared scientific publication boundary. The worker re-exports it for existing internal callers. HTTP handlers still submit jobs; scientific execution, upstream imports and blob IO happen outside metadata transactions.

## Publication protocol

1. Require the original `JobClaim` and copy the detached work/result to prevent caller mutation during publication. Validate the typed artifact and its expected identity.
2. Verify each referenced output/source blob through the immutable store before acquiring metadata locks. Missing or corrupt bytes reject publication. A successful benchmark must include a bundle. Callers publishing blob-backed outputs must supply `store=`; the worker supplies `LocalStore`.
3. Open a short transaction, lock the project barrier, then the scientific job. Validate running state, exact claim token, worker identity and database deadline after any lock wait. Future run/assignment/action barriers must remain between project and job, in the blueprint's order.
4. Compare job identity and accepted payload, reload authoritative immutable inputs, and reject altered detached artifact metadata. Verify the frozen report capture and typed result lineage/configuration. Recheck the worker's stop signal after lock acquisition and before terminalization.
5. Save the artifact, any B07 receipt link, and provenance in the same transaction. `finish_claim` rechecks authority and the database clock after flushing, then conditionally writes the result link and terminal state. Commit exposes all of these changes together.

A failed benchmark may publish its observed scientific result while terminalizing as failed. Cancellation and infrastructure errors do not become scientific artifacts. Blob verification establishes byte integrity; C08/C09 retain richer archive validation and scientific replay responsibilities.

The conditional terminal update is publication's decision point inside the transaction; readers observe it only after commit. A failed flush or commit rolls back artifact, provenance, journal artifact linkage and job result/state together. Durable immutable bytes remain available and are not deleted on rollback, since another artifact may share them. B07 receipt confirmation is a separate prior commit and can truthfully survive failed publication.

## Cancellation fence for trusted controllers

```python
from workbench.publication import fence_cancelled

with db.session.begin() as session:
    changed = fence_cancelled(session, authorized_project_id, original_claim)
```

The caller must establish authorization and sole ownership before invoking this primitive. It uses project-before-job lock order and checks project, original token, worker and running state. A matching claim becomes `failed` with `RUN_CANCELLED`, an advanced token and a finish timestamp. A replaced or terminal claim returns false without modifying its history. Wrong-project references reject. Commit before acknowledging an effective cancellation.

If cancellation commits first, later publication is stale and inserts nothing. If publication already holds the barrier and commits first, cancellation preserves that completed result. Duplicate callbacks and late worker errors cannot overwrite either outcome. A local worker stop signal is also checked after publication lock waits, but does not replace a controller's durable fence.

This primitive does **not** add an agent cancellation endpoint, decide shared-job ownership, cancel queued work, maintain a run control generation, or terminate a process. B11/B12/D12 own those controls and must detach shared consumers rather than cancelling their jobs. The four-state job vocabulary and existing database guards are unchanged.

## Compatibility and operation

No additional migration, environment variable, dependency or HTTP schema is introduced by B08. The B07 journal still requires revision `0004`. `TaskFailure` now lives in the private execution protocol and remains available from `worker`; publication owns its own terminal-update dependency for failure injection tests.

Claiming holds only the job lock and commits before computation or project-barrier acquisition. Publication and cancellation lock the project before the job. Error callbacks touch only the matching job and never acquire a later project lock. No adapter call, file read, digest check or process wait runs inside the publication transaction.

Coverage includes committed-state assertions for cancellation/publication ordering, post-lock shutdown, commit rollback, immutable input substitution, missing/corrupt output files, late errors and duplicate callbacks, plus the existing real worker process, deadline, report snapshot and B07 receipt suites.

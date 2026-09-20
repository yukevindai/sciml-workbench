# Failure Memory receipts and scoped retrieval (C06)

The adapter now lives in `workbench.failure_memory` and remains available as `adapters.FailureMemory`. It uses the public application factory and authenticated JSON API; provisioning still uses the public operator CLI. It never imports upstream database/authentication/record-service helpers or reads upstream tables.

## Confirmed import receipts

`save(project, external_id, record)` now returns the existing B01 `FailureReceipt`, replacing the previous `(external_project_id, record)` tuple. It includes the connector, stable external operation ID, local request digest, confirmed state, external project/record IDs and full returned record snapshot. The service maps these fields into the unchanged Failure 1.0 artifact. No new HTTP schema or database migration is needed.

The digest uses workbench request-identity version 1 with kind `failure_import`, workbench project ID and the exact submitted import envelope. It is **not** the upstream digest of its normalized/default-filled import model. Repeating identical submitted input produces the same workbench digest and resolves the same upstream record ID. Changing a record under the same project/connector/external ID returns upstream HTTP 409 rather than overwriting it. Another workbench project has a separate namespace.

The returned record is a snapshot. Independent upstream edits do not rewrite saved workbench artifacts. Replaying an original import after a native edit resolves the same ID but returns its current upstream snapshot, while the original request digest stays unchanged. A receipt does not mean that upstream content can never change.

Import/provisioning calls retain the existing single-host shared file lock and run outside workbench database transactions. The [B07 journal](external-operations.md) now wraps worker imports with durable identity, destination binding, receipt persistence and trusted reconciliation. [D04 recovery](recovery.md) now supplies automatic recovery policy and recovery publication. This ticket does not switch outcomes to Failure 2.0 or implement C07 actor/criterion semantics.

## Scoped live search

`search(project, query="", status=None, archived=False, limit=50)` returns typed `FailureSearchResult`; `search_async` is also available. Imports use the synchronous `save` wrapper to retain the shared file lock. Callers must resolve an authorized workbench project before calling this internal adapter; model-supplied project objects are not authority. E03/B09 still own user/agent tool and projection wiring.

The adapter resolves that project's remote identity and always supplies `project_id` to upstream `/api/search`. It validates query/filter limits before HTTP IO, preserves upstream matching evidence/record data, checks every returned project's identity, and rejects responses exceeding the requested limit. Search does not provision labs/projects or import data. No match is fabricated when authentication, permissions, a missing endpoint or an upstream scope limit fails.

Results identify the source as live upstream, the local/remote project IDs, `coverage`, requested limit and whether the limit was reached. `coverage="no_project_mapping"` explicitly distinguishes an absent mapping from a completed search of a mapped project. `limit_reached` is not proof that more matches exist.

The public API supports lexical terms, outcome status, archived state, and a limit of 1–200 (default 50), with query length at most 1,000. It has no pagination cursor or semantic/vector search. Scopes over 10,000 records are rejected upstream. These limitations accompany typed results; missing/unavailable search errors propagate rather than silently returning an empty list. No local-snapshot fallback is necessary for the pinned installation, and none is silently substituted.

## Identity mapping and independent operation

The existing remote convention is the `SciML Workbench` lab and a project name ending in ` [<workbench-project-id>]`. Resolution now uses the stable suffix within that lab, rather than the mutable workbench display name. Workbench renames therefore preserve the destination. Identical display names in different workbench projects remain separate. Multiple matching labs/projects fail explicitly; the adapter never arbitrarily picks one.

This convention is not a durable external-ID registry. If an operator independently renames the remote lab or removes the project-ID suffix, automatic resolution cannot recover that mapping: search reports no mapping, and import may provision a new destination. B07 worker imports persist a destination binding before submission and reuse that ID on subsequent jobs/reconciliation. The standalone adapter and live search still resolve names; preserve those markers for these callers. Native record creation, edits, archives, reads and searches remain supported and are exercised in C06 tests; no native routes or permissions were changed.

Each session uses public login, cookies, `X-EFM-Request` and CSRF headers and checks logout. Logout is attempted after body errors without replacing the primary import/search error. A failed logout after an otherwise successful operation still raises; callers must reconcile/replay rather than assume an unreturned receipt exists. Receipts/search results contain no login token, CSRF token or configured credentials.

See [C06 acceptance](tickets/C06.md) and the [C01 public-surface inventory](scientific-public-surface.md) for pinned versions, public API evidence and tests.

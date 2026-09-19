# External operation journal (B07)

Failure Memory imports now have a workbench-owned durable journal. Apply Alembic revision `0004` before starting the updated workers. The upstream integration still uses only the public authenticated API and operator CLI; no upstream tables or private services are accessed.

## Stored identity and outcomes

`external_operations.job_id` is both the original workbench job reference and the import's stable external ID. The row stores the connector, exact UTF-8 JSON body, SHA-256 of those bytes, the existing version-1 `FailureReceipt` request digest, submission count/time, destination, confirmed receipt, and optional published artifact link. The two digests have different purposes: byte integrity versus the existing scoped logical request identity.

| State | Meaning |
|---|---|
| `prepared` | Exact request committed; no import launch has been admitted. Destination provisioning may have occurred. |
| `unknown` | Submission committed before launching IO; import may or may not have committed upstream. Reconciliation is required. |
| `confirmed` | A validated public API receipt is durably recorded. Artifact publication may still be missing. |

`attempts` counts durable launch admissions, not proven upstream requests. A crash between journal commit and process launch is intentionally unknown. Transport errors, timeout, malformed responses and unconfirmed HTTP errors cannot manufacture success. There is no automatic retry loop.

The initial project destination is resolved/provisioned in a bounded subprocess using the existing shared file lock. The parent commits `external_projects` and the operation's destination before importing. Subsequent jobs and reconciliation use the saved remote ID without name resolution. Destination changes fail closed. A failure before the first binding commit can still require operator inspection if the remote lab/project was independently renamed; no unobserved provisioning ID is invented. Standalone C06 live search continues using its documented name-marker resolution.

## Worker boundaries

Preparation records the request in a short project-locked transaction. The parent commits unknown status before launching the import subprocess. The child receives the exact saved body and bound destination, and sends those UTF-8 bytes to the public idempotent import endpoint. It receives no workbench database credentials and performs no workbench metadata writes.

The parent validates receipt identity, digest, project and record IDs, then commits confirmation independently of artifact publication. Normal publication still locks the project and current job claim, validates lineage, and atomically links the journal to the saved Failure artifact and terminal job. An expired claim cannot publish, but an observed receipt can remain confirmed. A worker killed before saving the receipt leaves unknown state.

Database guards prohibit changes to import identity/body/digests, rebinding a destination, deleting journal history, regressing confirmed outcomes, replacing a confirmed snapshot, or changing an existing artifact link. Composite foreign keys enforce same-project job and artifact ownership. Concurrent reconciliation may admit multiple exact replays; the supported upstream idempotency key resolves one record, and the first confirmed snapshot is retained.

## Trusted reconciliation interface

```python
from workbench.external_operations import reconcile

receipt = reconcile(db, settings, authorized_project_id, original_job_id,
                    expected_body=previously_read_exact_body)
```

This internal service requires a trusted caller to authorize the project. It is not an HTTP endpoint or model-facing tool. `expected_body` is optional; when provided, even whitespace changes reject before IO. Every call validates the persisted body against both digests and original external ID. Recovery also compares the immutable scientific inputs with the original request. Missing journals, wrong projects, altered bodies and destination mismatches fail closed.

An unconfirmed operation must belong to a terminal original job. Reconciliation uses the bounded worker runner and original external ID/body/destination; an already confirmed operation returns its saved receipt without upstream IO. It does not change the original failed job, manufacture a new assessment, or publish a recovery artifact. D04 owns policy-governed automatic recovery and guarded missing-artifact publication; [B09 manual reads](read-projections.md) expose receipt status separately from the original job result; agent reads remain gated on C12. The service returns confirmation even when the original job remains failed.

An explicit retry job cannot replace an existing journaled failure import with a new external ID. Use reconciliation for that operation. A genuinely new researcher assessment uses a new request as before. Legacy failed jobs without a journal are not automatically reconstructed or labeled confirmed.

Failure 1.0 and public HTTP schemas are unchanged. C07 retains Failure 2.0 actor/criterion semantics. Restore workbench metadata, immutable storage and Failure Memory storage together; downgrading a populated journal or binding table is refused.

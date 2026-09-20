# Interrupted scientific and import recovery (D04)

Apply metadata migration `0007` before starting updated workers. Each scientific
worker processes at most one recovery before claiming ordinary work. Existing D03
claim sweeping fences expired executions; the following worker pass discovers
their failed jobs. No HTTP request executes science or reconciliation.

## Recorded policy

`job_recoveries` stores one decision per original job, the `manual-recovery-v1`
policy snapshot, attempt count, due time, lease token/deadline, retry job linkage,
and a redacted event history. Discovery, claiming and publication take the project
barrier in short transactions. Upstream IO runs outside metadata transactions in
the existing bounded subprocess. Recovery deadlines cannot be renewed by restart.

The policy permits one new scientific execution after `WORKER_INTERRUPTED`,
`JOB_TIMED_OUT`, or `DEPENDENCY_UNAVAILABLE`, provided no result or retry already
exists. The new job has the original canonical payload (including a report's
frozen capture), a reserved deterministic request key, and `retry_of_job_id`.
The original job stays failed. Retry jobs are never automatically retried again.
`completed` on a scientific recovery means the retry was durably queued; the
linked job records its eventual scientific outcome.

Import recovery requires the original journal. A confirmed receipt may recover
missing publication; a prepared/unknown operation may reconcile after the
transient errors above. An unknown import with `INTERNAL_ERROR` is also eligible
because its response or local commit may have been lost. Reconciliation repeats
the exact stored body, connector, external ID and bound destination. It never
creates another job or assessment. Publication verifies the journal and receipt,
revalidates authoritative inputs and Failure 1.0/2.0 fields, then commits the
artifact, provenance, journal link and recovery completion atomically. The failed
job's error and `result_id` remain unchanged. B09 receipt projections expose the
resolved artifact separately.

Recovery has at most three leased attempts, including attempts interrupted by
worker death. Transient failures wait 30 then 60 seconds. Expired leases can be
replaced within the recorded limit; their stale publishers are rejected. Restart
does not reset counters. Unknown receipts remain unknown after exhaustion.
Deterministic validation, admission, integrity and authority failures stop
recovery. Cancellation is ineligible. Exception messages and credentials are not
stored in recovery history.

## Ownership and operational limits

This policy applies to manual jobs. Agent action keys, jobs linked to agent runs,
and sealed evaluation candidates are excluded: their retries must retain run
authority, evaluation membership and budget reservations through D11/D12/E08.
An existing explicit retry also prevents an automatic duplicate. These exclusions
are durable decisions, not new authority granted to a scientific worker.

Inspect `job_recoveries` together with `jobs` and `external_operations` when a
recovery is exhausted. Existing trusted receipt reconciliation remains available
for operator investigation; it does not reset recovery budgets or relabel failed
jobs. No recovery-control HTTP API or UI is added by D04. Do not edit journal
identity/body fields or submit a new assessment to resolve an uncertain import.

The existing supported supervision boundary remains Linux/WSL. Recovery does not
garbage-collect abandoned workspaces/blobs or restore unavailable databases.
Unknown upstream outcomes cannot be resolved while the dependency is unavailable.
Migration downgrade refuses to discard populated recovery history.

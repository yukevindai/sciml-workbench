# Scientific worker runtime (D03)

The scientific worker consumes the durable PostgreSQL queue independently of HTTP requests and the reserved agent scheduler. Run one worker in the supported Linux/WSL deployment with shared local storage. PostgreSQL claims support competing workers; that does not make a distributed worker fleet or separate local disks supported.

## Execution and publication

1. A short claim transaction records the worker identity, advancing claim token, start time and fixed database deadline. Existing running jobs are never adopted or given a fresh budget. Expired claims become failed; queued work remains available after restart.
2. Another short transaction validates the original claim and copies the accepted request and required artifact metadata into a detached task input. It allocates the result ID. Blob reads, scientific adapters, report assembly and Failure Memory requests happen after that transaction closes.
3. A lightweight guardian supervises a separate compute process. Neither receives publication authority or a workbench database connection. Tasks receive storage configuration; only Failure Memory tasks receive the upstream account. Database, API and model credentials are excluded from the task environment. This is trusted application code with filesystem access, not an OS security sandbox.
4. The child returns a strict private JSON result capped at 32 MiB. The parent validates the artifact identity and project, locks and rechecks the original claim and deadline, and commits the artifact, provenance, result linkage and terminal job state together. An expired or superseded claim cannot publish a late success. Publication rollback leaves no committed result/provenance; immutable unreferenced blobs may remain.

Public artifact contracts and database schema are unchanged. Internal callers must retain the complete `JobClaim`; a job ID alone no longer authorizes `process_job`. `services.execute` consumes a detached `Work` input and returns an artifact without metadata writes. These private interfaces are intentionally separate from API contracts.

## Deadlines and shutdown

`WB_JOB_TIMEOUT_SECONDS` sets the deadline when a queued job is claimed. Changing settings or restarting a process does not extend an existing deadline. The worker converts the database's remaining allowance to a conservative monotonic deadline; input preparation, process startup, computation and result handling all consume it. Publication additionally checks current database time after taking the row lock and before the terminal update.

On timeout or SIGTERM/SIGINT, the worker stops its task and publishes a fenced `JOB_TIMED_OUT` or `WORKER_INTERRUPTED` failure when metadata is available. It stops claiming further jobs after shutdown is observed. The guardian gives computation up to two seconds to exit, then kills its process group, including descendants left after the direct child exits. The worker allows five seconds for guardian cleanup. Cleanup can therefore finish after the execution deadline; the extra cleanup allowance never authorizes result publication. The application launcher allows ten seconds for worker shutdown.

If the worker is killed, the guardian notices the parent change and terminates computation. The next worker leaves the original running claim alone until its persisted deadline expires; it can process other queued work meanwhile. There is no automatic scientific retry or checkpoint adoption. Database outages may prevent terminal failure recording; the expired-claim sweep handles such rows when a worker can access metadata again. Deadline supervision bounds computation, not an indefinitely stalled database or filesystem operation.

Process groups cover descendants that remain in their inherited group. Deliberate group escape, a killed guardian, uninterruptible kernel IO and whole-host failure require host/container cleanup. Native Windows supports development tests only; the worker and launcher entry points require POSIX process groups. Deployment memory sizing must include the worker, guardian, scientific process and any library subprocesses.

## Storage and external writes

Each attempt uses a private `workspaces/job-*` directory beneath `WB_STORAGE_ROOT`. Its input, bounded output and temporary scratch files are removed after normal completion, handled errors and graceful interruption. Abrupt worker death can leave an orphan workspace, including sensitive inputs or the Failure Memory credential; protect the volume. No automatic orphan cleanup or blob deletion is implemented. Never sweep a live worker's directories or delete final digest objects as rollback compensation.

Failure Memory operations serialize through an OS file lock at `.failure-memory.lock` on the shared local filesystem, replacing a workbench database transaction held across upstream calls. The OS releases the lock when its process exits. Waiting for that lock consumes the task deadline. This lock does not coordinate independent upstream writers or make network filesystems supported.

A timeout can occur after an upstream import committed but before its response was recorded. Do not infer that the external write failed or blindly retry it under a new identity. The [B07 journal](external-operations.md) commits unknown status before import, retains the original body/ID, and supports trusted reconciliation. [D04 recovery](recovery.md) provides bounded automatic recovery and guarded missing-artifact publication. The [B08 publication service](publication.md) supplies durable-output preflight, project-before-job fencing, authoritative input checks and a trusted cancellation fence. D11 retains agent scheduling and D12 run ownership/process cancellation. B06 report jobs carry a request-time [frozen capture](report-capture.md); preparation verifies its digest, and publication checks the detached copy against the accepted payload. Publication acquires the project barrier before the job lock. Legacy report jobs without a capture fail closed rather than exporting newer state.

See [D03 acceptance evidence](tickets/D03.md) for the checks actually run.

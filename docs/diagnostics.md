# Private agent and queue diagnostics (D08)

Run the read-only operator view inside the private backend environment:

```bash
python -m workbench.diagnostics
python -m workbench.diagnostics --project-id PROJECT_ID --run-id RUN_ID
```

For Compose, use `docker compose exec api python -m workbench.diagnostics`.
For Render, use the backend's authenticated operator shell. This command requires
the backend configuration and filesystem access; it has no public HTTP endpoint
and adds no model or database credentials to the frontend. It never calls a model,
executes science, resumes work, edits a ledger or clears a lease. Existing public
health endpoints remain separate from this private operator view.

Output is one JSON object. Exit status **0** means no configured alert was observed,
**1** means alerts are present, and **2** means diagnostics are unavailable or were
withheld by the secret guard. A missing/unbounded resource observation is `unknown`,
not proof of health. An unavailable database produces only
`DIAGNOSTICS_UNAVAILABLE`, with no driver exception or connection string.

## Reading the view

| Section | Meaning |
|---|---|
| `scientific_queue` | Counts by persisted job state, age of oldest queued job, number past their fixed deadline |
| `agent_queue` | Counts by run state, age since the latest queued event, expired active leases |
| `runs` | Paused/input-waiting, scientific wait, queued/delayed, advancing/expired or terminal condition; checkpoint advancement lag |
| `correlations` | Project, run, action and linked job IDs with whitelisted action states |
| `jobs` | IDs, state, queued age, deadline status and a safe error code |
| `unknown_model_usage` | Unsettled dispatched model reservations and age of the oldest, retaining their budget charge |
| `workers` | Independent scientific/agent heartbeat age, current phase and time since process progress |
| `model` | Age and outcome of the latest locally observed provider call; never a live availability probe |
| `resources` | Free bytes/fraction on the data filesystem and observed cgroup-v2 memory use/limit |
| `application_revision` | Valid full `RENDER_GIT_COMMIT`, otherwise `WB_APPLICATION_REVISION`, otherwise null |

Use the actual deployed application SHA for `WB_APPLICATION_REVISION` in native
environments; an unverified value does not establish deployment provenance. Render
normally supplies `RENDER_GIT_COMMIT`. This command does not infer a revision from
the operator's unrelated local checkout.

`--limit` bounds each detail list (default 100, maximum 500), with explicit
`truncated` flags. Aggregate queue/usage counts and alerts include all scoped rows,
including rows outside the displayed page. Increase the limit or filter a run to
inspect its correlations. A run filter requires its owning project; foreign runs
are rejected. Worker/model/resource observations are service-wide even with a
project filter; they carry no other project's content or correlation IDs.

Paused and input-waiting runs have `operator_wait`, not a stalled-worker label.
`waiting_for_job` has `scientific_wait`: inspect its linked job and deadline before
deciding anything is stuck. A recent worker heartbeat proves only that its heartbeat
thread recently ran. Compare progress age with lease/job deadlines to diagnose a
process that is alive while its operation has stalled.

Checkpoint lag counts the difference between a scheduler lease generation and its
committed checkpoint pointer's `lease-N` namespace. One pending advancement is normal
during execution. `checkpoint_pending_seconds` is time since that lease was claimed,
not the age of raw checkpoint contents. No checkpoint blob, prompt, tool argument,
operator goal, dataset row or provider response is loaded for display. Expired active
leases indicate interrupted advancement; the existing scheduler owns recovery.

## Alerts and responses

| Alert | Trigger and operator interpretation |
|---|---|
| `SCIENTIFIC_QUEUE_DELAYED` | Oldest queued scientific job exceeds `--stall-seconds`; inspect scientific worker independently of the provider |
| `SCIENTIFIC_DEADLINE_EXPIRED` | Running job has passed its persisted deadline; check worker recovery/process cleanup |
| `AGENT_QUEUE_DELAYED` | Enabled agent has a queued run older than the threshold; inspect agent/configuration/policy |
| `AGENT_LEASE_EXPIRED`, `CHECKPOINT_ADVANCEMENT_INTERRUPTED` | Running run lacks a live lease; inspect scheduler recovery, not a user-input pause |
| `SCIENTIFIC_HEARTBEAT_UNAVAILABLE` | Scientific heartbeat missing, stale, malformed or stopped |
| `AGENT_HEARTBEAT_UNAVAILABLE` | Configured agent heartbeat missing, stale, malformed or stopped |
| `AGENT_CONFIGURATION_INVALID` | Reviewed runtime configuration fails validation; no raw configuration value is returned |
| `MODEL_CALL_FAILED` | Recent provider call reported failure/unknown usage; this does not declare the scientific queue unhealthy |
| `MODEL_USAGE_UNRESOLVED` | Unknown model reservation is older than the threshold; retain it and reconcile under the existing budget policy |
| `STORAGE_LOW` | Data filesystem has less than 10% free or less than 256 MiB free |
| `STORAGE_PROBE_UNAVAILABLE` | Filesystem capacity cannot be read; do not assume capacity is adequate |
| `MEMORY_PRESSURE` | Observed cgroup-v2 memory use is at least 90% of its finite limit |

Default `--stall-seconds` is 300 and `--heartbeat-seconds` is 30. Adjust these
operator thresholds for a measured workload; they do not change execution deadlines,
retry budgets or reservation accounting. Unknown usage includes requests in flight,
so it is visible immediately but only produces the aged-usage alert after the window.
Disabling agents suppresses agent queue/lease/heartbeat alarms and labels runnable
agent rows `execution_disabled`; retained unknown usage still needs reconciliation.

No alert sends email or changes services automatically. An operator's existing
monitor may collect JSON and use exit statuses. Keep output private despite its
redaction. Planned maintenance intentionally reports unavailable/stopped workers;
account for that maintenance window in the operator's monitor.

## Observation storage and limits

Workers publish small, atomically replaced owner-only files under
`WB_STORAGE_ROOT/.diagnostics`. A background pulse runs every five seconds; phase
changes also update observations. It never extends a job deadline or agent lease.
Failed telemetry writes do not interrupt scientific/model work; missing/stale
observations expose that loss to the operator. Model outcomes contain only a timestamp
and one fixed outcome class. No provider exception prose is written.

The files are advisory and included in D07's full-volume backup. Restored files do
not prove the original processes are alive and can appear recent until the heartbeat
window expires; wait for fresh process progress after restore. There is one file per
role for the supported single scientific worker/single agent scheduler deployment;
these observations are not a distributed worker registry.

Memory measurements use the diagnostic process's visible cgroup-v2
`memory.current`/finite `memory.max`. Render's co-located backend shares that service
scope. Compose services use separate containers: running diagnostics in `api` does
not measure a separate scientific worker container's memory. Missing controllers,
unlimited cgroups and unsupported platforms report memory as unknown. Use platform
monitoring for other containers, CPU, OOM history and host-wide capacity.
[Linux cgroup-v2 memory interface](https://docs.kernel.org/admin-guide/cgroup-v2.html#memory-interface-files).

Diagnostic records whitelist fields and states and normalize unknown job errors to
`INTERNAL_ERROR`. The final snapshot passes the existing secret guard, including
configured credential encodings; a detected secret withholds the whole snapshot as
`DIAGNOSTICS_WITHHELD`. This does not redact arbitrary user-uploaded source files or
make all existing platform logs safe. Original prompts, requests, errors and receipts
stay in their established protected stores and are never copied into this view.

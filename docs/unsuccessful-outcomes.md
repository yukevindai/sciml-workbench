# Unsuccessful outcomes and actor truth (C07)

`SubmissionService.submit_outcome(scope, payload, actor=..., ...)` is the trusted Failure 2.0 entry point. The payload names a terminal benchmark source job, benchmark artifact, reason, uncertainty, typed observation and optional causal hypotheses. The caller supplies authenticated actor context separately; payloads cannot supply an actor. Agent run/action attribution must match the trusted scope and action identity. Provider/model/prompt/policy attribution is preserved, not inferred. E03/B11 must establish ownership and supply that context; this service is not a provider-facing endpoint.

The existing manual `/failure` endpoint and Failure 1.0 history remain unchanged. A legacy request remains a researcher assessment. The generic submission service still refuses agent failure requests; trusted callers use the actor-aware method. No migration, new credential, automatic failure import or upstream source modification is required.

## Supported observations

- **Execution error:** cites the exact recorded source-job error and supported code. Failed benchmark admission records with legacy `VALIDATION_FAILED` map to `ADMISSION_REJECTED` only when the job points to a failed benchmark with no metrics or bundle. Timeouts, interruptions and integrity failures describe execution, not scientific invalidity. Cancellation, provider outage and policy denial cannot be execution observations.
- **Missed criterion:** cites an actual numeric metric from a successfully completed benchmark and a matching immutable protocol persisted before job submission. The observation must miss the predeclared threshold. Missing/null/non-numeric metrics are rejected, never replaced with zero. Metric path, partition, value, criterion ID, comparison, threshold and protocol revision must agree. Units cannot be invented.
- **Researcher assessment:** requires a human actor. It stays distinct from objective observations and can describe a completed run that did not answer the research question. Agents cannot assert it.

Reasons are assessment context; causal hypotheses remain explicitly unverified. Workbench does not calculate new metrics or infer a scientific cause from an operational error.

## Predeclared criteria

Call `seal_outcome_protocol(db, scope, benchmark_request, criterion)` before submitting the benchmark. It validates the benchmark request and scoped dataset/split dependencies, persists an immutable EvaluationProtocol 1.0 with server timestamps, and records one candidate and a predeclared comparison. The configuration fingerprint is `request_digest("benchmark", canonical_request)`; the split fingerprint is `request_digest("split_artifact", exact_split_payload)`.

Outcome admission compares database persistence time and seal time against the source job's submission time, and checks dataset bytes, split payload, target/features, model, seed and canonical configuration. Backdating an artifact's authored timestamp cannot turn a post-hoc criterion into a predeclared one. A changed configuration requires a new declaration before its job is submitted.

This helper is deliberately a predeclaration service, not C12's full evaluation controller. Exposure is recorded as `unknown`; sealing does not hide or release test results, select candidates or authorize agent access to test metrics. Callers must enforce their access policy. Existing manual benchmark outputs remain readable as before.

## Runtime snapshots and durable publication

For a failed benchmark job without a result, use `runtime_benchmark_id(source_job_id)` as the benchmark reference. Admission can atomically create that deterministic failed benchmark snapshot with the original configuration and error, empty results and no bundle. It preserves the source job's terminal state and null result link. Restricted callers must authorize that snapshot ID and its dependency closure. Unsupported errors or failed validation roll back snapshot creation. Repeated submissions preserve the same source snapshot and idempotency rules.

Only existing terminal benchmark jobs are eligible. HTTP validation/admission rejected before a job exists, audit/split job failures and arbitrary provider events do not acquire invented benchmark identities.

The B07 journal captures the exact actor/observation/hypothesis import body before IO. A confirmed receipt with the exact request digest is required; unknown or lost responses cannot publish Failure 2.0. B08 rechecks authoritative inputs and actor/observation fields, then atomically commits artifact, provenance, terminal job and receipt linkage behind the original claim fence. Cancellation prevents late publication. Reconciliation retains the original body and external ID; scheduling/recovery remains D04.

Runtime graph resolution, HTTP/browser read contracts and report capture support Failure 2.0 and EvaluationProtocol 1.0. Reports retain source jobs, protocol dependencies, versioned schemas, receipt snapshots and distinct observation/assessment/hypothesis labels. Replay reads these records without reimporting them. C08/C09 retain ownership of broader report/replay hardening.

## Manual inspection (A07)

The Failure memory view reads confirmed records from the artifact listing and all import receipts from `job-index?kind=failure`. No new route or contract was needed. Failure 1.0 records are shown as manual researcher assessments with no stored actor details. They are never shown as agent-recorded. Failure 2.0 records show the actor, the observation type and its exact fields, uncertainty, unverified hypotheses, source job and benchmark. `unknown` receipts are labeled as possibly existing upstream and needing reconciliation. They are never shown as confirmed or as failed records. A confirmed receipt on a failed job is shown with the job still failed.

The manual save keeps one `Idempotency-Key` per draft (run, reason, uncertainty). Double clicks and retries after a lost response resolve to the original job. Editing the draft starts a new request, and reusing a key with a changed body returns `IDEMPOTENCY_CONFLICT`. A new assessment never reconciles an unknown import.

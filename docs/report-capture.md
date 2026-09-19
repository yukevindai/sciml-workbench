# Frozen report capture

Report submission now commits a metadata snapshot and its digest in the accepted job's immutable JSON payload. Workers assemble the archive from that capture, not from later project state. The existing authenticated project report route and response shape are unchanged.

## Project and run scopes

Manual project export requires all non-report project jobs to be terminal. Its capture includes current non-report artifacts, their dependency closure, materials, safe job outcomes and project metadata. Prior report artifacts and report-generation provenance are excluded to avoid recursively embedding old archives; their lineage is still validated.

The internal run interface accepts a trusted `SubmissionScope` with explicit artifact/material allowlists and a `ReportSelection`:

```python
selection = ReportSelection(
    artifact_ids=frozenset(selected_roots),
    job_ids=frozenset(selected_producers),
    material_ids=frozenset(selected_materials),
    revision=accepted_capture_revision,
    execution_cutoff=recorded_event_cutoff,
)
scope = SubmissionScope(
    project_id=trusted_project_id,
    artifact_ids=frozenset(authorized_artifacts),
    material_ids=frozenset(authorized_materials),
    run_id=trusted_run_id,
    report_selection=selection,
)
job = service.submit(scope, "report", {}, action_id=action_id, attempt_id=attempt_id)
```

Selected job inputs and published results join the selected roots. Selected CSV materials contribute their dataset, and selected PDF ingestion jobs contribute their input material. The resolver closes all typed dependencies under the artifact allowlist. Producer jobs for artifacts in that closure are included automatically. Explicit selected producers must be in the same project, and all included jobs must be terminal. Unrelated queued/running work does not block a run capture. Allowed materials are not automatically selected.

The snapshot records run ID, capture revision, execution cutoff and export status `pending`. These values are server-owned. **B11/E03 integration remains required:** the repository has no persisted run/action service yet. That service must derive and authorize the selection, freeze the revision/cutoff under its run barrier, check run cancellation/amendments, and associate the committed report job with the action. This interface does not validate a run's existence, claim completeness or policy authority and is not exposed as an HTTP or provider tool. Claims, evaluation protocols and execution-record artifacts need their future typed resolvers before inclusion.

## Atomicity and identity

The lock order is project publication barrier, then job publication lock. Report submission, checked artifact publication and material metadata publication share the project barrier. PostgreSQL uses a project row lock; SQLite uses its writer lock. A capture racing publication either sees an unsettled selected producer and rejects, or waits for publication and sees its committed artifact and terminal job together. Terminal jobs and artifact payloads are immutable. Assembly, blob reads and scientific execution occur outside the capture transaction. Intake publishes bytes before acquiring the metadata publication barrier.

The stored report payload has three fields:

- `request`: the normalized project request `{}` or trusted run selection, revision and cutoff.
- `snapshot`: versioned capture time, scope, project, complete artifact payloads, material bindings and safe terminal job projections.
- `snapshot_digest`: version-1 canonical request hashing with kind `report_snapshot_v1` over the snapshot. The job request digest separately binds the entire persisted payload.

The existing revision-0002 accepted-payload database guard protects the capture without a new table or migration. Same-key replay compares the requested selection and retry reference before busy admission and returns the original job/capture. It rechecks captured artifact/material IDs against current trusted allowlists. Selection, revision or cutoff changes conflict. A failed report's explicitly authorized retry copies its exact payload into the new attempt, even when newer unrelated work is active; it never recaptures.

Job export fields omit request keys, payloads, worker details and free-form errors. Failed jobs retain a generic message and error code. Scientific artifacts and operator metadata remain private scientific content, not a redacted public dataset.

## Worker and archive behavior

Preparation verifies the snapshot digest and detaches the stored capture. Publication checks that the detached capture still equals the accepted one and that the result's selected artifact IDs match it. Changed work cannot publish a result. The archive adds manifest-covered `snapshot.json`; `artifacts.json`, `jobs.json`, `materials.json` and `project.json` derive from the same capture. Report provenance stores only the normalized request and snapshot digest, avoiding a second nested copy of every artifact.

Already accepted pre-B06 report jobs with payload `{}` retain their identity on replay. They cannot reconstruct their historical request-time state: execution fails with `INTEGRITY_FAILED` rather than exporting newer data. Submit a new report key for a new capture after the legacy job settles. Completed legacy report downloads are unchanged. No old rows are rewritten.

No migration, environment variable, dependency or HTTP schema change is required. B08 owns broader publication fencing; C08/C09 own additional scientific archive validation/replay; B11/E03 own persisted run authorization and agent integration. No automatic retries, agent runtime or deployment are enabled here.

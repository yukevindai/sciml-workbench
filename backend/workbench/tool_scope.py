"""Reconstruct generated-input authority from committed E03 receipts."""
from sqlalchemy import select

from .agent_db import ActionRow, RunJobRow
from .db import ArtifactRow, JobRow


def derived_artifacts(session, run, policy):
    allowed = set(policy.artifact_ids)
    pending = []
    actions = session.scalars(select(ActionRow).where(
        ActionRow.run_id == run.id, ActionRow.project_id == run.project_id,
        ActionRow.state.in_(['submitted', 'completed'])))
    for action in actions:
        request = action.request
        if request.get('registry_version') != '1.0' or request.get('tool') not in policy.allowed_tools:
            continue
        if not set(request.get('material_ids', [])) <= policy.material_ids:
            continue
        if request.get('scientific_model') and request['scientific_model'] not in policy.scientific_models:
            continue
        link = session.get(RunJobRow, (run.id, action.id))
        ids = []
        if link and link.ownership != 'detached':
            job = session.get(JobRow, link.job_id)
            if job and job.project_id == run.project_id and job.result_id:
                ids.append(job.result_id)
        elif request['tool'] == 'seal_evaluation' and action.state == 'completed':
            ids = (action.outcome or {}).get('artifact_ids', [])
        for aid in ids:
            artifact = session.get(ArtifactRow, aid)
            if artifact and artifact.project_id == run.project_id:
                pending.append((aid, set(request.get('artifact_ids', [])) | set(artifact.payload.get('parents', []))))
    while pending:
        ready = {aid for aid, parents in pending if parents <= allowed}
        if not ready - allowed:
            break
        allowed |= ready
        pending = [(aid, parents) for aid, parents in pending if aid not in allowed]
    return frozenset(allowed) - policy.artifact_ids

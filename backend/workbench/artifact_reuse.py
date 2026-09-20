"""Exact, conservative E09 reuse of successful scoped scientific jobs.

An explicit version in the producer action binds the adapter compatibility key.
Legacy producers without that key are not guessed compatible. Benchmark reuse
across sealed protocols and report/failure effects are deliberately unavailable.
"""
from dataclasses import asdict
import hashlib

from sqlalchemy import select

from .agent_db import ActionRow, RunJobRow
from .artifacts import ArtifactResolver, operation_inputs, resolve_material
from .db import JobRow
from .request_identity import request_digest
from .services import software

ADAPTER_REUSE_VERSION = 'scientific-reuse/1'


def scientific_key(session, scope, kind, payload):
    if kind not in {'audit', 'split', 'evidence'}:
        return None
    inputs = operation_inputs(session, scope.project_id, kind, payload,
        allowed_ids=scope.artifact_ids, material_ids=scope.material_ids) if kind != 'evidence' else {}
    config = payload.get('config', {})
    if kind in {'audit', 'split'}:
        from chemdata_auditor import AuditConfig, SplitConfig
        config = asdict((AuditConfig if kind == 'audit' else SplitConfig)(**config))
    sources = []
    for aid, artifact in sorted(inputs.items()):
        sources.append(artifact.model_dump(mode='json'))
    material = None
    if kind == 'evidence':
        source = resolve_material(session, scope.project_id, payload['material_id'],
            allowed_ids=scope.material_ids, artifact_ids=scope.artifact_ids)
        material = {'id': source.id, 'sha256': source.sha256, 'media_type': source.media_type,
                    'filename': source.filename}
    # Exposure is part of the key even for audit/split reuse. A changed exposure
    # state is not a fresh untouched holdout just because its bytes are identical.
    from .db import ExposureRow
    exposure = []
    hashes = {a.sha256 for a in inputs.values() if a.kind == 'dataset'}
    if hashes:
        exposure = [r.id for r in session.scalars(select(ExposureRow).where(
            ExposureRow.project_id == scope.project_id, ExposureRow.dataset_sha256.in_(hashes)).order_by(ExposureRow.id))]
    return request_digest('scientific_reuse', {'version': ADAPTER_REUSE_VERSION, 'kind': kind,
        'project_id': scope.project_id, 'sources': sources, 'material': material,
        'config': config, 'software': software(), 'exposure_ids': exposure})


def compatible_job(session, store, scope, kind, key, policy):
    if not key or not policy.allow_reuse:
        return None
    candidates = session.execute(select(JobRow, ActionRow).join(RunJobRow, RunJobRow.job_id == JobRow.id)
        .join(ActionRow, ActionRow.id == RunJobRow.action_id).where(
            JobRow.project_id == scope.project_id, JobRow.kind == kind, JobRow.state == 'succeeded',
            JobRow.result_id.in_(scope.artifact_ids), RunJobRow.ownership != 'detached',
            ActionRow.state.in_(['submitted', 'completed']))
        .order_by(JobRow.created_at, JobRow.id).limit(100)).all()
    resolver = ArtifactResolver(session, scope.project_id, scope.artifact_ids)
    for job, action in candidates:
        if action.request.get('scientific_key') != key:
            continue
        value = resolver.resolve(job.result_id, kind)
        if value.software != software():
            continue
        # Read and verify the retained source/output blobs before declaring a hit.
        # Missing/corrupt sources are errors, not silent successful cache hits.
        closure = resolver.closure([value.id])
        for artifact in closure:
            for field in ('blob_key', 'bundle_key', 'pdf_key'):
                digest = getattr(artifact, field, None)
                if digest and hashlib.sha256(store.get(digest)).hexdigest() != digest:
                    from .errors import DomainError
                    raise DomainError('Reuse source integrity failed', 422, 'INTEGRITY_FAILED')
        return job
    return None

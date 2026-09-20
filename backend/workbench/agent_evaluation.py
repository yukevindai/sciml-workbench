"""E12: agent consumption of C12, never a second scientific selection engine."""
from dataclasses import replace
from typing import get_args

from sqlalchemy import select

from .artifacts import ArtifactResolver
from .contract_core import AgentRole
from .db import ExposureRow, JobRow, EvaluationJobRow, EvaluationRow
from .errors import DomainError
from .evaluation import evaluation_status, evaluation_view
from .projections import authorize


def selection_view(session, scope, protocol_id, artifact_id=None, *, role='coordinator'):
    """All agent roles get the same selection quarantine, even after release.

    No provider-selected purpose, partition, ranking metric or winner is accepted.
    The current pins do not support validation-driven model selection.
    """
    authorize(session, scope)
    if scope.audience != 'agent' or role not in get_args(AgentRole) or scope.purpose != 'selection':
        raise DomainError('Selection context required', 403, 'DATA_EXPOSURE_DENIED')
    view = evaluation_status(session, scope, protocol_id)
    if artifact_id is not None:
        value = ArtifactResolver(session, scope.project_id, scope.artifact_ids).resolve(artifact_id, 'benchmark')
        view = evaluation_view(session, replace(scope, protocol_id=protocol_id), value)
    return {**view, 'selection_rule': 'predeclared_comparison', 'validation_driven_selection': False,
            'test_computed_with_validation': True, 'ranking_permitted': False}


def final_exposure_marker(run_id):
    from .request_identity import request_digest
    return 'agent_final:' + request_digest('run_exposure', {'run_id': run_id})


def has_final_exposure(session, project_id, run_id):
    if session.scalar(select(ExposureRow.id).where(ExposureRow.project_id == project_id,
            ExposureRow.via == final_exposure_marker(run_id)).limit(1)):
        return True
    # Preserve the fence for pre-E12 final reads, whose C12 records did not carry
    # a run marker. Their accepted comparison bindings identify the owning run.
    return session.scalar(select(ExposureRow.id).join(JobRow, JobRow.result_id == ExposureRow.artifact_id)
        .join(EvaluationJobRow, EvaluationJobRow.job_id == JobRow.id)
        .join(EvaluationRow, EvaluationRow.protocol_id == EvaluationJobRow.protocol_id)
        .where(ExposureRow.project_id == project_id, ExposureRow.via == 'agent_final',
               EvaluationRow.project_id == project_id, EvaluationRow.run_id == run_id).limit(1)) is not None


def assert_no_final_tuning(session, project_id, run_id):
    if has_final_exposure(session, project_id, run_id):
        raise DomainError('Final test exposure forbids further scientific tuning in this run',
                          403, 'DATA_EXPOSURE_DENIED')


def assert_predeclared_run(session, project_id, run_id, dataset_sha256):
    accepted = session.scalar(select(EvaluationRow.protocol_id)
        .join(EvaluationJobRow, EvaluationJobRow.protocol_id == EvaluationRow.protocol_id)
        .where(EvaluationRow.project_id == project_id, EvaluationRow.run_id == run_id,
               EvaluationRow.dataset_sha256 == dataset_sha256).limit(1))
    if accepted is not None:
        raise DomainError('Adaptive candidate selection is unsupported; use an explicitly authorized new exploratory run',
                          422, 'UNSUPPORTED_CAPABILITY')

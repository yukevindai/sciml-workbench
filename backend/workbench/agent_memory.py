"""E09 retained memory. Prose is stored locally, never treated as instructions.

Provider projections use reviewed categorical preferences/lessons and scoped
failure observations; arbitrary saved prose has no verified holdout lineage.
"""
from typing import Literal

from pydantic import Field, model_validator
from sqlalchemy import select

from .agent_db import MemoryRow, RunRow
from .agent_policy import AuthorityPolicy
from .artifacts import ArtifactResolver
from .barriers import lock_project
from .contract_core import ContractModel, Identifier, Text
from .contracts import now, uid
from .errors import DomainError
from .projections import authorize

Kind = Literal['confirmed_preference', 'provisional_finding', 'failure_snapshot']


class MemoryContent(ContractModel):
    preference: Literal['report_summary', 'report_full', 'baseline_mean', 'baseline_ridge'] | None = None
    lesson: Literal['check_source_declarations', 'review_audit_findings', 'limited_independent_samples', 'check_execution_failure'] | None = None
    note: Text | None = Field(default=None, repr=False)


class MemoryInput(ContractModel):
    kind: Kind
    content: MemoryContent
    source_artifact_ids: list[Identifier] = Field(default_factory=list, max_length=50)

    @model_validator(mode='after')
    def typed_kind(self):
        if self.kind == 'confirmed_preference':
            if self.content.preference is None or self.content.lesson is not None:
                raise ValueError('Confirmed preferences require a preference value')
        elif self.kind == 'provisional_finding':
            if self.content.lesson is None or self.content.preference is not None or not self.source_artifact_ids:
                raise ValueError('Provisional findings require a lesson and sources')
        elif self.content.preference or self.content.lesson or len(self.source_artifact_ids) != 1:
            raise ValueError('Failure snapshots require one retained source')
        if len(set(self.source_artifact_ids)) != len(self.source_artifact_ids):
            raise ValueError('Source references must be distinct')
        return self


class StoredMemory(ContractModel):
    schema_version: Literal['1.0'] = '1.0'
    created_at: str
    supersedes: Identifier | None = None
    body: MemoryInput


def permitted(policy, project_id):
    if not isinstance(policy, AuthorityPolicy) or project_id not in policy.project_ids or 'read_memory' not in policy.allowed_tools:
        raise DomainError('Memory scope exceeds authority', 403, 'POLICY_DENIED')


class MemoryService:
    def record(self, session, project_id, policy, body, *, actor, run_id=None,
               supersedes=None, expected_revision=None):
        """Trusted caller supplies actor; no model tool can confirm/correct memory."""
        permitted(policy, project_id)
        body = MemoryInput.model_validate(body)
        lock_project(session, project_id)
        if actor not in {'human', 'agent'} or (actor == 'agent' and (body.kind == 'confirmed_preference' or not run_id or not policy.allow_reuse)):
            raise DomainError('Only an operator can confirm preferences', 403, 'POLICY_DENIED')
        if run_id:
            run = session.get(RunRow, run_id)
            if not run or run.project_id != project_id:
                raise DomainError('Memory source run is outside project', 403, 'POLICY_DENIED')
            if actor == 'agent':
                from .agent_runs import RunService, TERMINAL
                if run.state in TERMINAL | {'paused', 'waiting_for_input'}:
                    raise DomainError('Run cannot save a new lesson', 409, 'RUN_REVISION_CHANGED')
                current = RunService().effective_policy(session, run)
                if not set(body.source_artifact_ids) <= current.artifact_ids:
                    raise DomainError('Memory sources exceed run authority', 403, 'POLICY_DENIED')
        resolver = ArtifactResolver(session, project_id, policy.artifact_ids)
        for aid in body.source_artifact_ids:
            resolver.resolve(aid, 'failure' if body.kind == 'failure_snapshot' else None)
        revision = 1
        if supersedes is not None:
            old = session.get(MemoryRow, supersedes)
            if not old or old.project_id != project_id or old.status != 'valid' or old.revision != expected_revision:
                raise DomainError('Memory correction revision changed', 409, 'IDEMPOTENCY_CONFLICT')
            if actor != 'human' or old.kind != body.kind:
                raise DomainError('Only same-kind operator corrections are supported', 403, 'POLICY_DENIED')
            old.status = 'superseded'
            revision = old.revision + 1
        elif expected_revision is not None:
            raise DomainError('Correction requires original memory identity')
        value = StoredMemory(created_at=now().isoformat(), supersedes=supersedes, body=body)
        row = MemoryRow(id=uid(), project_id=project_id, revision=revision, kind=body.kind, status='valid',
            value=value.model_dump(mode='json'), attribution=actor, source_run_id=run_id,
            source_artifact_ids=body.source_artifact_ids, exposure='categorical_only')
        session.add(row)
        session.flush()
        return row

    def read(self, session, scope, policy, *, after='', limit=20):
        authorize(session, scope)
        permitted(policy, scope.project_id)
        if 'aggregates' not in policy.content_classes:
            raise DomainError('Memory projection exceeds exposure policy', 403, 'DATA_EXPOSURE_DENIED')
        if scope.audience != 'agent' or type(limit) is not int or not 1 <= limit <= 50:
            raise DomainError('Bounded agent memory scope required')
        ids = set(scope.artifact_ids) & policy.artifact_ids
        rows = list(session.scalars(select(MemoryRow).where(MemoryRow.project_id == scope.project_id,
            MemoryRow.status == 'valid', MemoryRow.id > after).order_by(MemoryRow.id).limit(limit + 1)))
        items = []
        for row in rows[:limit]:
            # Legacy/unclassified records are retained but not silently trusted.
            if row.exposure != 'categorical_only' or not set(row.source_artifact_ids) <= ids:
                continue
            stored = StoredMemory.model_validate(row.value)
            if stored.body.kind != row.kind or stored.body.source_artifact_ids != row.source_artifact_ids:
                raise DomainError('Memory source metadata is inconsistent', 422, 'INTEGRITY_FAILED')
            values = ArtifactResolver(session, scope.project_id, ids).closure(row.source_artifact_ids)
            if row.kind != 'failure_snapshot' and (
                any(a.kind in {'benchmark', 'failure', 'report', 'claim_set', 'evaluation_protocol'} for a in values)
                or row.source_run_id and final_exposed(session, scope.project_id, row.source_run_id)):
                continue
            item = {'id': row.id, 'revision': row.revision, 'kind': row.kind, 'actor': row.attribution,
                'created_at': stored.created_at, 'source_artifact_ids': row.source_artifact_ids,
                'supersedes': stored.supersedes, 'prose_withheld': True, 'untrusted_data': True}
            if row.kind == 'confirmed_preference':
                if row.attribution != 'human':
                    raise DomainError('Unconfirmed preference', 422, 'INTEGRITY_FAILED')
                item['preference'] = stored.body.content.preference
                item['authority'] = 'user_preference_not_scientific_fact'
            elif row.kind == 'provisional_finding':
                item['lesson'] = stored.body.content.lesson
                item['authority'] = 'provisional_not_a_fact'
            else:
                item['snapshot'] = failure_snapshot(session, scope, row.source_artifact_ids[0])
            items.append(item)
        from .db import JobRow
        from .contract_core import ErrorCode
        from typing import get_args
        failed = session.scalars(select(JobRow).where(JobRow.project_id == scope.project_id,
            JobRow.id.in_(scope.job_ids), JobRow.state == 'failed').order_by(JobRow.id).limit(limit))
        attempts = [{'job_id': job.id,
            'error_code': job.error_code if job.error_code in get_args(ErrorCode) else 'INTERNAL_ERROR',
            'successful_cache_output': False,
            'deterministic_rejection': job.error_code in {'ADMISSION_REJECTED', 'VALIDATION_FAILED'}} for job in failed]
        return {'items': items, 'next_cursor': rows[limit - 1].id if len(rows) > limit else None,
                'failed_attempts': attempts, 'coverage': 'retained_project_memory', 'provisional_overrides_confirmed': False}


def final_exposed(session, project_id, run_id):
    from .agent_evaluation import has_final_exposure
    return has_final_exposure(session, project_id, run_id)


def failure_snapshot(session, scope, artifact_id):
    authorize(session, scope)
    value = ArtifactResolver(session, scope.project_id, scope.artifact_ids).resolve(artifact_id, 'failure')
    result = {'artifact_id': value.id, 'schema_version': value.schema_version,
              'source': 'retained_workbench_snapshot', 'live_upstream_record': False,
              'prose_withheld': True, 'observation': 'withheld'}
    if value.schema_version == '2.0' and value.observation.kind == 'execution_failure':
        result['observation'] = {'kind': 'execution_failure', 'error_code': value.observation.error_code}
    # Criterion/researcher judgments can reveal test success/failure even without
    # numeric scores. No live upstream prose or assessment leaks through here.
    return result

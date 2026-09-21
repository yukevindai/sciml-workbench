"""Conditional, one-level specialist assignments sharing the parent budget.

Specialists receive only explicit scoped context and return advisory typed results.
They cannot dispatch science or delegate. The coordinator owns subsequent effects.
"""
from datetime import timedelta
import json
from typing import Literal

from pydantic import Field
from .agent_db import AssignmentRow
from .budgeted_provider import BudgetedProvider
from .budgets import BudgetService, Resources
from .contract_core import ContractModel, Identifier, Text, Digest
from .contracts import now
from .egress import check_context, SecretGuard
from .errors import DomainError
from .model_provider import ContextPart, ProviderError
from .research_contracts import SpecialistAssignment, SpecialistResult
from .request_identity import request_digest


class AssignmentRequest(ContractModel):
    role: Literal['data_evaluation', 'evidence', 'failure_memory', 'scientific_reviewer']
    objective: Text
    artifact_ids: list[Identifier] = Field(default_factory=list, max_length=100)
    material_ids: list[Identifier] = Field(default_factory=list, max_length=100)
    completion_criteria: list[Text] = Field(min_length=1, max_length=20)
    reviewed_snapshot_sha256: Digest | None = None


class SpecialistService:
    def __init__(self, db, runs, provider, *, model, bounds, settings=None, prices=None, max_tokens=1024):
        self.db, self.runs, self.provider = db, runs, provider
        self.model, self.bounds, self.settings = model, bounds, settings
        self.prices, self.max_tokens = prices, max_tokens
        self.budgets = BudgetService(runs)

    def execute_batch(self, pid, rid, key, requests, context):
        from concurrent.futures import ThreadPoolExecutor
        assignments = []
        try:
            for index, request in enumerate(requests):
                assignment = self.create(pid, rid, key if len(requests) == 1 else f'{key}:{index}', request)
                assignments.append(assignment)
            def execute_one(assignment):
                sources = [part for part in context
                    if set(part.artifact_ids) <= set(assignment.allowed_artifact_ids)
                    and set(part.material_ids) <= set(assignment.allowed_material_ids)]
                # Model-authored objectives/criteria may incorporate any context
                # seen by the coordinator. A smaller assignment cannot relabel
                # that prose as originating only from its chosen input subset.
                sources.append(ContextPart.derived(json.dumps({'objective': assignment.objective,
                    'completion_criteria': assignment.completion_criteria}), context))
                return self.execute(pid, rid, assignment.id, sources)
            with ThreadPoolExecutor(max_workers=len(assignments)) as pool:
                futures = [pool.submit(execute_one, assignment) for assignment in assignments]
                # All threads finish before this advancement returns or raises.
                results = [future.result() for future in futures]
            return results
        except (DomainError, ProviderError, ValueError):
            # Unissued allocations can be closed; dispatched unknown usage cannot.
            with self.db.session.begin() as s:
                run = self.runs.get(s, pid, rid, lock=True)
                self.runs.assert_dispatch(s, run)
                for assignment in assignments:
                    row = s.get(AssignmentRow, assignment.id)
                    if row.state == 'queued':
                        row.state = 'cancelled'
                        row.payload = {**row.payload, 'state': 'cancelled'}
                        self.budgets.release(s, pid, rid, assignment.budget_allocation_id)
            raise

    def create(self, pid, rid, key, request: AssignmentRequest):
        """Trusted coordinator entry, never advertised in specialist tool sets."""
        ident = request_digest('specialist', {'run_id': rid, 'key': key})
        with self.db.session.begin() as s:
            run = self.runs.get(s, pid, rid, lock=True)
            self.runs.assert_dispatch(s, run)
            old = s.get(AssignmentRow, ident)
            if old:
                scope = SpecialistAssignment.model_validate(old.payload)
                if (scope.objective != request.objective or scope.role != request.role
                        or scope.allowed_artifact_ids != request.artifact_ids
                        or scope.allowed_material_ids != request.material_ids
                        or scope.completion_criteria != request.completion_criteria
                        or scope.reviewed_snapshot_sha256 != request.reviewed_snapshot_sha256):
                    raise DomainError('Assignment key binds a different objective', 409, 'IDEMPOTENCY_CONFLICT')
                return scope
            policy = self.runs.effective_policy(s, run)
            if (not run.plan_revision or not set(request.artifact_ids) <= policy.artifact_ids
                    or not set(request.material_ids) <= policy.material_ids):
                raise DomainError('Assignment exceeds run scope', 403, 'POLICY_DENIED')
            stamp = now()
            assignment = SpecialistAssignment(id=ident, project_id=pid, run_id=rid, created_at=stamp,
                plan_revision=run.plan_revision, role=request.role, objective=request.objective,
                allowed_artifact_ids=request.artifact_ids, allowed_material_ids=request.material_ids,
                allowed_tools=[], budget_allocation_id='allocation:' + ident,
                deadline_at=stamp + timedelta(minutes=5), completion_criteria=request.completion_criteria,
                state='queued', reviewed_snapshot_sha256=request.reviewed_snapshot_sha256)
            SecretGuard(self.settings).check(assignment.model_dump(mode='json'))
            s.add(AssignmentRow(id=ident, project_id=pid, run_id=rid, state='queued',
                                payload=assignment.model_dump(mode='json'), result=None))
            s.flush()
            bound = self.bounds[self.model]
            self.budgets.reserve(s, pid, rid, assignment.budget_allocation_id,
                Resources(specialist_assignments=1, model_requests=1,
                    model_tokens=bound.input_tokens + self.max_tokens, active_seconds=bound.max_active_seconds),
                request_sha256=request_digest('assignment', request.model_dump(mode='json')),
                expected_revision=run.control_revision, claim_token=run.claim_token,
                assignment_id=ident, allocation=True, model=self.model,
                pricing=(self.prices or {}).get(self.model))
            return assignment

    def execute(self, pid, rid, ident, sources):
        with self.db.session.begin() as s:
            run = self.runs.get(s, pid, rid, lock=True)
            self.runs.assert_dispatch(s, run)
            row = s.get(AssignmentRow, ident)
            if not row or row.project_id != pid or row.run_id != rid:
                raise DomainError('Assignment not found', 404, 'REFERENCE_INVALID')
            assignment = SpecialistAssignment.model_validate(row.payload)
            if row.state == 'completed':
                return SpecialistResult.model_validate(row.result)
            if row.state != 'queued' or assignment.deadline_at <= now():
                raise DomainError('Assignment cannot be replayed', 409, 'POLICY_DENIED')
            if assignment.plan_revision != run.plan_revision:
                raise DomainError('Assignment plan was superseded', 409, 'RUN_REVISION_CHANGED')
            policy = self.runs.effective_policy(s, run).model_copy(update={
                'artifact_ids': frozenset(assignment.allowed_artifact_ids),
                'material_ids': frozenset(assignment.allowed_material_ids)})
            # Intersection is essential if current authority was narrowed.
            current = self.runs.effective_policy(s, run)
            policy = policy.model_copy(update={'artifact_ids': policy.artifact_ids & current.artifact_ids,
                                               'material_ids': policy.material_ids & current.material_ids})
            check_context(policy, sources)
            instructions = ContextPart(pid, 'schema', 'Return only JSON matching this result schema. '
                'No tools or delegation are available. Findings are advisory; preserve uncertainty. '
                + json.dumps(SpecialistResult.model_json_schema()) + '\nAssignment ID: ' + ident)
            task = ContextPart.derived(json.dumps({'role': assignment.role, 'objective': assignment.objective,
                'completion_criteria': assignment.completion_criteria}), sources)
            context = [instructions, task, *sources]
            # Persist before IO: a crash cannot start a second model request.
            row.state = 'running'
            row.payload = {**row.payload, 'state': 'running'}
            revision, token = run.control_revision, run.claim_token
        wrapper = BudgetedProvider(self.db, self.provider, bounds=self.bounds, prices=self.prices,
                                   backend_settings=self.settings, runs=self.runs)
        response = wrapper.complete(project_id=pid, run_id=rid, request_id='specialist:' + ident,
            expected_revision=revision, claim_token=token, model=self.model, context=context,
            tools=[], max_tokens=self.max_tokens, assignment_id=ident)
        result = SpecialistResult.model_validate_json(''.join(response.text))
        referenced = set(result.supporting_artifact_ids)
        for claim in result.findings:
            referenced.update(ref.source_artifact_id for ref in claim.source_references)
            referenced.update(ref.artifact_id for ref in claim.metric_references)
            if claim.split_id:
                referenced.add(claim.split_id)
            if any(ref.partition == 'test' for ref in claim.metric_references):
                raise ProviderError('specialist_test_metrics_forbidden')
        if result.assignment_id != ident or not referenced <= policy.artifact_ids:
            raise ProviderError('specialist_result_outside_scope')
        SecretGuard(self.settings).check(result.model_dump(mode='json'))
        with self.db.session.begin() as s:
            run = self.runs.get(s, pid, rid, lock=True)
            self.runs.assert_dispatch(s, run)
            if run.control_revision != revision or assignment.deadline_at <= now():
                raise DomainError('Assignment authority changed', 409, 'RUN_REVISION_CHANGED')
            row = s.get(AssignmentRow, ident)
            row.result, row.state = result.model_dump(mode='json'), 'completed'
            row.payload = {**row.payload, 'state': 'completed'}
            self.budgets.release(s, pid, rid, assignment.budget_allocation_id)
        return result

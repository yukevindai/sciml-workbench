"""E11 exact-candidate review, after deterministic reference checks.

Reviewers have no effect tools. Backend reads provide exact source spans and
selection-authorized scalar references; sealed test values are never included.
"""
from typing import Literal
import json
from dataclasses import replace

from pydantic import Field
from sqlalchemy import select

from .agent_db import AssignmentRow, RunJobRow
from .agent_specialists import AssignmentRequest, SpecialistService
from .budgeted_provider import BudgetedProvider
from .budgets import BudgetService, Resources
from .contract_core import ContractModel, Digest, Identifier, Text
from .egress import SecretGuard
from .errors import DomainError
from .model_provider import ContextPart, ProviderError
from .projections import ReadScope
from .references import validate_claims, read_span
from .request_identity import request_digest
from .scientific_contracts import Claim, SemanticReview
from .storage import StorageError


class Verdict(ContractModel):
    claim_id: Identifier
    status: Literal['supported', 'partially_supported', 'unsupported', 'conflicting']
    explanation: Text


class ReviewResult(ContractModel):
    candidate_sha256: Digest
    verdicts: list[Verdict] = Field(max_length=100)
    residual_uncertainty: Text


REVIEW_INSTRUCTIONS = ('Review only the supplied exact candidate. No tools or delegation are available. '
    'Reference validity alone does not prove semantic support. Give concise evidence-based explanations. '
    'Return JSON matching ' + json.dumps(ReviewResult.model_json_schema()))


def candidate_digest(claims):
    """Review annotations/timestamps are not part of the candidate's content."""
    records = []
    for claim in claims:
        value = Claim.model_validate(claim).model_dump(mode='json')
        value.pop('semantic_review')
        value.pop('reference_check')
        records.append(value)
    return request_digest('review_candidate_v1', {'answer': candidate_answer(claims), 'claims': records})


def candidate_answer(claims):
    # There is no separate unchecked narrative outside the reviewed claim set.
    return '\n'.join(f'{Claim.model_validate(c).classification}: {Claim.model_validate(c).statement}' for c in claims)


def checked_candidate(session, store, scope, claims):
    claims = [Claim.model_validate(c) for c in claims]
    if len(claims) > 100 or sum(len(c.source_references) + len(c.metric_references) for c in claims) > 1000:
        raise DomainError('Candidate exceeds reference-check bounds', 422, 'VALIDATION_FAILED')
    checked, removed = [], []
    seen = set()
    for value in claims:
        claim = Claim.model_validate(value)
        if claim.id in seen:
            raise DomainError('Candidate claim IDs must be unique', 422, 'VALIDATION_FAILED')
        seen.add(claim.id)
        # Prior annotations never survive an edit or a new review boundary.
        claim.semantic_review = SemanticReview(status='not_reviewed')
        try:
            protocol_ids = set()
            from .db import EvaluationJobRow, JobRow
            for ref in claim.metric_references:
                protocol = session.scalar(select(EvaluationJobRow.protocol_id).join(JobRow,
                    JobRow.id == EvaluationJobRow.job_id).where(JobRow.project_id == scope.project_id,
                    JobRow.result_id == ref.artifact_id))
                if protocol:
                    protocol_ids.add(protocol)
            if claim.metric_references and len(protocol_ids) != 1:
                raise DomainError('Claim needs one scoped sealed comparison', 422, 'REFERENCE_INVALID')
            checked.extend(validate_claims(session, store,
                replace(scope, protocol_id=next(iter(protocol_ids), None)), [claim]))
        except (DomainError, StorageError):
            removed.append(claim.id)
    return checked, removed


def apply_review(claims, result, assignment_id):
    result = ReviewResult.model_validate(result)
    if result.candidate_sha256 != candidate_digest(claims):
        raise DomainError('Review does not match the exact candidate', 409, 'RUN_REVISION_CHANGED')
    verdicts = {v.claim_id: v for v in result.verdicts}
    if len(verdicts) != len(result.verdicts) or set(verdicts) != {Claim.model_validate(c).id for c in claims}:
        raise DomainError('Review must cover each candidate claim exactly once', 422, 'VALIDATION_FAILED')
    accepted, removed = [], []
    for value in claims:
        claim = Claim.model_validate(value).model_copy(deep=True)
        verdict = verdicts[claim.id]
        if verdict.status != 'supported':
            # Removing avoids laundering unsupported prose through a new label.
            removed.append(claim.id)
            continue
        claim.semantic_review = SemanticReview(status='supported', reviewed_snapshot_sha256=result.candidate_sha256,
            reviewer_assignment_id=assignment_id, explanation=verdict.explanation)
        accepted.append(claim)
    return accepted, removed


class IndependentReviewer:
    def __init__(self, db, store, settings, runs, provider, *, model, bounds, prices=None, max_tokens=1024):
        self.db, self.store, self.settings, self.runs = db, store, settings, runs
        self.provider, self.model, self.bounds, self.prices, self.max_tokens = provider, model, bounds, prices, max_tokens

    def review(self, pid, rid, claims):
        digest = candidate_digest(claims)
        ids = {r.source_artifact_id for c in claims for r in c.source_references}
        ids |= {r.artifact_id for c in claims for r in c.metric_references}
        ids |= {c.split_id for c in claims if c.split_id}
        # Include source lineage so exact scoped reads can resolve references.
        with self.db.session.begin() as s:
            run = self.runs.get(s, pid, rid, lock=True)
            self.runs.assert_dispatch(s, run)
            from .agent_finalization import execution_versions, retain_versions
            retain_versions(s, run, execution_versions(self.model, self.provider, REVIEW_INSTRUCTIONS))
            policy = self.runs.effective_policy(s, run)
            from .artifacts import ArtifactResolver
            ids |= {a.id for a in ArtifactResolver(s, pid, policy.artifact_ids).closure(ids)}
            from .db import EvaluationJobRow, JobRow
            ids.update(s.scalars(select(EvaluationJobRow.protocol_id).join(JobRow,
                JobRow.id == EvaluationJobRow.job_id).where(JobRow.project_id == pid, JobRow.result_id.in_(ids))))
            jobs = frozenset(s.scalars(select(RunJobRow.job_id).where(RunJobRow.run_id == rid, RunJobRow.ownership != 'detached')))
            scope = ReadScope(pid, 'agent', rid, frozenset(ids), jobs)
            # Repeat deterministic checks immediately before the review read.
            checked, removed = checked_candidate(s, self.store, scope, claims)
            if removed or candidate_digest(checked) != digest:
                raise DomainError('Candidate references changed', 409, 'RUN_REVISION_CHANGED')
            excerpts = [read_span(s, self.store, scope, ref) for c in checked for ref in c.source_references]
        specialists = SpecialistService(self.db, self.runs, self.provider, model=self.model,
            bounds=self.bounds, settings=self.settings, prices=self.prices, max_tokens=self.max_tokens)
        assignment = specialists.create(pid, rid, 'review:' + digest, AssignmentRequest(
            role='scientific_reviewer', objective='Review the exact candidate for support, numeric consistency and residual uncertainty',
            artifact_ids=sorted(ids), completion_criteria=['Assess every claim against its exact retained references'],
            reviewed_snapshot_sha256=digest))
        with self.db.session.begin() as s:
            run = self.runs.get(s, pid, rid, lock=True)
            self.runs.assert_dispatch(s, run)
            row = s.get(AssignmentRow, assignment.id)
            if row.state == 'completed':
                result = ReviewResult.model_validate(row.result)
                apply_review(claims, result, row.id)
                return result, row.id
            if row.state != 'queued':
                raise ProviderError('review_outcome_unavailable', usage_unknown=True)
            budgets = BudgetService(self.runs)
            key = 'review-round:' + digest
            resources = Resources(review_rounds=1)
            budgets.reserve(s, pid, rid, key, resources, request_sha256=digest,
                expected_revision=run.control_revision, claim_token=run.claim_token)
            budgets.dispatch(s, pid, rid, key)
            budgets.settle(s, pid, rid, key, resources)
            row.state, row.payload = 'running', {**row.payload, 'state': 'running'}
            revision, token = run.control_revision, run.claim_token
        context = [ContextPart(pid, 'schema', REVIEW_INSTRUCTIONS),
            ContextPart(pid, 'raw', json.dumps({'candidate_sha256': digest, 'answer': candidate_answer(claims),
                'claims': [c.model_dump(mode='json') for c in claims], 'verified_source_spans': excerpts}), tuple(sorted(ids)))]
        wrapper = BudgetedProvider(self.db, self.provider, bounds=self.bounds, prices=self.prices,
                                   backend_settings=self.settings, runs=self.runs)
        response = wrapper.complete(project_id=pid, run_id=rid, request_id='review:' + assignment.id,
            expected_revision=revision, claim_token=token, model=self.model, context=context,
            tools=[], max_tokens=self.max_tokens, assignment_id=assignment.id)
        if response.tool_calls:
            raise ProviderError('review_effects_forbidden')
        result = ReviewResult.model_validate_json(''.join(response.text))
        SecretGuard(self.settings).check(result.model_dump(mode='json'))
        apply_review(claims, result, assignment.id)
        with self.db.session.begin() as s:
            run = self.runs.get(s, pid, rid, lock=True)
            self.runs.assert_dispatch(s, run)
            if run.control_revision != revision:
                raise DomainError('Run changed during review', 409, 'RUN_REVISION_CHANGED')
            row = s.get(AssignmentRow, assignment.id)
            row.state, row.result = 'completed', result.model_dump(mode='json')
            row.payload = {**row.payload, 'state': 'completed'}
            BudgetService(self.runs).release(s, pid, rid, assignment.budget_allocation_id)
        return result, assignment.id

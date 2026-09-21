"""Bounded adaptive coordinator for Scheduler.advance.

Each model proposal is checkpointed before execution. Proposals carry no
authority: current run revision, scope, role, budget and lease are rechecked at
every effect. Model prose is never published as a scientific conclusion.
"""
import json
from typing import Literal

from pydantic import Field, model_validator
from sqlalchemy import select

from .agent_db import PlanRow, QuestionRow, AssignmentRow, FinalizationRow
from .agent_policy import AuthorityPolicy
from .agent_recovery import reconcile_effects
from .budgeted_provider import BudgetedProvider
from .budgets import BudgetService, Resources
from .contract_core import ContractModel, Text
from .contracts import now, uid
from .errors import DomainError
from .model_provider import ContextPart, ProviderError
from .research_contracts import ResearchPlan, ResearchStep, ResearchQuestion, MaterialQuestion
from .request_identity import request_digest
from .tool_registry import ToolRegistry, DispatchContext
from .agent_specialists import AssignmentRequest, SpecialistService
from .scientific_contracts import Claim


class Decision(ContractModel):
    kind: Literal['plan', 'question', 'delegate', 'finish']
    steps: list[ResearchStep] = Field(default_factory=list, max_length=120)
    questions: list[MaterialQuestion] = Field(default_factory=list, max_length=20)
    summary: Text
    assignment: AssignmentRequest | None = None
    assignments: list[AssignmentRequest] = Field(default_factory=list, max_length=4)
    claims: list[Claim] = Field(default_factory=list, max_length=100)
    export_report: bool = False

    @model_validator(mode='after')
    def shape(self):
        if bool(self.steps) != (self.kind == 'plan') or bool(self.questions) != (self.kind == 'question'):
            raise ValueError('Decision fields must match its kind')
        if (bool(self.assignment) or bool(self.assignments)) != (self.kind == 'delegate') or (self.assignment and self.assignments):
            raise ValueError('Delegation requires scoped assignments in exactly one field')
        if self.kind != 'finish' and (self.claims or self.export_report):
            raise ValueError('Claims and report export belong to finalization')
        if len({claim.id for claim in self.claims}) != len(self.claims):
            raise ValueError('Final claim IDs must be unique')
        return self


INSTRUCTIONS = """Choose the next useful action from actual results and the accepted
objective. Audit-only objectives must not train. Inspect declared inputs first.
For scientific work: audit, inspect findings, choose an admissible split, seal
predeclared candidates before training and inspect selection results. Request a
report through a finish decision with export_report=true and typed claims, so
review and execution capture precede export. Do not infer target, units or source declarations as
facts. Ask one consolidated set of material questions after independent useful
work; routine defaults need no approval. Do not repeat unchanged rejected science.
First return a plan. Revise it when the objective or actual results require it.
Delegate only when a scoped data/evaluation, evidence, failure-memory or review
objective adds useful independent work. Audit-only work ordinarily needs no
specialist. Specialists cannot delegate or execute science. Independent assignments
may be proposed together in assignments; they share the run's limits. Scientific
review is entered only by finalization, never by an ad-hoc delegation.
Use record_outcome only for an eligible linked execution failure when offered;
its actor and observation come from trusted records. Use read_evidence_span for
exact citations only when authorized. Never invent source or metric references.
Use at most one offered tool per turn. When not calling a tool, return exactly one
JSON decision matching this schema (no markdown, narrative, or hidden reasoning):
""" + json.dumps(Decision.model_json_schema())


class Coordinator:
    def __init__(self, db, store, settings, provider, *, model, bounds, prices=None, max_tokens=1024, specialist_model=None):
        self.db, self.store, self.settings = db, store, settings
        self.provider, self.model = provider, model
        self.bounds, self.prices, self.max_tokens = bounds, prices, max_tokens
        self.specialist_model = specialist_model or model
        from .agent_finalization import execution_versions
        self.versions = execution_versions(model, provider, INSTRUCTIONS)

    def __call__(self, snapshot, previous, runs):
        pid, rid = snapshot['run']['project_id'], snapshot['run']['id']
        with self.db.session.begin() as s:
            from .agent_finalization import retain_versions
            row = runs.get(s, pid, rid, lock=True)
            runs.assert_dispatch(s, row)
            retain_versions(s, row, self.versions)
            snapshot = reconcile_effects(s, runs, pid, rid)
            finalizing = s.get(FinalizationRow, rid) is not None
        if finalizing:
            return self.finalizer(runs).advance(pid, rid)
        run = snapshot['run']
        with self.db.session() as s:
            uncertain = s.scalar(select(AssignmentRow.id).where(
                AssignmentRow.run_id == rid, AssignmentRow.state == 'waiting'))
        if uncertain:
            return self.recovery_question(snapshot, runs)
        state = previous or {}
        pending = state.get('pending')
        if pending and pending['revision'] == run['control_revision']:
            return self.execute(snapshot, state, runs)
        # A model reservation without an accepted response checkpoint must not be
        # replayed. Keep its true accounting and stop for explicit recovery.
        accepted = set(state.get('accepted_requests', []))
        lost = [r['request_id'] for r in snapshot['reservations']
                if r['request_id'].startswith('coordinator:') and r['request_id'] not in accepted]
        if lost or any(a['state'] == 'unknown' for a in snapshot['actions']):
            return self.recovery_question(snapshot, runs)
        registry = ToolRegistry(self.db, self.store, self.settings, runs=runs, versions=self.versions)
        policy = AuthorityPolicy.model_validate(snapshot['policy'])
        context = self.context(snapshot)
        if state.get('last_rejection'):
            from .tool_registry import ToolResult
            context.append(ToolResult.model_validate(state['last_rejection']).context(pid))
        request_id = 'coordinator:' + uid()
        budgets = BudgetService(runs)
        try:
            with self.db.session.begin() as s:
                resources = Resources(coordinator_iterations=1)
                budgets.reserve(s, pid, rid, 'iteration:' + request_id, resources,
                    request_sha256=request_digest('iteration', {'request_id': request_id}),
                    expected_revision=run['control_revision'], claim_token=snapshot['claim_token'])
                budgets.dispatch(s, pid, rid, 'iteration:' + request_id)
                budgets.settle(s, pid, rid, 'iteration:' + request_id, resources)
            wrapper = BudgetedProvider(self.db, self.provider, bounds=self.bounds, prices=self.prices,
                                       backend_settings=self.settings, runs=runs)
            response = wrapper.complete(project_id=pid, run_id=rid, request_id=request_id,
                expected_revision=run['control_revision'], claim_token=snapshot['claim_token'],
                model=self.model, context=context,
                tools=[tool for tool in registry.definitions(policy) if tool.name != 'build_report'],
                max_tokens=self.max_tokens)
            if response.tool_calls:
                if len(response.tool_calls) != 1 or not run['plan_revision'] or snapshot['plan_dirty']:
                    raise ProviderError('invalid_coordinator_decision')
                proposal = {'tool': response.tool_calls[0]['name'], 'arguments': response.tool_calls[0]['input']}
            else:
                decision = Decision.model_validate_json(''.join(response.text))
                if decision.kind == 'plan':
                    ResearchPlan(id='validation', project_id=pid, created_at=now(), run_id=rid,
                        revision=run['plan_revision'] + 1, steps=decision.steps, rationale_summary=decision.summary)
                    allowed = policy.artifact_ids | policy.material_ids
                    if any(not set(step.allowed_input_ids) <= allowed for step in decision.steps):
                        raise ValueError('Plan inputs exceed current scope')
                proposal = {'decision': decision.model_dump(mode='json')}
        except (ProviderError, ValueError):
            return self.recovery_question(snapshot, runs)
        except DomainError as exc:
            if exc.error_code != 'BUDGET_EXHAUSTED':
                raise
            return self.stop(snapshot, runs, 'Configured execution budget exhausted')
        # No provider IDs, reasoning, or authority are copied into the checkpoint.
        return {'accepted_requests': sorted(accepted | {request_id}),
                'pending': {'revision': run['control_revision'], 'key': request_id, **proposal}}, 'queued'

    def context(self, snapshot):
        run = snapshot['run']
        pid, rid = run['project_id'], run['id']
        # Only authenticated operator messages use this separately consented channel.
        # Model plans/results and source prose must retain their source classification.
        scope = run['inputs']
        policy = AuthorityPolicy.model_validate(snapshot['policy'])
        message_class = 'operator' if policy.share_operator_messages else 'raw'
        parts = [ContextPart(pid, 'schema', INSTRUCTIONS),
                 ContextPart(pid, message_class, run['objective'], tuple(scope['artifact_ids']), tuple(scope['material_ids']))]
        if snapshot['plan_dirty']:
            parts.append(ContextPart(pid, 'schema', 'The operator amended this run. Publish a revised plan before new work.'))
        with self.db.session() as s:
            plan = s.scalar(select(PlanRow).where(PlanRow.run_id == rid, PlanRow.revision == run['plan_revision']))
            questions = list(s.scalars(select(QuestionRow).where(QuestionRow.run_id == rid)))
            assignments = list(s.scalars(select(AssignmentRow).where(AssignmentRow.run_id == rid)))
        if plan:
            # Free-form model plans can depend on every source previously seen.
            # Expose only trusted structural state; no plan prose is relabelled.
            parts.append(ContextPart(pid, 'schema', json.dumps({'plan_revision': plan.revision})))
        for q in questions:
            if q.answer:
                parts.append(ContextPart.derived(json.dumps(q.answer['answers']), parts[1:2]))
        for assignment in assignments:
            if assignment.result:
                # Specialist prose inherits the conservative source classification.
                parts.append(ContextPart(pid, 'raw', json.dumps(assignment.result),
                    tuple(assignment.payload['allowed_artifact_ids']),
                    tuple(assignment.payload['allowed_material_ids'])))
        # Only bounded typed result projections, never raw job payloads or errors.
        for action in snapshot['actions'][-30:]:
            policy = AuthorityPolicy.model_validate(snapshot['policy'])
            request = action['request']
            if (not set(request.get('artifact_ids', [])) <= policy.artifact_ids
                    or not set(request.get('material_ids', [])) <= policy.material_ids):
                continue
            outcome = action['outcome'] or {}
            record = {'tool': action['request']['tool'], 'state': action['state'],
                      'job_id': outcome.get('job_id'), 'error_code': outcome.get('error_code'),
                      'artifact_ids': outcome.get('artifact_ids', [])}
            parts.append(ContextPart(pid, 'aggregates', json.dumps(record), tuple(record['artifact_ids'])))
            if outcome.get('result') and action['state'] == 'completed':
                from .tool_registry import ToolResult
                # Scope follows the read inputs even when its result contains no
                # artifact IDs (for example an aggregate dataset inspection).
                result = ToolResult.model_validate(outcome['result'])
                part = result.context(pid)
                parts.append(ContextPart(pid, part.content_class, part.text,
                    tuple(sorted(set(part.artifact_ids) | set(request.get('artifact_ids', [])))),
                    tuple(request.get('material_ids', []))))
        return parts

    def execute(self, snapshot, state, runs):
        run, pending = snapshot['run'], state['pending']
        pid, rid = run['project_id'], run['id']
        cleared = {**state, 'pending': None}
        if 'tool' in pending:
            if pending['tool'] == 'build_report':
                # Compatibility for a pre-E13 committed proposal. Export now
                # always crosses the trusted review/capture boundary.
                self.finalizer(runs).begin(pid, rid, claims=[], versions=self.versions, export=True)
                return {}, 'queued'
            registry = ToolRegistry(self.db, self.store, self.settings, runs=runs, versions=self.versions)
            from .tool_registry import DESCRIPTORS
            descriptor = DESCRIPTORS.get(pending['tool'])
            canonical = (descriptor.input_model.model_validate(pending['arguments']).model_dump(mode='json')
                         if descriptor else pending['arguments'])
            # A deterministic failure of identical science is evidence, not a
            # reason to allocate another attempt under a new action identity.
            for action in snapshot['actions']:
                if (action['request'].get('tool') == pending['tool']
                        and action['request'].get('arguments') == canonical
                        and action['state'] == 'failed'
                        and (action['outcome'] or {}).get('error_code') in {'ADMISSION_REJECTED', 'VALIDATION_FAILED'}):
                    return self.stop(snapshot, runs, 'Unchanged scientific request was deterministically rejected')
            result = registry.dispatch(DispatchContext(pid, rid, run['control_revision'],
                snapshot['claim_token'], pending['key']), pending['tool'], pending['arguments'])
            if result.status in {'blocked', 'failed'}:
                # Persist the bounded rejection so the next decision can adapt.
                cleared['last_rejection'] = result.model_dump(mode='json')
            return cleared, 'waiting_for_job' if result.status == 'submitted' else 'queued'
        decision = Decision.model_validate(pending['decision'])
        if decision.kind == 'delegate':
            requests = decision.assignments or [decision.assignment]
            if any(request.role == 'scientific_reviewer' for request in requests):
                # E11/E13 must supply a trusted candidate digest. A digest in a
                # model proposal is not evidence of an exact candidate snapshot.
                cleared['last_rejection'] = {'status': 'blocked', 'error_code': 'UNSUPPORTED_CAPABILITY',
                    'message': 'Grounded review requires the trusted candidate finalization boundary.'}
                return cleared, 'queued'
            service = SpecialistService(self.db, runs, self.provider, model=self.specialist_model,
                bounds=self.bounds, settings=self.settings, prices=self.prices, max_tokens=self.max_tokens)
            try:
                policy = AuthorityPolicy.model_validate(snapshot['policy'])
                if len(requests) > policy.limits.specialist_concurrency:
                    raise DomainError('Assignment batch exceeds concurrency', 409, 'BUDGET_EXHAUSTED')
                service.execute_batch(pid, rid, pending['key'], requests, self.context(snapshot))
            except (ProviderError, ValueError):
                return self.recovery_question(snapshot, runs)
            except DomainError as exc:
                if exc.error_code == 'RUN_REVISION_CHANGED':
                    raise
                cleared['last_rejection'] = {'status': 'blocked', 'error_code': exc.error_code,
                                             'message': 'Specialist assignment was not admitted.'}
            return cleared, 'queued'
        if decision.kind == 'finish':
            finalizer = self.finalizer(runs)
            finalizer.begin(pid, rid, claims=decision.claims,
                versions=self.versions, export=decision.export_report)
            return {}, 'queued'
        with self.db.session.begin() as s:
            if decision.kind == 'plan':
                plan = ResearchPlan(id=uid(), project_id=pid, created_at=now(), run_id=rid,
                    revision=run['plan_revision'] + 1, steps=decision.steps, rationale_summary=decision.summary)
                runs.publish_plan(s, pid, rid, plan, run['control_revision'])
            elif decision.kind == 'question':
                question = ResearchQuestion(id=uid(), project_id=pid, created_at=now(), run_id=rid,
                    revision=1, run_revision=run['control_revision'], questions=decision.questions, status='open')
                runs.ask(s, pid, rid, question, run['control_revision'])
        return cleared, 'waiting_for_input' if decision.kind == 'question' or run['mode'] == 'review_plan' else 'queued'

    def recovery_question(self, snapshot, runs):
        run = snapshot['run']
        with self.db.session.begin() as s:
            question = ResearchQuestion(id=uid(), project_id=run['project_id'], created_at=now(), run_id=run['id'],
                revision=1, run_revision=run['control_revision'], status='open', questions=[MaterialQuestion(
                    id='recovery', field='recovery', prompt='Execution requires trusted recovery of an unavailable or uncertain provider/external outcome. Cancel this run or reconcile the original operation before continuing.',
                    blocked_step_ids=['coordinator'], options=[], evidence=[])])
            runs.ask(s, run['project_id'], run['id'], question, run['control_revision'])
        return {}, 'waiting_for_input'

    def stop(self, snapshot, runs, reason):
        run = snapshot['run']
        finalizer = self.finalizer(runs)
        finalizer.begin(run['project_id'], run['id'], claims=[], stop_reason=reason,
            versions=self.versions)
        return {}, 'queued'

    def finalizer(self, runs):
        from .agent_finalization import Finalizer
        from .agent_review import IndependentReviewer
        reviewer = IndependentReviewer(self.db, self.store, self.settings, runs, self.provider,
            model=self.specialist_model, bounds=self.bounds, prices=self.prices, max_tokens=self.max_tokens)
        return Finalizer(self.db, self.store, self.settings, runs, reviewer=reviewer)

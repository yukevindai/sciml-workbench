"""Private operator routes; no raw graph state, leases or tool permissions."""
import json
from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import Response
from fastapi.routing import APIRoute
from sqlalchemy import select
from .agent_db import PlanRow, QuestionRow, ProjectPolicyRow, ActionRow, AssignmentRow
from .agent_runs import RunService, TERMINAL
from .agent_http_contracts import RunDetail, RunResult, ExecutionPolicySummary
from .agent_policy import intersect_policy
from .db import ArtifactRow, MaterialRow
from .errors import DomainError
from .contract_core import ErrorCode
from .research_contracts import (RunInput, ResearchRun, RunControlInput, RunAmendmentInput,
    QuestionAnswerInput, PlanAcceptanceInput, RunEvent)


def router(service: RunService, session, protected, *, settings=None):
    from .egress import SecretGuard, EgressDenied

    class SafeAgentRoute(APIRoute):
        def get_route_handler(self):
            handler = super().get_route_handler()

            async def guarded(request):
                response = await handler(request)
                try:
                    guard = SecretGuard(settings)
                    text = response.body.decode('utf-8')
                    guard.check(text)
                    if response.headers.get('content-type', '').startswith('application/json'):
                        guard.check(json.loads(text))
                except EgressDenied:
                    raise DomainError('Agent response withheld by egress policy', 403, 'DATA_EXPOSURE_DENIED') from None
                return response
            return guarded

    routes = APIRouter(prefix='/api/v1/projects/{pid}/agent-runs', dependencies=protected,
                       route_class=SafeAgentRoute)

    @routes.post('', response_model=ResearchRun, status_code=202)
    def create(pid: str, body: RunInput, idempotency_key: str = Header(), s=Depends(session)):
        return service.create(s, pid, body, idempotency_key)

    @routes.get('', response_model=list[ResearchRun])
    def history(pid: str, after: str = Query(default='', max_length=160),
                limit: int = Query(default=50, ge=1, le=100), s=Depends(session)):
        return service.history(s, pid, after, limit)

    @routes.post('/{rid}/continue', response_model=ResearchRun, status_code=202)
    def continue_run(pid: str, rid: str, body: RunInput, idempotency_key: str = Header(), s=Depends(session)):
        return service.continue_from(s, pid, rid, body, idempotency_key)

    @routes.get('/{rid}', response_model=RunDetail)
    def read(pid: str, rid: str, s=Depends(session)):
        row = service.get(s, pid, rid)
        plan = s.scalar(select(PlanRow).where(PlanRow.run_id == rid, PlanRow.revision == row.plan_revision))
        questions = [q.payload for q in s.scalars(select(QuestionRow).where(QuestionRow.run_id == rid).order_by(QuestionRow.id))]
        earlier = [p.payload for p in s.scalars(select(PlanRow).where(PlanRow.run_id == rid,
            PlanRow.revision < row.plan_revision).order_by(PlanRow.revision.desc()).limit(20))]
        actions = []
        for a in s.scalars(select(ActionRow).where(ActionRow.run_id == rid).order_by(ActionRow.action_key, ActionRow.attempt)):
            outcome = a.outcome or {}
            result = outcome.get('result') if isinstance(outcome.get('result'), dict) else {}
            code = outcome.get('error_code') or result.get('error_code')
            actions.append(dict(id=a.id, tool=a.request.get('tool', 'unknown'), attempt=a.attempt, state=a.state,
                assignment_id=a.assignment_id, job_id=outcome.get('job_id'),
                artifact_ids=[i for i in outcome.get('artifact_ids', []) if isinstance(i, str)],
                error_code=code if code in ErrorCode.__args__ else None))
        assignments = [dict(id=a.id, role=a.payload['role'], objective=a.payload['objective'],
            plan_revision=a.payload['plan_revision'], state=a.state, created_at=a.payload['created_at'],
            deadline_at=a.payload['deadline_at']) for a in s.scalars(select(AssignmentRow).where(AssignmentRow.run_id == rid))]
        return dict(run=service.projected_payload(s, row), plan=plan.payload if plan else None, questions=questions,
                    earlier_plans=earlier, actions=actions, assignments=assignments,
                    control_effect=('New dispatch is fenced; accepted jobs drain under their fixed deadlines.'
                        if row.state == 'paused' else
                        'Owned jobs are fenced and shared jobs detached; prior external effects may have settled.'
                        if row.state == 'cancelled' else 'No stop control is active.'))

    @routes.post('/{rid}/amend', response_model=ResearchRun)
    def amend(pid: str, rid: str, body: RunAmendmentInput, idempotency_key: str = Header(), s=Depends(session)):
        return service.mutate(s, pid, rid, 'amend', body, idempotency_key)

    @routes.post('/{rid}/review-plan', response_model=ResearchRun)
    def review(pid: str, rid: str, body: PlanAcceptanceInput, idempotency_key: str = Header(), s=Depends(session)):
        return service.mutate(s, pid, rid, 'review-plan', body, idempotency_key)

    @routes.post('/{rid}/questions/{qid}/answer', response_model=ResearchRun)
    def answer(pid: str, rid: str, qid: str, body: QuestionAnswerInput, idempotency_key: str = Header(), s=Depends(session)):
        return service.mutate(s, pid, rid, 'answer', body, idempotency_key, qid)

    def control(operation):
        def endpoint(pid: str, rid: str, body: RunControlInput, idempotency_key: str = Header(), s=Depends(session)):
            return service.mutate(s, pid, rid, operation, body, idempotency_key)
        endpoint.__name__ = operation + '_agent_run'
        return endpoint

    for operation in ('pause', 'resume', 'cancel'):
        routes.add_api_route('/{rid}/' + operation, control(operation), methods=['POST'], response_model=ResearchRun)

    @routes.get('/{rid}/events', response_model=list[RunEvent])
    def events(pid: str, rid: str, after: int = Query(default=0, ge=0),
               limit: int = Query(default=100, ge=1, le=500), s=Depends(session)):
        return service.events(s, pid, rid, after, limit)

    @routes.get('/{rid}/stream', response_class=Response)
    def stream(pid: str, rid: str, after: int = Query(default=0, ge=0),
               last_event_id: str | None = Header(default=None), s=Depends(session)):
        if last_event_id is not None:
            if not last_event_id.isascii() or not last_event_id.isdigit() or len(last_event_id) > 16:
                raise DomainError('Invalid Last-Event-ID')
            after = max(after, int(last_event_id))
        # Bounded replay closes the DB transaction. EventSource reconnects using
        # Last-Event-ID; no session/lock is held while waiting on a scientific job.
        batch = service.events(s, pid, rid, after, 100)
        data = 'retry: 2000\n\n' + ''.join(
            f"id: {e['sequence']}\nevent: {e['event_type']}\ndata: {json.dumps(e, separators=(',', ':'))}\n\n" for e in batch)
        return Response(data, media_type='text/event-stream', headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})

    @routes.get('/{rid}/result', response_model=RunResult)
    def result(pid: str, rid: str, s=Depends(session)):
        row = service.get(s, pid, rid)
        if row.state not in TERMINAL:
            raise DomainError('Run has no terminal result yet', 409, 'RUN_REVISION_CHANGED')
        return dict(run_id=rid, state=row.state, artifact_ids=row.payload['result_artifact_ids'],
                    stop_reason=row.payload.get('stop_reason'))

    policy_routes = APIRouter(dependencies=protected, route_class=SafeAgentRoute)

    @policy_routes.get('/api/v1/projects/{pid}/execution-policy', response_model=ExecutionPolicySummary)
    def execution_policy(pid: str, s=Depends(session)):
        """Read-only summary for the request workspace. Policy writes stay operator-provisioned."""
        from .services import project
        project(s, pid)
        try:
            service.admission()
            available, reason = True, None
        except DomainError as exc:
            available, reason = False, str(exc)
        try:
            server, current = service.policies(s, pid)
        except DomainError:
            return dict(project_id=pid, policy=None, agent_available=available, unavailable_reason=reason)
        # Run admission compares the stored row revision, so report that one.
        revision = s.scalar(select(ProjectPolicyRow.revision).where(ProjectPolicyRow.project_id == pid)
                            .order_by(ProjectPolicyRow.revision.desc()).limit(1))
        effective = intersect_policy(server, current)
        if pid not in effective.project_ids:
            return dict(project_id=pid, policy=None, agent_available=available, unavailable_reason=reason)
        owned = lambda model, ids: sorted(s.scalars(select(model.id).where(
            model.project_id == pid, model.id.in_(sorted(ids))))) if ids else []
        return dict(project_id=pid, agent_available=available, unavailable_reason=reason, policy=dict(
            reference=effective.reference(), project_policy_revision=revision,
            exposure=effective.exposure, allowed_tools=sorted(effective.allowed_tools),
            material_ids=owned(MaterialRow, effective.material_ids),
            artifact_ids=owned(ArtifactRow, effective.artifact_ids),
            limits=effective.limits, spend_ceiling_usd=effective.spend_ceiling_usd,
            allow_reuse=effective.allow_reuse, automatic_failure_recording=effective.automatic_failure_recording,
            verify_reports=effective.verify_reports, share_operator_messages=effective.share_operator_messages))

    outer = APIRouter()
    outer.include_router(routes)
    outer.include_router(policy_routes)
    return outer

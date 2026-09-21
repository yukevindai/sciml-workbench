"""Private operator routes; no raw graph state, leases or tool permissions."""
import json
from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import Response
from fastapi.routing import APIRoute
from sqlalchemy import select
from .agent_db import PlanRow, QuestionRow
from .agent_runs import RunService, TERMINAL
from .agent_http_contracts import RunDetail, RunResult
from .errors import DomainError
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
        return dict(run=service.projected_payload(s, row), plan=plan.payload if plan else None, questions=questions,
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

    return routes

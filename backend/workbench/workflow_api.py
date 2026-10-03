from fastapi import APIRouter, Depends, Header
from . import workflows
from .workflow_contracts import WorkflowInput, WorkflowUpdate, ResearchWorkflow, WorkflowCatalog, WorkflowStart, WorkflowRun, WorkflowActivity
from .market_contracts import ArchiveInput
from .agent_market import archive_entry
from .market_db import MarketEntryRow
from .barriers import lock_project
from .egress import SecretGuard


def router(service,session,protected,settings):
    routes=APIRouter(prefix='/api/v1',dependencies=protected)

    @routes.get('/workflows',response_model=WorkflowCatalog)
    def catalog(s=Depends(session,scope='function')):
        return workflows.catalog(s)

    @routes.post('/workflows',response_model=ResearchWorkflow,status_code=201)
    def create(body:WorkflowInput,s=Depends(session,scope='function')):
        SecretGuard(settings).check(body.model_dump(mode='json'))
        return workflows.save(s,body)

    @routes.post('/workflows/{ident}',response_model=ResearchWorkflow)
    def update(ident:str,body:WorkflowUpdate,s=Depends(session,scope='function')):
        SecretGuard(settings).check(body.model_dump(mode='json'))
        return workflows.save(s,body,ident)

    @routes.post('/workflows/{ident}/archive',response_model=ResearchWorkflow)
    def archive(ident:str,body:ArchiveInput,s=Depends(session,scope='function')):
        return archive_entry(s,ident,'workflow',body.expected_revision)

    @routes.get('/projects/{pid}/workflow-runs',response_model=WorkflowActivity)
    def activity(pid:str,s=Depends(session,scope='function')):
        return workflows.activity(s,pid)

    @routes.post('/projects/{pid}/workflows/{ident}/run',response_model=WorkflowRun,status_code=201)
    def start(pid:str,ident:str,body:WorkflowStart,idempotency_key:str=Header(),s=Depends(session,scope='function')):
        SecretGuard(settings).check(body.model_dump(mode='json'))
        return workflows.start(s,pid,ident,body,idempotency_key,service)

    @routes.post('/projects/{pid}/workflow-runs/{rid}/cancel',response_model=WorkflowRun)
    def cancel(pid:str,rid:str,s=Depends(session,scope='function')):
        return workflows.cancel(s,pid,rid,service)

    @routes.post('/projects/{pid}/workflows/{ident}/unschedule',response_model=WorkflowActivity)
    def unschedule(pid:str,ident:str,s=Depends(session,scope='function')):
        lock_project(s,pid)
        row=s.get(MarketEntryRow,'schedule:'+pid+':'+ident)
        if row:row.payload={**row.payload,'enabled':False}
        s.flush()
        return workflows.activity(s,pid)

    return routes

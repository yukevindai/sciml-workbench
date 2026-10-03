"""Durable graph orchestration over the existing bounded, permissioned run queue.

Definitions and run envelopes use the market's versioned JSON store. Project locks
serialize advancement with run controls. No browser session owns execution.
"""
from copy import deepcopy
from sqlalchemy import select, update
from .market_db import MarketEntryRow
from .workflow_contracts import ResearchWorkflow, WorkflowRun, WorkflowStart
from .agent_runs import RunService, TERMINAL, key_check
from .agent_db import RunRow
from .agent_policy import AuthorityPolicy, intersect_policy
from .research_contracts import RunInput, RunControlInput
from .market_contracts import AgentRoster, AgentProfile, ResearchTool
from .agent_market import entry, resolve_roster
from .barriers import lock_project
from .contracts import uid, now
from .errors import DomainError
from .request_identity import request_digest


def defaults():
    def node(i, kind, name, x, y, **kw):
        return dict(id=i, kind=kind, name=name, x=x, y=y, **kw)
    def edge(a, b, port='out', data_type='artifacts'):
        return dict(source=a, target=b, port=port, data_type=data_type)
    return [ResearchWorkflow(id='workflow-evidence', name='Evidence to insight', built_in=True,
        description='Research the sources and review them in parallel, then synthesize a grounded answer.',
        nodes=[node('start','trigger','Research request',40,210),
               node('research','research','Investigate evidence',340,80,instructions='Investigate the supplied sources and retain evidence for the research question.'),
               node('review','research','Independent critique',340,350,instructions='Independently examine assumptions, limitations and conflicting evidence for the research question.'),
               node('join','join','Bring findings together',650,210),
               node('synthesis','research','Synthesize findings',930,210,instructions='Synthesize the connected findings into an evidence-grounded answer. Explain disagreements and uncertainty.'),
               node('end','finish','Research complete',1220,210)],
        edges=[edge('start','research',data_type='signal'),edge('start','review',data_type='signal'),edge('research','join'),edge('review','join'),edge('join','synthesis'),edge('synthesis','end')]),
        ResearchWorkflow(id='workflow-evaluation', name='Evaluate and refine', built_in=True,
        description='Check data, branch on retained results, and run two bounded rounds of evaluation.',
        nodes=[node('start','trigger','Research request',40,210),node('audit','research','Check research inputs',330,210,instructions='Assess supplied data and research feasibility. Retain a data audit when possible.'),
               node('branch','branch','Results available?',620,210),node('iterate','repeat','Evaluate and refine',920,70,instructions='Evaluate the research question using the connected results. Improve the comparison using lessons from the previous round.',iterations=2),
               node('clarify','research','Identify missing evidence',920,380,instructions='Explain the missing inputs and propose an actionable research plan without fabricating results.'),node('end','finish','Findings ready',1240,210)],
        edges=[edge('start','audit',data_type='signal'),edge('audit','branch'),edge('branch','iterate','yes'),edge('branch','clarify','no'),edge('iterate','end'),edge('clarify','end')])]


def definition(s, ident):
    return next((w for w in defaults() if w.id == ident), None) or ResearchWorkflow.model_validate(entry(s, ident, 'workflow').payload)


def catalog(s):
    rows = s.scalars(select(MarketEntryRow).where(MarketEntryRow.kind == 'workflow').order_by(MarketEntryRow.id))
    return {'workflows': [*defaults(), *[ResearchWorkflow.model_validate(r.payload) for r in rows if not r.payload['archived']]]}


def save(s, body, ident=None):
    if ident and any(w.id == ident for w in defaults()):
        raise DomainError('Create a copy to customize a built-in workflow.',409)
    for n in body.nodes:
        if n.tool_id:
            entry(s,n.tool_id,'tool')
    data = body.model_dump(exclude={'expected_revision'})
    value = ResearchWorkflow(id=ident or uid(), revision=body.expected_revision+1 if ident else 1, **data)
    if ident:
        entry(s,ident,'workflow')
        result=s.execute(update(MarketEntryRow).where(MarketEntryRow.id==ident,
            MarketEntryRow.payload['revision'].as_integer()==body.expected_revision).values(payload=value.model_dump(mode='json')))
        if result.rowcount != 1:
            raise DomainError('Workflow changed. Reload before saving.',409,'RUN_REVISION_CHANGED')
    else:
        s.add(MarketEntryRow(id=value.id,kind='workflow',payload=value.model_dump(mode='json')))
    s.flush()
    return value


def public(row):
    return WorkflowRun.model_validate({k:row.payload[k] for k in WorkflowRun.model_fields if k in row.payload})


def start(s,pid,ident,body,key,service, *, ceiling=None):
    key_check(key)
    lock_project(s,pid)
    digest=request_digest('workflow',dict(workflow_id=ident,**body.model_dump(mode='json')))
    # Stable ID plus project lock makes retries safe even after the graph is edited.
    import hashlib
    rid=hashlib.sha256((pid+':'+key).encode()).hexdigest()[:36]
    old=s.get(MarketEntryRow,rid)
    if old:
        if old.kind!='workflow_run' or old.payload['digest']!=digest:
            raise DomainError('Request key binds another workflow request',409,'IDEMPOTENCY_CONFLICT')
        return public(old)
    w=definition(s,ident)
    if body.expected_revision!=w.revision:
        raise DomainError('Workflow changed. Reload before starting.',409,'RUN_REVISION_CHANGED')
    service.admission()
    server,project=service.policies(s,pid,body.request.policy_revision)
    policy=intersect_policy(server,project,ceiling or project)
    policy=policy.model_copy(update={'limits':policy.limits.model_copy(update={k:min(v,getattr(body.request.limits,k)) for k,v in policy.limits.model_dump().items()})})
    service.inputs(s,pid,body.request.inputs,policy)
    if any(len(body.request.objective)+len(n.name)+len(n.instructions)+30>4000 for n in w.nodes if n.kind in {'research','repeat'}):
        raise DomainError('Shorten the question or step instructions to fit the research request limit.',422)
    rosters={}; recipes={}
    for n in w.nodes:
        roster=resolve_roster(s,pid,n.assignment)
        rosters[n.id]=roster.model_dump(mode='json') if roster else None
        if n.tool_id:
            recipes[n.id]=ResearchTool.model_validate(entry(s,n.tool_id,'tool').payload).model_dump(mode='json')
    payload=dict(id=rid,project_id=pid,workflow_id=w.id,name=w.name,created_at=now().isoformat(),state='running',
        nodes={n.id:dict(state='pending',run_ids=[],artifact_ids=[],branch=None) for n in w.nodes},
        graph=w.model_dump(mode='json'),request=body.request.model_dump(mode='json'),policy=policy.model_dump(mode='json'),
        digest=digest,rosters=rosters,recipes=recipes,error=None)
    row=MarketEntryRow(id=rid,kind='workflow_run',payload=payload);s.add(row);s.flush()
    if body.enable_schedule:
        if w.trigger!='daily':
            raise DomainError('Only daily workflows can be scheduled',422)
        sid='schedule:'+pid+':'+ident
        schedule=s.get(MarketEntryRow,sid)
        data=dict(project_id=pid,workflow_id=ident,body=body.model_dump(mode='json'),policy=policy.model_dump(mode='json'),last_day=now().date().isoformat(),enabled=True)
        if schedule: schedule.payload=data
        else: s.add(MarketEntryRow(id=sid,kind='wf_schedule',payload=data))
    return public(row)


def activity(s,pid):
    lock_project(s,pid)
    rows=list(s.scalars(select(MarketEntryRow).where(MarketEntryRow.kind.in_(['workflow_run','wf_schedule']),MarketEntryRow.payload['project_id'].as_string()==pid)))
    return dict(runs=sorted([public(r) for r in rows if r.kind=='workflow_run'],key=lambda r:r.created_at,reverse=True)[:50],
        scheduled_workflow_ids=[r.payload['workflow_id'] for r in rows if r.kind=='wf_schedule' and r.payload.get('enabled')])


def cancel(s,pid,rid,service):
    lock_project(s,pid)
    row=entry(s,rid,'workflow_run')
    if row.payload['project_id']!=pid: raise DomainError('Workflow run not found',404)
    p=deepcopy(row.payload)
    if p['state'] in TERMINAL: return public(row)
    for state in p['nodes'].values():
        for child in state['run_ids']:
            run=service.get(s,pid,child)
            if run.state not in TERMINAL:
                service.mutate(s,pid,child,'cancel',RunControlInput(expected_run_revision=run.control_revision),'wf-cancel:'+rid)
    p['state']='cancelled';row.payload=p
    return public(row)


def advance(s,row,service):
    pid=row.payload['project_id'];lock_project(s,pid);s.refresh(row)
    if row.payload['state'] in TERMINAL: return
    p=deepcopy(row.payload);w=ResearchWorkflow.model_validate(p['graph']);states=p['nodes']
    running=0;waiting=False
    for n in w.nodes:
        state=states[n.id]
        if state['state']=='running':
            child=service.get(s,pid,state['run_ids'][-1])
            if child.state in TERMINAL:
                policy=service.effective_policy(s,child)
                state['artifact_ids']=sorted(set(state['artifact_ids']) | (set(child.payload['result_artifact_ids']) & policy.artifact_ids))
                state['state']='completed' if child.state=='completed' else 'failed'
                if n.kind=='repeat' and child.state=='completed' and len(state['run_ids'])<n.iterations:
                    state['state']='pending'
            else:
                running+=1
                waiting |= child.state in {'waiting_for_input','paused'}
    # Each pass advances all currently ready independent nodes, respecting fan-in.
    for n in w.nodes:
        state=states[n.id]
        if state['state']!='pending': continue
        incoming=[e for e in w.edges if e.target==n.id]
        if any(states[e.source]['state'] in {'pending','running'} for e in incoming): continue
        active=[e for e in incoming if states[e.source]['state']!='skipped' and (e.port=='out' or states[e.source]['branch']==e.port)]
        if incoming and not active:
            state['state']='skipped';continue
        artifacts=set(state['artifact_ids'])
        parents=set(state['run_ids'])
        # Follow artifact-carrying links across structural join/branch nodes.
        def collect(source, seen):
            if source in seen: return
            seen.add(source);parents.update(states[source]['run_ids'])
            for e in w.edges:
                if e.target==source and e.data_type=='artifacts' and states[e.source]['state']!='skipped' and (e.port=='out' or states[e.source]['branch']==e.port):collect(e.source,seen)
        for e in active:
            if e.data_type=='artifacts':
                artifacts.update(states[e.source]['artifact_ids']);collect(e.source,set())
        if n.kind in {'trigger','join','finish','branch'}:
            state['artifact_ids']=sorted(artifacts);state['state']='completed'
            if n.kind=='branch':
                yes=bool(artifacts) if n.condition=='has_artifacts' else all(states[e.source]['state']=='completed' for e in active)
                state['branch']='yes' if yes else 'no'
            continue
        if running>=w.concurrency:continue
        body=RunInput.model_validate(p['request'])
        _,project=service.policies(s,pid)
        # Divide the graph's cumulative request budget between its maximum child count.
        count=sum(n.iterations if n.kind=='repeat' else 1 for n in w.nodes if n.kind in {'research','tool','repeat'})
        limits=AuthorityPolicy.model_validate(p['policy']).limits.model_dump()
        for field in ['model_tokens','model_requests','tool_calls','coordinator_iterations','specialist_assignments','scientific_attempts','active_seconds','transient_retries','finalization_model_tokens','finalization_scientific_attempts']:
            limits[field]=limits[field]//max(1,count)
        limits['specialist_concurrency']=min(limits['specialist_concurrency'],limits['specialist_assignments'])
        recipe=p['recipes'].get(n.id)
        instructions=('Use the saved research tool supplied in your context.' if recipe else n.instructions)
        objective=(body.objective+'\n\nWorkflow stage: '+n.name+'\n'+instructions)
        if len(objective)>4000: raise DomainError('Research question plus step instructions exceeds 4000 characters.',422)
        body=body.model_copy(update={'objective':objective,'policy_revision':project.revision,'limits':body.limits.model_validate(limits),
            'inputs':body.inputs.model_copy(update={'artifact_ids':sorted(set(body.inputs.artifact_ids)|artifacts)})})
        meta=dict(id=p['id'],parent_ids=sorted(parents),roster=p['rosters'][n.id],recipe=recipe,ceiling=p['policy'])
        child=service.create(s,pid,body,f"workflow:{p['id']}:{n.id}:{len(state['run_ids'])}",workflow=meta)
        state['run_ids'].append(child['id']);state['state']='running';running+=1
    if all(v['state'] not in {'pending','running'} for v in states.values()):
        p['state']='partially_completed' if any(v['state']=='failed' for v in states.values()) else 'completed'
    else:p['state']='waiting' if waiting and all(v['state']!='pending' for v in states.values()) else 'running'
    # A wait can have pending downstream nodes; avoid a hot queue while all children need input.
    children=[service.get(s,pid,v['run_ids'][-1]) for v in states.values() if v['state']=='running']
    if children and all(c.state in {'waiting_for_input','paused'} for c in children):p['state']='waiting'
    p['last_advanced_at']=now().isoformat();row.payload=p;s.flush()


def tick(db,service):
    with db.session.begin() as s:
        rows=list(s.scalars(select(MarketEntryRow).where(MarketEntryRow.kind=='workflow_run',MarketEntryRow.payload['state'].as_string().in_(['running','waiting'])).order_by(MarketEntryRow.payload['last_advanced_at'].as_string().nullsfirst(),MarketEntryRow.id).limit(100)))
        for row in rows:
            try:
                with s.begin_nested():advance(s,row,service)
            except DomainError:
                # Do not expose provider/configuration detail through a graph error.
                cancel(s,row.payload['project_id'],row.id,service)
                p=deepcopy(row.payload);p.update(state='failed',error='Execution stopped because project access, configuration, or a saved dependency changed.');row.payload=p
        schedules=list(s.scalars(select(MarketEntryRow).where(MarketEntryRow.kind=='wf_schedule').limit(100)))
        day=now().date().isoformat()
        for row in schedules:
            p=deepcopy(row.payload)
            if not p.get('enabled') or p['last_day']>=day:continue
            lock_project(s,p['project_id']);s.refresh(row);p=deepcopy(row.payload)
            if not p.get('enabled') or p['last_day']>=day:continue
            # Never overlap recurring runs of this workflow in the same project.
            if s.scalar(select(MarketEntryRow.id).where(MarketEntryRow.kind=='workflow_run',MarketEntryRow.payload['project_id'].as_string()==p['project_id'],MarketEntryRow.payload['workflow_id'].as_string()==p['workflow_id'],MarketEntryRow.payload['state'].as_string().in_(['running','waiting'])).limit(1)):continue
            try:
                with s.begin_nested():
                    body=WorkflowStart.model_validate(p['body']);_,project=service.policies(s,p['project_id'])
                    body=body.model_copy(update={'enable_schedule':False,'request':body.request.model_copy(update={'policy_revision':project.revision})})
                    start(s,p['project_id'],p['workflow_id'],body,'daily:'+p['workflow_id']+':'+day,service,ceiling=AuthorityPolicy.model_validate(p['policy']))
                p['last_day']=day
            except DomainError:p['enabled']=False
            row.payload=p

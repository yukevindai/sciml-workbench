"""Graph durability, bounded fan-out, immutable recipes and permission inheritance."""
from copy import deepcopy
import pytest
from pydantic import ValidationError
from sqlalchemy import select
from workbench import workflows, agent_market
from workbench.workflow_contracts import WorkflowInput, WorkflowStart, WorkflowUpdate
from workbench.market_contracts import ResearchToolInput, ResearchToolUpdate, AgentInput, AgentSelection
from workbench.research_contracts import RunInput
from workbench.agent_policy import default_limits
from workbench.agent_db import RunRow, ProjectPolicyRow
from workbench.market_db import MarketEntryRow
from workbench.contracts import now
from workbench.errors import DomainError
from test_metadata import old_db, db
from test_tool_registry import registry


def request(data=None, **kw):
    return WorkflowStart(expected_revision=1,request=RunInput(objective='Investigate the evidence',policy_revision=1,
        limits=default_limits(),inputs={'artifact_ids':[data.id] if data else [],'material_ids':[]}),**kw)


def begin(tool, ident='workflow-evidence', body=None):
    with tool.db.session.begin() as s:
        return workflows.start(s,'p',ident,body or request(),'wf-test',tool.runs)


def finish(tool,rid,state='completed'):
    with tool.db.session.begin() as s:
        row=s.get(RunRow,rid)
        tool.runs.save(row,{**row.payload,'state':state,'finished_at':now().isoformat()})


def read(tool,rid):
    with tool.db.session() as s:return workflows.public(s.get(MarketEntryRow,rid))


def advance(tool):workflows.tick(tool.db,tool.runs)


def test_typed_graph_rejects_cycles_dangling_and_incomplete_branches():
    original=workflows.defaults()[1].model_dump(exclude={'id','revision','built_in','archived'})
    for mutate in [lambda v:v['edges'].append({'source':'iterate','target':'audit'}),
                   lambda v:v['edges'][0].update(target='missing'),
                   lambda v:v['edges'][0].update(data_type='artifacts'),
                   lambda v:v['edges'].pop(3),
                   lambda v:v['nodes'][3].update(iterations=100)]:
        v=deepcopy(original);mutate(v)
        with pytest.raises(ValidationError):WorkflowInput.model_validate(v)


def test_parallel_join_restart_idempotency_and_shared_limits(registry):
    tool,*_=registry
    run=begin(tool);assert begin(tool).id==run.id
    advance(tool);first=read(tool,run.id)
    assert first.nodes['research'].state==first.nodes['review'].state=='running'
    assert first.nodes['synthesis'].state=='pending'
    ids=[first.nodes[k].run_ids[0] for k in ['research','review']]
    with tool.db.session() as s:
        for rid in ids:assert s.get(RunRow,rid).payload['limits']['model_requests']==default_limits().model_requests//3
    finish(tool,ids[0]);advance(tool)
    assert read(tool,run.id).nodes['synthesis'].state=='pending'
    tool.db.engine.dispose()  # reopen durable state; no browser/checkpoint is required
    finish(tool,ids[1]);advance(tool)
    current=read(tool,run.id);synthesis=current.nodes['synthesis'].run_ids[0]
    advance(tool);assert read(tool,run.id).nodes['synthesis'].run_ids==[synthesis]
    finish(tool,synthesis);advance(tool)
    assert read(tool,run.id).state=='completed'


def test_branch_skips_unchosen_path_and_join_does_not_wait_forever(registry):
    tool,*_=registry;run=begin(tool,'workflow-evaluation');advance(tool)
    finish(tool,read(tool,run.id).nodes['audit'].run_ids[0]);advance(tool)
    state=read(tool,run.id)
    assert state.nodes['branch'].branch=='no'
    assert state.nodes['iterate'].state=='skipped'
    finish(tool,state.nodes['clarify'].run_ids[0]);advance(tool)
    assert read(tool,run.id).state=='completed'


def test_bounded_repeat_cancels_all_children_and_foreign_project_cannot_control(registry):
    tool,*_=registry
    w=workflows.defaults()[1].model_dump(exclude={'id','revision','built_in','archived'})
    w['nodes'][2]['condition']='all_completed'
    with tool.db.session.begin() as s:saved=workflows.save(s,WorkflowInput.model_validate(w))
    run=begin(tool,saved.id);advance(tool);finish(tool,read(tool,run.id).nodes['audit'].run_ids[0]);advance(tool)
    one=read(tool,run.id).nodes['iterate'].run_ids[0];finish(tool,one);advance(tool)
    ids=read(tool,run.id).nodes['iterate'].run_ids
    assert len(ids)==2 and ids[0]!=ids[1]
    with tool.db.session.begin() as s:
        with pytest.raises(DomainError):workflows.cancel(s,'q',run.id,tool.runs)
    with tool.db.session.begin() as s:workflows.cancel(s,'p',run.id,tool.runs)
    advance(tool)
    assert read(tool,run.id).state=='cancelled'
    with tool.db.session() as s:assert s.get(RunRow,ids[1]).state=='cancelled'


def test_custom_tool_snapshot_and_runtime_capability_ceiling(registry):
    tool,*_=registry
    with tool.db.session.begin() as s:
        recipe=agent_market.save_entry(s,'tool',ResearchToolInput(name='Read context',instructions='Summarize the project.',capabilities=['inspect_project']))
        agent=agent_market.save_entry(s,'agent',AgentInput(name='Reader',role='Researcher',skills=['evidence'],tools=[],custom_tool_ids=[recipe.id]))
        run=tool.runs.create(s,'p',request().request.model_copy(update={'agent_selection':AgentSelection(kind='agent',id=agent.id)}),'recipe')
        agent_market.save_entry(s,'tool',ResearchToolUpdate(name='Changed',instructions='New instructions.',capabilities=['run_audit'],expected_revision=1),recipe.id)
        assert tool.runs.effective_policy(s,s.get(RunRow,run['id'])).allowed_tools=={'inspect_project'}
        assert run['agent_roster']['agents'][0]['custom_tools'][0]['name']=='Read context'


def test_saved_graph_and_roster_do_not_change_under_active_run(registry):
    tool,*_=registry
    with tool.db.session.begin() as s:
        saved=workflows.save(s,WorkflowInput.model_validate(workflows.defaults()[0].model_dump(exclude={'id','revision','built_in','archived'})))
    run=begin(tool,saved.id)
    with tool.db.session.begin() as s:
        data=saved.model_dump(exclude={'id','revision','built_in','archived'});data['nodes'][1]['instructions']='Different task'
        workflows.save(s,WorkflowUpdate(**data,expected_revision=1),saved.id)
    advance(tool)
    with tool.db.session() as s:
        child=s.get(RunRow,read(tool,run.id).nodes['research'].run_ids[0])
        assert 'Different task' not in child.payload['objective']


def test_daily_schedule_is_durable_and_does_not_overlap(registry):
    tool,*_=registry
    with tool.db.session.begin() as s:
        w=workflows.defaults()[0].model_dump(exclude={'id','revision','built_in','archived'});w['trigger']='daily'
        saved=workflows.save(s,WorkflowInput.model_validate(w))
    run=begin(tool,saved.id,request(enable_schedule=True))
    with tool.db.session.begin() as s:
        schedule=s.get(MarketEntryRow,'schedule:p:'+saved.id);schedule.payload={**schedule.payload,'last_day':'2000-01-01'}
    advance(tool)
    with tool.db.session() as s:
        assert len(list(s.scalars(select(MarketEntryRow).where(MarketEntryRow.kind=='workflow_run'))))==1
    with tool.db.session.begin() as s:workflows.cancel(s,'p',run.id,tool.runs)
    advance(tool);advance(tool)
    with tool.db.session() as s:
        assert len(list(s.scalars(select(MarketEntryRow).where(MarketEntryRow.kind=='workflow_run'))))==2


def test_generated_artifacts_flow_only_while_parent_authority_remains(registry):
    from dataclasses import replace
    from workbench.job_metadata import claim_next
    from workbench.worker import process_job
    tool, ctx, data, _ = registry
    run=begin(tool,body=request(data));advance(tool)
    parent=read(tool,run.id).nodes['research'].run_ids[0]
    result=tool.dispatch(replace(ctx,run_id=parent,action_key='workflow-audit'),'run_audit',{'dataset_id':data.id})
    assert result.status=='submitted'
    process_job(tool.settings,claim_next(tool.db,120,'test-workflow'),db=tool.db)
    from workbench.db import JobRow
    with tool.db.session.begin() as s:
        artifact=s.get(JobRow,result.job_id).result_id
        row=s.get(RunRow,parent)
        tool.runs.save(row,{**row.payload,'state':'completed','finished_at':now().isoformat(),'result_artifact_ids':[artifact]})
    finish(tool,read(tool,run.id).nodes['review'].run_ids[0]);advance(tool)
    child=read(tool,run.id).nodes['synthesis'].run_ids[0]
    with tool.db.session.begin() as s:
        row=s.get(RunRow,child)
        assert artifact in row.payload['inputs']['artifact_ids']
        assert artifact in tool.runs.effective_policy(s,row).artifact_ids
        old=s.get(ProjectPolicyRow,('p',1))
        s.add(ProjectPolicyRow(project_id='p',revision=2,payload={**old.payload,'revision':2,'artifact_ids':[]}))
        s.flush()
        assert artifact not in tool.runs.effective_policy(s,row).artifact_ids


def test_workflow_and_tool_http_routes_preserve_private_boundary_and_revisions(registry):
    from fastapi.testclient import TestClient
    from workbench.api import create_app
    tool,*_=registry
    with TestClient(create_app(tool.settings)) as client:
        assert client.get('/api/v1/workflows').status_code==401
        client.headers['Authorization']='Bearer '+'a'*48
        assert len(client.get('/api/v1/workflows').json()['workflows'])==4
        recipe=dict(name='Compare evidence',instructions='Compare the project context.',capabilities=['inspect_project'])
        created=client.post('/api/v1/agent-market/tools',json=recipe)
        assert created.status_code==201
        ident=created.json()['id']
        assert client.post('/api/v1/agent-market/tools/'+ident,json={**recipe,'expected_revision':1}).status_code==200
        assert client.post('/api/v1/agent-market/tools/'+ident,json={**recipe,'expected_revision':1}).status_code==409
        body=workflows.defaults()[0].model_dump(mode='json',exclude={'id','revision','built_in','archived'})
        copied=client.post('/api/v1/workflows',json=body)
        assert copied.status_code==201
        assert copied.json()['id']!='workflow-evidence'
        assert client.post('/api/v1/workflows/workflow-evidence',json={**body,'expected_revision':1}).status_code==409
        assert client.get('/api/v1/projects/p/workflow-runs').json()=={'runs':[],'scheduled_workflow_ids':[]}


@pytest.mark.parametrize('ident,count', [('stress-single',1),('stress-council',3)])
def test_curated_reviews_are_independent_scoped_budgeted_and_cancellable(registry,ident,count):
    tool, _, data, _ = registry
    run=begin(tool,ident,request(data));advance(tool)
    current=read(tool,run.id)
    reviewer_ids=[key for key in current.nodes if key.startswith('stress-')]
    assert len(reviewer_ids)==count
    child_ids=[current.nodes[key].run_ids[0] for key in reviewer_ids]
    with tool.db.session.begin() as s:
        for key,rid in zip(reviewer_ids,child_ids):
            row=s.get(RunRow,rid)
            assert row.payload['inputs']['artifact_ids']==[data.id]
            assert row.payload['inputs']['material_ids']==[]
            roster=row.payload['agent_roster']
            assert [a['id'] for a in roster['agents']]==[key]
            assert roster['selection']['exclusive']
            assert row.payload['limits']['model_requests']==default_limits().model_requests//count
            assert 'run_benchmark' not in tool.runs.effective_policy(s,row).allowed_tools
        workflow=workflows.definition(s,ident)
        assert not any(e.source in reviewer_ids and e.target in reviewer_ids for e in workflow.edges)
        with pytest.raises(DomainError):
            workflows.save(s,WorkflowUpdate(**workflow.model_dump(exclude={'id','revision','built_in','archived'}),expected_revision=1),ident)
        workflows.cancel(s,'p',run.id,tool.runs)
    with tool.db.session() as s:
        assert all(s.get(RunRow,rid).state=='cancelled' for rid in child_ids)

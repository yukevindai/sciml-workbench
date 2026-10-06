/** Browser-only simulation. No fetch, provider SDK, backend import, or network fallback. */
import seed from './seed.json';
import { ApiError } from '../api';
import { parseAgentMarket, parseArtifactPreviews, parseExecutionPolicy, parseMaterials, parseProjects, parseRunDetail, parseWorkflowCatalog, parseResearchWorkflow, parseAgentProfile, parseAgentTeam, parseResearchTool } from '../decode';
import type { AgentSelection, RunDetail, WorkflowRun, WorkflowActivity, ResearchWorkflow } from '../generated/http';

const clone = <T,>(value: T): T => structuredClone(value);
const now = () => new Date().toISOString();
const id = () => `demo-${crypto.randomUUID()}`;
const missing = () => new ApiError('This action is not simulated. Explore the bundled examples, or sign in to work with your own research.', 400);

function initial() {
  const detail = parseRunDetail(clone(seed.detail));
  return {
    projects: parseProjects(clone(seed.projects)),
    artifacts: parseArtifactPreviews(clone(seed.previews)),
    materials: parseMaterials(clone(seed.materials)),
    market: parseAgentMarket(clone(seed.market)),
    workflows: parseWorkflowCatalog({workflows: clone(seed.workflows)}).workflows,
    details: { [detail.run.id]: detail } as Record<string, RunDetail>,
    assignments: {} as Record<string, AgentSelection>,
    activity: {} as Record<string, WorkflowActivity>,
    readyAt: {} as Record<string, number>,
    responses: {} as Record<string, string>,
    requests: {} as Record<string, unknown>,
  };
}
let state: ReturnType<typeof initial> | undefined;
function current():ReturnType<typeof initial> {
  if(!state) {
    state=initial();
    const council=state.workflows.find(w=>w.id==='stress-council');
    if(council) { workflowRun('demo-project',council,{}); Object.keys(state.readyAt).forEach(rid=>{state!.readyAt[rid]=0;}); }
  }
  return state;
}
export function resetDemo() { state = undefined; }

const answer = 'Scripted demo response: inspect the sample audit for missing values and duplicates, compare the grouped split with a row-wise split, and evaluate the mean and ridge baselines. The sample paper has limited replication, so the claim needs independent evidence. Open the linked results to explore the full inspection screens. This response is prewritten and does not analyze your question or files.';
const critiques = [
  'Scripted methods review — Major concern: the example claim lacks independent experimental replication. Confidence: high that the supplied example cannot establish causality. Alternative explanation: batch conditions could explain the apparent effect. Resolving test: repeat across independent batches with a predefined control. Strength: the claim is specific enough to test. This is sample feedback, not an assessment of your input.',
  'Scripted statistics review — Major concern: repeated measurements from one formulation are not independent samples. Confidence: high for the validation risk, uncertain for its magnitude. Alternative explanation: a row-wise split may reward memorization. Resolving test: hold out whole formulations and compare against a simple baseline. Strength: the example retains its split assignments. This is sample feedback, not an assessment of your input.',
  'Scripted evidence review — Major concern: a single paper does not establish generalization. Confidence: moderate because key experimental details are absent. Alternative explanation: unreported conditions could explain the result. Resolving test: trace each claim to its source and obtain independent measurements. Strength: explicit provenance makes gaps visible. This is sample feedback, not an assessment of your input.',
];

function newRun(pid: string, objective: string, response = answer, review = false): RunDetail {
  const s = current(), detail = parseRunDetail(clone(seed.detail));
  const rid = id(), created = now();
  detail.run = {...detail.run, id:rid, project_id:pid, objective, created_at:created, finished_at:null,
    state:review ? 'waiting_for_input' : 'running', mode:review ? 'review_plan' : 'autopilot', control_revision:1,
    result_artifact_ids:[], open_question_ids:[], stop_reason:null,
    inputs:{material_ids:[],artifact_ids:[],conversation_id:null,message_cutoff:null}};
  detail.answer = null; detail.actions = []; detail.assignments = []; detail.questions = [];
  detail.control_effect = 'Demo simulation only.';
  if (detail.plan) {
    detail.plan.id=id(); detail.plan.project_id=pid; detail.plan.run_id=rid; detail.plan.created_at=created;
    detail.plan.rationale_summary='Demo simulation: inspect the bundled sample and show a prewritten result. No model or scientific job is running.';
    detail.plan.steps.forEach((step,i)=>{step.status=i===0?'running':'pending';step.action_ids=[];});
  }
  s.details[rid]=detail; s.readyAt[rid]=Date.now()+6500; s.responses[rid]=response;
  return detail;
}
function advance() {
  const s=current();
  for(const [rid,deadline] of Object.entries(s.readyAt)) {
    const d=s.details[rid];
    if(d?.run.state==='running' && Date.now()>=deadline) {
      d.run.state='completed'; d.run.finished_at=now(); d.run.control_revision++;
      d.run.result_artifact_ids=s.artifacts.filter(a=>a.project_id===d.run.project_id && ['audit','split','benchmark_preview','evidence','failure','report'].includes(a.kind)).map(a=>a.id).slice(0,20);
      d.answer=s.responses[rid]; d.plan?.steps.forEach(step=>{step.status='completed';});
      delete s.readyAt[rid];
    }
  }
  for(const activity of Object.values(s.activity)) for(const run of activity.runs) {
    if(run.state!=='running')continue;
    for(const node of Object.values(run.nodes)) {
      if(node.run_ids.every(rid=>s.details[rid]?.run.state==='completed'))node.state='completed';
    }
    if(Object.values(run.nodes).every(n=>n.state==='completed'))run.state='completed';
  }
}
function workflowRun(pid:string, w:ResearchWorkflow, body:Record<string,unknown>) {
  const run:WorkflowRun={id:id(),project_id:pid,workflow_id:w.id,name:`${w.name} · demo`,created_at:now(),state:'running',nodes:{},error:null};
  let index=0;
  for(const node of w.nodes) {
    const executes=['research','tool','repeat'].includes(node.kind);
    const request=body.request as Record<string,unknown>|undefined;
    const d=executes?newRun(pid,`Example: ${node.name}`,w.id.startsWith('stress-')?critiques[index++%3]:answer,request?.mode==='review_plan'):null;
    run.nodes[node.id]={state:d?'running':'completed',run_ids:d?[d.run.id]:[],artifact_ids:[],branch:null};
  }
  const s=current(), activity=s.activity[pid]??={runs:[],scheduled_workflow_ids:[]};
  activity.runs.unshift(run);
  if(body.enable_schedule && !activity.scheduled_workflow_ids.includes(w.id))activity.scheduled_workflow_ids.push(w.id);
  return run;
}

export async function demoRequest(path:string, init?:RequestInit):Promise<unknown> {
  init?.signal?.throwIfAborted();
  const s=current(); advance();
  const method=(init?.method??'GET').toUpperCase();
  const url=new URL(path,'https://demo.invalid/'), parts=url.pathname.split('/').filter(Boolean);
  const body:Record<string,unknown>=typeof init?.body==='string'?JSON.parse(init.body):{};
  const key=new Headers(init?.headers).get('Idempotency-Key');
  const requestKey=key?`${method}:${path}:${key}`:null;
  if(method!=='GET' && requestKey && requestKey in s.requests)return clone(s.requests[requestKey]);
  const result=handle();
  if(method!=='GET' && requestKey)s.requests[requestKey]=clone(result);
  return clone(result);

  function handle():unknown {
    if(parts[0]==='projects' && parts.length===1) {
      if(method==='GET')return s.projects;
      if(method==='POST') {
        const project={id:id(),name:String(body.name??'Sample project').slice(0,120),description:String(body.description??'Demo project')};
        s.projects.push(project);return project;
      }
    }
    if(parts[0]==='agent-market') {
      if(parts.length===1 && method==='GET')return {...s.market,agents:s.market.agents.filter(a=>!a.archived),teams:s.market.teams.filter(t=>!t.archived),custom_tools:s.market.custom_tools.filter(t=>!t.archived)};
      if(method!=='POST')throw missing();
      const kind=parts[1], entries=kind==='agents'?s.market.agents:kind==='teams'?s.market.teams:kind==='tools'?s.market.custom_tools:null;
      if(!entries)throw missing();
      const old=entries.find(x=>x.id===parts[2]);
      if(parts[2] && !old)throw missing();
      if(old && 'built_in' in old && old.built_in)throw new ApiError('Customize a copy to keep the built-in original.',400);
      const raw:Record<string,unknown>={...(old??{}),...body,id:old?.id??id(),revision:(old?.revision??0)+1,archived:parts[3]==='archive'};
      delete raw.expected_revision;
      if(kind==='agents') {
        const value=parseAgentProfile({custom_tool_ids:[],custom_tools:[],...raw,built_in:false});
        s.market.agents=[...s.market.agents.filter(a=>a.id!==value.id),value];return value;
      }
      if(kind==='teams') {
        const value=parseAgentTeam(raw);s.market.teams=[...s.market.teams.filter(a=>a.id!==value.id),value];return value;
      }
      const value=parseResearchTool(raw);s.market.custom_tools=[...s.market.custom_tools.filter(a=>a.id!==value.id),value];return value;
    }
    if(parts[0]==='workflows') {
      if(method==='GET' && parts.length===1)return {workflows:s.workflows.filter(w=>!w.archived)};
      if(method!=='POST')throw missing();
      const old=s.workflows.find(w=>w.id===parts[1]);
      if(parts[1] && !old)throw missing();
      if(old?.built_in)throw new ApiError('Save a copy of the built-in template.',400);
      const raw:Record<string,unknown>={...(old??{}),...body,id:old?.id??id(),revision:(old?.revision??0)+1,built_in:false,archived:parts[2]==='archive'};
      delete raw.expected_revision;
      const value=parseResearchWorkflow(raw);s.workflows=[...s.workflows.filter(w=>w.id!==value.id),value];return value;
    }
    if(parts[0]!=='projects')throw missing();
    const pid=parts[1];
    if(!s.projects.some(p=>p.id===pid))throw missing();
    const resource=parts[2], rid=parts[3], action=parts[4];
    if(resource==='research-materials') {
      if(method==='GET' && !rid)return s.materials.filter(m=>m.project_id===pid);
      throw new ApiError('Uploads are disabled in this demo. Choose a bundled sample attachment, or sign in to use your own files.',400);
    }
    if(resource==='artifact-previews' && method==='GET')return s.artifacts.filter(a=>a.project_id===pid);
    if(resource==='job-index' && method==='GET')return {items:[],next_cursor:null};
    if(resource==='execution-policy') {
      const policy=parseExecutionPolicy(clone(seed.policy));policy.project_id=pid;
      if(policy.policy){policy.policy.material_ids=s.materials.filter(m=>m.project_id===pid).map(m=>m.id);policy.policy.artifact_ids=s.artifacts.filter(a=>a.project_id===pid).map(a=>a.id);}
      return policy;
    }
    if(resource==='agent-selection') {
      if(method==='POST')s.assignments[pid]=body as unknown as AgentSelection;
      return {project_id:pid,selection:s.assignments[pid]??{kind:'automatic',id:null,exclusive:true}};
    }
    if(resource==='agent-runs') {
      if(!rid) {
        if(method==='GET')return Object.values(s.details).filter(d=>d.run.project_id===pid).map(d=>d.run).sort((a,b)=>b.created_at.localeCompare(a.created_at));
        if(method==='POST') {
          const detail=newRun(pid,String(body.objective??'Sample research'),answer,body.mode==='review_plan');
          const inputs=body.inputs as {material_ids?:string[];artifact_ids?:string[]}|undefined;
          detail.run.inputs.material_ids=inputs?.material_ids??[]; detail.run.inputs.artifact_ids=inputs?.artifact_ids??[];
          return detail.run;
        }
      }
      const d=s.details[rid];if(!d || d.run.project_id!==pid)throw missing();
      if(method==='GET') {
        if(action==='events')return [];
        if(!action)return d;
      }
      if(method==='POST' && ['pause','resume','cancel','review-plan'].includes(action)) {
        d.run.state=action==='pause'?'paused':action==='cancel'?'cancelled':'running';d.run.control_revision++;
        if(action==='cancel'){d.run.finished_at=now();delete s.readyAt[rid];}
        else s.readyAt[rid]=Date.now()+6500;
        return d.run;
      }
    }
    if(resource==='workflow-runs') {
      const activity=s.activity[pid]??={runs:[],scheduled_workflow_ids:[]};
      if(method==='GET' && !rid)return activity;
      if(method==='POST' && action==='cancel') {
        const run=activity.runs.find(r=>r.id===rid);if(!run)throw missing();
        run.state='cancelled';for(const node of Object.values(run.nodes)) {node.state='skipped';for(const child of node.run_ids){s.details[child].run.state='cancelled';s.details[child].run.finished_at=now();delete s.readyAt[child];}}
        return run;
      }
    }
    if(resource==='workflows' && method==='POST') {
      const w=s.workflows.find(w=>w.id===rid);if(!w)throw missing();
      if(action==='run')return workflowRun(pid,w,body);
      if(action==='unschedule'){const a=s.activity[pid]??={runs:[],scheduled_workflow_ids:[]};a.scheduled_workflow_ids=a.scheduled_workflow_ids.filter(x=>x!==rid);return a;}
    }
    if(method==='GET' && pid==='demo-project') {
      if(resource==='reports' && action==='summary')return seed.report;
      if(resource==='evaluations')return {...seed.evaluation,protocol_id:rid};
      if(resource==='evidence' && action==='pages')return (seed.evidence.pages as Record<string,unknown>)[`${rid}/${parts[5]}`]??(()=>{throw missing();})();
      if(resource==='evidence' && action==='anchors')return seed.evidence.anchors.filter(a=>a.source_artifact_id===rid);
      if(resource==='evidence-spans' && !rid)return seed.evidence.anchors;
      if(resource==='evidence-spans' && rid===seed.evidence.ids.anchor)return seed.evidence.anchor_span;
    }
    throw missing(); // Unknown paths and writes never escape to the real API.
  }
}

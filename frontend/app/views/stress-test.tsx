'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, FilePlus2, ShieldCheck, Users } from 'lucide-react';
import type { Workbench } from '../lib/context';
import type { ResearchWorkflow, WorkflowRun, RunDetail } from '../lib/generated/http';
import { api } from '../lib/api';
import { parseWorkflowCatalog, parseWorkflowActivity, parseWorkflowRun, parseRunDetail } from '../lib/decode';
import { acceptedFile, listFiles, permissions, perRun, uploadFile } from '../lib/ask';
import { runInput, scopeItems, type ScopeItem } from '../lib/runs';
import { retainedPost, hasRetainedRequest } from '../lib/retained-request';
import { WorkspacePicker } from '../components/workspace-picker';
import { Alert, Badge, Panel } from '../components/ui';

const PRESETS=[
  {id:'stress-single',title:'Specialist review',tag:'One perspective',icon:ShieldCheck,description:'A broad scientific critique of the claim, assumptions, methods and evidence.'},
  {id:'stress-council',title:'Independent council',tag:'Three perspectives',icon:Users,description:'Methods, statistics and evidence reviewers work separately from the same inputs.'},
] as const;
const LENSES=[['Methods','Controls, confounders, causal claims and alternative explanations.'],['Statistics','Independence, leakage, baselines, uncertainty and generalization.'],['Evidence','Claim support, provenance, reproducibility and missing information.']];

function ReviewResult({pid,rid,state}:{pid:string;rid:string;state:string}) {
  const [detail,setDetail]=useState<RunDetail|null>(null),[error,setError]=useState('');
  useEffect(()=>{const c=new AbortController();void api(`projects/${pid}/agent-runs/${rid}`,parseRunDetail,{signal:c.signal},30_000).then(v=>{if(!c.signal.aborted){if(v.run.project_id!==pid)throw new Error('Review belongs to another project.');setDetail(v);}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[pid,rid,state]);
  return <div className="review-result">{detail?.answer&&<p className="review-answer">{detail.answer}</p>}{!detail?.answer&&detail?.assignments.filter(a=>a.findings.length).map(a=><div key={a.id}><h4>{a.agent_name??a.role}</h4><ul>{a.findings.map((f,i)=><li key={i}>{f}</li>)}</ul>{a.uncertainty&&<p><strong>Uncertainty:</strong> {a.uncertainty}</p>}{a.recommended_actions.length>0&&<><strong>Suggested next steps</strong><ul>{a.recommended_actions.map((v,i)=><li key={i}>{v}</li>)}</ul></>}</div>)}{error&&<p role="alert">{error}</p>}<Link className="text-link" href={`/ask?project=${pid}&run=${rid}`}>Open full review, evidence and questions <ArrowUpRight size={14} aria-hidden="true"/></Link></div>;
}

export function StressTestView({wb}:{wb:Workbench}) {
  const pid=wb.projectId;
  const [presets,setPresets]=useState<ResearchWorkflow[]>([]),[mode,setMode]=useState('stress-single'),[kind,setKind]=useState('idea');
  const [claim,setClaim]=useState(''),[items,setItems]=useState<ScopeItem[]>([]),[selected,setSelected]=useState<string[]>([]),[review,setReview]=useState(false);
  const [catalogAttempt,setCatalogAttempt]=useState(0);
  const [runs,setRuns]=useState<WorkflowRun[]>([]),[error,setError]=useState(''),[filesError,setFilesError]=useState(''),[activityError,setActivityError]=useState(''),[notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[uploading,setUploading]=useState(false),[pending,setPending]=useState(false);
  const flight=useRef(false),fileInput=useRef<HTMLInputElement>(null);
  const storageKey=`stress-request:${pid}:${mode}`;
  useEffect(()=>setPending(hasRetainedRequest(storageKey)),[storageKey]);
  useEffect(()=>{const c=new AbortController();if(!wb.preview)void api('workflows',parseWorkflowCatalog,{signal:c.signal},30_000).then(v=>{if(!c.signal.aborted)setPresets(v.workflows.filter(w=>PRESETS.some(p=>p.id===w.id)&&w.built_in));}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[wb.preview,catalogAttempt]);
  useEffect(()=>{
    if(!pid||wb.preview)return;const c=new AbortController();setLoading(true);
    listFiles(pid,c.signal).then(files=>{if(!c.signal.aborted){const base=scopeItems(files,wb.datasets);const existing=new Set(base.flatMap(v=>v.artifact_ids));setItems([...base,...wb.artifacts.filter(a=>!existing.has(a.id)&&['audit','evidence','claim_set','benchmark_preview','split','failure'].includes(a.kind)).map(a=>({id:a.id,label:`${a.kind.replaceAll('_',' ')} · ${a.id.slice(0,8)}`,media:'result' as const,artifact_ids:[a.id],material_ids:[]}))]);setFilesError('');}}).catch(e=>{if(!c.signal.aborted)setFilesError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();
  },[pid,wb.preview,wb.datasets,wb.artifacts,uploading]);
  useEffect(()=>{
    if(!pid||wb.preview)return;const c=new AbortController();let timer:ReturnType<typeof setTimeout>;
    const refresh=async()=>{try{const v=await api(`projects/${pid}/workflow-runs`,parseWorkflowActivity,{signal:c.signal},30_000);if(!c.signal.aborted){setRuns(v.runs.filter(r=>PRESETS.some(p=>p.id===r.workflow_id)));setActivityError('');}}catch(e){if(!c.signal.aborted)setActivityError(e instanceof Error?e.message:'Could not load reviews.');}finally{if(!c.signal.aborted)timer=setTimeout(refresh,document.hidden?15000:4000);}};void refresh();return()=>{c.abort();clearTimeout(timer);};
  },[pid,wb.preview]);
  const start=async()=>{
    if(flight.current||!pid)return;const preset=presets.find(p=>p.id===mode);if(!preset)return;
    flight.current=true;setBusy(true);setError('');setNotice('');
    try{const value=await retainedPost(storageKey,`projects/${pid}/workflows/${mode}/run`,async()=>{
      const chosen=items.filter(i=>selected.includes(i.id)),policy=perRun(await permissions(pid,chosen));
      return {expected_revision:preset.revision,request:runInput(`Stress-test this ${kind}. Claim and context supplied by the user:\n${claim.trim()}`,chosen,policy,review?'review_plan':'autopilot'),enable_schedule:false};
    },parseWorkflowRun);if(value.project_id!==pid)throw new Error('Review belongs to another project.');setRuns(v=>[value,...v.filter(r=>r.id!==value.id)]);setNotice('Stress test started. Reviews continue after you leave this page.');}
    catch(e){setError(e instanceof Error?e.message:'Could not start the stress test.');}
    finally{flight.current=false;setBusy(false);setPending(hasRetainedRequest(storageKey));}
  };
  return <div className="stress-page stack">
    <div className="market-intro"><div><p className="page-eyebrow">Find the weak points before they matter</p><h2>Put your research to the test.</h2><p>Challenge an idea, a paper, or a result with a reviewer—or an independent council.</p></div><Link className="text-link" href="/docs/stress-testing">How reviews work <ArrowUpRight size={15}/></Link></div>
    <div className="stress-presets" role="group" aria-label="Review setup">{PRESETS.map(({id,title,tag,icon:Icon,description})=><button key={id} className={`stress-preset${mode===id?' stress-preset--selected':''}`} aria-pressed={mode===id} disabled={busy||uploading} onClick={()=>setMode(id)}><Icon size={23} aria-hidden="true"/><span className="page-eyebrow">{tag}</span><strong>{title}</strong><span>{description}</span></button>)}</div>
    <div className="stress-layout"><Panel title="What should we challenge?" description="Be specific about your central claim, the evidence behind it, and what you want to hold up under scrutiny."><div className="stack">
      <label>Review target<WorkspacePicker compact label="Review target" value={kind} options={[{value:'idea',label:'Idea or hypothesis'},{value:'paper',label:'Research paper'},{value:'scientific result',label:'Scientific result'}]} disabled={busy||pending} onChange={setKind}/></label>
      <label>Claim and context<textarea className="textarea" rows={7} maxLength={1800} disabled={busy||pending} value={claim} onChange={e=>setClaim(e.target.value)} placeholder="Our formulation improves cycle life. Challenge whether the evidence supports this conclusion, including validation and alternative explanations."/></label>
      {pid?<><fieldset className="market-fieldset"><legend>Supporting evidence</legend><p className="field-hint">Only selected project inputs are included. Missing or inaccessible evidence will be reported as a limitation.</p>{loading&&<p role="status">Loading inputs…</p>}{filesError&&<p role="alert">{filesError}</p>}<div className="stress-inputs">{items.map(item=><label key={item.id} className="market-check"><input type="checkbox" disabled={busy||pending} checked={selected.includes(item.id)} onChange={()=>setSelected(v=>v.includes(item.id)?v.filter(id=>id!==item.id):[...v,item.id])}/>{item.label}</label>)}</div><input ref={fileInput} type="file" accept=".pdf,.csv" hidden onChange={async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;const invalid=acceptedFile(file);if(invalid){setError(invalid);return;}setUploading(true);setError('');try{const result=await uploadFile(pid,file);setSelected(v=>[...v,result.id]);wb.refreshJobs();}catch(e){setError(e instanceof Error?e.message:'Could not attach file.');}finally{setUploading(false);}}}/><button className="button button--secondary button--sm" disabled={busy||uploading||pending} onClick={()=>fileInput.current?.click()}><FilePlus2 size={15}/>{uploading?'Attaching…':'Attach CSV or PDF'}</button></fieldset><label className="market-check"><input type="checkbox" checked={review} disabled={busy||pending} onChange={e=>setReview(e.target.checked)}/>Review plans before the agents proceed</label></>:<Alert variant="info">Choose a project at the top, or <Link href="/projects">create one</Link>, to retain this review and its evidence.</Alert>}
      {error&&<Alert variant="error" role="alert">{error}{!presets.length&&<button className="button button--ghost" onClick={()=>{setError('');setCatalogAttempt(v=>v+1);}}>Reload review setups</button>}</Alert>}{notice&&<Alert variant="success" role="status">{notice}</Alert>}{pending&&<p className="field-hint">The previous request’s acceptance is uncertain. Retry sends that exact saved claim and input selection.</p>}
      <button className="button button--primary" disabled={!pid||busy||uploading||loading||!!filesError||!presets.some(p=>p.id===mode)||(!claim.trim()&&!pending)||wb.preview} onClick={start}>{busy?'Starting…':pending?'Retry previous stress test':'Start stress test'}</button>
    </div></Panel><aside className="stress-rubric"><p className="page-eyebrow">Curated, not improvised</p><h3>A consistent standard of review.</h3>{LENSES.map(([title,text])=><div key={title}><h4>{title}</h4><p>{text}</p></div>)}<p className="field-hint">Every concern should include evidence, severity, confidence, an alternative explanation and a resolving test. Reviewers use your configured provider and may share its blind spots. Their agreement is not proof or peer-review certification.</p></aside></div>
    {pid&&<section className="stack" aria-label="Stress test history"><h2>Your stress tests</h2>{activityError&&<Alert variant="error">{activityError}</Alert>}{!runs.length&&!activityError&&<p className="field-hint">Your retained reviews will appear here.</p>}{runs.map(run=><Panel key={run.id} title={run.name} aside={<Badge state={run.state}/>} description={new Date(run.created_at).toLocaleString()}>{run.error&&<Alert variant="error">{run.error}</Alert>}<div className="stack">{Object.entries(run.nodes).filter(([,s])=>s.run_ids.length).map(([id,state])=><details className="stress-review" key={id}><summary><strong>{presets.find(p=>p.id===run.workflow_id)?.nodes.find(n=>n.id===id)?.name??'Reviewer'}</strong><Badge state={state.state}/></summary>{state.run_ids.map(rid=><ReviewResult key={rid} pid={pid} rid={rid} state={run.state+state.state}/>)}</details>)}{['running','waiting'].includes(run.state)&&<><p className="field-hint">Open each review for questions, plan approval, and progress.</p><button className="button button--ghost" disabled={busy} onClick={async()=>{setBusy(true);try{const stopped=await api(`projects/${pid}/workflow-runs/${run.id}/cancel`,parseWorkflowRun,{method:'POST'},30_000);setRuns(v=>v.map(r=>r.id===stopped.id?stopped:r));}catch(e){setError(e instanceof Error?e.message:'Could not stop test.');}finally{setBusy(false);}}}>Stop test</button></>}</div></Panel>)}</section>}
  </div>;
}

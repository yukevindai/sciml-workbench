'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Bot, Check, Copy, GitBranch, Grip, Merge, Play, Plus, Repeat2, Save, Trash2, Wrench, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { Workbench } from '../lib/context';
import type { AgentMarket, ResearchWorkflow, WorkflowNode, WorkflowEdge, WorkflowActivity } from '../lib/generated/http';
import { api, ApiError, json } from '../lib/api';
import { parseResearchWorkflow, parseWorkflowCatalog, parseWorkflowRun, parseWorkflowActivity } from '../lib/decode';
import { loadMarket, fromKey, selectionKey } from '../lib/agent-market';
import { listFiles, permissions, perRun } from '../lib/ask';
import { runInput, scopeItems, type ScopeItem } from '../lib/runs';
import { WorkspacePicker } from '../components/workspace-picker';
import { Alert, Badge, Panel } from '../components/ui';

type Graph = Omit<ResearchWorkflow, 'id' | 'revision' | 'archived' | 'built_in'>;
const stepDefaults = { instructions: '', assignment: { kind: 'automatic' as const, id: null, exclusive: true }, tool_id: null, iterations: 2, condition: 'has_artifacts' as const };
const blank = (): Graph => ({ name: 'Untitled workflow', description: '', trigger: 'manual', concurrency: 2,
  nodes: [{ ...stepDefaults, id: 'start', kind: 'trigger', name: 'Research request', x: 60, y: 160 }, { ...stepDefaults, id: 'research', kind: 'research', name: 'Investigate', x: 370, y: 160, instructions: 'Investigate the research question and retain supporting evidence.' }, { ...stepDefaults, id: 'finish', kind: 'finish', name: 'Findings ready', x: 680, y: 160 }],
  edges: [{ source: 'start', target: 'research', port: 'out', data_type: 'signal' }, { source: 'research', target: 'finish', port: 'out', data_type: 'artifacts' }] });
const icons = { trigger: Play, research: Bot, tool: Wrench, branch: GitBranch, join: Merge, repeat: Repeat2, finish: Check };
const names = { trigger: 'Trigger', research: 'Research', tool: 'Research tool', branch: 'Condition', join: 'Join paths', repeat: 'Repeat', finish: 'Finish' };
const NODE_WIDTH = 224;

export function WorkflowsView({ wb }: { wb: Workbench }) {
  const [catalog, setCatalog] = useState<ResearchWorkflow[]>([]);
  const [market, setMarket] = useState<AgentMarket | null>(null);
  const [selected, setSelected] = useState<ResearchWorkflow | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [dirty, setDirty] = useState(false);
  const [nodeId, setNodeId] = useState('');
  const [connecting, setConnecting] = useState<{ source: string; port: 'out' | 'yes' | 'no' } | null>(null);
  const [target, setTarget] = useState('');
  const [edgeType, setEdgeType] = useState<'signal' | 'artifacts'>('artifacts');
  const [zoom, setZoom] = useState(.8);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [review, setReview] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [items, setItems] = useState<ScopeItem[]>([]);
  const [inputs, setInputs] = useState<string[]>([]);
  const [activity, setActivity] = useState<WorkflowActivity>({ runs: [], scheduled_workflow_ids: [] });
  const [activityError, setActivityError] = useState('');
  const [inputError, setInputError] = useState('');
  const [search, setSearch] = useState('');
  const [archiving, setArchiving] = useState(false);
  const drag = useRef<{ id: string; x: number; y: number; clientX: number; clientY: number } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const toolLinkApplied = useRef(false);
  const pid = wb.projectId;
  const load = useCallback(async (signal?: AbortSignal) => {
    const [workflows, tools] = await Promise.all([api('workflows', parseWorkflowCatalog, { signal }, 30_000), loadMarket(signal)]);
    if (signal?.aborted) return;
    setCatalog(workflows.workflows); setMarket(tools);
  }, []);
  useEffect(() => { const c = new AbortController(); if (!wb.preview) void load(c.signal).catch(e => { if (!c.signal.aborted) setError(e.message); }); return () => c.abort(); }, [load, wb.preview]);
  useEffect(() => {
    if (!market || toolLinkApplied.current) return;
    toolLinkApplied.current = true;
    const tool = new URLSearchParams(window.location.search).get('tool');
    if (tool && market.custom_tools?.some(t => t.id === tool)) {
      const next = blank(); next.nodes[1] = { ...next.nodes[1], kind: 'tool', tool_id: tool, name: market.custom_tools.find(t => t.id === tool)!.name };
      setGraph(next); setDirty(true); setNodeId(next.nodes[1].id);
    }
  }, [market, graph]);
  useEffect(() => {
    if (!pid || wb.preview) return;
    const c = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try { const next = await api(`projects/${pid}/workflow-runs`, parseWorkflowActivity, { signal: c.signal }, 30_000); if (!c.signal.aborted) { setActivity(next); setActivityError(''); } }
      catch (e) { if (!c.signal.aborted) setActivityError(e instanceof Error ? e.message : 'Could not load workflow activity.'); }
      finally { if (!c.signal.aborted) timer = setTimeout(refresh, document.hidden ? 15000 : 4000); }
    };
    void refresh();
    listFiles(pid,c.signal).then(files => { if (!c.signal.aborted) setItems(scopeItems(files,wb.datasets)); }).catch(e => { if (!c.signal.aborted) setInputError(e.message); });
    return () => { c.abort(); clearTimeout(timer); };
  }, [pid, wb.preview, wb.datasets]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload',guard); return () => window.removeEventListener('beforeunload',guard);
  }, [dirty]);
  const change = (next: Graph) => { setGraph(next); setDirty(true); setNotice(''); };
  const open = (workflow?: ResearchWorkflow) => {
    if (dirty && !window.confirm('Discard your unsaved workflow changes?')) return;
    setSelected(workflow ?? null); setGraph(workflow ? structuredClone(workflow) : blank()); setNodeId(workflow?.nodes[0]?.id ?? 'start'); setDirty(!workflow); setRunOpen(false); setConnecting(null); setError(''); setNotice(''); setArchiving(false);
  };
  const updateNode = (patch: Partial<WorkflowNode>) => { if (graph) change({ ...graph, nodes: graph.nodes.map(n => n.id === nodeId ? { ...n, ...patch } : n) }); };
  const addNode = (kind: WorkflowNode['kind']) => {
    if (!graph) return;
    const id = crypto.randomUUID();
    const node: WorkflowNode = { ...stepDefaults, id, kind, name: names[kind], x: 100 + graph.nodes.length * 80, y: 400, instructions: kind === 'research' || kind === 'repeat' ? 'Describe the research task for this step.' : '', iterations: 2 };
    change({ ...graph, nodes: [...graph.nodes,node] }); setNodeId(id);
  };
  const connect = (destination: string) => {
    if (!graph || !connecting || connecting.source === destination) return;
    const source = graph.nodes.find(n => n.id === connecting.source)!;
    const edge: WorkflowEdge = { ...connecting, target: destination, data_type: source.kind === 'trigger' ? 'signal' : edgeType };
    if (!graph.edges.some(e => e.source === edge.source && e.target === edge.target && (e.port ?? 'out') === edge.port)) change({ ...graph, edges: [...graph.edges,edge] });
    setConnecting(null); setTarget('');
  };
  const save = async () => {
    if (!graph || busy) return; setBusy(true); setError('');
    const { name, description, trigger, concurrency, nodes, edges } = graph;
    try {
      const editing = selected && !selected.built_in;
      const value = await api(`workflows${editing ? `/${selected.id}` : ''}`, parseResearchWorkflow, json({ name: selected?.built_in && name === selected.name ? `${name} copy`.slice(0,80) : name, description, trigger, concurrency, nodes, edges, ...(editing ? { expected_revision: selected.revision } : {}) }), 30_000);
      setSelected(value); setGraph(value); setDirty(false); await load(); setNotice('Workflow saved. Assign a research question when you are ready.');
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not save workflow.'); } finally { setBusy(false); }
  };
  const launch = async () => {
    if (!pid || !selected || busy) return; setBusy(true); setError('');
    const storageKey = `workflow-request:${pid}:${selected.id}`;
    try {
      let pending: { key: string; body: unknown } | null = null;
      try { const stored = localStorage.getItem(storageKey); if (stored) pending = JSON.parse(stored); } catch { /* unavailable */ }
      if (!pending) {
        const chosen = items.filter(i => inputs.includes(i.id));
        const policy = perRun(await permissions(pid, chosen));
        pending = { key: crypto.randomUUID(), body: { expected_revision: selected.revision, request: runInput(prompt,chosen,policy,review ? 'review_plan' : 'autopilot'), enable_schedule: schedule && selected.trigger === 'daily' } };
        localStorage.setItem(storageKey, JSON.stringify(pending));
      }
      const started = await api(`projects/${pid}/workflows/${selected.id}/run`,parseWorkflowRun,{ ...json(pending.body), headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.key } },60000);
      localStorage.removeItem(storageKey); setActivity(current => ({ ...current,runs:[started,...current.runs.filter(r=>r.id!==started.id)] })); setRunOpen(false); setNotice('Workflow started. You can leave this page; your research group will keep working.');
    } catch(e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && ![408,429].includes(e.status)) localStorage.removeItem(storageKey);
      setError((e instanceof Error ? e.message : 'Could not start workflow.')+' Retry uses the same saved request if acceptance is uncertain.');
    } finally { setBusy(false); }
  };
  const node = graph?.nodes.find(n => n.id === nodeId);
  const latest = activity.runs.find(r => r.workflow_id === selected?.id);
  const width = Math.max(1200,...(graph?.nodes.map(n => (n.x ?? 0) + 320) ?? []));
  const height = Math.max(650,...(graph?.nodes.map(n => (n.y ?? 0) + 180) ?? []));
  return <div className="workflow-page stack">
    <div className="market-intro"><div><p className="page-eyebrow">Your research, connected</p><h2>From a question to a repeatable process.</h2><p>Connect specialists, research tools, and decisions. Start with a template or design your own.</p></div><button className="button button--primary" disabled={busy} onClick={() => open()}><Plus size={16} aria-hidden="true" />New workflow</button></div>
    {error && <Alert variant="error" role="alert">{error}</Alert>}{notice && <Alert variant="success" role="status">{notice}</Alert>}
    {!market && !error && <p role="status">Loading workflows…</p>}
    {!market && error && <button className="button button--secondary" onClick={() => void load().catch(e => setError(e.message))}>Retry</button>}
    {!graph && <><label className="market-search">Search workflows<input className="input" type="search" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="market-grid">{catalog.filter(w => `${w.name} ${w.description}`.toLowerCase().includes(search.toLowerCase())).map(w => <Panel key={w.id} className="market-card" title={<><GitBranch size={20} aria-hidden="true" />{w.name}</>} aside={<Badge state={w.built_in ? 'Template' : 'Custom'} />} description={w.description}><p className="field-hint">{w.nodes.length} steps · {w.trigger === 'daily' ? 'Daily trigger' : 'On request'}</p><button className="button button--secondary" onClick={() => open(w)}>Open workflow</button></Panel>)}</div></>}
    {graph && <>
      <section className="workflow-studio" aria-label="Workflow designer">
        <div className="workflow-toolbar"><div><input className="workflow-title input" aria-label="Workflow name" maxLength={80} value={graph.name} onChange={e => change({ ...graph,name:e.target.value })} /><span className="field-hint">{selected?.built_in ? 'Built-in template · editing saves a copy' : dirty ? 'Unsaved changes' : 'Saved'} · {graph.nodes.length} steps</span></div><div className="market-actions"><button className="button button--ghost" disabled={busy} onClick={() => { if (!dirty || window.confirm('Discard your unsaved workflow changes?')) { setGraph(null); setDirty(false); } }}>All workflows</button><button className="button button--secondary" disabled={busy || !dirty && !selected?.built_in} onClick={save}>{selected?.built_in ? <Copy size={15} /> : <Save size={15} />}{busy ? 'Saving…' : selected?.built_in ? 'Save a copy' : 'Save'}</button><button className="button button--primary" disabled={busy || dirty || !selected || !pid} onClick={() => setRunOpen(!runOpen)}><Play size={15} aria-hidden="true" />Run</button></div></div>
        <div className="workflow-layout"><div className="workflow-board">
          <div className="workflow-palette" role="group" aria-label="Add a step">{(['research','tool','branch','join','repeat','finish'] as const).map(kind => { const Icon = icons[kind]; return <button key={kind} className="button button--ghost button--sm" disabled={busy || graph.nodes.length >= 30} onClick={() => addNode(kind)}><Icon size={15} aria-hidden="true" />{names[kind]}</button>; })}</div>
          <div className="workflow-viewport" ref={viewport} aria-label="Research graph canvas" tabIndex={0}>
            <div className="workflow-space" style={{ width: width*zoom, height: height*zoom }}><div className="workflow-canvas" style={{ width,height,transform:`scale(${zoom})` }}>
              <svg className="workflow-edges" width={width} height={height} aria-label="Workflow connections">{graph.edges.map((e,i) => { const a=graph.nodes.find(n=>n.id===e.source),b=graph.nodes.find(n=>n.id===e.target); if (!a || !b) return null; const x=(a.x??0)+NODE_WIDTH,y=(a.y??0)+(e.port==='no'?86: e.port==='yes'?56:70),tx=b.x??0,ty=(b.y??0)+70; return <g key={`${e.source}:${e.target}:${e.port}`}><path d={`M${x},${y} C${x+80},${y} ${tx-80},${ty} ${tx},${ty}`} className={e.data_type==='signal'?'edge-signal':''} /><text x={(x+tx)/2} y={(y+ty)/2-8} textAnchor="middle">{e.port==='yes' || e.port==='no' ? `${e.port} · ` : ''}{e.data_type ?? 'artifacts'}</text><title>{a.name} → {b.name}: {e.data_type}</title></g>; })}</svg>
              {graph.nodes.map(n => { const Icon=icons[n.kind];const state=latest?.nodes[n.id]?.state;return <div className={`workflow-node${nodeId===n.id?' workflow-node--selected':''}`} key={n.id} style={{ left:n.x??0,top:n.y??0,width:NODE_WIDTH }} data-kind={n.kind}>
                {n.kind!=='trigger' && <button className={`node-port node-port--in${connecting?' node-port--ready':''}`} aria-label={`Connect to ${n.name}`} disabled={!connecting} onClick={() => connect(n.id)} />}
                <button className="node-drag" aria-label={`Move ${n.name}. Use arrow keys to reposition.`} onKeyDown={e => { const dx=e.key==='ArrowRight'?20:e.key==='ArrowLeft'?-20:0,dy=e.key==='ArrowDown'?20:e.key==='ArrowUp'?-20:0;if(dx||dy){ e.preventDefault(); change({ ...graph,nodes:graph.nodes.map(v=>v.id===n.id?{...v,x:Math.max(0,(v.x??0)+dx),y:Math.max(0,(v.y??0)+dy)}:v) }); } }} onPointerDown={e=>{ if(busy)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={ id:n.id,x:n.x??0,y:n.y??0,clientX:e.clientX,clientY:e.clientY };setNodeId(n.id); }} onPointerMove={e=>{ const d=drag.current;if(!d||d.id!==n.id)return;change({...graph,nodes:graph.nodes.map(v=>v.id===n.id?{...v,x:Math.min(10000,Math.max(0,d.x+(e.clientX-d.clientX)/zoom)),y:Math.min(10000,Math.max(0,d.y+(e.clientY-d.clientY)/zoom))}:v)}); }} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}><Grip size={14} aria-hidden="true" /><span>{names[n.kind]}</span></button>
                <button className="node-main" aria-pressed={nodeId===n.id} onClick={()=>setNodeId(n.id)}><span className="node-icon"><Icon size={20} aria-hidden="true" /></span><strong>{n.name}</strong><small>{state ?? (n.kind==='repeat'?`${n.iterations??2} rounds`:n.kind==='trigger'?(graph.trigger==='daily'?'Daily · UTC':'On request'):'Configure step')}</small></button>
                {n.kind!=='finish' && (n.kind==='branch'?(['yes','no'] as const):(['out'] as const)).map(port=><button key={port} className={`node-port node-port--out node-port--${port}`} aria-label={`Connect ${n.name} ${port} output`} title={`${port} output`} onClick={()=>{setConnecting({source:n.id,port});setEdgeType(n.kind==='trigger'?'signal':'artifacts');setNodeId(n.id);}} />)}
              </div>;})}
            </div></div>
          </div>
          <div className="workflow-canvas-foot"><span className="field-hint">Drag the grip to move · Click ports to connect · Scroll to explore</span><div className="market-actions"><button className="icon-button" aria-label="Zoom out" disabled={zoom<=.4} onClick={()=>setZoom(v=>Math.max(.4,v-.1))}><ZoomOut size={16}/></button><span>{Math.round(zoom*100)}%</span><button className="icon-button" aria-label="Zoom in" disabled={zoom>=1.4} onClick={()=>setZoom(v=>Math.min(1.4,v+.1))}><ZoomIn size={16}/></button><button className="button button--ghost button--sm" onClick={()=>{setZoom(Math.max(.4,Math.min(1,(viewport.current?.clientWidth??1000)/width)));viewport.current?.scrollTo(0,0);}}>Fit</button></div></div>
        </div>
        <aside className="workflow-inspector stack" aria-label="Step settings">
          {node ? <><div className="workflow-inspector-head"><span className="page-eyebrow">{names[node.kind]}</span>{node.kind!=='trigger' && <button className="icon-button" aria-label={`Delete ${node.name}`} onClick={()=>{change({...graph,nodes:graph.nodes.filter(n=>n.id!==node.id),edges:graph.edges.filter(e=>e.source!==node.id&&e.target!==node.id)});setNodeId('');}}><Trash2 size={15}/></button>}</div>
            <label>Step name<input className="input" maxLength={80} value={node.name} onChange={e=>updateNode({name:e.target.value})}/></label>
            {node.kind==='trigger' && <><label>Start workflow<WorkspacePicker compact label="Workflow trigger" value={graph.trigger??'manual'} options={[{value:'manual',label:'On request',detail:'Run when you assign a question'},{value:'daily',label:'Daily',detail:'Once per UTC day while enabled'}]} onChange={v=>change({...graph,trigger:v as Graph['trigger']})}/></label><p className="field-hint">Daily schedules use the saved question and selected inputs. Enable the schedule when starting a run.</p></>}
            {['research','tool','repeat'].includes(node.kind) && <><label>Assign to<WorkspacePicker compact label="Step assignment" value={selectionKey(node.assignment??stepDefaults.assignment)} options={[{value:'automatic',label:'Automatic lab group'},...(market?.agents.map(a=>({value:`agent:${a.id}`,label:a.name,detail:a.role,group:'Agents'}))??[]),...(market?.teams.map(t=>({value:`team:${t.id}`,label:t.name,group:'Teams'}))??[])]} onChange={v=>updateNode({assignment:fromKey(v,true)??stepDefaults.assignment})}/></label>{node.kind==='tool'?<label>Research tool<WorkspacePicker compact label="Research tool" value={node.tool_id??''} options={(market?.custom_tools??[]).map(t=>({value:t.id,label:t.name,detail:t.description}))} placeholder="Choose a tool" onChange={v=>updateNode({tool_id:v})}/><Link className="text-link" href="/tools">Create a reusable tool</Link></label>:<label>Research instructions<textarea className="textarea" rows={6} maxLength={2000} value={node.instructions??''} onChange={e=>updateNode({instructions:e.target.value})}/></label>}</>}
            {node.kind==='repeat' && <label>Rounds<WorkspacePicker compact label="Repeat rounds" value={String(node.iterations??2)} options={[1,2,3,4,5].map(n=>({value:String(n),label:`${n} ${n===1?'round':'rounds'}`}))} onChange={v=>updateNode({iterations:Number(v)})}/><span className="field-hint">Each round receives the previous round’s retained artifacts. Stops on failure.</span></label>}
            {node.kind==='branch' && <label>Continue on “yes” when<WorkspacePicker compact label="Branch condition" value={node.condition??'has_artifacts'} options={[{value:'has_artifacts',label:'Retained artifacts exist'},{value:'all_completed',label:'All connected steps succeeded'}]} onChange={v=>updateNode({condition:v as WorkflowNode['condition']})}/></label>}
            {node.kind==='join' && <p className="field-hint">Waits for every incoming path to finish. Merges artifacts from active paths; skipped branches do not block the join.</p>}
            {node.kind==='finish' && <p className="field-hint">Collects the retained results from connected research paths.</p>}
            {node.kind!=='finish' && <><h3>Connect a step</h3><WorkspacePicker compact label="Output port" value={connecting?.source===node.id?connecting.port:''} placeholder="Choose output" options={(node.kind==='branch'?['yes','no']:['out']).map(p=>({value:p,label:p==='out'?'Output':p==='yes'?'Yes branch':'No branch'}))} onChange={v=>{setConnecting({source:node.id,port:v as 'out'|'yes'|'no'});setEdgeType(node.kind==='trigger'?'signal':'artifacts');}}/>{connecting?.source===node.id && <><WorkspacePicker compact label="Connection type" value={edgeType} options={node.kind==='trigger'?[{value:'signal',label:'Signal · order only'}]:[{value:'artifacts',label:'Artifacts · carry research results'},{value:'signal',label:'Signal · order only'}]} onChange={v=>setEdgeType(v as 'signal'|'artifacts')}/><WorkspacePicker compact label="Connect to step" value={target} options={graph.nodes.filter(n=>n.id!==node.id&&n.kind!=='trigger').map(n=>({value:n.id,label:n.name}))} placeholder="Choose destination" onChange={setTarget}/><div className="market-actions"><button className="button button--secondary button--sm" disabled={!target} onClick={()=>connect(target)}>Connect</button><button className="button button--ghost button--sm" onClick={()=>setConnecting(null)}>Cancel</button></div></>}</>}
            <div className="workflow-connections">{graph.edges.map((e,i)=>e.source===node.id||e.target===node.id?<div key={i}><span>{graph.nodes.find(n=>n.id===e.source)?.name} → {graph.nodes.find(n=>n.id===e.target)?.name}<small>{e.port??'out'} · {e.data_type??'artifacts'}</small></span><button className="icon-button" aria-label={`Remove connection ${i+1}`} onClick={()=>change({...graph,edges:graph.edges.filter((_,index)=>index!==i)})}><X size={14}/></button></div>:null)}</div>
          </>:<p>Select a step to configure its task, agents, and connections.</p>}
        </aside></div>
      </section>
      <div className="workflow-settings"><label>Description<input className="input" value={graph.description??''} maxLength={500} onChange={e=>change({...graph,description:e.target.value})}/></label><label>Parallel research steps<WorkspacePicker compact label="Parallel research steps" value={String(graph.concurrency??2)} options={[1,2,3].map(n=>({value:String(n),label:String(n)}))} onChange={v=>change({...graph,concurrency:Number(v)})}/></label></div>
      {dirty && <p className="field-hint">Save to validate connections before running. Branches need both yes and no paths; use Repeat for bounded loops.</p>}
      {!pid && <p className="field-hint">Choose a project to run this workflow. You can design and save it now.</p>}
      {selected && !selected.built_in && <div><button className="button button--ghost button--sm" disabled={busy} onClick={()=>setArchiving(!archiving)}>Archive workflow</button>{archiving && <Alert variant="warning">Existing executions keep their saved graph. <button className="button button--secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await api(`workflows/${selected.id}/archive`,parseResearchWorkflow,json({expected_revision:selected.revision}),30000);setGraph(null);setDirty(false);setSelected(null);await load();}catch(e){setError(e instanceof Error?e.message:'Could not archive workflow.');}finally{setBusy(false);}}}>Confirm archive</button></Alert>}</div>}
      {runOpen && selected && <Panel title={`Run ${selected.name}`} description="The total research allowance is shared across the graph’s maximum number of research steps and repeat rounds."><div className="stack"><label>Research question<textarea className="textarea" rows={3} maxLength={1800} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="What should your research group investigate?"/></label>{inputError && <Alert variant="error">Inputs could not be loaded: {inputError}</Alert>}<fieldset className="market-fieldset"><legend>Project inputs</legend><div className="market-choice-grid">{items.map(i=><label className="market-check" key={i.id}><input type="checkbox" checked={inputs.includes(i.id)} onChange={()=>setInputs(v=>v.includes(i.id)?v.filter(id=>id!==i.id):[...v,i.id])}/>{i.label}</label>)}</div>{!items.length && <p className="field-hint">No files attached. <Link href="/ask" className="text-link">Attach research materials in Ask</Link>, or run a question without files.</p>}</fieldset><label className="market-check"><input type="checkbox" checked={review} onChange={e=>setReview(e.target.checked)}/>Review each research plan before execution</label>{selected.trigger==='daily' && <label className="market-check"><input type="checkbox" checked={schedule} onChange={e=>setSchedule(e.target.checked)}/>Repeat daily using this question and these inputs</label>}<div className="market-actions"><button className="button button--primary" disabled={busy||!prompt.trim()||!!inputError} onClick={launch}>{busy?'Starting…':'Start research'}</button><button className="button button--ghost" disabled={busy} onClick={()=>setRunOpen(false)}>Cancel</button></div></div></Panel>}
    </>}
    {pid && <section className="stack" aria-label="Workflow activity"><h2>Research activity</h2>{activityError && <Alert variant="error">Could not refresh activity: {activityError}</Alert>}{activity.scheduled_workflow_ids.map(id=><div className="workflow-schedule" key={id}><span>Daily · {catalog.find(w=>w.id===id)?.name??'Saved workflow'}</span><button className="button button--secondary button--sm" onClick={async()=>{try{setActivity(await api(`projects/${pid}/workflows/${id}/unschedule`,parseWorkflowActivity,{method:'POST'},30000));}catch(e){setError(e instanceof Error?e.message:'Could not stop schedule.');}}}>Stop schedule</button></div>)}{activity.runs.map(run=><Panel key={run.id} title={run.name} aside={<Badge state={run.state.replaceAll('_',' ')} />} description={new Date(run.created_at).toLocaleString()}>{run.error&&<Alert variant="error">{run.error}</Alert>}<div className="workflow-run-steps">{Object.entries(run.nodes).map(([id,state])=><div key={id}><strong>{catalog.find(w=>w.id===run.workflow_id)?.nodes.find(n=>n.id===id)?.name??'Saved step'}</strong><span>{state.state}</span>{state.run_ids.map((rid,index)=><Link key={rid} className="text-link" href={`/ask?project=${pid}&run=${rid}`}>Open {state.run_ids.length>1?`round ${index+1}`:'research'} ↗</Link>)}</div>)}</div>{['running','waiting'].includes(run.state)&&<button className="button button--ghost button--sm" onClick={async()=>{try{const stopped=await api(`projects/${pid}/workflow-runs/${run.id}/cancel`,parseWorkflowRun,{method:'POST'},30000);setActivity(v=>({...v,runs:v.runs.map(r=>r.id===stopped.id?stopped:r)}));}catch(e){setError(e instanceof Error?e.message:'Could not stop workflow.');}}}>Stop workflow</button>}</Panel>)}{!activity.runs.length&&!activityError&&<p className="field-hint">Workflow runs for this project will appear here.</p>}</section>}
  </div>;
}

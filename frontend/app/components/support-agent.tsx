'use client';

import { workspaceSession } from '../lib/demo-mode';
import Link from './workspace-link';
import { useEffect, useRef, useState } from 'react';
import { LifeBuoy, Send, X } from 'lucide-react';
import { api, json } from '../lib/api';
import { permissions, perRun } from '../lib/ask';
import { runInput, isTerminalRun } from '../lib/runs';
import { parseResearchRun, parseRunDetail } from '../lib/decode';
import type { ResearchRun, RunDetail } from '../lib/generated/http';
import { PendingProgress, RunProgress } from './run-progress';
import { helpTopics } from '../lib/product-help';
import { hasRetainedRequest, retainedPost } from '../lib/retained-request';

/** Mounted only by the authenticated Workbench shell, never the public layout. */
export function SupportAgent({projectId,view,preview=false}:{projectId:string;view:string;preview?:boolean}) {
  const dialog=useRef<HTMLDialogElement>(null), input=useRef<HTMLTextAreaElement>(null), launcher=useRef<HTMLButtonElement>(null), flight=useRef(false);
  const [open,setOpen]=useState(false),[question,setQuestion]=useState(''),[lookup,setLookup]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [runId,setRunId]=useState(''),[detail,setDetail]=useState<RunDetail|null>(null),[pending,setPending]=useState(false);
  const [accepted,setAccepted]=useState<ResearchRun|null>(null),[lastRead,setLastRead]=useState(''),[readError,setReadError]=useState('');
  const key=`support-request:${projectId}`;
  const active=!!runId&&(!detail||!isTerminalRun(detail.run));
  useEffect(()=>{setPending(hasRetainedRequest(key)); try{setRunId(workspaceSession.getItem(`support-run:${projectId}`)??'');}catch{}},[key,projectId]);
  useEffect(()=>{
    if(!open||!runId||!projectId)return;
    const c=new AbortController();let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{try{const value=await api(`projects/${projectId}/agent-runs/${runId}`,parseRunDetail,{signal:c.signal},30_000);if(c.signal.aborted)return;if(value.run.project_id!==projectId)throw new Error('Support response belongs to another project.');setDetail(value);setLastRead(new Date().toISOString());setReadError('');if(isTerminalRun(value.run))return;}catch(e){if(!c.signal.aborted)setReadError(e instanceof Error?e.message:'Could not refresh support.');}if(!c.signal.aborted)timer=setTimeout(poll,document.hidden?15000:1000);};
    void poll();return()=>{c.abort();clearTimeout(timer);};
  },[open,projectId,runId]);
  const ask=async()=>{
    if(flight.current||!projectId||(!question.trim()&&!pending))return;flight.current=true;setBusy(true);setError('');setLookup(question);
    try{
      const run=await retainedPost(key,`projects/${projectId}/agent-runs`,async()=>{
        const policy=perRun(await permissions(projectId,[]));
        return {...runInput(`Product support question (page: ${view}): ${question.trim()}`,[],policy,'autopilot'),agent_selection:{kind:'agent',id:'support-guide',exclusive:true}};
      },parseResearchRun);
      if(run.project_id!==projectId)throw new Error('Support response belongs to another project.');
      setDetail(null);setAccepted(run);setReadError('');setLastRead('');setRunId(run.id);workspaceSession.setItem(`support-run:${projectId}`,run.id);
    }catch(e){setError(e instanceof Error?e.message:'Support could not start. The guides below are still available.');}
    finally{flight.current=false;setBusy(false);setPending(hasRetainedRequest(key));}
  };
  const close=()=>{dialog.current?.close();setOpen(false);launcher.current?.focus();};
  return <>
    <button ref={launcher} type="button" className="support-launcher" aria-label="Open product support" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setOpen(true);dialog.current?.showModal();input.current?.focus();}}><LifeBuoy size={19} aria-hidden="true"/><span>Help</span></button>
    <dialog ref={dialog} className="support-dialog" aria-labelledby="support-title" onCancel={()=>setOpen(false)} onClose={()=>{setOpen(false);launcher.current?.focus();}}>
      <header className="support-header"><div><p className="page-eyebrow">Your workspace guide</p><h2 id="support-title">Product Support</h2></div><button type="button" className="icon-button" aria-label="Close product support" onClick={close}><X size={19}/></button></header>
      <div className="support-body stack">
        <p>Ask what a button does or how to use the product. The support agent cannot access your research files or run tools.</p>
        <form className="stack" onSubmit={event=>{event.preventDefault();if(projectId&&!preview)void ask();else setLookup(question);}}>
          <label>Your question<textarea ref={input} className="textarea" rows={3} maxLength={1800} value={question} disabled={busy||active||pending} onChange={e=>{setQuestion(e.target.value);setLookup(e.target.value);}} placeholder="What’s the difference between Join and Finish?"/></label>
          <button className="button button--primary" disabled={busy||active||(!question.trim()&&!pending)}><Send size={15} aria-hidden="true"/>{busy?'Starting…':active?'Support is working…':pending?'Retry previous question':projectId&&!preview?'Ask support agent':'Find guidance'}</button>
          {!projectId&&<p className="field-hint">Choose a project for AI answers. Product guides work here without one.</p>}
          {projectId&&<p className="field-hint">AI questions are retained in this project’s run history. No attachments are sent.</p>}
        </form>
        {open&&busy&&!active&&<PendingProgress label="Starting support" description="Preparing your question for the support agent."/>}
        {open&&(detail?.run??accepted)&&<RunProgress run={(detail?.run??accepted)!} detail={detail} error={readError} lastRead={lastRead} support/>}
        {active&&!detail&&!accepted&&<p role="status">{readError?'Could not restore support activity. Retrying automatically…':'Restoring your saved support request…'}</p>}
        {error&&<p role="alert" className="field-hint">{error}{pending?' Retry resends the exact saved question.':''}</p>}
        {lookup.trim()&&<section aria-label="Instant product guidance" className="support-answer"><p className="page-eyebrow">From the product guide</p><p>{helpTopics(lookup,view)[0]?.answer}</p><p className="field-hint">Suggested guidance. Ask the support agent if you need a tailored explanation.</p></section>}
        {detail&&<section aria-label="Support answer" className="support-answer"><p className="page-eyebrow">Support answer</p>{detail.answer?<p>{detail.answer}</p>:<p>{isTerminalRun(detail.run)?'This request ended without a direct answer. Open the conversation for its retained details.':'The agent is preparing an answer. Any questions or plan approvals appear in the conversation.'}</p>}<Link className="text-link" href={`/ask?project=${projectId}&run=${runId}`}>Open support conversation</Link></section>}
        {active&&detail&&<button className="button button--ghost" disabled={busy} onClick={async()=>{setBusy(true);try{const stopped=await api(`projects/${projectId}/agent-runs/${runId}/cancel`,parseResearchRun,json({expected_run_revision:detail.run.control_revision}),30_000);setDetail(v=>v?{...v,run:stopped}:v);}catch(e){setError(e instanceof Error?e.message:'Could not stop support.');}finally{setBusy(false);}}}>Stop support request</button>}
        <section className="stack" aria-label="Product guides"><h3>{lookup?'Related guidance':'Help with this page'}</h3>{helpTopics(lookup,view).map(topic=><details className="support-topic" key={topic.title}><summary>{topic.title}</summary><p>{topic.answer}</p><Link className="text-link" href={topic.href}>Read guide</Link></details>)}<Link className="text-link" href="/docs">All product guides</Link></section>
      </div>
    </dialog>
  </>;
}

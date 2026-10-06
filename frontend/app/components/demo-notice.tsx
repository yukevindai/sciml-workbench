'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, RotateCcw, BookOpen, X } from 'lucide-react';
import { DEMO_STORAGE_PREFIX } from '../lib/demo-mode';
import { helpTopics } from '../lib/product-help';
import { NAV } from '../lib/pipeline';

export function DemoNotice() {
  const dialog=useRef<HTMLDialogElement>(null), launcher=useRef<HTMLButtonElement>(null);
  const [query,setQuery]=useState('');
  const pathname=usePathname(), view=pathname.split('/')[2]??'ask';
  const close=()=>{dialog.current?.close();launcher.current?.focus();};
  const reset=async()=>{
    if(!window.confirm('Reset the demo? Your sample edits and simulated runs will be cleared.'))return;
    const {resetDemo}=await import('../lib/demo/transport');resetDemo();
    for(const kind of ['localStorage','sessionStorage'] as const) {
      try { const storage=window[kind];
        for(let i=storage.length-1;i>=0;i--) {const key=storage.key(i);if(key?.startsWith(DEMO_STORAGE_PREFIX))storage.removeItem(key);}
      } catch { /* Reset still works when browser storage is unavailable. */ }
    }
    window.location.assign('/demo');
  };
  return <section className="demo-notice" aria-label="Demo workspace">
    <div className="demo-notice-main"><div><p className="page-eyebrow">Interactive demo · no sign-in needed</p><p>Explore the real interface with sample data. Responses are scripted; no AI calls or uploads. Edits last until you refresh.</p></div>
      <div className="demo-actions"><button className="button button--ghost button--sm" onClick={()=>void reset()}><RotateCcw size={14} aria-hidden="true"/>Reset demo</button><Link href="/sign-in" className="button button--primary button--sm">Use your own research<ArrowUpRight size={14} aria-hidden="true"/></Link></div>
    </div>
    <details className="demo-explore"><summary>Explore sample results &amp; product guidance</summary><div className="demo-result-links">{NAV.filter(n=>!['ask','projects','workflows','stress-test','agent-market','tools'].includes(n.view)).map(n=><Link key={n.view} prefetch={false} href={`/demo/${n.view}?project=demo-project`}>{n.label}<ArrowUpRight size={13} aria-hidden="true"/></Link>)}<button ref={launcher} onClick={()=>dialog.current?.showModal()}><BookOpen size={14} aria-hidden="true"/>Demo guide</button></div><p className="field-hint">Try a suggested question, customize an agent, pan a workflow, or run a sample council. Schedules are illustrative and never execute. Product Support’s AI agent is available after sign-in; this guide searches built-in help only.</p></details>
    <dialog ref={dialog} className="support-dialog" aria-labelledby="demo-guide-title" onCancel={()=>launcher.current?.focus()}>
      <header className="support-header"><h2 id="demo-guide-title">Demo guide</h2><button className="icon-button" onClick={close} aria-label="Close demo guide"><X size={18}/></button></header>
      <div className="support-body stack"><label>Search product guidance<input autoFocus type="search" className="input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Try pan, agents, or stress test"/></label><p className="field-hint">Built-in guidance. No AI request is sent.</p>{helpTopics(query,view).map(topic=><details key={topic.title} className="support-topic"><summary>{topic.title}</summary><p>{topic.answer}</p><Link className="text-link" href={topic.href}>Read guide</Link></details>)}</div>
    </dialog>
  </section>;
}

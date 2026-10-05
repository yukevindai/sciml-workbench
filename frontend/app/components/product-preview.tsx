'use client';

import { useState } from 'react';
import { ArrowUpRight, GitBranch, MessageSquareText, ShieldCheck, Users, FileText, Check } from 'lucide-react';
import Link from 'next/link';

const VIEWS = [
  { id: 'ask', label: 'Ask a question', icon: MessageSquareText, description: 'Choose an agent or a small team, attach your evidence, and set the direction in plain language.' },
  { id: 'workflows', label: 'Design a workflow', icon: GitBranch, description: 'Start from a template or connect your own research steps. Pan, zoom, assign agents, and run the saved process.' },
  { id: 'stress-test', label: 'Challenge an idea', icon: ShieldCheck, description: 'Choose a curated specialist or council. Review the assumptions, uncertainty, and evidence behind each concern.' },
];

/** Responsive product illustrations. Never present sample findings as a real review. */
export function ProductPreview() {
  const [selected, setSelected] = useState(0);
  const view = VIEWS[selected];
  return <div className="product-preview">
    <div className="preview-tabs" role="tablist" aria-label="Explore the workspace">
      {VIEWS.map(({ id, label, icon: Icon }, index) => <button key={id} id={`preview-tab-${id}`} type="button"
        role="tab" aria-selected={selected === index} aria-controls="preview-panel" tabIndex={selected === index ? 0 : -1}
        onClick={() => setSelected(index)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % VIEWS.length
            : event.key === 'ArrowLeft' ? (index + VIEWS.length - 1) % VIEWS.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : undefined;
          if (next === undefined) return;
          event.preventDefault(); setSelected(next);
          document.getElementById(`preview-tab-${VIEWS[next].id}`)?.focus();
        }}><Icon size={17} aria-hidden="true" />{label}</button>)}
    </div>
    <div id="preview-panel" role="tabpanel" aria-labelledby={`preview-tab-${view.id}`} tabIndex={0}>
      <div className="preview-workspace">
        <aside className="preview-sidebar" aria-label="Illustrated workspace navigation"><strong>SciML Workbench</strong><span>Battery research</span>{[['ask','Ask'],['workflows','Workflows'],['stress-test','Stress tests'],['agent-market','Agent market'],['tools','Tools']].map(([id,label])=><span key={id} data-active={view.id===id}>{label}</span>)}</aside>
        <div className="preview-stage">
          <div className="preview-stage-heading"><span>YOUR PERSONAL AI LAB GROUP</span><span>Illustrative example</span></div>
          {view.id==='ask'?<div className="preview-question"><Users size={28} aria-hidden="true"/><h3>What are we investigating?</h3><p>Your question. Your evidence. Your research team.</p><div className="preview-prompt"><span>Challenge whether our cycling data supports a longer battery lifetime.</span><div><span><FileText size={14} aria-hidden="true"/> cycling-data.csv</span><span>Assign to · Battery team</span></div></div><div className="preview-team"><span>Principal Investigator</span><span>Researcher</span><span>Scientific Reviewer</span></div></div>:view.id==='workflows'?<div className="preview-graph"><h3>Evidence to insight</h3><p>A repeatable investigation, with a second perspective.</p><div className="preview-graph-flow"><div className="preview-step"><span>01 · TRIGGER</span><strong>Research question</strong></div><div className="preview-branches"><div className="preview-step"><span>02 · RESEARCH</span><strong>Investigate evidence</strong><small>Researcher</small></div><div className="preview-step"><span>03 · RESEARCH</span><strong>Challenge assumptions</strong><small>Scientific Reviewer</small></div></div><div className="preview-step"><span>04 · SYNTHESIS</span><strong>Bring findings together</strong><small>Principal Investigator</small></div></div><span className="preview-hint">Drag to pan · Connect steps · Assign your agents</span></div>:<div className="preview-council"><h3>Put your research to the test.</h3><p>Three perspectives. The same evidence. Independent reviews.</p><div className="preview-reviewers">{[['Methods','Are the controls sufficient?'],['Statistics','Does the holdout test generalization?'],['Evidence','Which claims have direct support?']].map(([name,question])=><div className="preview-step" key={name}><ShieldCheck size={20} aria-hidden="true"/><strong>{name}</strong><p>{question}</p><span>CURATED REVIEWER</span></div>)}</div><div className="preview-rubric"><Check size={16} aria-hidden="true"/>Evidence · Severity · Uncertainty · Resolving tests</div><small>Critical feedback to guide your next experiment.</small></div>}
        </div>
      </div>
      <div className="preview-caption"><p>{view.description}</p><Link href={`/${view.id}`} className="text-link">Open workspace <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
    </div>
    <p className="preview-note">Illustrative product preview. In-app support explains the controls whenever you need it.</p>
  </div>;
}

'use client';

import { useState } from 'react';
import { ArrowUpRight, GitBranch, MessageSquareText, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

const VIEWS = [
  { id: 'ask', label: 'Ask a question', icon: MessageSquareText, description: 'Choose an agent or a small team, attach your evidence, and set the direction in plain language.' },
  { id: 'workflows', label: 'Design a workflow', icon: GitBranch, description: 'Start from a template or connect your own research steps. Pan, zoom, assign agents, and run the saved process.' },
  { id: 'stress-test', label: 'Challenge an idea', icon: ShieldCheck, description: 'Choose a curated specialist or council. Review the assumptions, uncertainty, and evidence behind each concern.' },
];

/** Captures of the real workspace components with synthetic example data. */
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
      <div className="preview-image">
        {['dark', 'light'].map(theme => <picture key={theme} className={`preview-${theme}`}>
          <source media="(max-width: 600px)" srcSet={`/images/product-${view.id}-${theme}-mobile.jpg`} />
          <img src={`/images/product-${view.id}-${theme}-desktop.jpg`} width={1440} height={1050} loading="lazy"
            alt={view.id === 'ask' ? 'Actual Ask interface: project selector, lab-group sidebar, agent assignment and question composer.' : view.id === 'workflows' ? 'Actual workflow designer: Evidence to insight template, canvas, step inspector and workflow controls.' : 'Actual stress-test interface: specialist or independent council selection, claim, supporting evidence and review rubric.'} />
        </picture>)}
      </div>
      <div className="preview-caption"><p>{view.description}</p><Link href={`/${view.id}`} className="text-link">Open workspace <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
    </div>
    <p className="preview-note">Actual workspace screenshots with example data. Sign in to use the controls and in-app support.</p>
  </div>;
}

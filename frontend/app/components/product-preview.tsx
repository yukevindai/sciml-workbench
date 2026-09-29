'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ArrowUpRight, FileSearch, MessageSquareText, Microscope } from 'lucide-react';
import Link from 'next/link';

const VIEWS = [
  { id: 'ask', label: 'Ask a question', icon: MessageSquareText, image: 'workspace-ask', description: 'Start with a question in plain language. Attach your CSVs and PDFs, then let the assistant plan the work.' },
  { id: 'research', label: 'Guide the research', icon: Microscope, image: 'workspace-research', description: 'Define the objective, review the plan, and keep control over the files and steps your research team can use.' },
  { id: 'dataset-audit', label: 'Inspect the evidence', icon: FileSearch, image: 'workspace-audit', description: 'Open the detailed tools to inspect data quality and trace findings back to the original dataset.' },
];

/** Real application captures, using synthetic fixtures. No production data. */
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
        <Image className="preview-dark" src={`/images/${view.image}-dark.png`} width={1440} height={1000}
          alt={`SciML Workbench: ${view.label.toLowerCase()}, shown with sample research data`} sizes="(max-width: 768px) 94vw, 1120px" />
        <Image className="preview-light" src={`/images/${view.image}-light.png`} width={1440} height={1000}
          alt={`SciML Workbench: ${view.label.toLowerCase()}, shown with sample research data`} sizes="(max-width: 768px) 94vw, 1120px" />
      </div>
      <div className="preview-caption"><p>{view.description}</p><Link href={`/${view.id}`} className="text-link">Open workspace <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
    </div>
    <p className="preview-note">Actual workspace views with illustrative sample data.</p>
  </div>;
}

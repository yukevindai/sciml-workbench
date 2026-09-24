'use client';

import Link from 'next/link';
import { Database } from 'lucide-react';
import type { Workbench } from '../lib/context';
import { EmptyState, Panel } from '../components/ui';

export function ResearchView({ wb }: { wb: Workbench }) {
  return (
    <>
      <Panel title="Your research workspace" description="Manual research tools are available now. Automated requests and run controls are not yet available in this interface.">
        {wb.activeProject ? (
          <div className="stack">
            <div>
              <h3>{wb.activeProject.name}</h3>
              <p className="prose">{wb.activeProject.description || 'No research question recorded yet.'}</p>
            </div>
            {wb.selectedDataset ? (
              <div className="research-context">
                <span className="field-label">Selected dataset</span>
                <strong>{wb.selectedDataset.filename}</strong>
                <p>{wb.selectedDataset.rows} rows · {wb.selectedDataset.columns.length} columns</p>
                <p className="meta-id">Dataset ID: {wb.selectedDataset.id}</p>
                {wb.selectedDataset.schema_version === '2.0' && wb.selectedDataset.unresolved_fields.length > 0 && (
                  <p>Unresolved declarations: {wb.selectedDataset.unresolved_fields.join(', ')}. Inspect these before drawing conclusions.</p>
                )}
              </div>
            ) : (
              <EmptyState icon={Database} title="No dataset attached">
                Attach a CSV in Dataset audit to start inspecting this project.
              </EmptyState>
            )}
            <div className="research-actions">
              <Link className="button" href="/dataset-audit">{wb.selectedDataset ? 'Inspect dataset' : 'Attach a CSV'}</Link>
              <Link className="button button--secondary" href="/evidence">Inspect evidence</Link>
              <Link className="text-link" href="/projects">Manage projects</Link>
            </div>
          </div>
        ) : (
          <EmptyState icon={Database} title="Start with a project"
            action={<Link className="button" href="/projects">Create a project</Link>}>
            Keep your research question, datasets, sources, and results together. Create a project to begin.
          </EmptyState>
        )}
      </Panel>
      <Panel title="Inspect your research" description="Use the manual tools in the navigation to audit data, design partitions, compare baselines, and record outcomes.">
        <p className="prose">Job status describes execution. A successful job does not mean the data is clean, a model is scientifically valid, or a report has passed replay verification.</p>
      </Panel>
    </>
  );
}

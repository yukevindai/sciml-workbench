'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import type { Workbench } from '../lib/context';
import type { ResearchRun } from '../lib/generated/http';
import { chooseRun, loadRunHistory, rememberedRun, rememberRun } from '../lib/runs';
import { EmptyState, Panel } from '../components/ui';
import { ResearchRequest } from '../components/research-request';
import { ResearchRunPanel } from '../components/research-run';

export function ResearchView({ wb }: { wb: Workbench }) {
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [runId, setRunId] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [historyError, setHistoryError] = useState('');

  // History is the server's record, so a reload or another browser finds the same run.
  useEffect(() => {
    setRuns([]); setRunId(''); setTruncated(false); setHistoryError('');
    if (!wb.projectId || wb.preview) return;
    const controller = new AbortController();
    loadRunHistory(wb.projectId, controller.signal)
      .then(history => {
        if (controller.signal.aborted) return;
        setRuns(history.runs); setTruncated(history.truncated);
        setRunId(current => current || chooseRun(history.runs, rememberedRun(wb.projectId))?.id || '');
      })
      .catch(e => { if (!controller.signal.aborted) setHistoryError(e instanceof Error ? e.message : 'Could not load run history'); });
    return () => controller.abort();
  }, [wb.projectId, wb.preview]);

  const select = useCallback((id: string) => {
    setRunId(id);
    rememberRun(wb.projectId, id);
  }, [wb.projectId]);

  const changed = useCallback((run: ResearchRun) => {
    if (run.project_id !== wb.projectId) return;
    setRuns(current => [run, ...current.filter(value => value.id !== run.id)]
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)));
  }, [wb.projectId]);

  const accepted = useCallback((run: ResearchRun) => {
    changed(run);
    select(run.id);
  }, [changed, select]);

  if (!wb.activeProject) {
    return <Panel title="Your research workspace">
      <EmptyState icon={Database} title="Start with a project"
        action={<Link className="button" href="/projects">Create a project</Link>}>
        Keep your research question, datasets, sources, and results together. Create a project to begin.
      </EmptyState>
    </Panel>;
  }

  return (
    <>
      <Panel title="Your research workspace" description="Ask for research in one request, or use the manual tools in the navigation. Both record the same traceable results.">
        <div className="stack">
          <div>
            <h3>{wb.activeProject.name}</h3>
            <p className="prose">{wb.activeProject.description || 'No research question recorded yet.'}</p>
          </div>
          {!wb.selectedDataset && (
            <EmptyState icon={Database} title="No dataset attached">
              Attach a CSV below with your request, or in Dataset audit to inspect it manually.
            </EmptyState>
          )}
          {wb.selectedDataset && (
            <div className="research-context">
              <span className="field-label">Selected dataset</span>
              <strong>{wb.selectedDataset.filename}</strong>
              <p>{wb.selectedDataset.rows} rows · {wb.selectedDataset.columns.length} columns</p>
              <p className="meta-id">Dataset ID: {wb.selectedDataset.id}</p>
              {wb.selectedDataset.schema_version === '2.0' && wb.selectedDataset.unresolved_fields.length > 0 && (
                <p>Unresolved declarations: {wb.selectedDataset.unresolved_fields.join(', ')}. Inspect these before drawing conclusions.</p>
              )}
            </div>
          )}
          <div className="research-actions">
            <Link className="button button--secondary" href="/dataset-audit">{wb.selectedDataset ? 'Inspect dataset' : 'Attach a CSV manually'}</Link>
            <Link className="button button--secondary" href="/evidence">Inspect evidence</Link>
            <Link className="text-link" href="/projects">Manage projects</Link>
          </div>
          <p className="field-hint">Job status describes execution. A successful job does not mean the data is clean, a model is scientifically valid, or a report has passed replay verification.</p>
        </div>
      </Panel>
      <ResearchRequest key={wb.projectId} wb={wb} onRun={accepted} />
      <ResearchRunPanel wb={wb} runs={runs} runId={runId} truncated={truncated} historyError={historyError} onSelect={select} onChanged={changed} />
    </>
  );
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import type { Workbench } from '../lib/context';
import type { ResearchRun } from '../lib/generated/http';
import { chooseRun, loadRunHistory, rememberedRun, rememberRun } from '../lib/runs';
import { EmptyState, Panel } from '../components/ui';
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
      <Panel title="Research activity" description="Review agent investigations, answer questions, and inspect their retained results.">
        <h3>{wb.activeProject.name}</h3>
        {wb.selectedDataset ? <div className="research-context"><strong>{wb.selectedDataset.filename}</strong><p>{wb.selectedDataset.rows} rows · {wb.selectedDataset.columns.length} columns</p></div> : <h3>No dataset attached</h3>}
        <div className="market-actions"><Link className="button button--primary" href={`/ask?project=${wb.projectId}`}>Assign a new question</Link><Link className="button button--secondary" href="/workflows">Open workflows</Link></div>
      </Panel>
      <ResearchRunPanel wb={wb} runs={runs} runId={runId} truncated={truncated} historyError={historyError} onSelect={select} onChanged={changed} />
    </>
  );
}

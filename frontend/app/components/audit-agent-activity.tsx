'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Workbench } from '../lib/context';
import type { ResearchRun } from '../lib/generated/http';
import { api } from '../lib/api';
import { parseResearchRuns } from '../lib/decode';
import { auditHref } from '../lib/audit';
import { kinds } from '../lib/types';
import { Alert, Badge, Panel } from './ui';

export function AuditAgentActivity({ wb }: { wb: Workbench }) {
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!wb.projectId) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    api(`projects/${wb.projectId}/agent-runs?limit=50`, parseResearchRuns, { signal: controller.signal })
      .then(values => {
        if (controller.signal.aborted) return;
        if (values.some(run => run.project_id !== wb.projectId)) throw new Error('The server returned activity for another project.');
        setRuns(values);
      })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load agent activity'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [wb.projectId, revision]);
  const audits = kinds(wb.artifacts, 'audit');
  const relevant = runs.filter(run => run.inputs.artifact_ids.includes(wb.selectedDataset?.id ?? '')
    || run.result_artifact_ids.some(id => wb.audits.some(audit => audit.id === id)));
  return <Panel title="Agent activity for this dataset" description="Read-only snapshot of the first 50 project runs. Refresh to update; this is not a complete activity history or a live stream.">
    <div className="stack">
      {loading && <p>Loading agent activity…</p>}
      {error && <Alert variant="warning">Agent activity unavailable: {error}. Manual audit remains available.{runs.length ? ' Previously loaded activity remains visible.' : ''}</Alert>}
      {!loading && !error && !relevant.length && <p>No linked runs in this snapshot. This does not rule out other activity or prove who created an audit.</p>}
      {relevant.map(run => <div key={run.id}>
        <p>{run.objective}</p><Badge state={run.state} />
        <p className="field-hint">Run {run.id}. Run status does not establish scientific validity.</p>
        <ul>{run.result_artifact_ids.map(id => {
          const audit = audits.find(value => value.id === id);
          return audit ? <li key={id}><Link className="text-link" href={auditHref(wb.projectId, id)}>Open audit {id}</Link></li> : null;
        })}</ul>
      </div>)}
      <div><button className="button button--secondary" disabled={loading || !wb.projectId} onClick={() => setRevision(value => value + 1)}>Refresh agent activity</button></div>
    </div>
  </Panel>;
}

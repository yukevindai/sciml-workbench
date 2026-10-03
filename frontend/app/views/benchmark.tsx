'use client';

import { useState } from 'react';
import { Activity, ShieldCheck } from 'lucide-react';
import type { Workbench } from '../lib/context';
import { kinds, type BenchmarkArtifact, type BenchmarkPreview } from '../lib/types';
import { api } from '../lib/api';
import { parseArtifact } from '../lib/decode';
import { Alert, EmptyState, Panel } from '../components/ui';
import { StageGate } from '../components/workflow';
import { BenchmarkForm } from '../components/benchmark-form';
import { ProtocolCard, RunInspection } from '../components/benchmark-inspection';
import { ArtifactAgentActivity } from '../components/artifact-agent-activity';
import { DatasetSelect } from './shared';

export function BenchmarkView({ wb, requestedBenchmarkId }: { wb: Workbench; requestedBenchmarkId?: string }) {
  const [revealed, setRevealed] = useState<Record<string, BenchmarkArtifact>>({});
  const linked = wb.runs.find(run => run.id === requestedBenchmarkId);
  const dataset = wb.selectedDataset;
  const runs = wb.runs.filter(run => run.dataset_id === dataset?.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const protocols = kinds(wb.artifacts, 'evaluation_protocol').filter(protocol => protocol.dataset_id === dataset?.id);

  // Complete artifact detail is the only path to test output; the backend
  // commits the exposure record before returning it.
  const reveal = (run: BenchmarkPreview) => wb.act(async () => {
    const value = await api(`projects/${run.project_id}/artifacts/${run.id}`, parseArtifact);
    if (value.kind !== 'benchmark' || value.id !== run.id || value.project_id !== run.project_id) throw new Error('The server returned a different artifact.');
    setRevealed(current => ({ ...current, [value.id]: value }));
  });

  return <>
    {requestedBenchmarkId && !linked && <Alert variant="error" title="Requested benchmark unavailable">This project has no accessible benchmark with ID {requestedBenchmarkId}. No other result is substituted for that link.</Alert>}
    {linked && linked.dataset_id !== dataset?.id && <Alert title="The linked benchmark belongs to another dataset">
      <button className="button button--secondary" disabled={wb.busy || !wb.datasets.some(value => value.id === linked.dataset_id)} onClick={() => { wb.setDatasetId(linked.dataset_id); wb.setSplitId(linked.split_id); }}>Select the linked run&rsquo;s dataset</button>
    </Alert>}

    {protocols.length > 0 && <Panel title="Sealed comparisons" description="Predeclared candidates and criteria, frozen before any candidate ran. Current exposure status is read live; it does not reveal results.">
      <div className="stack stack--tight">{protocols.map(protocol => <ProtocolCard key={protocol.id} wb={wb} protocol={protocol} revision={Object.keys(revealed).length} />)}</div>
    </Panel>}

    {runs.length ? runs.map(run => <RunInspection key={run.id} wb={wb} run={run} focus={run.id === requestedBenchmarkId} revealed={revealed[run.id]} onReveal={reveal} />)
      : <Panel title="Benchmark results"><p>No benchmark result for this dataset. Queued or failed jobs without an artifact are listed under job activity.</p></Panel>}
    <ArtifactAgentActivity key={wb.projectId} wb={wb} kind="benchmark" />
  </>;
}

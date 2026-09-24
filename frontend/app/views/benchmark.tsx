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
    <StageGate stage={wb.workflow.stages.find(s => s.view === 'benchmark')} />
    <div className="split split--sticky">
      <Panel title="Configure a baseline" description="This is a task card: the declarations upstream admission checks before any model is fitted. An incomplete card is rejected rather than silently patched.">
        <fieldset className="intake-fields" disabled={wb.busy}><DatasetSelect wb={wb} /></fieldset>
        {dataset ? <BenchmarkForm key={wb.projectId + ':' + dataset.id} wb={wb} dataset={dataset} />
          : <EmptyState icon={Activity} title="No dataset selected">Upload a CSV, audit it and generate a partition first.</EmptyState>}
      </Panel>

      <Panel title="Evaluation protocol" description="ChemE Benchmarks owns admission, preprocessing, fitting and every metric. The workbench assembles the card and controls who sees test output.">
        <div className="stack stack--tight">
          <div className="finding">
            <span className="finding-mark" data-severity="info"><ShieldCheck size={14} aria-hidden="true" /></span>
            <div className="finding-body"><span className="finding-code">Admission before evaluation</span>
              <p className="finding-message">The dataset, declared units, independent groups and frozen split are validated before training starts.</p></div>
          </div>
          <div className="finding">
            <span className="finding-mark" data-severity="info"><Activity size={14} aria-hidden="true" /></span>
            <div className="finding-body"><span className="finding-code">Test output withheld by default</span>
              <p className="finding-message">Upstream computes validation and test scores together. Previews show validation only; revealing test scores is an explicit, recorded exposure of that holdout.</p></div>
          </div>
        </div>
        <Alert variant="warning" title="Errors block admission">A warning can be accepted only with a written scientific justification, stored with the run. Errors cannot be waived.</Alert>
        <p className="field-hint">Runs here are local task cards. They are not submissions to, or claims about, the public benchmark catalogue.</p>
      </Panel>
    </div>

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

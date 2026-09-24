'use client';

import { GitBranch } from 'lucide-react';
import type { Workbench } from '../lib/context';
import { kinds } from '../lib/types';
import { Alert, EmptyState, Panel } from '../components/ui';
import { StageGate } from '../components/workflow';
import { DatasetSelect, SplitSelect } from './shared';
import { SplitForm } from '../components/split-form';
import { SplitInspection } from '../components/split-inspection';
import { ArtifactAgentActivity } from '../components/artifact-agent-activity';

export function SplitView({ wb, requestedSplitId }: { wb: Workbench; requestedSplitId?: string }) {
  const linked = kinds(wb.artifacts, 'split').find(value => value.id === requestedSplitId);
  const split = linked && !wb.datasets.some(value => value.id === linked.dataset_id) ? linked : wb.selectedSplit;
  return <>
    <StageGate stage={wb.workflow.stages.find(s => s.view === 'split-designer')} />
    <Panel title="Define the holdout" description="Manual partition design remains available alongside agent results. Choose the design and independent unit that match your scientific question.">
      <fieldset className="intake-fields" disabled={wb.busy}><DatasetSelect wb={wb} /></fieldset>
      {wb.selectedDataset ? <SplitForm key={wb.projectId + ':' + wb.selectedDataset.id} wb={wb} dataset={wb.selectedDataset} />
        : <EmptyState icon={GitBranch} title="No dataset selected">Upload a CSV and complete its audit first.</EmptyState>}
    </Panel>
    {requestedSplitId && !linked && <Alert variant="error" title="Requested split unavailable">This project has no accessible split with ID {requestedSplitId}. No other result is substituted for that link.</Alert>}
    {linked && (linked.dataset_id !== wb.selectedDataset?.id || linked.id !== split?.id) && <Alert title="A different split is selected">
      <button className="button button--secondary" disabled={wb.busy || !wb.datasets.some(value => value.id === linked.dataset_id)} onClick={() => { wb.setDatasetId(linked.dataset_id); wb.setSplitId(linked.id); }}>Select the linked split and dataset</button>
    </Alert>}
    {wb.partitions.length > 0 && <Panel title="Choose a stored partition"><SplitSelect wb={wb} /></Panel>}
    {split ? <SplitInspection key={split.id} wb={wb} split={split} focus={split.id === requestedSplitId} />
      : <Panel title="Split results"><p>No split result for this dataset. Queued or failed jobs are not completed partitions.</p></Panel>}
    <ArtifactAgentActivity key={wb.projectId} wb={wb} kind="split" />
  </>;
}

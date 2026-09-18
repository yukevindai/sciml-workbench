'use client';

import type { Workbench } from '../lib/context';
import { shortId } from '../lib/format';
import { Field } from '../components/ui';

/** The dataset every downstream step is scoped to. */
export function DatasetSelect({ wb }: { wb: Workbench }) {
  return (
    <Field label="Dataset" hint="Audits, partitions and runs below all belong to this file.">
      {props => (
        <select
          className="select"
          value={wb.selectedDataset?.id ?? ''}
          onChange={event => wb.setDatasetId(event.target.value)}
          {...props}
        >
          <option value="" disabled>Select a dataset</option>
          {wb.datasets.map(dataset => (
            <option key={dataset.id} value={dataset.id}>
              {dataset.filename} · {dataset.rows} rows · {dataset.columns.length} columns
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** The frozen partition a benchmark is evaluated against. */
export function SplitSelect({ wb }: { wb: Workbench }) {
  return (
    <Field label="Frozen split" hint="Partitions are immutable once generated; a run always names the exact one it used.">
      {props => (
        <select
          className="select"
          value={wb.selectedSplit?.id ?? ''}
          onChange={event => wb.setSplitId(event.target.value)}
          {...props}
        >
          <option value="" disabled>Select a partition</option>
          {wb.partitions.map(split => (
            <option key={split.id} value={split.id}>
              {String(split.config?.strategy ?? 'partition')} · {shortId(split.id)}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

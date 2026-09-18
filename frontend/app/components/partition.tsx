'use client';

import { PARTITIONS, type Partition } from '../lib/types';
import { percent } from '../lib/format';

const MAX_CELLS = 400;

const DESCRIPTION: Record<Partition, string> = {
  train: 'Model is fitted on these rows',
  validation: 'Used to choose hyperparameters',
  test: 'Scored once, at the end',
  excluded: 'Held out of the partition entirely',
};

export function PartitionSummary({ assignments }: { assignments: Partition[] }) {
  const total = assignments.length;
  const counts = Object.fromEntries(
    PARTITIONS.map(p => [p, assignments.filter(a => a === p).length])
  ) as Record<Partition, number>;
  const present = PARTITIONS.filter(p => counts[p] > 0);
  const shown = assignments.slice(0, MAX_CELLS);

  return (
    <div className="stack stack--tight">
      {/* The bar carries counts as text; colour is a redundant second cue. */}
      <div className="partition-bar">
        {present.map(p => (
          <div key={p} className={p} style={{ flex: counts[p] }} title={`${p}: ${counts[p]} rows`}>
            <span className="partition-count">{counts[p]}</span>
          </div>
        ))}
      </div>

      <ul className="legend">
        {PARTITIONS.map(p => (
          <li className="legend-item" key={p}>
            <span className={`legend-swatch ${p}`} aria-hidden="true" />
            <span className="legend-text">
              <span className="legend-head">
                <span className="legend-name">{p}</span>
                <span className="legend-count">{counts[p]} rows</span>
                <span className="legend-pct">{percent(counts[p], total)}</span>
              </span>
              <span className="legend-desc">{DESCRIPTION[p]}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="panel-section">
        <span className="panel-section-title">Row assignments, in original CSV order</span>
        {/* Exactly one cell per row. */}
        <div className="row-grid">
          {shown.map((p, index) => (
            <span key={index} className={p} title={`Row ${index + 1}: ${p}`} />
          ))}
        </div>
        <p className="field-hint" style={{ marginTop: 'var(--space-5)' }}>
          {total > MAX_CELLS
            ? `Showing the first ${MAX_CELLS} of ${total} rows. The exported report contains every assignment.`
            : `All ${total} rows shown. The exported report contains every assignment.`}
        </p>
      </div>
    </div>
  );
}

'use client';

import { PARTITIONS, type Partition } from '../lib/types';
import { percent } from '../lib/format';
import { useState } from 'react';

const MAX_CELLS = 400;

const DESCRIPTION: Record<Partition, string> = {
  train: 'Model is fitted on these rows',
  validation: 'Used to choose hyperparameters',
  test: 'Held out for evaluation under the benchmark protocol',
  excluded: 'Excluded from fitting/evaluation; retained in the original dataset',
};

export function PartitionSummary({ assignments }: { assignments: Partition[] }) {
  const total = assignments.length;
  const counts = Object.fromEntries(
    PARTITIONS.map(p => [p, assignments.filter(a => a === p).length])
  ) as Record<Partition, number>;
  const present = PARTITIONS.filter(p => counts[p] > 0);
  const shown = assignments.slice(0, MAX_CELLS);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(total / 50));
  const current = Math.min(page, pages - 1);
  const start = current * 50;

  return (
    <div className="stack stack--tight">
      {/* The bar carries counts as text; colour is a redundant second cue. */}
      <div className="partition-bar" aria-hidden="true">
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

      <div className="table-scroll" tabIndex={0} role="region" aria-label="Partition counts">
        <table className="table">
          <caption>Exact assignment counts · denominator: all {total} stored assignments, including exclusions</caption>
          <thead><tr><th scope="col">Partition</th><th scope="col">Rows</th><th scope="col">Share of original rows</th></tr></thead>
          <tbody>{PARTITIONS.map(p => <tr key={p}><th scope="row">{p}</th><td>{counts[p]}</td><td>{total ? percent(counts[p], total) : 'Unavailable'}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="panel-section">
        <span className="panel-section-title">Row assignments, in original CSV order</span>
        {/* Exactly one cell per row. */}
        <div className="row-grid" aria-hidden="true">
          {shown.map((p, index) => (
            <span key={index} className={p} title={`Row position ${index} (zero-based): ${p}`} />
          ))}
        </div>
        <p className="field-hint" style={{ marginTop: 'var(--space-5)' }}>
          {total > MAX_CELLS
            ? `Visual preview: first ${MAX_CELLS} of ${total} rows. The table below provides every assignment.`
            : `Visual preview: all ${total} rows. The table below provides every assignment.`}
        </p>
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Complete row assignments">
        <table className="table">
          <caption>Full assignments · zero-based positions in the original CSV, not row-ID values</caption>
          <thead><tr><th scope="col">Row position</th><th scope="col">Partition</th></tr></thead>
          <tbody>{assignments.slice(start, start + 50).map((value, index) => <tr key={start + index}><th scope="row">{start + index}</th><td>{value}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="cluster">
        <button className="button button--secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous assignments</button>
        <p role="status">{total ? `Positions ${start}–${Math.min(start + 50, total) - 1} of ${total} rows` : 'No assignments reported'} · page {current + 1} of {pages}</p>
        <button className="button button--secondary" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next assignments</button>
      </div>
    </div>
  );
}

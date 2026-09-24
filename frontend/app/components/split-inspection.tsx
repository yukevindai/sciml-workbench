'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import type { Workbench } from '../lib/context';
import type { SplitArtifact } from '../lib/types';
import { auditHref } from '../lib/audit';
import { record, strings, splitDisplayIssues, splitHref, splitLineage } from '../lib/split';
import { auditFindings } from '../lib/result-projections';
import { formatDate } from '../lib/format';
import { Alert, JsonBox, Panel } from './ui';
import { FindingList } from './results';
import { PartitionSummary } from './partition';

function Diagnostics({ result }: { result: Record<string, unknown> }) {
  const diagnostic = record(result.diagnostics) ? result.diagnostics : null;
  const generalization = diagnostic && record(diagnostic.generalization) ? diagnostic.generalization : null;
  const evaluation = diagnostic && record(diagnostic.evaluation) ? diagnostic.evaluation : null;
  const overlaps = evaluation && record(evaluation.pairwise_overlap) ? evaluation.pairwise_overlap : null;
  const findings = auditFindings(result);
  return <div className="stack">
    <h3>Upstream diagnostics</h3>
    {!diagnostic && <Alert variant="warning">Diagnostics unavailable or unsupported. No independence or balance conclusion can be drawn.</Alert>}
    {diagnostic && <>
      {strings(diagnostic.warnings) ? <ul>{diagnostic.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : <p>Diagnostic warnings unavailable.</p>}
      {generalization ? <dl className="audit-config">{['supports', 'does_not_establish', 'conditional_on'].map(key => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{typeof generalization[key] === 'string' ? generalization[key] : 'Unavailable'}</dd></div>)}</dl>
        : <p>Generalization scope unavailable.</p>}
      <p>Checks not configured: {evaluation && strings(evaluation.checks_not_configured) ? evaluation.checks_not_configured.join(', ') || 'None reported' : 'Unavailable'}. Missing diagnostics are not zero overlap or proof of independence.</p>
      {overlaps ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Pairwise overlap diagnostics"><table className="table">
        <caption>Upstream overlap checks</caption><thead><tr><th scope="col">Partitions</th><th scope="col">Check</th><th scope="col">Count</th></tr></thead>
        <tbody>{Object.entries(overlaps).flatMap(([pair, value]) => {
          if (!record(value)) return <tr key={pair}><th scope="row">{pair}</th><td colSpan={2}>Unsupported diagnostic</td></tr>;
          const groups = record(value.groups) ? Object.entries(value.groups).map(([key, count]) => [`Group: ${key}`, count] as const) : [];
          return [['Exact duplicate pairs', value.exact_duplicate_pairs] as const, ...groups].map(([key, count]) => <tr key={`${pair}:${key}`}><th scope="row">{pair}</th><td>{key}</td><td>{typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : 'Unavailable'}</td></tr>);
        })}</tbody>
      </table></div> : <p>Pairwise overlap diagnostics unavailable.</p>}
      <JsonBox value={diagnostic} summary="Complete diagnostics, boundaries and distribution checks" />
    </>}
    <h3>Split findings</h3>
    {findings === null ? <Alert variant="warning">Findings unavailable or unsupported. Inspect the complete split artifact.</Alert>
      : findings.length ? <FindingList findings={findings} /> : <p>No findings reported for configured checks. This does not certify scientific validity.</p>}
  </div>;
}

export function SplitInspection({ wb, split, focus }: { wb: Workbench; split: SplitArtifact; focus: boolean }) {
  const lineage = splitLineage(split, wb.artifacts);
  const issues = splitDisplayIssues(split, lineage.dataset);
  const metadata = record(split.result.metadata) ? split.result.metadata : null;
  useEffect(() => {
    if (!focus) return;
    const panel = document.getElementById(`split-${split.id}`);
    panel?.scrollIntoView({ block: 'start' }); panel?.focus({ preventScroll: true });
  }, [split.id, focus]);
  const download = () => {
    const value = { project_id: split.project_id, split_id: split.id, dataset_id: split.dataset_id, audit_id: split.audit_id,
      row_reference: 'zero-based position in original CSV; not row-ID values', assignments: split.assignments };
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `split-${split.id}-assignments.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <Panel id={`split-${split.id}`} tabIndex={-1} className="audit-inspection" title="Frozen split inspection" description={`Split ${split.id} · ${formatDate(split.created_at)}`}>
    <div className="stack">
      <Alert title="Split execution completed · benchmark admission not established">Counts and diagnostics describe this stored split. They do not establish scientific validity or authorize test-metric exposure.</Alert>
      <div className="stack stack--tight">
      <h3>Exact input lineage</h3>
      <p>Dataset {split.dataset_id} · Audit {split.audit_id}</p>
      {lineage.valid ? <>
        <p>{lineage.dataset!.filename} · {lineage.dataset!.rows} original rows</p>
        <p className="mono">Original CSV SHA-256: {lineage.dataset!.sha256}</p>
        <div className="research-actions"><Link className="text-link" href={auditHref(split.project_id, split.audit_id)}>Inspect source audit {split.audit_id}</Link>
          <a className="text-link" href={`/api/projects/${split.project_id}/artifacts/${split.dataset_id}/download`}>Download original CSV</a></div>
      </> : <Alert variant="error" title="Split lineage unavailable or inconsistent">The declared dataset, audit and parents do not resolve together in this project. Another dataset’s audit cannot stand in for the recorded input.</Alert>}
      <Link className="text-link" href={splitHref(split.project_id, split.id)}>Direct split link</Link>
      </div>
      {issues.length > 0 && <Alert variant="warning" title="Stored split consistency could not be confirmed">{issues.join(' ')} Displayed counts below are computed from the stored assignments only; inspect the original artifact.</Alert>}
      <div className="stack stack--tight">
      <h3>Requested configuration</h3>
      <dl className="audit-config">{['strategy', 'columns', 'group_columns', 'target_column', 'seed', 'validation_size', 'test_size'].map(key => {
        const value = split.config[key];
        return <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{typeof value === 'string' || typeof value === 'number' ? String(value) : strings(value) ? value.join(', ') || 'None selected' : value === null ? 'None declared' : value === undefined ? 'Not supplied' : 'Unsupported — inspect JSON'}</dd></div>;
      })}</dl>
      <JsonBox value={split.config} summary="Complete requested split configuration" />
      {metadata && record(metadata.config) ? <JsonBox value={metadata.config} summary="Effective upstream split configuration" /> : <p>Effective configuration unavailable.</p>}
      <p>Requested shares may differ from actual counts, especially for whole-group or boundary-based designs.</p>
      </div>
      <PartitionSummary key={split.id} assignments={split.assignments} />
      <div><button className="button button--secondary" onClick={download}>Download all assignments (JSON)</button></div>
      {split.assignments.includes('excluded') && <Alert variant="warning" title="Excluded rows remain in the original dataset">No rows were removed from the upload. The current benchmark protocol rejects splits with excluded rows.</Alert>}
      <Diagnostics result={split.result} />
      <JsonBox value={split} summary="Inspect complete split artifact" />
    </div>
  </Panel>;
}

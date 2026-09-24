'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import type { Workbench } from '../lib/context';
import { auditDataset, auditHref } from '../lib/audit';
import { auditFindings } from '../lib/result-projections';
import { kinds } from '../lib/types';
import { formatDate } from '../lib/format';
import { Alert, JsonBox, Panel } from './ui';
import { FindingList, FindingSummary } from './results';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');

export function AuditInspection({ wb, requestedAuditId }: { wb: Workbench; requestedAuditId?: string }) {
  const linked = kinds(wb.artifacts, 'audit').find(audit => audit.id === requestedAuditId);
  const scoped = linked && !wb.datasets.some(dataset => dataset.id === linked.dataset_id) ? [linked, ...wb.audits] : wb.audits;
  const audits = [...scoped].sort((a, b) => a.id === requestedAuditId ? -1 : b.id === requestedAuditId ? 1 : b.created_at.localeCompare(a.created_at));
  useEffect(() => {
    if (!linked || linked.dataset_id !== wb.selectedDataset?.id) return;
    const panel = document.getElementById(`audit-${linked.id}`);
    panel?.scrollIntoView({ block: 'start' });
    panel?.focus({ preventScroll: true });
  }, [linked?.id, linked?.dataset_id, wb.selectedDataset?.id]);
  return <>
    {requestedAuditId && !linked && <Alert variant="error" title="Requested audit unavailable">This project has no accessible audit with ID {requestedAuditId}. No other audit is being substituted for that link.</Alert>}
    {linked && linked.dataset_id !== wb.selectedDataset?.id && <Alert title="Linked audit belongs to another dataset">
      <button className="button button--secondary" disabled={!wb.datasets.some(dataset => dataset.id === linked.dataset_id)} onClick={() => wb.setDatasetId(linked.dataset_id)}>Select the linked audit’s dataset</button>
    </Alert>}
    {!audits.length && <Panel title="Audit results"><p>No audit result for the selected dataset. A queued or failed job is not a completed audit; inspect job activity for its state.</p></Panel>}
    {audits.map(audit => {
      const dataset = auditDataset(audit, wb.datasets);
      const findings = auditFindings(audit.result);
      const metadata = object(audit.result.metadata) ? audit.result.metadata : undefined;
      const skipped = object(audit.result.checks_skipped) && Object.values(audit.result.checks_skipped).every(value => typeof value === 'string')
        ? audit.result.checks_skipped : undefined;
      return <Panel key={audit.id} id={`audit-${audit.id}`} tabIndex={-1} className="audit-inspection" title="Audit findings"
        description={`Audit ${audit.id} · ${formatDate(audit.created_at)}`} aside={findings && <FindingSummary findings={findings} />}>
        <div className="stack">
          <Alert title="Audit execution completed · scientific acceptance not assessed">
            Completion means the configured checks ran. It does not mean the data is clean or admitted for benchmarking.
          </Alert>
          {dataset ? <div className="stack stack--tight">
            <h3>Dataset lineage</h3>
            <p>{dataset.filename} · {dataset.rows} rows · dataset {dataset.id}</p>
            <p className="mono">Original CSV SHA-256: {dataset.sha256}</p>
            <div className="research-actions">
              <Link className="text-link" href={auditHref(wb.projectId, audit.id)}>Direct audit link</Link>
              <a className="text-link" href={`/api/projects/${wb.projectId}/artifacts/${dataset.id}/download`}>Download audited CSV</a>
            </div>
          </div> : <Alert variant="error" title="Dataset lineage unavailable">The audit does not resolve to its declared parent dataset in this project. Inspect the original artifact; do not infer its source from the current selection.</Alert>}
          <div>
            <h3>Requested configuration</h3>
            <dl className="audit-config">
              {['target_column', 'numeric_columns', 'feature_columns', 'provenance_columns'].map(key => {
                const value = audit.config[key];
                return <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{typeof value === 'string' ? value : strings(value) ? value.join(', ') || 'None selected' : value === null ? 'None declared' : value === undefined ? 'Not supplied' : 'Unsupported value — inspect configuration JSON'}</dd></div>;
              })}
            </dl>
            <JsonBox value={audit.config} summary="Complete requested configuration" />
            {metadata && object(metadata.config) ? <JsonBox value={metadata.config} summary="Effective upstream configuration (including defaults)" />
              : <p className="field-hint">Effective upstream configuration unavailable.</p>}
          </div>
          <div>
            <h3>Check coverage</h3>
            <p>Rows checked: {typeof audit.result.n_rows === 'number' && Number.isSafeInteger(audit.result.n_rows) && audit.result.n_rows >= 0 ? audit.result.n_rows : 'Unavailable'}</p>
            <p>Checks run: {strings(audit.result.checks_run) ? audit.result.checks_run.join(', ') || 'None reported' : 'Unavailable'}</p>
            {skipped ? <ul>{Object.entries(skipped).map(([check, reason]) => <li key={check}>{check}: {String(reason)}</li>)}{!Object.keys(skipped).length && <li>No skipped checks reported.</li>}</ul>
              : <p>Skipped-check reasons unavailable.</p>}
          </div>
          {findings === null ? <Alert variant="warning" title="Findings summary unavailable">The findings shape is unsupported. Inspect the complete artifact; no clean-data conclusion can be drawn.</Alert>
            : findings.length === 0 ? <Alert title="No findings for the checks you configured">Review checks run, skipped checks and configuration limits. Empty findings are not a certificate of scientific validity.</Alert>
              : <FindingList findings={findings} />}
          <JsonBox value={audit} summary="Inspect complete audit artifact" />
        </div>
      </Panel>;
    })}
  </>;
}

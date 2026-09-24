'use client';

import { AlertTriangle, CircleAlert, Info } from 'lucide-react';
import type { AuditFinding } from '../lib/types';

import { Badge, JsonBox } from './ui';

const SEVERITY_ICON = { error: CircleAlert, warning: AlertTriangle, info: Info };

function severityOf(finding: AuditFinding): 'error' | 'warning' | 'info' | 'unknown' {
  const value = (finding.severity ?? '').toLowerCase();
  if (value.startsWith('err') || value === 'critical') return 'error';
  if (value.startsWith('warn')) return 'warning';
  return value === 'info' ? 'info' : 'unknown';
}

export function FindingList({ findings }: { findings: AuditFinding[] }) {
  return (
    <ul>
      {findings.map((finding, index) => {
        const severity = severityOf(finding);
        const Icon = severity === 'unknown' ? Info : SEVERITY_ICON[severity];
        return (
          <li className="finding" key={`${finding.code}-${index}`}>
            <span className="finding-mark" data-severity={severity}>
              <Icon size={14} aria-hidden="true" />
              <span className="visually-hidden">{severity}</span>
            </span>
            <div className="finding-body">
              <span className="finding-code">{finding.code ?? 'Finding'}</span>
              {finding.message && <p className="finding-message">{finding.message}</p>}
              <p className="field-hint">Severity: {finding.severity || 'not supplied'}</p>
              {(finding.suggestion || finding.action || finding.recommendation) && (
                <p className="finding-action">{finding.suggestion || finding.action || finding.recommendation}</p>
              )}
              {finding.columns && <p>Columns: {finding.columns.join(', ') || 'None specified'}</p>}
              {finding.rows && <>
                <p>Row positions (zero-based): {finding.rows.slice(0, 20).join(', ') || 'None specified'}{finding.rows.length > 20 ? ` · first 20 of ${finding.rows.length}` : ''}</p>
                {finding.rows.length > 20 && <JsonBox value={finding.rows} summary="All affected row positions" />}
              </>}
              {finding.details && <JsonBox value={finding.details} summary="Finding details and examples" />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function FindingSummary({ findings }: { findings: AuditFinding[] }) {
  const counts = { error: 0, warning: 0, info: 0, unknown: 0 };
  findings.forEach(f => { counts[severityOf(f)] += 1; });
  return (
    <div className="cluster">
      {counts.error > 0 && <Badge state={`${counts.error} error${counts.error === 1 ? '' : 's'}`} tone="badge--danger" />}
      {counts.warning > 0 && <Badge state={`${counts.warning} warning${counts.warning === 1 ? '' : 's'}`} tone="badge--warning" />}
      {counts.info > 0 && <Badge state={`${counts.info} note${counts.info === 1 ? '' : 's'}`} tone="badge--info" />}
      {counts.unknown > 0 && <Badge state={`${counts.unknown} unknown severity`} />}
    </div>
  );
}

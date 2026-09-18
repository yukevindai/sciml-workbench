'use client';

import { AlertTriangle, CircleAlert, Info } from 'lucide-react';
import type { AuditFinding } from '../lib/types';
import { formatMetric, humanise } from '../lib/format';
import { Badge } from './ui';

const SEVERITY_ICON = { error: CircleAlert, warning: AlertTriangle, info: Info };

function severityOf(finding: AuditFinding): 'error' | 'warning' | 'info' {
  const value = (finding.severity ?? '').toLowerCase();
  if (value.startsWith('err') || value === 'critical') return 'error';
  if (value.startsWith('warn')) return 'warning';
  return 'info';
}

export function FindingList({ findings }: { findings: AuditFinding[] }) {
  return (
    <ul>
      {findings.map((finding, index) => {
        const severity = severityOf(finding);
        const Icon = SEVERITY_ICON[severity];
        return (
          <li className="finding" key={`${finding.code}-${index}`}>
            <span className="finding-mark" data-severity={severity}>
              <Icon size={14} aria-hidden="true" />
              <span className="visually-hidden">{severity}</span>
            </span>
            <div className="finding-body">
              <span className="finding-code">{finding.code ?? 'Finding'}</span>
              {finding.message && <p className="finding-message">{finding.message}</p>}
              {(finding.action || finding.recommendation) && (
                <p className="finding-action">{finding.action || finding.recommendation}</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function FindingSummary({ findings }: { findings: AuditFinding[] }) {
  const counts = { error: 0, warning: 0, info: 0 };
  findings.forEach(f => { counts[severityOf(f)] += 1; });
  return (
    <div className="cluster">
      {counts.error > 0 && <Badge state={`${counts.error} error${counts.error === 1 ? '' : 's'}`} tone="badge--danger" />}
      {counts.warning > 0 && <Badge state={`${counts.warning} warning${counts.warning === 1 ? '' : 's'}`} tone="badge--warning" />}
      {counts.info > 0 && <Badge state={`${counts.info} note${counts.info === 1 ? '' : 's'}`} tone="badge--info" />}
    </div>
  );
}

/** Held-out test scores. Validation numbers stay in the full artifact and the
 *  exported report; only the test split is promoted here. */
export function MetricGrid({ metrics }: { metrics: Record<string, unknown> }) {
  const numeric = Object.entries(metrics).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number'
  );
  if (!numeric.length) return null;

  return (
    <dl className="metrics">
      {numeric.map(([name, value]) => (
        <div className="metric" key={name}>
          <dt className="metric-name">{humanise(name)}</dt>
          <dd className="metric-value">{formatMetric(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

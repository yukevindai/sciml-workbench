import type { AuditFinding } from './types';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Upstream dictionaries stay opaque on the wire; only checked fields reach UI. */
export function auditFindings(result: Record<string, unknown>): AuditFinding[] | null {
  const fields = ['code', 'severity', 'message', 'action', 'recommendation', 'suggestion'] as const;
  if (!Array.isArray(result.findings)) return null;
  const findings: AuditFinding[] = [];
  for (const item of result.findings) {
    if (!record(item)) return null;
    const finding: AuditFinding = {};
    for (const key of fields) {
      const value = item[key];
      if (value !== undefined && typeof value !== 'string') return null;
      if (typeof value === 'string') finding[key] = value;
    }
    if (item.columns !== undefined) {
      if (!Array.isArray(item.columns) || !item.columns.every(value => typeof value === 'string')) return null;
      finding.columns = item.columns;
    }
    if (item.rows !== undefined) {
      if (!Array.isArray(item.rows) || !item.rows.every(value => Number.isSafeInteger(value) && value >= 0)) return null;
      finding.rows = item.rows;
    }
    if (item.details !== undefined) {
      if (!record(item.details)) return null;
      finding.details = item.details;
    }
    findings.push(finding);
  }
  return findings;
}

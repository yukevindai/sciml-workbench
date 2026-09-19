import type { AuditFinding } from './types';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Upstream dictionaries stay opaque on the wire; only checked fields reach UI. */
export function auditFindings(result: Record<string, unknown>): AuditFinding[] | null {
  const fields = ['code', 'severity', 'message', 'action', 'recommendation'] as const;
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
    findings.push(finding);
  }
  return findings;
}

export function metricPartition(result: Record<string, unknown>, partition: string): Record<string, unknown> | null {
  if (!record(result.metrics)) return null;
  const values = result.metrics[partition];
  return record(values) ? values : null;
}

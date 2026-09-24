import type { AuditArtifact, DatasetArtifact } from './types';
import { auditDefault } from './defaults';
import { isBundledDemo } from './intake';

export type AuditDraft = Record<string, unknown> & {
  numeric_columns: string[]; feature_columns: string[]; provenance_columns: string[];
  target_column: string | null;
};
export function initialAuditConfig(dataset: DatasetArtifact): AuditDraft {
  if (isBundledDemo(dataset.sha256)) return structuredClone(auditDefault);
  return { numeric_columns: [], feature_columns: [], provenance_columns: [], target_column: null };
}
const lists = ['numeric_columns', 'feature_columns', 'provenance_columns', 'group_columns', 'unavailable_features', 'identity_columns', 'conflict_columns', 'identifier_columns', 'density_columns', 'duplicate_columns'];

/** Validate UI-owned fields; advanced scientific options remain upstream-owned and are preserved. */
export function parseAuditConfig(value: unknown): AuditDraft {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Audit configuration must be a JSON object.');
  const config = value as Record<string, unknown>;
  for (const key of lists) {
    const item = config[key];
    if (item === undefined || (key === 'duplicate_columns' && item === null)) continue;
    if (!Array.isArray(item) || !item.every(column => typeof column === 'string' && column.trim()) || new Set(item).size !== item.length) {
      throw new Error(`${key} must be an array of distinct, nonblank column names.`);
    }
  }
  for (const key of ['target_column', 'split_column', 'smiles_column']) {
    if (config[key] !== undefined && config[key] !== null && (typeof config[key] !== 'string' || !config[key].trim())) {
      throw new Error(`${key} must be a column name or null.`);
    }
  }
  return { numeric_columns: [], feature_columns: [], provenance_columns: [], target_column: null, ...config } as AuditDraft;
}
export function auditConfigIssues(config: AuditDraft, columns: string[]): string[] {
  const requested = lists.flatMap(key => Array.isArray(config[key]) ? config[key] as string[] : []);
  for (const key of ['target_column', 'split_column', 'smiles_column']) if (typeof config[key] === 'string') requested.push(config[key]);
  for (const key of ['bounds', 'units', 'sparse_bins', 'near_duplicates', 'density_scales', 'provenance_patterns']) {
    const value = config[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) requested.push(...Object.keys(value));
  }
  const missing = [...new Set(requested.filter(column => !columns.includes(column)))];
  return [
    ...(missing.length ? [`Columns not in this dataset: ${missing.join(', ')}.`] : []),
    ...(config.target_column && config.feature_columns.includes(config.target_column) ? ['The target cannot also be a feature.'] : []),
  ];
}
export function auditHref(projectId: string, auditId: string) {
  return `/dataset-audit?project=${encodeURIComponent(projectId)}&audit=${encodeURIComponent(auditId)}#audit-${encodeURIComponent(auditId)}`;
}
export function auditDataset(audit: AuditArtifact, datasets: DatasetArtifact[]): DatasetArtifact | undefined {
  return datasets.find(dataset => dataset.id === audit.dataset_id && dataset.project_id === audit.project_id && audit.parents.includes(dataset.id));
}

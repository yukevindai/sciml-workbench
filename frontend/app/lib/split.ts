import { splitDefault } from './defaults';
import { isBundledDemo } from './intake';
import { auditDataset } from './audit';
import { kinds, PARTITIONS, type Artifact, type DatasetArtifact, type SplitArtifact } from './types';

export const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
export type SplitDraft = Record<string, unknown> & {
  strategy: string; columns: string[]; group_columns: string[]; target_column: string | null;
  validation_size: number; test_size: number; seed: number;
};
export function initialSplitConfig(dataset: DatasetArtifact): SplitDraft {
  return isBundledDemo(dataset.sha256) ? structuredClone(splitDefault)
    : { strategy: 'random', columns: [], group_columns: [], target_column: null, validation_size: 0.2, test_size: 0.2, seed: 42 };
}
export function parseSplitConfig(value: unknown): SplitDraft {
  if (!record(value)) throw new Error('Split configuration must be a JSON object.');
  const config: Record<string, unknown> = { columns: [], group_columns: [], target_column: null, validation_size: 0, test_size: 0.2, seed: 0, ...value };
  if (typeof config.strategy !== 'string' || !config.strategy.trim()) throw new Error('A split strategy is required.');
  for (const key of ['columns', 'group_columns'] as const) {
    if (!strings(config[key]) || config[key].some(column => !column.trim()) || new Set(config[key]).size !== config[key].length) throw new Error(`${key} must contain distinct column names.`);
  }
  for (const key of ['target_column', 'group_smiles_column']) {
    const column = config[key as keyof typeof config];
    if (column !== undefined && column !== null && (typeof column !== 'string' || !column.trim())) throw new Error(`${key} must be a column name or null.`);
  }
  if (typeof config.validation_size !== 'number' || !Number.isFinite(config.validation_size) || config.validation_size < 0 || config.validation_size >= 1
    || typeof config.test_size !== 'number' || !Number.isFinite(config.test_size) || config.test_size <= 0 || config.test_size >= 1
    || config.validation_size + config.test_size >= 1) throw new Error('Shares must leave training rows: validation ≥ 0, test > 0, and their sum < 1.');
  if (typeof config.seed !== 'number' || !Number.isSafeInteger(config.seed) || config.seed < 0) throw new Error('Random seed must be a nonnegative integer.');
  return config as SplitDraft;
}
export function splitConfigIssues(config: SplitDraft, columns: string[]): string[] {
  try { parseSplitConfig(config); } catch (error) { return [(error as Error).message]; }
  const refs: string[] = [...config.columns, ...config.group_columns];
  for (const key of ['target_column', 'group_smiles_column']) if (typeof config[key] === 'string') refs.push(config[key]);
  for (const key of ['cluster_scales', 'group_near_duplicates', 'extrapolation_bounds', 'validation_bounds']) if (record(config[key])) refs.push(...Object.keys(config[key]));
  const missing = [...new Set(refs.filter(column => !columns.includes(column)))];
  return missing.length ? [`Columns not in this dataset: ${missing.join(', ')}.`] : [];
}
export function splitHref(project: string, split: string) {
  return `/split-designer?project=${encodeURIComponent(project)}&split=${encodeURIComponent(split)}#split-${encodeURIComponent(split)}`;
}
export function splitLineage(split: SplitArtifact, artifacts: Artifact[]) {
  const dataset = kinds(artifacts, 'dataset').find(value => value.id === split.dataset_id && value.project_id === split.project_id);
  const audit = kinds(artifacts, 'audit').find(value => value.id === split.audit_id && value.project_id === split.project_id);
  const valid = Boolean(dataset && audit && auditDataset(audit, [dataset]) && split.parents.includes(dataset.id) && split.parents.includes(audit.id));
  return { dataset, audit, valid };
}
/** Presentation consistency only; the backend remains authoritative for exchange/admission. */
export function splitDisplayIssues(split: SplitArtifact, dataset?: DatasetArtifact): string[] {
  const issues: string[] = [];
  if (dataset && split.assignments.length !== dataset.rows) issues.push('Assignment count differs from the original dataset row count.');
  const diagnostics = record(split.result.diagnostics) ? split.result.diagnostics : {};
  for (const label of PARTITIONS) {
    const expected = split.assignments.flatMap((value, index) => value === label ? [index] : []);
    const positions = split.result[label];
    if (!Array.isArray(positions) || positions.length !== expected.length || new Set(positions).size !== expected.length || positions.some(value => !Number.isSafeInteger(value) || value < 0 || split.assignments[value] !== label)) {
      issues.push(`${label}: positional report unavailable or inconsistent with assignments.`);
    }
    if (diagnostics[`n_${label}`] !== expected.length) issues.push(`${label}: reported diagnostic count unavailable or inconsistent with assignments.`);
  }
  return issues;
}

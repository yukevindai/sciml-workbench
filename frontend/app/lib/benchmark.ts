import { benchmarkDefault } from './defaults';
import { isBundledDemo } from './intake';
import { record, strings } from './split';
import {
  DOMAINS, kinds, type Artifact, type BenchmarkArtifact, type BenchmarkConfig, type BenchmarkPreview,
  type DatasetArtifact, type IndependenceStatus,
} from './types';

/** Scalar metrics upstream may report. Order is display order only. */
export const SCALAR_METRICS = ['group_mae', 'group_rmse', 'mae', 'rmse', 'r2', 'rows', 'groups'] as const;
export const INDEPENDENCE_STATUSES: IndependenceStatus[] = ['documented', 'proxy', 'synthetic'];

/** Scientific declarations start empty for ordinary uploads; nothing is inferred. */
export type BenchmarkDraft = Omit<BenchmarkConfig, 'independence_status' | 'domain'> & {
  independence_status: IndependenceStatus | '';
  domain: BenchmarkConfig['domain'] | '';
};

const FIELDS: (keyof BenchmarkDraft)[] = [
  'target', 'numeric_features', 'categorical_features', 'row_id', 'group_columns', 'units', 'independence_unit',
  'independence_status', 'independence_rationale', 'generalization', 'limitations', 'domain', 'accepted_warnings', 'model', 'seed',
];

export function initialBenchmarkConfig(dataset: DatasetArtifact): BenchmarkDraft {
  return isBundledDemo(dataset.sha256) ? structuredClone(benchmarkDefault) : {
    target: '', numeric_features: [], categorical_features: [], row_id: '', group_columns: [], units: {},
    independence_unit: '', independence_status: '', independence_rationale: '', generalization: '',
    limitations: [], domain: '', accepted_warnings: {}, model: 'ridge', seed: 0,
  };
}

const stringMap = (value: unknown): value is Record<string, string> => record(value) && Object.values(value).every(item => typeof item === 'string');

/** Shape check for the advanced editor; scientific admission remains upstream. */
export function parseBenchmarkConfig(value: unknown): BenchmarkDraft {
  if (!record(value)) throw new Error('Task card declarations must be a JSON object.');
  const unknown = Object.keys(value).filter(key => !FIELDS.includes(key as keyof BenchmarkDraft));
  if (unknown.length) throw new Error(`Unsupported fields: ${unknown.join(', ')}. Dataset and split are chosen above.`);
  const missing = FIELDS.filter(key => !(key in value));
  if (missing.length) throw new Error(`Missing fields: ${missing.join(', ')}.`);
  for (const key of ['target', 'row_id', 'independence_unit', 'independence_rationale', 'generalization'] as const) {
    if (typeof value[key] !== 'string') throw new Error(`${key} must be a string.`);
  }
  for (const key of ['numeric_features', 'categorical_features', 'group_columns', 'limitations'] as const) {
    if (!strings(value[key])) throw new Error(`${key} must be a list of strings.`);
  }
  for (const key of ['units', 'accepted_warnings'] as const) {
    if (!stringMap(value[key])) throw new Error(`${key} must map names to strings.`);
  }
  if (!['', ...INDEPENDENCE_STATUSES].includes(value.independence_status as string)) throw new Error('independence_status must be documented, proxy or synthetic.');
  if (!['', ...DOMAINS].includes(value.domain as string)) throw new Error(`domain must be one of: ${DOMAINS.join(', ')}.`);
  if (value.model !== 'mean' && value.model !== 'ridge') throw new Error('model must be mean or ridge.');
  if (typeof value.seed !== 'number' || !Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed >= 2 ** 32) throw new Error('seed must be an integer from 0 to 4294967295.');
  return value as BenchmarkDraft;
}

/** Declaration completeness and column consistency. Upstream admission still decides. */
export function benchmarkConfigIssues(config: BenchmarkDraft, columns: string[]): string[] {
  try { parseBenchmarkConfig(config); } catch (error) { return [(error as Error).message]; }
  const issues: string[] = [];
  const features = [...config.numeric_features, ...config.categorical_features];
  if (!config.target) issues.push('Choose a target column.');
  if (config.target && features.includes(config.target)) issues.push(`Target ${config.target} cannot also be a feature.`);
  if (!config.numeric_features.length) issues.push('Choose at least one numeric feature.');
  if (new Set(features).size !== features.length) issues.push('A column cannot be both a numeric and a categorical feature, or appear twice.');
  if (!config.row_id) issues.push('Choose a row identifier.');
  if (!config.group_columns.length) issues.push('Choose at least one independent group column.');
  const referenced = [config.target, config.row_id, ...features, ...config.group_columns, ...Object.keys(config.units)].filter(Boolean);
  const absent = [...new Set(referenced.filter(column => !columns.includes(column)))];
  if (absent.length) issues.push(`Columns not in this dataset: ${absent.join(', ')}.`);
  if (!config.independence_unit.trim() || !config.independence_status || !config.independence_rationale.trim()) issues.push('Describe the independent unit, its status and why it is independent.');
  if (!config.generalization.trim()) issues.push('State what a good score would support.');
  if (!config.limitations.some(value => value.trim())) issues.push('Declare at least one limitation.');
  if (!config.domain) issues.push('Choose a scientific domain.');
  if (Object.entries(config.accepted_warnings).some(([code, reason]) => !code.trim() || !reason.trim())) issues.push('Every accepted warning needs a code and a written justification.');
  return issues;
}

/** Not blocking: upstream admission owns unit rules, and a rejected card is a recorded outcome. */
export function undeclaredUnits(config: BenchmarkDraft): string[] {
  return [config.target, ...config.numeric_features].filter(column => column && !config.units[column]?.trim());
}

export function benchmarkHref(project: string, benchmark: string) {
  return `/benchmark?project=${encodeURIComponent(project)}&benchmark=${encodeURIComponent(benchmark)}#benchmark-${encodeURIComponent(benchmark)}`;
}

export function benchmarkLineage(run: BenchmarkPreview, artifacts: Artifact[]) {
  const dataset = kinds(artifacts, 'dataset').find(value => value.id === run.dataset_id && value.project_id === run.project_id);
  const split = kinds(artifacts, 'split').find(value => value.id === run.split_id && value.project_id === run.project_id);
  const valid = Boolean(dataset && split && split.dataset_id === dataset.id && run.parents.includes(dataset.id) && run.parents.includes(split.id));
  return { dataset, split, valid };
}

/** Finite allowlisted scalars only. Absent values stay absent; nothing becomes zero. */
export function scalarMetrics(value: unknown): Partial<Record<(typeof SCALAR_METRICS)[number], number>> | null {
  if (!record(value)) return null;
  return Object.fromEntries(SCALAR_METRICS.flatMap(key => typeof value[key] === 'number' && Number.isFinite(value[key]) ? [[key, value[key]]] : []));
}

export type RevealedTest = {
  metrics: ReturnType<typeof scalarMetrics>;
  interval: [number, number] | null;
  intervalScope: string | null;
};

export function revealedTest(benchmark: BenchmarkArtifact): RevealedTest {
  const metrics = record(benchmark.result.metrics) ? benchmark.result.metrics : null;
  const test = metrics && record(metrics.test) ? metrics.test : null;
  const interval = test?.group_mae_interval95;
  return {
    metrics: scalarMetrics(test),
    interval: Array.isArray(interval) && interval.length === 2 && interval.every(item => typeof item === 'number' && Number.isFinite(item)) ? [interval[0], interval[1]] : null,
    intervalScope: typeof test?.interval_scope === 'string' ? test.interval_scope : null,
  };
}

export const HOLDOUT_EXPOSURE: Record<BenchmarkPreview['holdout_exposure'], string> = {
  unexposed: 'No recorded exposure for this exact dataset and partition assignment.',
  exposed: 'Test output for this exact dataset and partition assignment has already been read.',
  unknown: 'Prior exposure is unknown, for example from reads made before tracking existed.',
};

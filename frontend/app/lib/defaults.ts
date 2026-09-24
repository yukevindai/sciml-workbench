import type { AuditConfig, BenchmarkConfig, SourceMetadata, SplitConfig } from './types';

/** Starting values for the bundled `examples/demo.csv` fixture. They are only
 *  defaults: every one is editable in the form, and the payload the form sends
 *  is the same shape the API has always received. */

export const sourceDefault: SourceMetadata = {
  citation: 'Workbench synthetic demonstration',
  url: 'Not applicable: generated fixture',
  license: 'CC0-1.0',
  data_kind: 'synthetic',
  transformations: 'Deterministic toy fixture; no empirical claims.',
};

export const auditDefault: AuditConfig = {
  numeric_columns: ['temperature', 'response'],
  feature_columns: ['temperature'],
  target_column: 'response',
  provenance_columns: ['source_id', 'group_id'],
};

export const splitDefault: SplitConfig = {
  strategy: 'composition',
  columns: ['group_id'],
  group_columns: ['group_id'],
  target_column: 'response',
  validation_size: 0.2,
  test_size: 0.2,
  seed: 42,
};

export const benchmarkDefault: BenchmarkConfig = {
  target: 'response',
  numeric_features: ['temperature'],
  categorical_features: [],
  row_id: 'row_id',
  group_columns: ['group_id'],
  units: { temperature: 'kelvin', response: 'dimensionless' },
  independence_unit: 'Generated family',
  independence_status: 'synthetic',
  independence_rationale: 'Each family is held entirely within a partition.',
  generalization: 'Held-out generated families only.',
  limitations: ['Synthetic software fixture; not experimental evidence.'],
  domain: 'materials',
  accepted_warnings: {},
  model: 'ridge',
  seed: 0,
};

/** Known SciSplit strategy. Offered as a suggestion, not a closed list: the
 *  value is passed straight through to the upstream package. */
export const SPLIT_STRATEGIES = ['random', 'formulation', 'composition', 'publication', 'laboratory', 'cluster', 'time', 'temporal', 'extrapolation'];

export const COMMON_UNITS = [
  'dimensionless', 'kelvin', 'celsius', 'pascal', 'bar', 'mole_per_litre',
  'gram_per_litre', 'metre', 'second', 'volt', 'ampere', 'joule_per_mole',
  'percent', 'square_metre_per_gram',
];

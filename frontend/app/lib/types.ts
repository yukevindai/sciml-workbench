/** Shapes mirror the versioned envelopes in contracts/v1. Upstream result
 *  payloads stay opaque `Record<string, unknown>` and are never reshaped here. */

export type Project = { id: string; name: string; description: string };

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed';
export type Job = { id: string; kind: string; state: JobState | string; error?: string; result_id?: string };

export type Partition = 'train' | 'validation' | 'test' | 'excluded';
export const PARTITIONS: Partition[] = ['train', 'validation', 'test', 'excluded'];

export type ArtifactKind =
  | 'dataset' | 'audit' | 'split' | 'benchmark'
  | 'evidence' | 'failure' | 'provenance' | 'report';

type Envelope = {
  id: string;
  project_id?: string;
  created_at: string;
  parents?: string[];
  software?: Record<string, string>;
};

export type DatasetArtifact = Envelope & {
  kind: 'dataset';
  filename: string;
  rows: number;
  columns: string[];
  sha256?: string;
  source?: SourceMetadata;
};

export type AuditArtifact = Envelope & {
  kind: 'audit';
  dataset_id: string;
  config: Record<string, unknown>;
  result: { findings?: AuditFinding[] } & Record<string, unknown>;
};

export type AuditFinding = {
  code?: string;
  severity?: string;
  message?: string;
  action?: string;
  recommendation?: string;
};

export type SplitArtifact = Envelope & {
  kind: 'split';
  dataset_id: string;
  audit_id: string;
  config: Record<string, unknown>;
  assignments: Partition[];
  result: Record<string, unknown>;
};

export type BenchmarkArtifact = Envelope & {
  kind: 'benchmark';
  dataset_id: string;
  split_id: string;
  model: string;
  seed: number;
  status: 'succeeded' | 'failed' | string;
  error?: string | null;
  config: Record<string, unknown>;
  result: { metrics?: Record<string, Record<string, unknown>> } & Record<string, unknown>;
};

export type EvidenceArtifact = Envelope & {
  kind: 'evidence';
  title: string;
  result: { page_count?: number } & Record<string, unknown>;
};

export type FailureArtifact = Envelope & {
  kind: 'failure';
  benchmark_id: string;
  reason: string;
  record: Record<string, unknown>;
};

export type ProvenanceArtifact = Envelope & {
  kind: 'provenance';
  activity: string;
  inputs: string[];
  outputs: string[];
  parameters: Record<string, unknown>;
};

export type ReportArtifact = Envelope & { kind: 'report'; sha256?: string; artifact_ids?: string[] };

export type Artifact =
  | DatasetArtifact | AuditArtifact | SplitArtifact | BenchmarkArtifact
  | EvidenceArtifact | FailureArtifact | ProvenanceArtifact | ReportArtifact;

/** Narrowing helper: `kinds(artifacts, 'dataset')` returns DatasetArtifact[]. */
type ByKind = {
  dataset: DatasetArtifact; audit: AuditArtifact; split: SplitArtifact;
  benchmark: BenchmarkArtifact; evidence: EvidenceArtifact; failure: FailureArtifact;
  provenance: ProvenanceArtifact; report: ReportArtifact;
};
export function kinds<K extends ArtifactKind>(artifacts: Artifact[], kind: K): ByKind[K][] {
  return artifacts.filter((a): a is ByKind[K] => a.kind === kind);
}

/* ------------------------------ configuration ----------------------------- */

export type SourceMetadata = {
  citation: string;
  url: string;
  license: string;
  data_kind: 'empirical' | 'synthetic';
  transformations: string;
};

export type AuditConfig = {
  numeric_columns: string[];
  feature_columns: string[];
  target_column: string;
  provenance_columns: string[];
};

export type SplitConfig = {
  strategy: string;
  columns: string[];
  group_columns: string[];
  target_column: string;
  validation_size: number;
  test_size: number;
  seed: number;
};

export type IndependenceStatus = 'documented' | 'proxy' | 'synthetic';

export type BenchmarkConfig = {
  target: string;
  numeric_features: string[];
  categorical_features: string[];
  row_id: string;
  group_columns: string[];
  units: Record<string, string>;
  independence_unit: string;
  independence_status: IndependenceStatus;
  independence_rationale: string;
  generalization: string;
  limitations: string[];
  domain: string;
  accepted_warnings: Record<string, string>;
  model: 'mean' | 'ridge';
  seed: number;
};

export const DOMAINS = [
  'batteries', 'electrolytes', 'adsorption', 'catalysis', 'separations',
  'thermodynamics', 'transport', 'materials', 'process_optimization',
] as const;

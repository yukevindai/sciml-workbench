/** Wire types are generated. Form controls and display projections live below. */
import type * as Wire from './generated/http';
import type { BenchmarkInput } from './generated/contracts';

export type Project = Wire.ProjectResponse;
export type Job = Wire.LegacyJobResponse;
export type JobState = Job['state'];

export type Partition = 'train' | 'validation' | 'test' | 'excluded';
export const PARTITIONS: Partition[] = ['train', 'validation', 'test', 'excluded'];

export type Artifact = Wire.LegacyArtifact;
export type ArtifactKind = Artifact['kind'];
export type DatasetArtifact = Wire.Dataset;
export type AuditArtifact = Wire.Audit;
export type SplitArtifact = Wire.Split;
export type BenchmarkArtifact = Wire.Benchmark;
export type EvidenceArtifact = Wire.Evidence;
export type FailureArtifact = Wire.Failure;
export type ProvenanceArtifact = Wire.Provenance;
export type ReportArtifact = Wire.Report;

export type AuditFinding = {
  code?: string;
  severity?: string;
  message?: string;
  action?: string;
  recommendation?: string;
};

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

export type SourceMetadata = Wire.Source;

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

export type BenchmarkConfig = Required<Omit<BenchmarkInput, 'dataset_id' | 'split_id'>>;

export const DOMAINS = [
  'batteries', 'electrolytes', 'adsorption', 'catalysis', 'separations',
  'thermodynamics', 'transport', 'materials', 'process_optimization',
] as const;

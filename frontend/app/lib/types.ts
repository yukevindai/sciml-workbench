/** Wire types are generated. Form controls and display projections live below. */
import type * as Wire from './generated/http';
import type { BenchmarkInput } from './generated/contracts';

export type Project = Wire.ProjectResponse;
/** Scoped B09 job read: receipts, agent-run links and recovery decisions included. */
export type Job = Wire.JobDetail;
export type JobState = Job['state'];

export type Partition = 'train' | 'validation' | 'test' | 'excluded';
export const PARTITIONS: Partition[] = ['train', 'validation', 'test', 'excluded'];

/** Workspace listings withhold benchmark test output; complete artifacts are explicit reads. */
export type Artifact = Wire.IntakeArtifact | Wire.BenchmarkPreview;
export type ArtifactKind = Artifact['kind'];
export type DatasetArtifact = Wire.Dataset | Wire.DatasetV2;
export type AuditArtifact = Wire.Audit;
export type SplitArtifact = Wire.Split;
export type BenchmarkArtifact = Wire.Benchmark;
export type BenchmarkPreview = Wire.BenchmarkPreview;
export type EvaluationProtocolArtifact = Wire.EvaluationProtocol;
export type EvidenceArtifact = Wire.Evidence;
export type FailureArtifact = Wire.Failure | Wire.FailureV2;
export type ProvenanceArtifact = Wire.Provenance;
export type ReportArtifact = Wire.Report;
export type AgentExecutionArtifact = Wire.AgentExecutionRecord;

export type AuditFinding = {
  code?: string;
  severity?: string;
  message?: string;
  action?: string;
  recommendation?: string;
  suggestion?: string;
  columns?: string[];
  rows?: number[];
  details?: Record<string, unknown>;
};

/** Narrowing helper: `kinds(artifacts, 'dataset')` returns DatasetArtifact[]. */
type ByKind = {
  dataset: DatasetArtifact; audit: AuditArtifact; split: SplitArtifact;
  benchmark: BenchmarkArtifact; benchmark_preview: BenchmarkPreview; evidence: EvidenceArtifact; failure: FailureArtifact;
  provenance: ProvenanceArtifact; report: ReportArtifact;
  evaluation_protocol: Wire.EvaluationProtocol;
  claim_set: Wire.ClaimSet;
  agent_execution: Wire.AgentExecutionRecord;
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

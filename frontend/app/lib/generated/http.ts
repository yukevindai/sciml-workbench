/* Generated from Pydantic JSON schemas. Do not edit; run npm run contracts:generate. */

export type HttpResponse =
  ProjectResponse | ProjectsResponse | LegacyJobResponse | JobsResponse | LegacyArtifact | ArtifactsResponse;
export type Id = string;
export type Name = string;
export type Description = string;
export type ProjectsResponse = ProjectResponse[];
export type Id1 = string;
export type ProjectId = string;
export type Kind = 'audit' | 'split' | 'benchmark' | 'evidence' | 'failure' | 'report';
export type State = 'queued' | 'running' | 'succeeded' | 'failed';
export type ResultId = string | null;
export type Error = string | null;
export type CreatedAt = string;
export type StartedAt = string | null;
export type FinishedAt = string | null;
export type JobsResponse = LegacyJobResponse[];
export type LegacyArtifact = Dataset | Audit | Split | Benchmark | Evidence | Failure | Provenance | Report;
export type SchemaVersion = '1.0';
export type Id2 = string;
export type ProjectId1 = string;
export type CreatedAt1 = string;
export type Parents = string[];
export type Kind1 = 'dataset';
export type Filename = string;
export type BlobKey = string;
export type Sha256 = string;
export type Rows = number;
export type Columns = string[];
export type Citation = string;
export type Url = string;
export type License = string;
export type DataKind = 'empirical' | 'synthetic';
export type Transformations = string;
export type SchemaVersion1 = '1.0';
export type Id3 = string;
export type ProjectId2 = string;
export type CreatedAt2 = string;
export type Parents1 = string[];
export type Kind2 = 'audit';
export type DatasetId = string;
export type SchemaVersion2 = '1.0';
export type Id4 = string;
export type ProjectId3 = string;
export type CreatedAt3 = string;
export type Parents2 = string[];
export type Kind3 = 'split';
export type DatasetId1 = string;
export type AuditId = string;
export type Assignments = ('train' | 'validation' | 'test' | 'excluded')[];
export type SchemaVersion3 = '1.0';
export type Id5 = string;
export type ProjectId4 = string;
export type CreatedAt4 = string;
export type Parents3 = string[];
export type Kind4 = 'benchmark';
export type DatasetId2 = string;
export type SplitId = string;
export type Model = 'mean' | 'ridge';
export type Seed = number;
export type Status = 'succeeded' | 'failed';
export type Error1 = string | null;
export type BundleKey = string | null;
export type SchemaVersion4 = '1.0';
export type Id6 = string;
export type ProjectId5 = string;
export type CreatedAt5 = string;
export type Parents4 = string[];
export type Kind5 = 'evidence';
export type Title = string;
export type PdfKey = string;
export type Sha2561 = string;
export type BundleKey1 = string;
export type SchemaVersion5 = '1.0';
export type Id7 = string;
export type ProjectId6 = string;
export type CreatedAt6 = string;
export type Parents5 = string[];
export type Kind6 = 'failure';
export type BenchmarkId = string;
export type ExternalProjectId = string;
export type ExternalRecordId = string;
export type Reason = string;
export type SchemaVersion6 = '1.0';
export type Id8 = string;
export type ProjectId7 = string;
export type CreatedAt7 = string;
export type Parents6 = string[];
export type Kind7 = 'provenance';
export type Activity = string;
export type Inputs = string[];
export type Outputs = string[];
export type SchemaVersion7 = '1.0';
export type Id9 = string;
export type ProjectId8 = string;
export type CreatedAt8 = string;
export type Parents7 = string[];
export type Kind8 = 'report';
export type BlobKey1 = string;
export type Sha2562 = string;
export type ArtifactIds = string[];
export type ArtifactsResponse = (Dataset | Audit | Split | Benchmark | Evidence | Failure | Provenance | Report)[];

export interface ProjectResponse {
  id: Id;
  name: Name;
  description: Description;
}
export interface LegacyJobResponse {
  id: Id1;
  project_id: ProjectId;
  kind: Kind;
  state: State;
  result_id: ResultId;
  error: Error;
  created_at: CreatedAt;
  started_at: StartedAt;
  finished_at: FinishedAt;
}
export interface Dataset {
  schema_version: SchemaVersion;
  id: Id2;
  project_id: ProjectId1;
  created_at: CreatedAt1;
  parents: Parents;
  software: Software;
  kind: Kind1;
  filename: Filename;
  blob_key: BlobKey;
  sha256: Sha256;
  rows: Rows;
  columns: Columns;
  source: Source;
}
export interface Software {
  [k: string]: string;
}
export interface Source {
  citation: Citation;
  url: Url;
  license: License;
  data_kind: DataKind;
  transformations: Transformations;
}
export interface Audit {
  schema_version: SchemaVersion1;
  id: Id3;
  project_id: ProjectId2;
  created_at: CreatedAt2;
  parents: Parents1;
  software: Software1;
  kind: Kind2;
  dataset_id: DatasetId;
  config: Config;
  result: Result;
}
export interface Software1 {
  [k: string]: string;
}
export interface Config {
  [k: string]: unknown;
}
export interface Result {
  [k: string]: unknown;
}
export interface Split {
  schema_version: SchemaVersion2;
  id: Id4;
  project_id: ProjectId3;
  created_at: CreatedAt3;
  parents: Parents2;
  software: Software2;
  kind: Kind3;
  dataset_id: DatasetId1;
  audit_id: AuditId;
  config: Config1;
  assignments: Assignments;
  result: Result1;
}
export interface Software2 {
  [k: string]: string;
}
export interface Config1 {
  [k: string]: unknown;
}
export interface Result1 {
  [k: string]: unknown;
}
export interface Benchmark {
  schema_version: SchemaVersion3;
  id: Id5;
  project_id: ProjectId4;
  created_at: CreatedAt4;
  parents: Parents3;
  software: Software3;
  kind: Kind4;
  dataset_id: DatasetId2;
  split_id: SplitId;
  model: Model;
  seed: Seed;
  status: Status;
  result: Result2;
  error: Error1;
  bundle_key: BundleKey;
  config: Config2;
}
export interface Software3 {
  [k: string]: string;
}
export interface Result2 {
  [k: string]: unknown;
}
export interface Config2 {
  [k: string]: unknown;
}
export interface Evidence {
  schema_version: SchemaVersion4;
  id: Id6;
  project_id: ProjectId5;
  created_at: CreatedAt5;
  parents: Parents4;
  software: Software4;
  kind: Kind5;
  title: Title;
  pdf_key: PdfKey;
  sha256: Sha2561;
  result: Result3;
  bundle_key: BundleKey1;
}
export interface Software4 {
  [k: string]: string;
}
export interface Result3 {
  [k: string]: unknown;
}
export interface Failure {
  schema_version: SchemaVersion5;
  id: Id7;
  project_id: ProjectId6;
  created_at: CreatedAt6;
  parents: Parents5;
  software: Software5;
  kind: Kind6;
  benchmark_id: BenchmarkId;
  external_project_id: ExternalProjectId;
  external_record_id: ExternalRecordId;
  reason: Reason;
  record: Record;
}
export interface Software5 {
  [k: string]: string;
}
export interface Record {
  [k: string]: unknown;
}
export interface Provenance {
  schema_version: SchemaVersion6;
  id: Id8;
  project_id: ProjectId7;
  created_at: CreatedAt7;
  parents: Parents6;
  software: Software6;
  kind: Kind7;
  activity: Activity;
  inputs: Inputs;
  outputs: Outputs;
  parameters: Parameters;
}
export interface Software6 {
  [k: string]: string;
}
export interface Parameters {
  [k: string]: unknown;
}
export interface Report {
  schema_version: SchemaVersion7;
  id: Id9;
  project_id: ProjectId8;
  created_at: CreatedAt8;
  parents: Parents7;
  software: Software7;
  kind: Kind8;
  blob_key: BlobKey1;
  sha256: Sha2562;
  artifact_ids: ArtifactIds;
}
export interface Software7 {
  [k: string]: string;
}

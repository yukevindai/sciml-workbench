/* Generated from Pydantic JSON schemas. Do not edit; run npm run contracts:generate. */

export type HttpResponse =
  | ProjectResponse
  | ProjectsResponse
  | LegacyJobResponse
  | JobsResponse
  | LegacyArtifact
  | ArtifactsResponse
  | IntakeArtifact
  | MaterialResponse
  | Capabilities
  | JobDetail
  | JobPage
  | ArtifactPage;
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
export type SchemaVersion8 = '2.0';
export type Id10 = string;
export type ProjectId9 = string;
export type CreatedAt9 = string;
export type Parents8 = string[];
export type Kind9 = 'dataset';
export type Filename1 = string;
export type BlobKey2 = string;
export type Sha2563 = string;
export type Rows1 = number;
/**
 * @minItems 1
 * @maxItems 200
 */
export type Columns1 = string[];
export type Declaration_AnnotatedStr__StringConstraints__ =
  | UnknownDeclaration
  | UserDeclarationAnnotatedStrStringConstraints
  | SourceDeclarationAnnotatedStrStringConstraints
  | InferredDeclarationAnnotatedStrStringConstraints;
export type Origin = 'unknown';
export type Value = null;
export type Kind10 = 'user_message' | 'operator_assertion' | 'source_span' | 'artifact';
export type Id11 = string;
export type SupportingReferences = DeclarationReference[];
export type Uncertainty = string | null;
export type Origin1 = 'user_supplied';
export type Value1 = string;
/**
 * @minItems 1
 */
export type SupportingReferences1 = DeclarationReference[];
export type Uncertainty1 = string | null;
export type Origin2 = 'source_derived';
export type Value2 = string;
/**
 * @minItems 1
 */
export type SupportingReferences2 = DeclarationReference[];
export type Uncertainty2 = string | null;
export type Origin3 = 'inferred';
export type Value3 = string;
/**
 * @minItems 1
 */
export type SupportingReferences3 = DeclarationReference[];
export type Rationale = string;
export type Uncertainty3 = string;
export type Confidence = number | null;
export type Declaration_Literal_Empirical___Synthetic___ =
  | UnknownDeclaration
  | UserDeclarationLiteralEmpiricalSynthetic
  | SourceDeclarationLiteralEmpiricalSynthetic
  | InferredDeclarationLiteralEmpiricalSynthetic;
export type Origin4 = 'user_supplied';
export type Value4 = 'empirical' | 'synthetic';
/**
 * @minItems 1
 */
export type SupportingReferences4 = DeclarationReference[];
export type Uncertainty4 = string | null;
export type Origin5 = 'source_derived';
export type Value5 = 'empirical' | 'synthetic';
/**
 * @minItems 1
 */
export type SupportingReferences5 = DeclarationReference[];
export type Uncertainty5 = string | null;
export type Origin6 = 'inferred';
export type Value6 = 'empirical' | 'synthetic';
/**
 * @minItems 1
 */
export type SupportingReferences6 = DeclarationReference[];
export type Rationale1 = string;
export type Uncertainty6 = string;
export type Confidence1 = number | null;
export type DeclarationList_AnnotatedStr__StringConstraints___ =
  | UnknownDeclaration
  | UserDeclarationListAnnotatedStrStringConstraints
  | SourceDeclarationListAnnotatedStrStringConstraints
  | InferredDeclarationListAnnotatedStrStringConstraints;
export type Origin7 = 'user_supplied';
export type Value7 = string[];
/**
 * @minItems 1
 */
export type SupportingReferences7 = DeclarationReference[];
export type Uncertainty7 = string | null;
export type Origin8 = 'source_derived';
export type Value8 = string[];
/**
 * @minItems 1
 */
export type SupportingReferences8 = DeclarationReference[];
export type Uncertainty8 = string | null;
export type Origin9 = 'inferred';
export type Value9 = string[];
/**
 * @minItems 1
 */
export type SupportingReferences9 = DeclarationReference[];
export type Rationale2 = string;
export type Uncertainty9 = string;
export type Confidence2 = number | null;
export type Declaration_AnnotatedDict_AnnotatedStr__FieldInfoAnnotation_NoneType_Required_True_Metadata__MinLenMinLength_1____PydanticGeneralMetadataPattern____S_______AnnotatedStr__StringConstraints____FieldInfoAnnotation_NoneType_Required_True_Metadata__MinLenMinLength_1_____ =
  | UnknownDeclaration
  | UserDeclarationAnnotatedDictAnnotatedStrFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1_PydanticGeneralMetadataPatternSAnnotatedStrStringConstraintsFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1
  | SourceDeclarationAnnotatedDictAnnotatedStrFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1_PydanticGeneralMetadataPatternSAnnotatedStrStringConstraintsFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1
  | InferredDeclarationAnnotatedDictAnnotatedStrFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1_PydanticGeneralMetadataPatternSAnnotatedStrStringConstraintsFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1;
export type Origin10 = 'user_supplied';
/**
 * @minItems 1
 */
export type SupportingReferences10 = DeclarationReference[];
export type Uncertainty10 = string | null;
export type Origin11 = 'source_derived';
/**
 * @minItems 1
 */
export type SupportingReferences11 = DeclarationReference[];
export type Uncertainty11 = string | null;
export type Origin12 = 'inferred';
/**
 * @minItems 1
 */
export type SupportingReferences12 = DeclarationReference[];
export type Rationale3 = string;
export type Uncertainty12 = string;
export type Confidence3 = number | null;
export type Declaration_AnnotatedStr__FieldInfoAnnotation_NoneType_Required_True_Metadata__MinLenMinLength_1____PydanticGeneralMetadataPattern____S______ =
  | UnknownDeclaration
  | UserDeclarationAnnotatedStrFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1_PydanticGeneralMetadataPatternS
  | SourceDeclarationAnnotatedStrFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1_PydanticGeneralMetadataPatternS
  | InferredDeclarationAnnotatedStrFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1_PydanticGeneralMetadataPatternS;
export type Origin13 = 'user_supplied';
export type Value13 = string;
/**
 * @minItems 1
 */
export type SupportingReferences13 = DeclarationReference[];
export type Uncertainty13 = string | null;
export type Origin14 = 'source_derived';
export type Value14 = string;
/**
 * @minItems 1
 */
export type SupportingReferences14 = DeclarationReference[];
export type Uncertainty14 = string | null;
export type Origin15 = 'inferred';
export type Value15 = string;
/**
 * @minItems 1
 */
export type SupportingReferences15 = DeclarationReference[];
export type Rationale4 = string;
export type Uncertainty15 = string;
export type Confidence4 = number | null;
export type Declaration_IndependentUnit_ =
  | UnknownDeclaration
  | UserDeclarationIndependentUnit
  | SourceDeclarationIndependentUnit
  | InferredDeclarationIndependentUnit;
export type Origin16 = 'user_supplied';
export type Name1 = string;
/**
 * @minItems 1
 */
export type GroupColumns = string[];
export type Rationale5 = string;
/**
 * @minItems 1
 */
export type SupportingReferences16 = DeclarationReference[];
export type Uncertainty16 = string | null;
export type Origin17 = 'source_derived';
/**
 * @minItems 1
 */
export type SupportingReferences17 = DeclarationReference[];
export type Uncertainty17 = string | null;
export type Origin18 = 'inferred';
/**
 * @minItems 1
 */
export type SupportingReferences18 = DeclarationReference[];
export type Rationale6 = string;
export type Uncertainty18 = string;
export type Confidence5 = number | null;
export type UnresolvedFields = (
  'citation' | 'url' | 'license' | 'data_kind' | 'transformations' | 'units' | 'target' | 'independent_unit'
)[];
export type ArtifactsResponse = (
  (Dataset | DatasetV2) | Audit | Split | Benchmark | Evidence | Failure | Provenance | Report
)[];
export type IntakeArtifact =
  (Dataset | DatasetV2) | Audit | Split | Benchmark | Evidence | Failure | Provenance | Report;
export type Id12 = string;
export type ProjectId10 = string;
export type Filename2 = string;
export type MediaType = 'text/csv' | 'application/pdf';
export type Sha2564 = string;
export type DatasetId3 = string | null;
export type SchemaVersion9 = '1.0';
/**
 * @maxItems 20
 */
export type Operations = string[];
/**
 * @maxItems 20
 */
export type BenchmarkModels = string[];
/**
 * @maxItems 20
 */
export type SplitStrategies = string[];
export type MaxUploadBytes = number;
export type MaxRows = number;
export type JobTimeoutSeconds = number;
export type MaxPageSize = 100;
export type MaxDetailBytes = 33554432;
export type AgentReadsAvailable = false;
export type EvaluationExposure = 'unavailable_pending_C12';
export type ValidationOnlyExecution = false;
export type Ocr = false;
export type FailureSearch = 'project_scoped_lexical';
/**
 * @maxItems 20
 */
export type Limitations = string[];
export type Id13 = string;
export type ProjectId11 = string;
export type Kind11 =
  'audit' | 'split' | 'benchmark' | 'evidence' | 'failure' | 'report' | 'report_verify' | 'scientific_replay';
export type State1 = 'queued' | 'running' | 'succeeded' | 'failed';
export type ResultId1 = string | null;
export type Error2 = string | null;
export type CreatedAt10 = string;
export type StartedAt1 = string | null;
export type FinishedAt1 = string | null;
export type ErrorCode =
  | (
      | 'UNAUTHORIZED'
      | 'ORIGIN_REJECTED'
      | 'PROJECT_NOT_FOUND'
      | 'ARTIFACT_NOT_FOUND'
      | 'JOB_NOT_FOUND'
      | 'IDEMPOTENCY_CONFLICT'
      | 'PROJECT_BUSY'
      | 'VALIDATION_FAILED'
      | 'LINEAGE_MISMATCH'
      | 'UPLOAD_TOO_LARGE'
      | 'STORAGE_UNAVAILABLE'
      | 'DEPENDENCY_UNAVAILABLE'
      | 'INTERNAL_ERROR'
      | 'ADMISSION_REJECTED'
      | 'JOB_TIMED_OUT'
      | 'WORKER_INTERRUPTED'
      | 'INTEGRITY_FAILED'
      | 'EXTERNAL_OUTCOME_UNKNOWN'
      | 'AGENT_UNAVAILABLE'
      | 'POLICY_DENIED'
      | 'DATA_EXPOSURE_DENIED'
      | 'RUN_REVISION_CHANGED'
      | 'QUESTION_STALE'
      | 'BUDGET_EXHAUSTED'
      | 'PROVIDER_UNAVAILABLE'
      | 'TOOL_SCHEMA_INVALID'
      | 'UNSUPPORTED_CAPABILITY'
      | 'REFERENCE_INVALID'
      | 'TEST_PROTOCOL_SEALED'
      | 'RUN_CANCELLED'
    )
  | null;
export type RetryOfJobId = string | null;
export type DeadlineAt = string | null;
export type ExternalId = string;
export type Connector = 'sciml-workbench';
export type State2 = 'prepared' | 'unknown' | 'confirmed';
export type RequestSha256 = string;
export type BodySha256 = string;
export type Attempts = number;
export type SubmittedAt = string | null;
export type ExternalProjectId1 = string | null;
export type ExternalRecordId1 = string | null;
export type ArtifactId = string | null;
export type ReconciliationRequired = boolean;
/**
 * @maxItems 100
 */
export type Items = JobDetail[];
export type NextCursor = string | null;
export type Id14 = string;
export type ProjectId12 = string;
export type Kind12 = string;
export type SchemaVersion10 = string;
export type CreatedAt11 = string;
/**
 * @maxItems 100
 */
export type Items1 = ArtifactSummary[];
export type NextCursor1 = string | null;

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
export interface DatasetV2 {
  schema_version: SchemaVersion8;
  id: Id10;
  project_id: ProjectId9;
  created_at: CreatedAt9;
  parents: Parents8;
  software: Software8;
  kind: Kind9;
  filename: Filename1;
  blob_key: BlobKey2;
  sha256: Sha2563;
  rows: Rows1;
  columns: Columns1;
  source: SourceDeclarations;
  unresolved_fields: UnresolvedFields;
}
export interface Software8 {
  [k: string]: string;
}
export interface SourceDeclarations {
  citation: Declaration_AnnotatedStr__StringConstraints__;
  url: Declaration_AnnotatedStr__StringConstraints__;
  license: Declaration_AnnotatedStr__StringConstraints__;
  data_kind: Declaration_Literal_Empirical___Synthetic___;
  transformations: DeclarationList_AnnotatedStr__StringConstraints___;
  units: Declaration_AnnotatedDict_AnnotatedStr__FieldInfoAnnotation_NoneType_Required_True_Metadata__MinLenMinLength_1____PydanticGeneralMetadataPattern____S_______AnnotatedStr__StringConstraints____FieldInfoAnnotation_NoneType_Required_True_Metadata__MinLenMinLength_1_____;
  target: Declaration_AnnotatedStr__FieldInfoAnnotation_NoneType_Required_True_Metadata__MinLenMinLength_1____PydanticGeneralMetadataPattern____S______;
  independent_unit: Declaration_IndependentUnit_;
}
export interface UnknownDeclaration {
  origin: Origin;
  value: Value;
  supporting_references: SupportingReferences;
  uncertainty: Uncertainty;
}
export interface DeclarationReference {
  kind: Kind10;
  id: Id11;
}
export interface UserDeclarationAnnotatedStrStringConstraints {
  origin: Origin1;
  value: Value1;
  supporting_references: SupportingReferences1;
  uncertainty: Uncertainty1;
}
export interface SourceDeclarationAnnotatedStrStringConstraints {
  origin: Origin2;
  value: Value2;
  supporting_references: SupportingReferences2;
  uncertainty: Uncertainty2;
}
export interface InferredDeclarationAnnotatedStrStringConstraints {
  origin: Origin3;
  value: Value3;
  supporting_references: SupportingReferences3;
  rationale: Rationale;
  uncertainty: Uncertainty3;
  confidence: Confidence;
}
export interface UserDeclarationLiteralEmpiricalSynthetic {
  origin: Origin4;
  value: Value4;
  supporting_references: SupportingReferences4;
  uncertainty: Uncertainty4;
}
export interface SourceDeclarationLiteralEmpiricalSynthetic {
  origin: Origin5;
  value: Value5;
  supporting_references: SupportingReferences5;
  uncertainty: Uncertainty5;
}
export interface InferredDeclarationLiteralEmpiricalSynthetic {
  origin: Origin6;
  value: Value6;
  supporting_references: SupportingReferences6;
  rationale: Rationale1;
  uncertainty: Uncertainty6;
  confidence: Confidence1;
}
export interface UserDeclarationListAnnotatedStrStringConstraints {
  origin: Origin7;
  value: Value7;
  supporting_references: SupportingReferences7;
  uncertainty: Uncertainty7;
}
export interface SourceDeclarationListAnnotatedStrStringConstraints {
  origin: Origin8;
  value: Value8;
  supporting_references: SupportingReferences8;
  uncertainty: Uncertainty8;
}
export interface InferredDeclarationListAnnotatedStrStringConstraints {
  origin: Origin9;
  value: Value9;
  supporting_references: SupportingReferences9;
  rationale: Rationale2;
  uncertainty: Uncertainty9;
  confidence: Confidence2;
}
export interface UserDeclarationAnnotatedDictAnnotatedStrFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1_PydanticGeneralMetadataPatternSAnnotatedStrStringConstraintsFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1 {
  origin: Origin10;
  value: Value10;
  supporting_references: SupportingReferences10;
  uncertainty: Uncertainty10;
}
export interface Value10 {
  /**
   * This interface was referenced by `Value10`'s JSON-Schema definition
   * via the `patternProperty` "\S".
   */
  [k: string]: string;
}
export interface SourceDeclarationAnnotatedDictAnnotatedStrFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1_PydanticGeneralMetadataPatternSAnnotatedStrStringConstraintsFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1 {
  origin: Origin11;
  value: Value11;
  supporting_references: SupportingReferences11;
  uncertainty: Uncertainty11;
}
export interface Value11 {
  /**
   * This interface was referenced by `Value11`'s JSON-Schema definition
   * via the `patternProperty` "\S".
   */
  [k: string]: string;
}
export interface InferredDeclarationAnnotatedDictAnnotatedStrFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1_PydanticGeneralMetadataPatternSAnnotatedStrStringConstraintsFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1 {
  origin: Origin12;
  value: Value12;
  supporting_references: SupportingReferences12;
  rationale: Rationale3;
  uncertainty: Uncertainty12;
  confidence: Confidence3;
}
export interface Value12 {
  /**
   * This interface was referenced by `Value12`'s JSON-Schema definition
   * via the `patternProperty` "\S".
   */
  [k: string]: string;
}
export interface UserDeclarationAnnotatedStrFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1_PydanticGeneralMetadataPatternS {
  origin: Origin13;
  value: Value13;
  supporting_references: SupportingReferences13;
  uncertainty: Uncertainty13;
}
export interface SourceDeclarationAnnotatedStrFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1_PydanticGeneralMetadataPatternS {
  origin: Origin14;
  value: Value14;
  supporting_references: SupportingReferences14;
  uncertainty: Uncertainty14;
}
export interface InferredDeclarationAnnotatedStrFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1_PydanticGeneralMetadataPatternS {
  origin: Origin15;
  value: Value15;
  supporting_references: SupportingReferences15;
  rationale: Rationale4;
  uncertainty: Uncertainty15;
  confidence: Confidence4;
}
export interface UserDeclarationIndependentUnit {
  origin: Origin16;
  value: IndependentUnit;
  supporting_references: SupportingReferences16;
  uncertainty: Uncertainty16;
}
export interface IndependentUnit {
  name: Name1;
  group_columns: GroupColumns;
  rationale: Rationale5;
}
export interface SourceDeclarationIndependentUnit {
  origin: Origin17;
  value: IndependentUnit;
  supporting_references: SupportingReferences17;
  uncertainty: Uncertainty17;
}
export interface InferredDeclarationIndependentUnit {
  origin: Origin18;
  value: IndependentUnit;
  supporting_references: SupportingReferences18;
  rationale: Rationale6;
  uncertainty: Uncertainty18;
  confidence: Confidence5;
}
export interface MaterialResponse {
  id: Id12;
  project_id: ProjectId10;
  filename: Filename2;
  media_type: MediaType;
  sha256: Sha2564;
  dataset_id: DatasetId3;
}
export interface Capabilities {
  schema_version: SchemaVersion9;
  operations: Operations;
  benchmark_models: BenchmarkModels;
  split_strategies: SplitStrategies;
  artifact_read_versions: ArtifactReadVersions;
  artifact_write_versions: ArtifactWriteVersions;
  dependency_pins: DependencyPins;
  limits: CapabilityLimits;
  agent_reads_available: AgentReadsAvailable;
  evaluation_exposure: EvaluationExposure;
  validation_only_execution: ValidationOnlyExecution;
  ocr: Ocr;
  failure_search: FailureSearch;
  limitations: Limitations;
}
export interface ArtifactReadVersions {
  [k: string]: string[];
}
export interface ArtifactWriteVersions {
  [k: string]: string[];
}
export interface DependencyPins {
  [k: string]: string;
}
export interface CapabilityLimits {
  max_upload_bytes: MaxUploadBytes;
  max_rows: MaxRows;
  job_timeout_seconds: JobTimeoutSeconds;
  max_page_size: MaxPageSize;
  max_detail_bytes: MaxDetailBytes;
}
export interface JobDetail {
  id: Id13;
  project_id: ProjectId11;
  kind: Kind11;
  state: State1;
  result_id: ResultId1;
  error: Error2;
  created_at: CreatedAt10;
  started_at: StartedAt1;
  finished_at: FinishedAt1;
  error_code: ErrorCode;
  retry_of_job_id: RetryOfJobId;
  deadline_at: DeadlineAt;
  external_receipt: ExternalReceiptProjection | null;
}
export interface ExternalReceiptProjection {
  external_id: ExternalId;
  connector: Connector;
  state: State2;
  request_sha256: RequestSha256;
  body_sha256: BodySha256;
  attempts: Attempts;
  submitted_at: SubmittedAt;
  external_project_id: ExternalProjectId1;
  external_record_id: ExternalRecordId1;
  artifact_id: ArtifactId;
  reconciliation_required: ReconciliationRequired;
}
export interface JobPage {
  items: Items;
  next_cursor: NextCursor;
}
export interface ArtifactPage {
  items: Items1;
  next_cursor: NextCursor1;
}
export interface ArtifactSummary {
  id: Id14;
  project_id: ProjectId12;
  kind: Kind12;
  schema_version: SchemaVersion10;
  created_at: CreatedAt11;
}

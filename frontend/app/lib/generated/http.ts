/* Generated from Pydantic JSON schemas. Do not edit; run npm run contracts:generate. */

export type HttpResponse =
  | EvaluationStatusView
  | EvaluationView
  | ProjectResponse
  | ProjectsResponse
  | LegacyJobResponse
  | JobsResponse
  | LegacyArtifact
  | ArtifactsResponse
  | IntakeArtifact
  | ArtifactPreviews
  | MaterialResponse
  | Capabilities
  | JobDetail
  | JobPage
  | ArtifactPage
  | ResearchRun
  | ResearchRuns
  | RunDetail
  | RunResult
  | RunEvents;
export type ProtocolId = string;
export type State = 'sealed' | 'released';
export type Exploratory = boolean;
export type CleanHoldoutEligible = boolean;
export type ExposureStatus = 'unexposed' | 'exposed' | 'unknown';
export type ExposureEventIds = string[];
export type Limitation = string;
export type ArtifactId = string;
export type ProtocolId1 = string;
export type Status = 'succeeded' | 'failed';
export type Model = 'mean' | 'ridge';
export type Seed = number;
export type TestVisible = boolean;
export type Id = string;
export type Name = string;
export type Description = string;
export type ProjectsResponse = ProjectResponse[];
export type Id1 = string;
export type ProjectId = string;
export type Kind = 'audit' | 'split' | 'benchmark' | 'evidence' | 'failure' | 'report';
export type State1 = 'queued' | 'running' | 'succeeded' | 'failed';
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
export type Model1 = 'mean' | 'ridge';
export type Seed1 = number;
export type Status1 = 'succeeded' | 'failed';
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
export type SchemaVersion9 = '2.0';
export type Id12 = string;
export type ProjectId10 = string;
export type CreatedAt10 = string;
export type Parents9 = string[];
export type Kind11 = 'failure';
export type BenchmarkId1 = string;
export type SourceJobId = string;
export type Reason1 = string;
export type UncertaintyNotes = string;
export type Actor = HumanActor | AgentActor;
export type Kind12 = 'human';
export type OperatorSessionReference = string;
export type Kind13 = 'agent';
export type RunId = string;
export type AssignmentId = string | null;
export type ActionId = string;
export type Provider = string;
export type Model2 = string;
export type PromptVersion = string;
export type PolicyId = string;
export type Revision = number;
export type Sha2564 = string;
export type PolicyRuleId = string;
export type Observation = ExecutionFailure | CriterionFailure | ResearcherAssessment;
export type Kind14 = 'execution_failure';
export type ErrorCode = 'ADMISSION_REJECTED' | 'JOB_TIMED_OUT' | 'WORKER_INTERRUPTED' | 'INTEGRITY_FAILED';
export type ObservedError = string;
export type Kind15 = 'criterion_missed';
export type ProtocolId2 = string;
export type ProtocolRevision = number;
export type CriterionId = string;
export type ArtifactId1 = string;
export type FieldPath = string;
export type Partition = 'train' | 'validation' | 'test' | 'excluded';
export type Value16 = number;
export type Units = string | null;
export type SuccessComparison = 'lt' | 'lte' | 'gt' | 'gte';
export type Threshold = number;
export type Kind16 = 'researcher_assessment';
export type Statement = string;
export type CausalHypotheses = string[];
export type Connector = 'sciml-workbench';
export type ExternalId = string;
export type RequestSha256 = string;
export type State2 = 'confirmed';
export type ExternalProjectId1 = string;
export type ExternalRecordId1 = string;
export type JsonValue = unknown;
export type SchemaVersion10 = '1.0';
export type Id13 = string;
export type ProjectId11 = string;
export type CreatedAt11 = string;
export type Parents10 = string[];
export type Kind17 = 'evaluation_protocol';
export type Revision1 = number;
export type DatasetId3 = string;
export type DatasetSha256 = string;
export type SplitId1 = string;
export type SplitSha256 = string;
export type ConfigurationSha256 = string;
export type Target = string;
/**
 * @minItems 1
 */
export type Features = string[];
export type Preprocessing = string;
export type Id14 = string;
export type Model3 = 'mean' | 'ridge';
export type Seed2 = number;
export type ConfigurationSha2561 = string;
/**
 * @minItems 1
 */
export type Candidates = EvaluationCandidate[];
export type PrimaryMetric = string;
export type SelectionRule = 'validation' | 'predeclared_comparison';
export type Id15 = string;
export type Metric = string;
export type Partition1 = 'validation' | 'test';
export type Comparison = 'lt' | 'lte' | 'gt' | 'gte';
export type Threshold1 = number;
export type State3 = 'draft' | 'sealed' | 'released';
export type SealedAt = string | null;
export type ReleasedAt = string | null;
export type SelectedCandidateId = string | null;
export type ExposureStatus1 = 'unexposed' | 'exposed' | 'unknown';
export type ExposureEventIds1 = string[];
export type SchemaVersion11 = '1.0';
export type Id16 = string;
export type ProjectId12 = string;
export type CreatedAt12 = string;
export type Parents11 = string[];
export type Kind18 = 'claim_set';
export type RunId1 = string;
export type Revision2 = number;
export type Id17 = string;
export type Statement1 = string;
export type Classification = 'computed_result' | 'source_supported' | 'interpretation' | 'hypothesis';
export type Contract = 'evidence_reference';
export type SchemaVersion12 = '1.0';
export type Availability = 'available';
export type SourceArtifactId = string;
export type SourceSha256 = string;
export type RepresentationSha256 = string;
export type ExtractionVersion = string;
export type Kind19 = 'text_span';
export type Unit = 'unicode_codepoint';
export type Start = number;
export type End = number;
export type ExcerptSha256 = string;
export type Page = number | null;
export type SourceReferences = AvailableEvidenceReference[];
export type MetricReferences = MetricReference[];
export type Population = string;
export type SplitId2 = string | null;
export type Limitations = string[];
export type Uncertainty19 = string;
export type Status2 = 'not_checked' | 'valid' | 'invalid';
export type CheckedAt = string | null;
export type Issues = string[];
export type Status3 = 'supported' | 'partially_supported' | 'unsupported' | 'conflicting' | 'not_reviewed';
export type ReviewedSnapshotSha256 = string | null;
export type ReviewerAssignmentId = string | null;
export type Explanation = string | null;
/**
 * @minItems 1
 */
export type Claims = Claim[];
export type ArtifactsResponse = (
  | (Dataset | DatasetV2)
  | Audit
  | Split
  | Benchmark
  | Evidence
  | (Failure | FailureV2)
  | Provenance
  | Report
  | EvaluationProtocol
  | ClaimSet
)[];
export type IntakeArtifact =
  | (Dataset | DatasetV2)
  | Audit
  | Split
  | Benchmark
  | Evidence
  | (Failure | FailureV2)
  | Provenance
  | Report
  | EvaluationProtocol
  | ClaimSet;
export type Kind20 = 'benchmark_preview';
export type SchemaVersion13 = '1.0';
export type Id18 = string;
export type ProjectId13 = string;
export type CreatedAt13 = string;
export type Parents12 = string[];
export type DatasetId4 = string;
export type SplitId3 = string;
export type Model4 = 'mean' | 'ridge';
export type Seed3 = number;
export type Status4 = 'succeeded' | 'failed';
export type Error2 = string | null;
export type ProtocolIds = string[];
export type ValidationMetrics = {
  [k: string]: number;
} | null;
export type Name2 = string | null;
export type Seed4 = number | null;
export type Parameters1 = {
  [k: string]: JsonValue;
} | null;
export type ValidationSearch = ValidationSearchPreview[] | null;
export type ValidationPrimary = number;
export type TrainingDescription = string | null;
export type VerificationScope = string | null;
export type TestResults = 'withheld' | 'not_produced';
export type HoldoutExposure = 'unexposed' | 'exposed' | 'unknown';
export type BundleAvailable = boolean;
export type ArtifactPreviews = (
  | (Dataset | DatasetV2)
  | Audit
  | Split
  | BenchmarkPreview
  | Evidence
  | (Failure | FailureV2)
  | Provenance
  | Report
  | EvaluationProtocol
  | ClaimSet
)[];
export type Id19 = string;
export type ProjectId14 = string;
export type Filename2 = string;
export type MediaType = 'text/csv' | 'application/pdf';
export type Sha2565 = string;
export type DatasetId5 = string | null;
export type SchemaVersion14 = '1.1';
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
export type AgentReadsAvailable = true;
export type EvaluationExposure = 'tracked_with_quarantine';
export type ValidationOnlyExecution = false;
export type Ocr = false;
export type FailureSearch = 'project_scoped_lexical';
/**
 * @maxItems 20
 */
export type Limitations1 = string[];
export type Id20 = string;
export type ProjectId15 = string;
export type Kind21 =
  'audit' | 'split' | 'benchmark' | 'evidence' | 'failure' | 'report' | 'report_verify' | 'scientific_replay';
export type State4 = 'queued' | 'running' | 'succeeded' | 'failed';
export type ResultId1 = string | null;
export type Error3 = string | null;
export type CreatedAt14 = string;
export type StartedAt1 = string | null;
export type FinishedAt1 = string | null;
export type ErrorCode1 =
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
export type ExternalId1 = string;
export type Connector1 = 'sciml-workbench';
export type State5 = 'prepared' | 'unknown' | 'confirmed';
export type RequestSha2561 = string;
export type BodySha256 = string;
export type Attempts = number;
export type SubmittedAt = string | null;
export type ExternalProjectId2 = string | null;
export type ExternalRecordId2 = string | null;
export type ArtifactId2 = string | null;
export type ReconciliationRequired = boolean;
/**
 * @maxItems 100
 */
export type Items = JobDetail[];
export type NextCursor = string | null;
export type Id21 = string;
export type ProjectId16 = string;
export type Kind22 = string;
export type SchemaVersion15 = string;
export type CreatedAt15 = string;
/**
 * @maxItems 100
 */
export type Items1 = ArtifactSummary[];
export type NextCursor1 = string | null;
export type SchemaVersion16 = '1.0';
export type Id22 = string;
export type ProjectId17 = string;
export type CreatedAt16 = string;
export type Contract1 = 'research_run';
export type Objective = string;
export type MaterialIds = string[];
export type ArtifactIds1 = string[];
export type ConversationId = string | null;
export type MessageCutoff = number | null;
export type Mode = 'autopilot' | 'review_plan';
export type State6 =
  | 'queued'
  | 'running'
  | 'waiting_for_job'
  | 'waiting_for_input'
  | 'paused'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled';
export type ControlRevision = number;
export type PlanRevision = number;
export type ModelTokens = number;
export type ModelRequests = number;
export type ToolCalls = number;
export type CoordinatorIterations = number;
export type SpecialistAssignments = number;
export type SpecialistConcurrency = number;
export type DelegationDepth = number;
export type ReviewRounds = number;
export type ScientificAttempts = number;
export type ActiveSeconds = number;
export type TransientRetries = number;
export type FinalizationModelTokens = number;
export type FinalizationScientificAttempts = number;
export type ReservedTokens = number;
export type ModelRequests1 = number;
export type ToolCalls1 = number;
export type ScientificAttempts1 = number;
export type ActiveSeconds1 = number;
export type UnknownRequestIds = string[];
export type Cost = UnknownCost | EstimatedCost;
export type Status5 = 'unknown';
export type Reason2 = string;
export type Status6 = 'estimated';
export type Amount = number;
export type Currency = string;
export type PricingRevision = string;
export type OpenQuestionIds = string[];
export type ResultArtifactIds = string[];
export type ContinuedFromRunId = string | null;
export type FinishedAt2 = string | null;
export type StopReason = string | null;
export type ResearchRuns = ResearchRun[];
export type SchemaVersion17 = '1.0';
export type Id23 = string;
export type ProjectId18 = string;
export type CreatedAt17 = string;
export type Contract2 = 'research_plan';
export type RunId2 = string;
export type Revision3 = number;
export type Id24 = string;
export type Objective1 = string;
export type DependsOn = string[];
export type AllowedInputIds = string[];
export type ExpectedArtifactKinds = string[];
/**
 * @minItems 1
 */
export type CompletionCriteria = string[];
export type Status7 = 'pending' | 'ready' | 'running' | 'blocked' | 'completed' | 'failed' | 'skipped';
export type ActionIds = string[];
/**
 * @minItems 1
 * @maxItems 120
 */
export type Steps = ResearchStep[];
export type RationaleSummary = string;
export type SchemaVersion18 = '1.0';
export type Id25 = string;
export type ProjectId19 = string;
export type CreatedAt18 = string;
export type Contract3 = 'research_question';
export type RunId3 = string;
export type Revision4 = number;
export type RunRevision = number;
export type Id26 = string;
export type Field = string;
export type Prompt = string;
/**
 * @minItems 1
 */
export type BlockedStepIds = string[];
export type Id27 = string;
export type Label = string;
export type Consequence = string;
export type Options = QuestionOption[];
export type Contract4 = 'evidence_reference';
export type SchemaVersion19 = '1.0';
export type Availability1 = 'unavailable';
export type SourceArtifactId1 = string;
export type SourceSha2561 = string;
export type Reason3 = string;
export type Evidence1 = (AvailableEvidenceReference | UnavailableEvidenceReference)[];
/**
 * @minItems 1
 * @maxItems 20
 */
export type Questions1 = MaterialQuestion[];
export type Status8 = 'open' | 'answered' | 'superseded' | 'expired' | 'cancelled';
export type ExpiresAt = string | null;
export type AnswerMessageId = string | null;
export type Questions = ResearchQuestion[];
export type ControlEffect = string;
export type RunId4 = string;
export type State7 =
  | 'queued'
  | 'running'
  | 'waiting_for_job'
  | 'waiting_for_input'
  | 'paused'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled';
export type ArtifactIds2 = string[];
export type StopReason1 = string | null;
export type Contract5 = 'run_event';
export type SchemaVersion20 = '1.0';
export type RunId5 = string;
export type Sequence = number;
export type CreatedAt19 = string;
export type EventType =
  | 'accepted'
  | 'state_changed'
  | 'plan_changed'
  | 'action_changed'
  | 'question_changed'
  | 'usage_changed'
  | 'result_published';
export type RunRevision1 = number;
export type State8 =
  | 'queued'
  | 'running'
  | 'waiting_for_job'
  | 'waiting_for_input'
  | 'paused'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled';
export type ActionId1 = string | null;
export type QuestionId = string | null;
export type ArtifactIds3 = string[];
export type Summary = string | null;
export type RunEvents = RunEvent[];

export interface EvaluationStatusView {
  protocol_id: ProtocolId;
  state: State;
  exploratory: Exploratory;
  clean_holdout_eligible: CleanHoldoutEligible;
  exposure_status: ExposureStatus;
  exposure_event_ids: ExposureEventIds;
  limitation: Limitation;
}
export interface EvaluationView {
  artifact_id: ArtifactId;
  protocol_id: ProtocolId1;
  status: Status;
  model: Model;
  seed: Seed;
  metrics: Metrics;
  test_visible: TestVisible;
  evaluation: EvaluationStatusView;
}
export interface Metrics {
  [k: string]: {
    [k: string]: number;
  };
}
export interface ProjectResponse {
  id: Id;
  name: Name;
  description: Description;
}
export interface LegacyJobResponse {
  id: Id1;
  project_id: ProjectId;
  kind: Kind;
  state: State1;
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
  model: Model1;
  seed: Seed1;
  status: Status1;
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
export interface FailureV2 {
  schema_version: SchemaVersion9;
  id: Id12;
  project_id: ProjectId10;
  created_at: CreatedAt10;
  parents: Parents9;
  software: Software9;
  kind: Kind11;
  benchmark_id: BenchmarkId1;
  source_job_id: SourceJobId;
  reason: Reason1;
  uncertainty_notes: UncertaintyNotes;
  actor: Actor;
  observation: Observation;
  causal_hypotheses: CausalHypotheses;
  receipt: FailureReceipt;
}
export interface Software9 {
  [k: string]: string;
}
export interface HumanActor {
  kind: Kind12;
  operator_session_reference: OperatorSessionReference;
}
export interface AgentActor {
  kind: Kind13;
  run_id: RunId;
  assignment_id: AssignmentId;
  action_id: ActionId;
  provider: Provider;
  model: Model2;
  prompt_version: PromptVersion;
  policy: PolicyReference;
  policy_rule_id: PolicyRuleId;
}
export interface PolicyReference {
  policy_id: PolicyId;
  revision: Revision;
  sha256: Sha2564;
}
export interface ExecutionFailure {
  kind: Kind14;
  error_code: ErrorCode;
  observed_error: ObservedError;
}
export interface CriterionFailure {
  kind: Kind15;
  protocol_id: ProtocolId2;
  protocol_revision: ProtocolRevision;
  criterion_id: CriterionId;
  metric: MetricReference;
  success_comparison: SuccessComparison;
  threshold: Threshold;
}
export interface MetricReference {
  artifact_id: ArtifactId1;
  field_path: FieldPath;
  partition: Partition;
  value: Value16;
  units: Units;
}
export interface ResearcherAssessment {
  kind: Kind16;
  statement: Statement;
}
export interface FailureReceipt {
  connector: Connector;
  external_id: ExternalId;
  request_sha256: RequestSha256;
  state: State2;
  external_project_id: ExternalProjectId1;
  external_record_id: ExternalRecordId1;
  record: Record1;
}
export interface Record1 {
  [k: string]: JsonValue;
}
export interface EvaluationProtocol {
  schema_version: SchemaVersion10;
  id: Id13;
  project_id: ProjectId11;
  created_at: CreatedAt11;
  parents: Parents10;
  software: Software10;
  kind: Kind17;
  revision: Revision1;
  dataset_id: DatasetId3;
  dataset_sha256: DatasetSha256;
  split_id: SplitId1;
  split_sha256: SplitSha256;
  configuration_sha256: ConfigurationSha256;
  target: Target;
  features: Features;
  preprocessing: Preprocessing;
  independent_unit: IndependentUnit;
  candidates: Candidates;
  primary_metric: PrimaryMetric;
  selection_rule: SelectionRule;
  success_criterion: SuccessCriterion | null;
  state: State3;
  sealed_at: SealedAt;
  released_at: ReleasedAt;
  selected_candidate_id: SelectedCandidateId;
  exposure_status: ExposureStatus1;
  exposure_event_ids: ExposureEventIds1;
}
export interface Software10 {
  [k: string]: string;
}
export interface EvaluationCandidate {
  id: Id14;
  model: Model3;
  seed: Seed2;
  configuration_sha256: ConfigurationSha2561;
}
export interface SuccessCriterion {
  id: Id15;
  metric: Metric;
  partition: Partition1;
  comparison: Comparison;
  threshold: Threshold1;
  declaration_reference: DeclarationReference;
}
export interface ClaimSet {
  schema_version: SchemaVersion11;
  id: Id16;
  project_id: ProjectId12;
  created_at: CreatedAt12;
  parents: Parents11;
  software: Software11;
  kind: Kind18;
  run_id: RunId1;
  revision: Revision2;
  claims: Claims;
}
export interface Software11 {
  [k: string]: string;
}
export interface Claim {
  id: Id17;
  statement: Statement1;
  classification: Classification;
  source_references: SourceReferences;
  metric_references: MetricReferences;
  population: Population;
  split_id: SplitId2;
  limitations: Limitations;
  uncertainty: Uncertainty19;
  reference_check: ReferenceCheck;
  semantic_review: SemanticReview;
}
export interface AvailableEvidenceReference {
  contract: Contract;
  schema_version: SchemaVersion12;
  availability: Availability;
  source_artifact_id: SourceArtifactId;
  source_sha256: SourceSha256;
  representation_sha256: RepresentationSha256;
  extraction_version: ExtractionVersion;
  locator: TextSpan;
  excerpt_sha256: ExcerptSha256;
  page: Page;
}
export interface TextSpan {
  kind: Kind19;
  unit: Unit;
  start: Start;
  end: End;
}
export interface ReferenceCheck {
  status: Status2;
  checked_at: CheckedAt;
  issues: Issues;
}
export interface SemanticReview {
  status: Status3;
  reviewed_snapshot_sha256: ReviewedSnapshotSha256;
  reviewer_assignment_id: ReviewerAssignmentId;
  explanation: Explanation;
}
/**
 * Manual list projection of a benchmark. Test-partition output is withheld and
 * the projection itself records no holdout exposure; the complete artifact detail
 * remains the explicit, exposure-recording reveal path.
 */
export interface BenchmarkPreview {
  kind: Kind20;
  schema_version: SchemaVersion13;
  id: Id18;
  project_id: ProjectId13;
  created_at: CreatedAt13;
  parents: Parents12;
  software: Software12;
  dataset_id: DatasetId4;
  split_id: SplitId3;
  model: Model4;
  seed: Seed3;
  status: Status4;
  error: Error2;
  config: Config3;
  protocol_ids: ProtocolIds;
  validation_metrics: ValidationMetrics;
  method: BenchmarkMethodPreview | null;
  verification_scope: VerificationScope;
  test_results: TestResults;
  holdout_exposure: HoldoutExposure;
  bundle_available: BundleAvailable;
}
export interface Software12 {
  [k: string]: string;
}
export interface Config3 {
  [k: string]: JsonValue;
}
export interface BenchmarkMethodPreview {
  name: Name2;
  seed: Seed4;
  parameters: Parameters1;
  validation_search: ValidationSearch;
  training_description: TrainingDescription;
}
export interface ValidationSearchPreview {
  parameters: Parameters2;
  validation_primary: ValidationPrimary;
}
export interface Parameters2 {
  [k: string]: JsonValue;
}
export interface MaterialResponse {
  id: Id19;
  project_id: ProjectId14;
  filename: Filename2;
  media_type: MediaType;
  sha256: Sha2565;
  dataset_id: DatasetId5;
}
export interface Capabilities {
  schema_version: SchemaVersion14;
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
  limitations: Limitations1;
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
  id: Id20;
  project_id: ProjectId15;
  kind: Kind21;
  state: State4;
  result_id: ResultId1;
  error: Error3;
  created_at: CreatedAt14;
  started_at: StartedAt1;
  finished_at: FinishedAt1;
  error_code: ErrorCode1;
  retry_of_job_id: RetryOfJobId;
  deadline_at: DeadlineAt;
  external_receipt: ExternalReceiptProjection | null;
}
export interface ExternalReceiptProjection {
  external_id: ExternalId1;
  connector: Connector1;
  state: State5;
  request_sha256: RequestSha2561;
  body_sha256: BodySha256;
  attempts: Attempts;
  submitted_at: SubmittedAt;
  external_project_id: ExternalProjectId2;
  external_record_id: ExternalRecordId2;
  artifact_id: ArtifactId2;
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
  id: Id21;
  project_id: ProjectId16;
  kind: Kind22;
  schema_version: SchemaVersion15;
  created_at: CreatedAt15;
}
export interface ResearchRun {
  schema_version: SchemaVersion16;
  id: Id22;
  project_id: ProjectId17;
  created_at: CreatedAt16;
  contract: Contract1;
  objective: Objective;
  inputs: InputScope;
  policy: PolicyReference;
  mode: Mode;
  state: State6;
  control_revision: ControlRevision;
  plan_revision: PlanRevision;
  limits: ResourceLimits;
  usage: UsageSnapshot;
  open_question_ids: OpenQuestionIds;
  result_artifact_ids: ResultArtifactIds;
  continued_from_run_id: ContinuedFromRunId;
  finished_at: FinishedAt2;
  stop_reason: StopReason;
}
export interface InputScope {
  material_ids: MaterialIds;
  artifact_ids: ArtifactIds1;
  conversation_id: ConversationId;
  message_cutoff: MessageCutoff;
}
/**
 * Values are required; E01 owns defaults and server/project intersections.
 */
export interface ResourceLimits {
  model_tokens: ModelTokens;
  model_requests: ModelRequests;
  tool_calls: ToolCalls;
  coordinator_iterations: CoordinatorIterations;
  specialist_assignments: SpecialistAssignments;
  specialist_concurrency: SpecialistConcurrency;
  delegation_depth: DelegationDepth;
  review_rounds: ReviewRounds;
  scientific_attempts: ScientificAttempts;
  active_seconds: ActiveSeconds;
  transient_retries: TransientRetries;
  finalization_model_tokens: FinalizationModelTokens;
  finalization_scientific_attempts: FinalizationScientificAttempts;
}
export interface UsageSnapshot {
  billed_token_categories: BilledTokenCategories;
  reserved_tokens: ReservedTokens;
  model_requests: ModelRequests1;
  tool_calls: ToolCalls1;
  scientific_attempts: ScientificAttempts1;
  active_seconds: ActiveSeconds1;
  unknown_request_ids: UnknownRequestIds;
  cost: Cost;
}
export interface BilledTokenCategories {
  [k: string]: number;
}
export interface UnknownCost {
  status: Status5;
  reason: Reason2;
}
export interface EstimatedCost {
  status: Status6;
  amount: Amount;
  currency: Currency;
  pricing_revision: PricingRevision;
}
export interface RunDetail {
  run: ResearchRun;
  plan: ResearchPlan | null;
  questions: Questions;
  control_effect: ControlEffect;
}
export interface ResearchPlan {
  schema_version: SchemaVersion17;
  id: Id23;
  project_id: ProjectId18;
  created_at: CreatedAt17;
  contract: Contract2;
  run_id: RunId2;
  revision: Revision3;
  steps: Steps;
  rationale_summary: RationaleSummary;
}
export interface ResearchStep {
  id: Id24;
  objective: Objective1;
  depends_on: DependsOn;
  allowed_input_ids: AllowedInputIds;
  expected_artifact_kinds: ExpectedArtifactKinds;
  completion_criteria: CompletionCriteria;
  status: Status7;
  action_ids: ActionIds;
}
export interface ResearchQuestion {
  schema_version: SchemaVersion18;
  id: Id25;
  project_id: ProjectId19;
  created_at: CreatedAt18;
  contract: Contract3;
  run_id: RunId3;
  revision: Revision4;
  run_revision: RunRevision;
  questions: Questions1;
  status: Status8;
  expires_at: ExpiresAt;
  answer_message_id: AnswerMessageId;
}
export interface MaterialQuestion {
  id: Id26;
  field: Field;
  prompt: Prompt;
  blocked_step_ids: BlockedStepIds;
  options: Options;
  evidence: Evidence1;
}
export interface QuestionOption {
  id: Id27;
  label: Label;
  consequence: Consequence;
}
export interface UnavailableEvidenceReference {
  contract: Contract4;
  schema_version: SchemaVersion19;
  availability: Availability1;
  source_artifact_id: SourceArtifactId1;
  source_sha256: SourceSha2561;
  reason: Reason3;
}
export interface RunResult {
  run_id: RunId4;
  state: State7;
  artifact_ids: ArtifactIds2;
  stop_reason: StopReason1;
}
export interface RunEvent {
  contract: Contract5;
  schema_version: SchemaVersion20;
  run_id: RunId5;
  sequence: Sequence;
  created_at: CreatedAt19;
  event_type: EventType;
  run_revision: RunRevision1;
  state: State8;
  action_id: ActionId1;
  question_id: QuestionId;
  artifact_ids: ArtifactIds3;
  summary: Summary;
}

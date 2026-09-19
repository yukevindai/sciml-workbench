/* Generated from Pydantic JSON schemas. Do not edit; run npm run contracts:generate. */

export type WorkbenchContract =
  | Dataset
  | Audit
  | Split
  | Benchmark
  | Evidence
  | Failure
  | Provenance
  | Report
  | DatasetV2
  | FailureV2
  | ClaimSet
  | EvaluationProtocol
  | AgentExecutionRecord
  | EvidenceReference
  | MetricReference
  | FailureReceipt
  | ResearchRun
  | RunInput
  | RunControlInput
  | RunAmendmentInput
  | PlanAcceptanceInput
  | ResearchPlan
  | SpecialistAssignment
  | SpecialistResult
  | ResearchQuestion
  | QuestionAnswerInput
  | ToolRequest
  | ToolResponse
  | ToolDescriptor
  | RunEvent
  | ResourceLimits
  | UsageSnapshot
  | ErrorResponse
  | ProjectResponse
  | JobResponse
  | LegacyArtifact
  | VersionedArtifact
  | ProjectsResponse
  | JobsResponse
  | ArtifactsResponse
  | ProjectInput
  | Source
  | AuditInput
  | SplitInput
  | BenchmarkInput
  | FailureInput;
export type SchemaVersion = '1.0';
export type Id = string;
export type ProjectId = string;
export type CreatedAt = string;
export type Parents = string[];
export type Kind = 'dataset';
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
export type Id1 = string;
export type ProjectId1 = string;
export type CreatedAt1 = string;
export type Parents1 = string[];
export type Kind1 = 'audit';
export type DatasetId = string;
export type SchemaVersion2 = '1.0';
export type Id2 = string;
export type ProjectId2 = string;
export type CreatedAt2 = string;
export type Parents2 = string[];
export type Kind2 = 'split';
export type DatasetId1 = string;
export type AuditId = string;
export type Assignments = ('train' | 'validation' | 'test' | 'excluded')[];
export type SchemaVersion3 = '1.0';
export type Id3 = string;
export type ProjectId3 = string;
export type CreatedAt3 = string;
export type Parents3 = string[];
export type Kind3 = 'benchmark';
export type DatasetId2 = string;
export type SplitId = string;
export type Model = 'mean' | 'ridge';
export type Seed = number;
export type Status = 'succeeded' | 'failed';
export type Error = string | null;
export type BundleKey = string | null;
export type SchemaVersion4 = '1.0';
export type Id4 = string;
export type ProjectId4 = string;
export type CreatedAt4 = string;
export type Parents4 = string[];
export type Kind4 = 'evidence';
export type Title = string;
export type PdfKey = string;
export type Sha2561 = string;
export type BundleKey1 = string;
export type SchemaVersion5 = '1.0';
export type Id5 = string;
export type ProjectId5 = string;
export type CreatedAt5 = string;
export type Parents5 = string[];
export type Kind5 = 'failure';
export type BenchmarkId = string;
export type ExternalProjectId = string;
export type ExternalRecordId = string;
export type Reason = string;
export type SchemaVersion6 = '1.0';
export type Id6 = string;
export type ProjectId6 = string;
export type CreatedAt6 = string;
export type Parents6 = string[];
export type Kind6 = 'provenance';
export type Activity = string;
export type Inputs = string[];
export type Outputs = string[];
export type SchemaVersion7 = '1.0';
export type Id7 = string;
export type ProjectId7 = string;
export type CreatedAt7 = string;
export type Parents7 = string[];
export type Kind7 = 'report';
export type BlobKey1 = string;
export type Sha2562 = string;
export type ArtifactIds = string[];
export type SchemaVersion8 = '2.0';
export type Id8 = string;
export type ProjectId8 = string;
export type CreatedAt8 = string;
export type Parents8 = string[];
export type Kind8 = 'dataset';
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
export type Kind9 = 'user_message' | 'operator_assertion' | 'source_span' | 'artifact';
export type Id9 = string;
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
export type Name = string;
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
export type Id10 = string;
export type ProjectId9 = string;
export type CreatedAt9 = string;
export type Parents9 = string[];
export type Kind10 = 'failure';
export type BenchmarkId1 = string;
export type SourceJobId = string;
export type Reason1 = string;
export type UncertaintyNotes = string;
export type Actor = HumanActor | AgentActor;
export type Kind11 = 'human';
export type OperatorSessionReference = string;
export type Kind12 = 'agent';
export type RunId = string;
export type AssignmentId = string | null;
export type ActionId = string;
export type Provider = string;
export type Model1 = string;
export type PromptVersion = string;
export type PolicyId = string;
export type Revision = number;
export type Sha2564 = string;
export type PolicyRuleId = string;
export type Observation = ExecutionFailure | CriterionFailure | ResearcherAssessment;
export type Kind13 = 'execution_failure';
export type ErrorCode = 'ADMISSION_REJECTED' | 'JOB_TIMED_OUT' | 'WORKER_INTERRUPTED' | 'INTEGRITY_FAILED';
export type ObservedError = string;
export type Kind14 = 'criterion_missed';
export type ProtocolId = string;
export type ProtocolRevision = number;
export type CriterionId = string;
export type ArtifactId = string;
export type FieldPath = string;
export type Partition = 'train' | 'validation' | 'test' | 'excluded';
export type Value16 = number;
export type Units = string | null;
export type SuccessComparison = 'lt' | 'lte' | 'gt' | 'gte';
export type Threshold = number;
export type Kind15 = 'researcher_assessment';
export type Statement = string;
export type CausalHypotheses = string[];
export type Connector = 'sciml-workbench';
export type ExternalId = string;
export type RequestSha256 = string;
export type State = 'confirmed';
export type ExternalProjectId1 = string;
export type ExternalRecordId1 = string;
export type JsonValue = unknown;
export type SchemaVersion10 = '1.0';
export type Id11 = string;
export type ProjectId10 = string;
export type CreatedAt10 = string;
export type Parents10 = string[];
export type Kind16 = 'claim_set';
export type RunId1 = string;
export type Revision1 = number;
export type Id12 = string;
export type Statement1 = string;
export type Classification = 'computed_result' | 'source_supported' | 'interpretation' | 'hypothesis';
export type Contract = 'evidence_reference';
export type SchemaVersion11 = '1.0';
export type Availability = 'available';
export type SourceArtifactId = string;
export type SourceSha256 = string;
export type RepresentationSha256 = string;
export type ExtractionVersion = string;
export type Kind17 = 'text_span';
export type Unit = 'unicode_codepoint';
export type Start = number;
export type End = number;
export type ExcerptSha256 = string;
export type Page = number | null;
export type SourceReferences = AvailableEvidenceReference[];
export type MetricReferences = MetricReference[];
export type Population = string;
export type SplitId1 = string | null;
export type Limitations = string[];
export type Uncertainty19 = string;
export type Status1 = 'not_checked' | 'valid' | 'invalid';
export type CheckedAt = string | null;
export type Issues = string[];
export type Status2 = 'supported' | 'partially_supported' | 'unsupported' | 'conflicting' | 'not_reviewed';
export type ReviewedSnapshotSha256 = string | null;
export type ReviewerAssignmentId = string | null;
export type Explanation = string | null;
/**
 * @minItems 1
 */
export type Claims = Claim[];
export type SchemaVersion12 = '1.0';
export type Id13 = string;
export type ProjectId11 = string;
export type CreatedAt11 = string;
export type Parents11 = string[];
export type Kind18 = 'evaluation_protocol';
export type Revision2 = number;
export type DatasetId3 = string;
export type DatasetSha256 = string;
export type SplitId2 = string;
export type SplitSha256 = string;
export type ConfigurationSha256 = string;
export type Target = string;
/**
 * @minItems 1
 */
export type Features = string[];
export type Preprocessing = string;
export type Id14 = string;
export type Model2 = 'mean' | 'ridge';
export type Seed1 = number;
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
export type State1 = 'draft' | 'sealed' | 'released';
export type SealedAt = string | null;
export type ReleasedAt = string | null;
export type SelectedCandidateId = string | null;
export type ExposureStatus = 'unexposed' | 'exposed' | 'unknown';
export type ExposureEventIds = string[];
export type SchemaVersion13 = '1.0';
export type Id16 = string;
export type ProjectId12 = string;
export type CreatedAt12 = string;
export type Parents12 = string[];
export type Kind19 = 'agent_execution';
export type RunId2 = string;
export type Objective = string;
export type MaterialIds = string[];
export type ArtifactIds1 = string[];
export type ConversationId = string | null;
export type MessageCutoff = number | null;
export type SchemaVersion14 = '1.0';
export type Id17 = string;
export type ProjectId13 = string;
export type CreatedAt13 = string;
export type Contract1 = 'research_plan';
export type RunId3 = string;
export type Revision3 = number;
export type Id18 = string;
export type Objective1 = string;
export type DependsOn = string[];
export type AllowedInputIds = string[];
export type ExpectedArtifactKinds = string[];
/**
 * @minItems 1
 */
export type CompletionCriteria = string[];
export type Status3 = 'pending' | 'ready' | 'running' | 'blocked' | 'completed' | 'failed' | 'skipped';
export type ActionIds = string[];
/**
 * @minItems 1
 * @maxItems 120
 */
export type Steps = ResearchStep[];
export type RationaleSummary = string;
export type PlanRevisions = ResearchPlan[];
export type ActionId1 = string;
export type PlanRevision = number;
export type Summary = string;
export type Id19 = string;
export type Contract2 = string;
export type SchemaVersion15 = string;
export type Sha2565 = string;
export type InputReferences = ContractReference[];
export type Decisions = DecisionSummary[];
export type AssignmentIds = string[];
export type ActionId2 = string;
export type AttemptId = string;
export type Tool =
  | 'inspect_project'
  | 'inspect_dataset'
  | 'list_artifacts'
  | 'read_artifact'
  | 'read_job'
  | 'run_audit'
  | 'generate_split'
  | 'seal_evaluation'
  | 'run_baseline'
  | 'read_evaluation'
  | 'ingest_evidence'
  | 'search_evidence'
  | 'read_evidence_span'
  | 'search_failures'
  | 'read_failure'
  | 'record_outcome'
  | 'reconcile_outcome'
  | 'validate_claims'
  | 'build_report'
  | 'verify_report'
  | 'replay_science'
  | 'read_memory';
export type ToolVersion = string;
export type RequestSha2561 = string;
export type State2 = 'prepared' | 'submitted' | 'completed' | 'failed' | 'unknown' | 'cancelled';
export type JobId = string | null;
export type ReceiptId = string | null;
export type ArtifactIds2 = string[];
export type Actions = ActionSummary[];
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
export type Status4 = 'unknown';
export type Reason2 = string;
export type Status5 = 'estimated';
export type Amount = number;
export type Currency = string;
export type PricingRevision = string;
export type WorkbenchRevision = string;
export type Provider1 = string;
export type Model3 = string;
export type ModelRevision = string | null;
export type ProviderSdk = string;
export type Runtime = string;
export type Checkpointer = string;
export type Prompt = string;
export type ToolCatalog = string;
export type StateAtCutoff =
  | 'queued'
  | 'running'
  | 'waiting_for_job'
  | 'waiting_for_input'
  | 'paused'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled';
export type EventCutoff = number;
export type CapturedAt = string;
export type PendingFinalizationActionIds = string[];
export type EvidenceReference = AvailableEvidenceReference | UnavailableEvidenceReference;
export type Contract3 = 'evidence_reference';
export type SchemaVersion16 = '1.0';
export type Availability1 = 'unavailable';
export type SourceArtifactId1 = string;
export type SourceSha2561 = string;
export type Reason3 = string;
export type SchemaVersion17 = '1.0';
export type Id20 = string;
export type ProjectId14 = string;
export type CreatedAt14 = string;
export type Contract4 = 'research_run';
export type Objective2 = string;
export type Mode = 'autopilot' | 'review_plan';
export type State3 =
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
export type PlanRevision1 = number;
export type OpenQuestionIds = string[];
export type ResultArtifactIds = string[];
export type ContinuedFromRunId = string | null;
export type FinishedAt = string | null;
export type StopReason = string | null;
export type Objective3 = string;
export type PolicyRevision = number;
export type Mode1 = 'autopilot' | 'review_plan';
export type ExpectedRunRevision = number;
export type ExpectedRunRevision1 = number;
export type ExpectedPlanRevision = number;
export type Objective4 = string | null;
export type PolicyRevision1 = number | null;
export type ExpectedRunRevision2 = number;
export type ExpectedPlanRevision1 = number;
export type SchemaVersion18 = '1.0';
export type Id21 = string;
export type ProjectId15 = string;
export type CreatedAt15 = string;
export type Contract5 = 'specialist_assignment';
export type RunId4 = string;
export type PlanRevision2 = number;
export type Role = 'data_evaluation' | 'evidence' | 'failure_memory' | 'scientific_reviewer';
export type Objective5 = string;
export type AllowedArtifactIds = string[];
export type AllowedMaterialIds = string[];
export type AllowedTools = (
  | 'inspect_project'
  | 'inspect_dataset'
  | 'list_artifacts'
  | 'read_artifact'
  | 'read_job'
  | 'run_audit'
  | 'generate_split'
  | 'seal_evaluation'
  | 'run_baseline'
  | 'read_evaluation'
  | 'ingest_evidence'
  | 'search_evidence'
  | 'read_evidence_span'
  | 'search_failures'
  | 'read_failure'
  | 'record_outcome'
  | 'reconcile_outcome'
  | 'validate_claims'
  | 'build_report'
  | 'verify_report'
  | 'replay_science'
  | 'read_memory'
)[];
export type BudgetAllocationId = string;
export type DeadlineAt = string;
/**
 * @minItems 1
 */
export type CompletionCriteria1 = string[];
export type State4 = 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';
export type ReviewedSnapshotSha2561 = string | null;
export type Contract6 = 'specialist_result';
export type SchemaVersion19 = '1.0';
export type AssignmentId1 = string;
export type Findings = Claim[];
export type SupportingArtifactIds = string[];
export type Uncertainty20 = string;
export type UnresolvedIssues = string[];
export type RecommendedActions = string[];
export type SchemaVersion20 = '1.0';
export type Id22 = string;
export type ProjectId16 = string;
export type CreatedAt16 = string;
export type Contract7 = 'research_question';
export type RunId5 = string;
export type Revision4 = number;
export type RunRevision = number;
export type Id23 = string;
export type Field = string;
export type Prompt1 = string;
/**
 * @minItems 1
 */
export type BlockedStepIds = string[];
export type Id24 = string;
export type Label = string;
export type Consequence = string;
export type Options = QuestionOption[];
export type Evidence1 = (AvailableEvidenceReference | UnavailableEvidenceReference)[];
/**
 * @minItems 1
 * @maxItems 20
 */
export type Questions = MaterialQuestion[];
export type Status6 = 'open' | 'answered' | 'superseded' | 'expired' | 'cancelled';
export type ExpiresAt = string | null;
export type AnswerMessageId = string | null;
export type ExpectedRunRevision3 = number;
export type ExpectedQuestionRevision = number;
export type Contract8 = 'tool_request';
export type SchemaVersion21 = '1.0';
export type RunId6 = string;
export type ActionId3 = string;
export type AttemptId1 = string;
export type AssignmentId2 = string | null;
export type Name1 =
  | 'inspect_project'
  | 'inspect_dataset'
  | 'list_artifacts'
  | 'read_artifact'
  | 'read_job'
  | 'run_audit'
  | 'generate_split'
  | 'seal_evaluation'
  | 'run_baseline'
  | 'read_evaluation'
  | 'ingest_evidence'
  | 'search_evidence'
  | 'read_evidence_span'
  | 'search_failures'
  | 'read_failure'
  | 'record_outcome'
  | 'reconcile_outcome'
  | 'validate_claims'
  | 'build_report'
  | 'verify_report'
  | 'replay_science'
  | 'read_memory';
export type ToolVersion1 = string;
export type RequestSha2562 = string;
export type Contract9 = 'tool_response';
export type SchemaVersion22 = '1.0';
export type ActionId4 = string;
export type AttemptId2 = string;
export type Outcome = ToolCompleted | ToolSubmitted | ToolBlocked | ToolFailed;
export type Status7 = 'completed';
export type ArtifactIds3 = string[];
export type Status8 = 'submitted';
export type JobId1 = string;
export type Status9 = 'blocked';
export type ErrorCode1 =
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
  | 'RUN_CANCELLED';
export type Reason4 = string;
export type BlockedStepIds1 = string[];
export type Status10 = 'failed';
export type ErrorCode2 =
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
  | 'RUN_CANCELLED';
export type Error1 = string;
export type Contract10 = 'tool_descriptor';
export type SchemaVersion23 = '1.0';
export type Name2 =
  | 'inspect_project'
  | 'inspect_dataset'
  | 'list_artifacts'
  | 'read_artifact'
  | 'read_job'
  | 'run_audit'
  | 'generate_split'
  | 'seal_evaluation'
  | 'run_baseline'
  | 'read_evaluation'
  | 'ingest_evidence'
  | 'search_evidence'
  | 'read_evidence_span'
  | 'search_failures'
  | 'read_failure'
  | 'record_outcome'
  | 'reconcile_outcome'
  | 'validate_claims'
  | 'build_report'
  | 'verify_report'
  | 'replay_science'
  | 'read_memory';
export type Version = string;
export type Purpose = string;
export type InputSchemaId = string;
export type OutputSchemaId = string;
/**
 * @minItems 1
 */
export type AllowedRoles = (
  'coordinator' | 'data_evaluation' | 'evidence' | 'failure_memory' | 'scientific_reviewer'
)[];
export type Prerequisites = string[];
export type SideEffect = 'read' | 'compute' | 'external_write' | 'control' | 'report';
export type RetryClass = 'read' | 'idempotent_submission' | 'receipt_reconciliation' | 'new_attempt' | 'never';
export type ExpectedArtifactKinds1 = string[];
export type RequiredChecks = ('project_scope' | 'policy' | 'exposure' | 'evaluation' | 'prerequisites' | 'budget')[];
export type ScientificAttemptEstimate = number;
export type ActiveSecondsEstimate = number | null;
export type Contract11 = 'run_event';
export type SchemaVersion24 = '1.0';
export type RunId7 = string;
export type Sequence = number;
export type CreatedAt17 = string;
export type EventType =
  | 'accepted'
  | 'state_changed'
  | 'plan_changed'
  | 'action_changed'
  | 'question_changed'
  | 'usage_changed'
  | 'result_published';
export type RunRevision1 = number;
export type State5 =
  | 'queued'
  | 'running'
  | 'waiting_for_job'
  | 'waiting_for_input'
  | 'paused'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled';
export type ActionId5 = string | null;
export type QuestionId = string | null;
export type ArtifactIds4 = string[];
export type Summary1 = string | null;
export type Error2 = string;
export type ErrorCode3 =
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
  | 'RUN_CANCELLED';
export type RequestId = string;
export type Loc = (string | number)[];
export type Msg = string;
export type Details = ValidationIssue[];
export type Id25 = string;
export type Name3 = string;
export type Description = string;
export type Id26 = string;
export type ProjectId17 = string;
export type Kind20 =
  'audit' | 'split' | 'benchmark' | 'evidence' | 'failure' | 'report' | 'report_verify' | 'scientific_replay';
export type State6 = 'queued' | 'running' | 'succeeded' | 'failed';
export type ResultId = string | null;
export type Error3 = string | null;
export type CreatedAt18 = string;
export type StartedAt = string | null;
export type FinishedAt1 = string | null;
export type ErrorCode4 =
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
export type DeadlineAt1 = string | null;
export type LegacyArtifact = Dataset | Audit | Split | Benchmark | Evidence | Failure | Provenance | Report;
export type VersionedArtifact =
  | (Dataset | DatasetV2)
  | Audit
  | Split
  | Benchmark
  | Evidence
  | (Failure | FailureV2)
  | Provenance
  | Report
  | ClaimSet
  | EvaluationProtocol
  | AgentExecutionRecord;
export type ProjectsResponse = ProjectResponse[];
export type Id27 = string;
export type ProjectId18 = string;
export type Kind21 = 'audit' | 'split' | 'benchmark' | 'evidence' | 'failure' | 'report';
export type State7 = 'queued' | 'running' | 'succeeded' | 'failed';
export type ResultId1 = string | null;
export type Error4 = string | null;
export type CreatedAt19 = string;
export type StartedAt1 = string | null;
export type FinishedAt2 = string | null;
export type JobsResponse = LegacyJobResponse[];
export type ArtifactsResponse = (Dataset | Audit | Split | Benchmark | Evidence | Failure | Provenance | Report)[];
export type Name4 = string;
export type Description1 = string;
export type DatasetId4 = string;
export type DatasetId5 = string;
export type AuditId1 = string;
export type DatasetId6 = string;
export type SplitId3 = string;
export type Target1 = string;
/**
 * @minItems 1
 */
export type NumericFeatures = string[];
export type CategoricalFeatures = string[];
export type RowId = string;
/**
 * @minItems 1
 */
export type GroupColumns1 = string[];
export type IndependenceUnit = string;
export type IndependenceStatus = 'documented' | 'proxy' | 'synthetic';
export type IndependenceRationale = string;
export type Generalization = string;
/**
 * @minItems 1
 */
export type Limitations1 = string[];
export type Domain =
  | 'batteries'
  | 'electrolytes'
  | 'adsorption'
  | 'catalysis'
  | 'separations'
  | 'thermodynamics'
  | 'transport'
  | 'materials'
  | 'process_optimization';
export type Model4 = 'mean' | 'ridge';
export type Seed2 = number;
export type BenchmarkId2 = string;
export type Reason5 = string;
export type UncertaintyNotes1 = string;

export interface Dataset {
  schema_version?: SchemaVersion;
  id?: Id;
  project_id: ProjectId;
  created_at?: CreatedAt;
  parents?: Parents;
  software?: Software;
  kind?: Kind;
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
  url?: Url;
  license: License;
  data_kind: DataKind;
  transformations: Transformations;
}
export interface Audit {
  schema_version?: SchemaVersion1;
  id?: Id1;
  project_id: ProjectId1;
  created_at?: CreatedAt1;
  parents?: Parents1;
  software?: Software1;
  kind?: Kind1;
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
  schema_version?: SchemaVersion2;
  id?: Id2;
  project_id: ProjectId2;
  created_at?: CreatedAt2;
  parents?: Parents2;
  software?: Software2;
  kind?: Kind2;
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
  schema_version?: SchemaVersion3;
  id?: Id3;
  project_id: ProjectId3;
  created_at?: CreatedAt3;
  parents?: Parents3;
  software?: Software3;
  kind?: Kind3;
  dataset_id: DatasetId2;
  split_id: SplitId;
  model: Model;
  seed: Seed;
  status: Status;
  result?: Result2;
  error?: Error;
  bundle_key?: BundleKey;
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
  schema_version?: SchemaVersion4;
  id?: Id4;
  project_id: ProjectId4;
  created_at?: CreatedAt4;
  parents?: Parents4;
  software?: Software4;
  kind?: Kind4;
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
  schema_version?: SchemaVersion5;
  id?: Id5;
  project_id: ProjectId5;
  created_at?: CreatedAt5;
  parents?: Parents5;
  software?: Software5;
  kind?: Kind5;
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
  schema_version?: SchemaVersion6;
  id?: Id6;
  project_id: ProjectId6;
  created_at?: CreatedAt6;
  parents?: Parents6;
  software?: Software6;
  kind?: Kind6;
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
  schema_version?: SchemaVersion7;
  id?: Id7;
  project_id: ProjectId7;
  created_at?: CreatedAt7;
  parents?: Parents7;
  software?: Software7;
  kind?: Kind7;
  blob_key: BlobKey1;
  sha256: Sha2562;
  artifact_ids: ArtifactIds;
}
export interface Software7 {
  [k: string]: string;
}
export interface DatasetV2 {
  schema_version?: SchemaVersion8;
  id?: Id8;
  project_id: ProjectId8;
  created_at?: CreatedAt8;
  parents?: Parents8;
  software?: Software8;
  kind?: Kind8;
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
  citation?: Declaration_AnnotatedStr__StringConstraints__;
  url?: Declaration_AnnotatedStr__StringConstraints__;
  license?: Declaration_AnnotatedStr__StringConstraints__;
  data_kind?: Declaration_Literal_Empirical___Synthetic___;
  transformations?: DeclarationList_AnnotatedStr__StringConstraints___;
  units?: Declaration_AnnotatedDict_AnnotatedStr__FieldInfoAnnotation_NoneType_Required_True_Metadata__MinLenMinLength_1____PydanticGeneralMetadataPattern____S_______AnnotatedStr__StringConstraints____FieldInfoAnnotation_NoneType_Required_True_Metadata__MinLenMinLength_1_____;
  target?: Declaration_AnnotatedStr__FieldInfoAnnotation_NoneType_Required_True_Metadata__MinLenMinLength_1____PydanticGeneralMetadataPattern____S______;
  independent_unit?: Declaration_IndependentUnit_;
}
export interface UnknownDeclaration {
  origin?: Origin;
  value?: Value;
  supporting_references?: SupportingReferences;
  uncertainty?: Uncertainty;
}
export interface DeclarationReference {
  kind: Kind9;
  id: Id9;
}
export interface UserDeclarationAnnotatedStrStringConstraints {
  origin: Origin1;
  value: Value1;
  supporting_references: SupportingReferences1;
  uncertainty?: Uncertainty1;
}
export interface SourceDeclarationAnnotatedStrStringConstraints {
  origin: Origin2;
  value: Value2;
  supporting_references: SupportingReferences2;
  uncertainty?: Uncertainty2;
}
export interface InferredDeclarationAnnotatedStrStringConstraints {
  origin: Origin3;
  value: Value3;
  supporting_references: SupportingReferences3;
  rationale: Rationale;
  uncertainty: Uncertainty3;
  confidence?: Confidence;
}
export interface UserDeclarationLiteralEmpiricalSynthetic {
  origin: Origin4;
  value: Value4;
  supporting_references: SupportingReferences4;
  uncertainty?: Uncertainty4;
}
export interface SourceDeclarationLiteralEmpiricalSynthetic {
  origin: Origin5;
  value: Value5;
  supporting_references: SupportingReferences5;
  uncertainty?: Uncertainty5;
}
export interface InferredDeclarationLiteralEmpiricalSynthetic {
  origin: Origin6;
  value: Value6;
  supporting_references: SupportingReferences6;
  rationale: Rationale1;
  uncertainty: Uncertainty6;
  confidence?: Confidence1;
}
export interface UserDeclarationListAnnotatedStrStringConstraints {
  origin: Origin7;
  value: Value7;
  supporting_references: SupportingReferences7;
  uncertainty?: Uncertainty7;
}
export interface SourceDeclarationListAnnotatedStrStringConstraints {
  origin: Origin8;
  value: Value8;
  supporting_references: SupportingReferences8;
  uncertainty?: Uncertainty8;
}
export interface InferredDeclarationListAnnotatedStrStringConstraints {
  origin: Origin9;
  value: Value9;
  supporting_references: SupportingReferences9;
  rationale: Rationale2;
  uncertainty: Uncertainty9;
  confidence?: Confidence2;
}
export interface UserDeclarationAnnotatedDictAnnotatedStrFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1_PydanticGeneralMetadataPatternSAnnotatedStrStringConstraintsFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1 {
  origin: Origin10;
  value: Value10;
  supporting_references: SupportingReferences10;
  uncertainty?: Uncertainty10;
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
  uncertainty?: Uncertainty11;
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
  confidence?: Confidence3;
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
  uncertainty?: Uncertainty13;
}
export interface SourceDeclarationAnnotatedStrFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1_PydanticGeneralMetadataPatternS {
  origin: Origin14;
  value: Value14;
  supporting_references: SupportingReferences14;
  uncertainty?: Uncertainty14;
}
export interface InferredDeclarationAnnotatedStrFieldInfoAnnotationNoneTypeRequiredTrueMetadataMinLenMinLength1_PydanticGeneralMetadataPatternS {
  origin: Origin15;
  value: Value15;
  supporting_references: SupportingReferences15;
  rationale: Rationale4;
  uncertainty: Uncertainty15;
  confidence?: Confidence4;
}
export interface UserDeclarationIndependentUnit {
  origin: Origin16;
  value: IndependentUnit;
  supporting_references: SupportingReferences16;
  uncertainty?: Uncertainty16;
}
export interface IndependentUnit {
  name: Name;
  group_columns: GroupColumns;
  rationale: Rationale5;
}
export interface SourceDeclarationIndependentUnit {
  origin: Origin17;
  value: IndependentUnit;
  supporting_references: SupportingReferences17;
  uncertainty?: Uncertainty17;
}
export interface InferredDeclarationIndependentUnit {
  origin: Origin18;
  value: IndependentUnit;
  supporting_references: SupportingReferences18;
  rationale: Rationale6;
  uncertainty: Uncertainty18;
  confidence?: Confidence5;
}
export interface FailureV2 {
  schema_version?: SchemaVersion9;
  id?: Id10;
  project_id: ProjectId9;
  created_at?: CreatedAt9;
  parents?: Parents9;
  software?: Software9;
  kind?: Kind10;
  benchmark_id: BenchmarkId1;
  source_job_id: SourceJobId;
  reason: Reason1;
  uncertainty_notes: UncertaintyNotes;
  actor: Actor;
  observation: Observation;
  causal_hypotheses?: CausalHypotheses;
  receipt: FailureReceipt;
}
export interface Software9 {
  [k: string]: string;
}
export interface HumanActor {
  kind: Kind11;
  operator_session_reference: OperatorSessionReference;
}
export interface AgentActor {
  kind: Kind12;
  run_id: RunId;
  assignment_id?: AssignmentId;
  action_id: ActionId;
  provider: Provider;
  model: Model1;
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
  kind: Kind13;
  error_code: ErrorCode;
  observed_error: ObservedError;
}
export interface CriterionFailure {
  kind: Kind14;
  protocol_id: ProtocolId;
  protocol_revision: ProtocolRevision;
  criterion_id: CriterionId;
  metric: MetricReference;
  success_comparison: SuccessComparison;
  threshold: Threshold;
}
export interface MetricReference {
  artifact_id: ArtifactId;
  field_path: FieldPath;
  partition: Partition;
  value: Value16;
  units?: Units;
}
export interface ResearcherAssessment {
  kind: Kind15;
  statement: Statement;
}
export interface FailureReceipt {
  connector?: Connector;
  external_id: ExternalId;
  request_sha256: RequestSha256;
  state?: State;
  external_project_id: ExternalProjectId1;
  external_record_id: ExternalRecordId1;
  record: Record1;
}
export interface Record1 {
  [k: string]: JsonValue;
}
export interface ClaimSet {
  schema_version?: SchemaVersion10;
  id?: Id11;
  project_id: ProjectId10;
  created_at?: CreatedAt10;
  parents?: Parents10;
  software?: Software10;
  kind?: Kind16;
  run_id: RunId1;
  revision: Revision1;
  claims: Claims;
}
export interface Software10 {
  [k: string]: string;
}
export interface Claim {
  id: Id12;
  statement: Statement1;
  classification: Classification;
  source_references?: SourceReferences;
  metric_references?: MetricReferences;
  population: Population;
  split_id?: SplitId1;
  limitations: Limitations;
  uncertainty: Uncertainty19;
  reference_check: ReferenceCheck;
  semantic_review: SemanticReview;
}
export interface AvailableEvidenceReference {
  contract?: Contract;
  schema_version?: SchemaVersion11;
  availability: Availability;
  source_artifact_id: SourceArtifactId;
  source_sha256: SourceSha256;
  representation_sha256: RepresentationSha256;
  extraction_version: ExtractionVersion;
  locator: TextSpan;
  excerpt_sha256: ExcerptSha256;
  page?: Page;
}
export interface TextSpan {
  kind?: Kind17;
  unit?: Unit;
  start: Start;
  end: End;
}
export interface ReferenceCheck {
  status: Status1;
  checked_at?: CheckedAt;
  issues?: Issues;
}
export interface SemanticReview {
  status: Status2;
  reviewed_snapshot_sha256?: ReviewedSnapshotSha256;
  reviewer_assignment_id?: ReviewerAssignmentId;
  explanation?: Explanation;
}
export interface EvaluationProtocol {
  schema_version?: SchemaVersion12;
  id?: Id13;
  project_id: ProjectId11;
  created_at?: CreatedAt11;
  parents?: Parents11;
  software?: Software11;
  kind?: Kind18;
  revision: Revision2;
  dataset_id: DatasetId3;
  dataset_sha256: DatasetSha256;
  split_id: SplitId2;
  split_sha256: SplitSha256;
  configuration_sha256: ConfigurationSha256;
  target: Target;
  features: Features;
  preprocessing: Preprocessing;
  independent_unit: IndependentUnit;
  candidates: Candidates;
  primary_metric: PrimaryMetric;
  selection_rule: SelectionRule;
  success_criterion?: SuccessCriterion | null;
  state: State1;
  sealed_at?: SealedAt;
  released_at?: ReleasedAt;
  selected_candidate_id?: SelectedCandidateId;
  exposure_status: ExposureStatus;
  exposure_event_ids?: ExposureEventIds;
}
export interface Software11 {
  [k: string]: string;
}
export interface EvaluationCandidate {
  id: Id14;
  model: Model2;
  seed: Seed1;
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
export interface AgentExecutionRecord {
  schema_version?: SchemaVersion13;
  id?: Id16;
  project_id: ProjectId12;
  created_at?: CreatedAt12;
  parents?: Parents12;
  software?: Software12;
  kind?: Kind19;
  run_id: RunId2;
  objective: Objective;
  inputs: InputScope;
  policy: PolicyReference;
  plan_revisions: PlanRevisions;
  decisions: Decisions;
  assignment_ids: AssignmentIds;
  actions: Actions;
  limits: ResourceLimits;
  usage: UsageSnapshot;
  versions: ExecutionVersions;
  state_at_cutoff: StateAtCutoff;
  event_cutoff: EventCutoff;
  captured_at: CapturedAt;
  pending_finalization_action_ids: PendingFinalizationActionIds;
}
export interface Software12 {
  [k: string]: string;
}
export interface InputScope {
  material_ids: MaterialIds;
  artifact_ids: ArtifactIds1;
  conversation_id?: ConversationId;
  message_cutoff?: MessageCutoff;
}
export interface ResearchPlan {
  schema_version?: SchemaVersion14;
  id: Id17;
  project_id: ProjectId13;
  created_at: CreatedAt13;
  contract?: Contract1;
  run_id: RunId3;
  revision: Revision3;
  steps: Steps;
  rationale_summary: RationaleSummary;
}
export interface ResearchStep {
  id: Id18;
  objective: Objective1;
  depends_on: DependsOn;
  allowed_input_ids: AllowedInputIds;
  expected_artifact_kinds: ExpectedArtifactKinds;
  completion_criteria: CompletionCriteria;
  status: Status3;
  action_ids?: ActionIds;
}
export interface DecisionSummary {
  action_id: ActionId1;
  plan_revision: PlanRevision;
  summary: Summary;
  input_references: InputReferences;
}
export interface ContractReference {
  id: Id19;
  contract: Contract2;
  schema_version: SchemaVersion15;
  sha256: Sha2565;
}
export interface ActionSummary {
  action_id: ActionId2;
  attempt_id: AttemptId;
  tool: Tool;
  tool_version: ToolVersion;
  request_sha256: RequestSha2561;
  state: State2;
  job_id?: JobId;
  receipt_id?: ReceiptId;
  artifact_ids: ArtifactIds2;
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
  status: Status4;
  reason: Reason2;
}
export interface EstimatedCost {
  status: Status5;
  amount: Amount;
  currency: Currency;
  pricing_revision: PricingRevision;
}
export interface ExecutionVersions {
  workbench_revision: WorkbenchRevision;
  provider: Provider1;
  model: Model3;
  model_revision: ModelRevision;
  provider_sdk: ProviderSdk;
  runtime: Runtime;
  checkpointer: Checkpointer;
  prompt: Prompt;
  tool_catalog: ToolCatalog;
}
export interface UnavailableEvidenceReference {
  contract?: Contract3;
  schema_version?: SchemaVersion16;
  availability: Availability1;
  source_artifact_id: SourceArtifactId1;
  source_sha256: SourceSha2561;
  reason: Reason3;
}
export interface ResearchRun {
  schema_version?: SchemaVersion17;
  id: Id20;
  project_id: ProjectId14;
  created_at: CreatedAt14;
  contract?: Contract4;
  objective: Objective2;
  inputs: InputScope;
  policy: PolicyReference;
  mode: Mode;
  state: State3;
  control_revision: ControlRevision;
  plan_revision: PlanRevision1;
  limits: ResourceLimits;
  usage: UsageSnapshot;
  open_question_ids: OpenQuestionIds;
  result_artifact_ids: ResultArtifactIds;
  continued_from_run_id?: ContinuedFromRunId;
  finished_at?: FinishedAt;
  stop_reason?: StopReason;
}
export interface RunInput {
  objective: Objective3;
  inputs: InputScope;
  policy_revision: PolicyRevision;
  mode?: Mode1;
  limits: ResourceLimits;
}
export interface RunControlInput {
  expected_run_revision: ExpectedRunRevision;
}
export interface RunAmendmentInput {
  expected_run_revision: ExpectedRunRevision1;
  expected_plan_revision: ExpectedPlanRevision;
  objective?: Objective4;
  inputs?: InputScope | null;
  policy_revision?: PolicyRevision1;
}
export interface PlanAcceptanceInput {
  expected_run_revision: ExpectedRunRevision2;
  expected_plan_revision: ExpectedPlanRevision1;
}
export interface SpecialistAssignment {
  schema_version?: SchemaVersion18;
  id: Id21;
  project_id: ProjectId15;
  created_at: CreatedAt15;
  contract?: Contract5;
  run_id: RunId4;
  plan_revision: PlanRevision2;
  role: Role;
  objective: Objective5;
  allowed_artifact_ids: AllowedArtifactIds;
  allowed_material_ids: AllowedMaterialIds;
  allowed_tools: AllowedTools;
  budget_allocation_id: BudgetAllocationId;
  deadline_at: DeadlineAt;
  completion_criteria: CompletionCriteria1;
  state: State4;
  reviewed_snapshot_sha256?: ReviewedSnapshotSha2561;
}
export interface SpecialistResult {
  contract?: Contract6;
  schema_version?: SchemaVersion19;
  assignment_id: AssignmentId1;
  findings: Findings;
  supporting_artifact_ids: SupportingArtifactIds;
  uncertainty: Uncertainty20;
  unresolved_issues: UnresolvedIssues;
  recommended_actions: RecommendedActions;
}
export interface ResearchQuestion {
  schema_version?: SchemaVersion20;
  id: Id22;
  project_id: ProjectId16;
  created_at: CreatedAt16;
  contract?: Contract7;
  run_id: RunId5;
  revision: Revision4;
  run_revision: RunRevision;
  questions: Questions;
  status: Status6;
  expires_at?: ExpiresAt;
  answer_message_id?: AnswerMessageId;
}
export interface MaterialQuestion {
  id: Id23;
  field: Field;
  prompt: Prompt1;
  blocked_step_ids: BlockedStepIds;
  options: Options;
  evidence: Evidence1;
}
export interface QuestionOption {
  id: Id24;
  label: Label;
  consequence: Consequence;
}
export interface QuestionAnswerInput {
  expected_run_revision: ExpectedRunRevision3;
  expected_question_revision: ExpectedQuestionRevision;
  answers: Answers;
}
export interface Answers {
  [k: string]: string;
}
/**
 * Trusted dispatch envelope. A provider proposes only name/arguments.
 */
export interface ToolRequest {
  contract?: Contract8;
  schema_version?: SchemaVersion21;
  run_id: RunId6;
  action_id: ActionId3;
  attempt_id: AttemptId1;
  assignment_id?: AssignmentId2;
  name: Name1;
  tool_version: ToolVersion1;
  arguments: Arguments;
  request_sha256: RequestSha2562;
  policy: PolicyReference;
}
export interface Arguments {
  [k: string]: JsonValue;
}
export interface ToolResponse {
  contract?: Contract9;
  schema_version?: SchemaVersion22;
  action_id: ActionId4;
  attempt_id: AttemptId2;
  outcome: Outcome;
}
export interface ToolCompleted {
  status: Status7;
  artifact_ids: ArtifactIds3;
  result: Result4;
}
export interface Result4 {
  [k: string]: JsonValue;
}
export interface ToolSubmitted {
  status: Status8;
  job_id: JobId1;
}
export interface ToolBlocked {
  status: Status9;
  error_code: ErrorCode1;
  reason: Reason4;
  blocked_step_ids: BlockedStepIds1;
}
export interface ToolFailed {
  status: Status10;
  error_code: ErrorCode2;
  error: Error1;
}
export interface ToolDescriptor {
  contract?: Contract10;
  schema_version?: SchemaVersion23;
  name: Name2;
  version: Version;
  purpose: Purpose;
  input_schema_id: InputSchemaId;
  output_schema_id: OutputSchemaId;
  allowed_roles: AllowedRoles;
  prerequisites: Prerequisites;
  accepted_artifact_versions: AcceptedArtifactVersions;
  side_effect: SideEffect;
  retry_class: RetryClass;
  expected_artifact_kinds: ExpectedArtifactKinds1;
  required_checks: RequiredChecks;
  scientific_attempt_estimate: ScientificAttemptEstimate;
  active_seconds_estimate: ActiveSecondsEstimate;
}
export interface AcceptedArtifactVersions {
  [k: string]: string[];
}
export interface RunEvent {
  contract?: Contract11;
  schema_version?: SchemaVersion24;
  run_id: RunId7;
  sequence: Sequence;
  created_at: CreatedAt17;
  event_type: EventType;
  run_revision: RunRevision1;
  state: State5;
  action_id?: ActionId5;
  question_id?: QuestionId;
  artifact_ids?: ArtifactIds4;
  summary?: Summary1;
}
/**
 * Additive API error fields: the original error string/details remain.
 */
export interface ErrorResponse {
  error: Error2;
  error_code: ErrorCode3;
  request_id: RequestId;
  details?: Details;
}
export interface ValidationIssue {
  loc: Loc;
  msg: Msg;
}
export interface ProjectResponse {
  id: Id25;
  name: Name3;
  description: Description;
}
export interface JobResponse {
  id: Id26;
  project_id: ProjectId17;
  kind: Kind20;
  state: State6;
  result_id: ResultId;
  error: Error3;
  created_at: CreatedAt18;
  started_at: StartedAt;
  finished_at: FinishedAt1;
  error_code?: ErrorCode4;
  retry_of_job_id?: RetryOfJobId;
  deadline_at?: DeadlineAt1;
}
export interface LegacyJobResponse {
  id: Id27;
  project_id: ProjectId18;
  kind: Kind21;
  state: State7;
  result_id: ResultId1;
  error: Error4;
  created_at: CreatedAt19;
  started_at: StartedAt1;
  finished_at: FinishedAt2;
}
export interface ProjectInput {
  name: Name4;
  description?: Description1;
}
export interface AuditInput {
  dataset_id: DatasetId4;
  config?: Config3;
}
export interface Config3 {
  [k: string]: unknown;
}
export interface SplitInput {
  dataset_id: DatasetId5;
  audit_id: AuditId1;
  config: Config4;
}
export interface Config4 {
  [k: string]: unknown;
}
export interface BenchmarkInput {
  dataset_id: DatasetId6;
  split_id: SplitId3;
  target: Target1;
  numeric_features: NumericFeatures;
  categorical_features?: CategoricalFeatures;
  row_id: RowId;
  group_columns: GroupColumns1;
  units: Units1;
  independence_unit: IndependenceUnit;
  independence_status: IndependenceStatus;
  independence_rationale: IndependenceRationale;
  generalization: Generalization;
  limitations: Limitations1;
  domain?: Domain;
  accepted_warnings?: AcceptedWarnings;
  model?: Model4;
  seed?: Seed2;
}
export interface Units1 {
  [k: string]: string;
}
export interface AcceptedWarnings {
  [k: string]: string;
}
export interface FailureInput {
  benchmark_id: BenchmarkId2;
  reason: Reason5;
  uncertainty_notes: UncertaintyNotes1;
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  validateArtifactsResponse, validateLegacyArtifact, validateLegacyJobResponse,
  validateProjectsResponse,
  validateIntakeArtifact, validateMaterialResponse,
  validateJobDetail, validateJobPage, validateArtifactPage,
  validateEvaluationView,
  validateRunResult, validateRunEvents,
} from '../app/lib/generated/validators.cjs';

test('B12 run projections reject private runtime state and invalid event sequences', () => {
  const result = { run_id: 'r', state: 'cancelled', artifact_ids: [], stop_reason: 'Cancelled by operator' };
  assert.equal(validateRunResult(result), true);
  assert.equal(validateRunResult({ ...result, checkpoint: {} }), false);
  assert.equal(validateRunResult({ ...result, state: 'made_up' }), false);
  const event = { contract: 'run_event', schema_version: '1.0', run_id: 'r', sequence: 1,
    created_at: '2026-09-19T12:00:00Z', event_type: 'accepted', run_revision: 1, state: 'queued',
    action_id: null, question_id: null, artifact_ids: [], summary: null };
  assert.equal(validateRunEvents([event]), true);
  assert.equal(validateRunEvents([{ ...event, sequence: 0 }]), false);
  assert.equal(validateRunEvents([{ ...event, claim_token: 1 }]), false);
});

test('B09 pages are bounded and reject private worker fields', () => {
  const job = { id: 'j', project_id: 'p', kind: 'failure', state: 'failed', result_id: null,
    error: 'Operation did not complete', created_at: '2026-09-19T12:00:00Z', started_at: null,
    finished_at: null, error_code: 'WORKER_INTERRUPTED', retry_of_job_id: null, deadline_at: null, external_receipt: {
      external_id: 'j', connector: 'sciml-workbench', state: 'unknown', request_sha256: 'a'.repeat(64),
      body_sha256: 'b'.repeat(64), attempts: 1, submitted_at: '2026-09-19T12:00:00Z',
      external_project_id: 'remote', external_record_id: null, artifact_id: null, reconciliation_required: true,
    } };
  assert.equal(validateJobDetail(job), true);
  assert.equal(validateJobDetail({ ...job, claim_token: 9 }), false);
  assert.equal(validateJobPage({ items: [job], next_cursor: null }), true);
  assert.equal(validateJobPage({ items: Array(101).fill(job), next_cursor: null }), false);
  const summary = { id: 'a', project_id: 'p', kind: 'audit', schema_version: '1.0', created_at: job.created_at };
  assert.equal(validateArtifactPage({ items: [summary], next_cursor: null }), true);
  assert.equal(validateArtifactPage({ items: [{ ...summary, payload: {} }], next_cursor: null }), false);
});

test('C12 evaluation projections reject opaque outputs and expose only named scalar metrics', () => {
  const view = { artifact_id: 'benchmark', protocol_id: 'protocol', status: 'succeeded', model: 'ridge', seed: 7,
    metrics: { validation: { rmse: 1.25 } }, test_visible: false,
    evaluation: { protocol_id: 'protocol', state: 'sealed', exploratory: false, clean_holdout_eligible: true,
      exposure_status: 'unexposed', exposure_event_ids: [], limitation: 'Full-run outputs are quarantined.' } };
  assert.equal(validateEvaluationView(view), true);
  assert.equal(validateEvaluationView({ ...view, predictions: [99] }), false);
  assert.equal(validateEvaluationView({ ...view, bundle_key: 'a'.repeat(64) }), false);
  assert.equal(validateEvaluationView({ ...view, metrics: { validation: { unreviewed_field: 99 } } }), false);
});

const fixtures = JSON.parse(await readFile(new URL('../../backend/tests/fixtures/contracts/legacy-v1.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(await readFile(new URL('../../contracts/catalog.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: true });
ajv.addKeyword('discriminator');
addFormats(ajv);
ajv.addSchema(catalog);

test('intake accepts unresolved Dataset 2.0 without changing the legacy boundary', () => {
  const data = { ...fixtures[0], schema_version: '2.0', source: {},
    unresolved_fields: ['citation', 'url', 'license', 'data_kind', 'transformations', 'units', 'target', 'independent_unit'] };
  for (const field of data.unresolved_fields) data.source[field] = { origin: 'unknown', value: null, supporting_references: [], uncertainty: null };
  assert.equal(validateIntakeArtifact(data), true);
  assert.equal(validateArtifactsResponse([data, ...fixtures]), true);
  assert.equal(validateLegacyArtifact(data), false);
  assert.equal(validateIntakeArtifact({ ...data, schema_version: '3.0' }), false);
  assert.equal(validateMaterialResponse({ id: 'material', project_id: 'p', filename: 'source.pdf',
    media_type: 'application/pdf', sha256: 'a'.repeat(64), dataset_id: null }), true);
});

test('all eight legacy payloads pass the generated browser validators unchanged', () => {
  const original = structuredClone(fixtures);
  assert.equal(validateArtifactsResponse(fixtures), true);
  for (const fixture of fixtures) assert.equal(validateLegacyArtifact(fixture), true, fixture.kind);
  assert.deepEqual(fixtures, original);
});

test('C07 reads Failure 2.0 with confirmed receipt and preserves the legacy reader', () => {
  const value = { kind: 'failure', schema_version: '2.0', id: 'outcome', project_id: 'p',
    created_at: '2026-09-19T12:00:00Z', parents: ['benchmark'], software: {},
    benchmark_id: 'benchmark', source_job_id: 'source-job', reason: 'Observed runtime interruption',
    uncertainty_notes: 'No scientific conclusion', causal_hypotheses: [],
    actor: { kind: 'human', operator_session_reference: 'opaque-reference' },
    observation: { kind: 'execution_failure', error_code: 'JOB_TIMED_OUT', observed_error: 'Deadline exceeded' },
    receipt: { connector: 'sciml-workbench', external_id: 'import-job', request_sha256: 'a'.repeat(64),
      state: 'confirmed', external_project_id: 'remote', external_record_id: 'record', record: {} } };
  assert.equal(validateIntakeArtifact(value), true);
  assert.equal(validateArtifactsResponse([...fixtures, value]), true);
  assert.equal(validateLegacyArtifact(value), false);
  assert.equal(validateIntakeArtifact({ ...value, receipt: { ...value.receipt, state: 'unknown' } }), false);
  assert.equal(validateIntakeArtifact({ ...value, observation: { ...value.observation, error_code: 'RUN_CANCELLED' } }), false);
});

test('browser boundary rejects missing fields and unrecognized versions', () => {
  for (const patch of [{ schema_version: '2.0' }, { kind: 'invented' }, { rows: '3' }, { secret: 'unexpected' }]) {
    assert.equal(validateLegacyArtifact({ ...fixtures[0], ...patch }), false);
  }
  const missing = { ...fixtures[0] };
  delete missing.id;
  assert.equal(validateLegacyArtifact(missing), false);
  assert.equal(validateArtifactsResponse({ artifacts: fixtures }), false);
  assert.equal(validateArtifactsResponse(null), false);
  assert.equal(validateProjectsResponse([{ id: 'p', name: 'Project', description: '' }]), true);
  assert.equal(validateProjectsResponse([{ id: 'p', name: 'Project' }]), false);
});

test('failed jobs retain nullable results and strict states without invented zero values', () => {
  const job = { id: 'job', project_id: 'p', kind: 'benchmark', state: 'failed', result_id: 'failed-artifact',
    error: 'Admission rejected', created_at: '2026-09-19T12:00:00Z', started_at: null, finished_at: '2026-09-19T12:01:00Z' };
  assert.equal(validateLegacyJobResponse(job), true);
  assert.equal(validateLegacyJobResponse({ ...job, state: 'done' }), false);
  assert.equal(validateLegacyJobResponse({ ...job, result_id: 0 }), false);
  assert.equal(validateLegacyJobResponse({ ...job, claim_token: 'private' }), false);
});

test('new schemas reject malformed declarations and actor mixing structurally', () => {
  const source = ajv.getSchema(`${catalog.$id}#/$defs/SourceDeclarations`);
  assert.ok(source);
  assert.equal(source({ data_kind: { origin: 'unknown', value: 'synthetic' } }), false);
  assert.equal(source({ data_kind: { origin: 'user_supplied', value: null, supporting_references: [] } }), false);
  const actor = ajv.getSchema(`${catalog.$id}#/$defs/HumanActor`);
  assert.equal(actor({ kind: 'human', operator_session_reference: 'opaque-reference' }), true);
  assert.equal(actor({ kind: 'human', operator_session_reference: 'opaque-reference', run_id: 'agent-run' }), false);
});

test('published schema references resolve and available evidence needs actual locator fields', () => {
  const evidence = ajv.getSchema(`${catalog.$id}#/$defs/AvailableEvidenceReference`);
  assert.ok(evidence);
  assert.equal(evidence({ availability: 'available', source_artifact_id: 'paper' }), false);
  const tool = ajv.getSchema(`${catalog.$id}#/$defs/ToolResponse`);
  assert.equal(tool({ action_id: 'a', attempt_id: 'attempt', outcome: { status: 'submitted' } }), false);
  assert.equal(tool({ action_id: 'a', attempt_id: 'attempt', outcome: { status: 'submitted', job_id: 'j' } }), true);
  const versioned = ajv.getSchema(`${catalog.$id}#/$defs/VersionedArtifact`);
  for (const fixture of fixtures) {
    assert.equal(versioned(fixture), true);
    const { schema_version, ...missingVersion } = fixture;
    assert.equal(versioned(missingVersion), false);
  }
});

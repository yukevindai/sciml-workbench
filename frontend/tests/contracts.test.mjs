import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  validateArtifactsResponse, validateLegacyArtifact, validateLegacyJobResponse,
  validateProjectsResponse,
  validateIntakeArtifact, validateMaterialResponse,
} from '../app/lib/generated/validators.cjs';

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

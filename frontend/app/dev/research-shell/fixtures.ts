import type { DatasetArtifact } from '../../lib/types';
import type { ShellFixture } from '../../lib/shell-fixture';
import { parseArtifacts, parseJobPage, parseProjects } from '../../lib/decode';

const unknown = { origin: 'unknown', value: null, supporting_references: [], uncertainty: null } as const;
const dataset = {
  schema_version: '2.0', kind: 'dataset', id: 'fixture-dataset', project_id: 'fixture-project',
  created_at: '2026-09-23T12:00:00Z', parents: [], software: {}, filename: 'sample.csv',
  blob_key: '0'.repeat(64), sha256: '0'.repeat(64), rows: 12, columns: ['feature', 'target'],
  source: {
    citation: { ...unknown, supporting_references: [] }, url: { ...unknown, supporting_references: [] },
    license: { ...unknown, supporting_references: [] }, data_kind: { ...unknown, supporting_references: [] },
    transformations: { ...unknown, supporting_references: [] }, units: { ...unknown, supporting_references: [] },
    target: { ...unknown, supporting_references: [] }, independent_unit: { ...unknown, supporting_references: [] },
  },
  unresolved_fields: ['citation', 'url', 'license', 'data_kind', 'transformations', 'units', 'target', 'independent_unit'],
} satisfies DatasetArtifact;

const sample = {
  projects: [{ id: 'fixture-project', name: 'Development sample project', description: 'Synthetic UI fixture. No scientific work has run.' }],
  artifacts: [dataset], jobs: [],
} satisfies ShellFixture;

export function shellFixture(empty: boolean): ShellFixture {
  const value = empty ? { projects: [], artifacts: [], jobs: [] } : sample;
  return { projects: parseProjects(value.projects), artifacts: parseArtifacts(value.artifacts), jobs: parseJobPage({ items: value.jobs, next_cursor: null }).items };
}

import type { DatasetArtifact, SourceMetadata } from './types';
import type { IndependentUnit } from './generated/http';
import { sourceDefault } from './defaults';

/** Exact LF repository bytes and Git's CRLF checkout of examples/demo.csv. */
const DEMO_DIGESTS = new Set([
  '69442b300c036ecf17f4fb60b323ed2771316829bc55eaa1290a18654ebf0a99',
  'aa0e1db7ba154779d11787120c4ea7dd87aab22d8a8fbd1e4a5b1446507afe3c',
]);
export const isBundledDemo = (digest: string): boolean => DEMO_DIGESTS.has(digest);
export type SourceDraft = Omit<SourceMetadata, 'data_kind' | 'transformations'> & {
  data_kind: SourceMetadata['data_kind'] | '';
  transformations: string | string[];
  target?: string;
  units?: Record<string, string>;
  independent_unit?: IndependentUnit;
};

export const emptySource = (): SourceDraft => ({ citation: '', url: '', license: '', data_kind: '', transformations: '' });
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonblank = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && value.length <= 4000;

/** Validate the editor shape before it can enter React form state. The server remains authoritative. */
export function parseSourceDraft(value: unknown): SourceDraft {
  if (!object(value)) throw new Error('Source metadata must be a JSON object.');
  const allowed = ['citation', 'url', 'license', 'data_kind', 'transformations', 'target', 'units', 'independent_unit'];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Use only the supported source metadata fields.');
  for (const key of ['citation', 'url', 'license']) {
    if (typeof value[key] !== 'string' || value[key].length > 4000) throw new Error(`${key} must be a string of at most 4,000 characters; use an empty string for unknown.`);
  }
  if (!['', 'empirical', 'synthetic'].includes(value.data_kind as string)) throw new Error('data_kind must be empty, empirical, or synthetic.');
  if (!(typeof value.transformations === 'string' && value.transformations.length <= 4000)
    && !(Array.isArray(value.transformations) && value.transformations.every(nonblank))) {
    throw new Error('transformations must be text or an array of nonblank strings. An empty array explicitly declares no transformations.');
  }
  if (value.target !== undefined && !nonblank(value.target)) throw new Error('target must be a nonblank column name; omit it if unknown.');
  if (value.units !== undefined && (!object(value.units) || !Object.keys(value.units).length
    || !Object.entries(value.units).every(([key, unit]) => nonblank(key) && nonblank(unit)))) {
    throw new Error('units must map column names to nonblank unit strings; omit it if unknown.');
  }
  if (value.independent_unit !== undefined) {
    const unit = value.independent_unit;
    if (!object(unit) || Object.keys(unit).some(key => !['name', 'group_columns', 'rationale'].includes(key))
      || !nonblank(unit.name) || !nonblank(unit.rationale) || !Array.isArray(unit.group_columns)
      || !unit.group_columns.length || !unit.group_columns.every(nonblank)) {
      throw new Error('independent_unit requires a name, nonempty group_columns array, and rationale.');
    }
  }
  return value as SourceDraft;
}

export function sourceDeclarations(source: SourceDraft, requestKey: string) {
  return Object.fromEntries(Object.entries(parseSourceDraft(source))
    .filter(([, value]) => typeof value !== 'string' || Boolean(value.trim()))
    .map(([name, value]) => [name, {
      origin: 'user_supplied',
      value: name === 'transformations' && typeof value === 'string' ? [value] : value,
      supporting_references: [{ kind: 'operator_assertion', id: requestKey }],
    }]));
}

export function reusableSource(dataset: DatasetArtifact): SourceDraft {
  if (dataset.schema_version === '1.0') return { ...dataset.source };
  const values = Object.fromEntries(Object.entries(dataset.source)
    .filter(([, declaration]) => declaration.origin === 'user_supplied' || declaration.origin === 'source_derived')
    .map(([key, declaration]) => [key, declaration.value]));
  return parseSourceDraft({ ...emptySource(), ...values });
}

export function isDemoSource(dataset: DatasetArtifact): boolean {
  return isBundledDemo(dataset.sha256) || reusableSource(dataset).citation === sourceDefault.citation;
}

export async function fileDigest(file: File): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** JSON values travel in a legacy header; escaping keeps non-Latin metadata valid in Headers. */
export function sourceHeader(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

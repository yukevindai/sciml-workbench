import { expect, test, type Page, type Route } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { shellFixture } from '../app/dev/research-shell/fixtures';
import { kinds, type Artifact } from '../app/lib/types';
import { emptySource, isBundledDemo, parseSourceDraft, sourceDeclarations } from '../app/lib/intake';
import { validateArtifactsResponse } from '../app/lib/generated/validators.cjs';

const project = { id: 'project', name: 'Intake study', description: '' };
const other = { id: 'other', name: 'Other study', description: '' };
const csv = { name: 'input.csv', mimeType: 'text/csv', buffer: Buffer.from('x,y\n1,2\n2,3\n3,4\n') };
const material = { id: 'material', project_id: project.id, filename: csv.name, media_type: 'text/csv', sha256: 'a'.repeat(64), dataset_id: 'dataset' };
const baseDataset = { ...kinds(shellFixture(false).artifacts, 'dataset')[0], project_id: project.id };

async function workspace(page: Page, override: (route: Route, pathname: string) => Promise<boolean>, artifacts: Artifact[] = []) {
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (await override(route, pathname)) return;
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation ${pathname}`);
    await route.fulfill({ json: pathname === '/api/projects' ? [project, other]
      : pathname === '/api/projects/project/artifacts' ? artifacts : [] });
  });
}

test('project validation retains the name and research question through a rejected request', async ({ page }) => {
  let submissions = 0;
  await workspace(page, async (route, pathname) => {
    if (pathname !== '/api/projects' || route.request().method() !== 'POST') return false;
    submissions += 1;
    await route.fulfill(submissions === 1
      ? { status: 422, json: { detail: [{ loc: ['body', 'name'], msg: 'Choose another project name' }] } }
      : { json: { id: 'created', name: 'My study', description: 'My question' } });
    return true;
  });
  await page.goto('/projects');
  await page.getByLabel('Project name', { exact: true }).fill('   ');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByText('Enter a project name; spaces alone are not a name.')).toBeVisible();
  expect(submissions).toBe(0);
  await page.getByLabel('Project name', { exact: true }).fill('My study');
  await page.getByLabel('Research question', { exact: true }).fill('My question');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('name: Choose another project name');
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('My study');
  await expect(page.getByLabel('Research question', { exact: true })).toHaveValue('My question');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByLabel('Active project', { exact: true })).toHaveValue('created');
  await expect(page.getByRole('link', { name: 'Attach a source PDF', exact: true })).toBeVisible();
});

test('advanced source validation preserves invalid JSON and server-rejected input', async ({ page }) => {
  const sent: Record<string, string>[] = [];
  await workspace(page, async (route, pathname) => {
    if (!pathname.endsWith('/research-materials') || route.request().method() !== 'POST') return false;
    sent.push(route.request().headers());
    await route.fulfill(sent.length === 1 ? { status: 422, json: { detail: 'Source declarations do not match the CSV columns' } } : { json: material });
    return true;
  });
  await page.goto('/dataset-audit');
  await page.getByLabel('CSV file').setInputFiles(csv);
  await page.getByText('Advanced — edit source metadata as JSON', { exact: true }).click();
  const editor = page.getByLabel('Source metadata (JSON)', { exact: true });
  for (const invalid of ['null', '[]', '{"citation": 7}', '{']) {
    await editor.fill(invalid);
    await editor.blur();
    await expect(editor).toHaveValue(invalid);
    await expect(page.getByRole('button', { name: 'Upload dataset' })).toBeDisabled();
  }
  const source = { ...emptySource(), citation: '研究 dataset', target: 'missing', units: { x: 'kelvin' } };
  await editor.fill(JSON.stringify(source));
  await page.getByRole('button', { name: 'Upload dataset' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('do not match');
  await expect(page.getByLabel('Citation', { exact: true })).toHaveValue('研究 dataset');
  expect(await page.getByLabel('CSV file').evaluate((input: HTMLInputElement) => input.files?.[0].name)).toBe(csv.name);
  await page.getByRole('button', { name: 'Upload dataset' }).click();
  await expect(page.getByRole('status')).toContainText('Dataset uploaded');
  expect(sent[1]['idempotency-key']).toBe(sent[0]['idempotency-key']);
  expect(JSON.parse(sent[0]['x-source']).citation.value).toBe('研究 dataset');
  expect(JSON.parse(sent[0]['x-source']).target.value).toBe('missing');
});

test('a demo filename is insufficient and project changes clear attachment declarations', async ({ page }) => {
  await workspace(page, async () => false);
  await page.goto('/dataset-audit');
  await page.getByLabel('CSV file').setInputFiles({ ...csv, name: 'demo.csv' });
  const demo = page.getByRole('button', { name: 'Use bundled synthetic demo declarations' });
  await expect(demo).toBeDisabled();
  await page.getByLabel('CSV file').setInputFiles(path.resolve(__dirname, '../../examples/demo.csv'));
  await demo.click();
  await expect(page.getByLabel('Kind of data', { exact: true })).toHaveValue('synthetic');
  await page.getByLabel('Active project', { exact: true }).selectOption(other.id);
  await expect(page.getByLabel('Citation', { exact: true })).toHaveValue('');
  expect(await page.getByLabel('CSV file').evaluate((input: HTMLInputElement) => input.files?.length)).toBe(0);
});

test('metadata reuse is explicit and excludes inferred values and demo assertions for unrelated files', async ({ page }) => {
  const citation = { origin: 'user_supplied' as const, value: 'Known source', supporting_references: [{ kind: 'operator_assertion' as const, id: 'old' }], uncertainty: null };
  const known = { ...baseDataset, id: 'known', schema_version: '2.0' as const,
    source: { ...kinds(shellFixture(false).artifacts, 'dataset')[0].source, citation,
      license: { origin: 'inferred' as const, value: 'CC0-1.0', supporting_references: [{ kind: 'artifact', id: 'source' }], uncertainty: 'Unverified', rationale: 'A guess', confidence: null },
      transformations: { ...citation, value: [] } },
    unresolved_fields: ['url', 'data_kind', 'units', 'target', 'independent_unit'],
  } as Artifact;
  const demo = { ...baseDataset, id: 'demo', blob_key: 'aa0e1db7ba154779d11787120c4ea7dd87aab22d8a8fbd1e4a5b1446507afe3c', sha256: 'aa0e1db7ba154779d11787120c4ea7dd87aab22d8a8fbd1e4a5b1446507afe3c' };
  expect(validateArtifactsResponse([known, demo]), JSON.stringify((validateArtifactsResponse as unknown as { errors: unknown }).errors)).toBe(true);
  let sent: Record<string, { origin: string; value: unknown }> = {};
  await workspace(page, async (route, pathname) => {
    if (!pathname.endsWith('/research-materials') || route.request().method() !== 'POST') return false;
    sent = JSON.parse(route.request().headers()['x-source']);
    await route.fulfill({ json: material }); return true;
  }, [known, demo]);
  await page.goto('/dataset-audit');
  await page.getByLabel('CSV file').setInputFiles(csv);
  await expect(page.getByLabel('Citation', { exact: true })).toHaveValue('');
  await page.getByText('Reuse known metadata from this project', { exact: true }).click();
  await expect(page.getByLabel('Metadata from dataset').locator('option[value="demo"]')).toHaveCount(0);
  await page.getByLabel('Metadata from dataset').selectOption('known');
  await expect(page.getByLabel('Citation', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Copy known metadata' }).click();
  await expect(page.getByLabel('Citation', { exact: true })).toHaveValue('Known source');
  await expect(page.getByLabel('Licence', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Upload dataset' }).click();
  await expect(page.getByRole('status')).toContainText('Dataset uploaded');
  expect(sent.citation).toMatchObject({ origin: 'user_supplied', value: 'Known source' });
  expect(sent.transformations.value).toEqual([]);
  expect(sent.license).toBeUndefined();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.panel').first().screenshot({ path: 'test-results/a02-csv-mobile.png' });
});

test('PDF originals survive failed extraction requests and both retries retain their keys', async ({ page }) => {
  const pdf = { ...material, filename: 'paper.pdf', media_type: 'application/pdf', dataset_id: null };
  const uploads: string[] = [];
  const extractions: string[] = [];
  let attached = false;
  await workspace(page, async (route, pathname) => {
    const request = route.request();
    if (pathname.endsWith('/research-materials')) {
      if (request.method() === 'GET') { await route.fulfill({ json: attached ? [pdf] : [] }); return true; }
      uploads.push(request.headers()['idempotency-key']);
      attached = true;
      await route.fulfill(uploads.length === 1 ? { status: 503, json: { detail: 'Response lost' } } : { json: pdf });
      return true;
    }
    if (pathname.endsWith('/ingest')) {
      extractions.push(request.headers()['idempotency-key']);
      await route.fulfill(extractions.length === 1 ? { status: 503, json: { detail: 'Worker admission interrupted' } } : { json: {
        id: 'ingest', project_id: project.id, kind: 'evidence', state: 'queued', result_id: null, error: null,
        created_at: '2026-09-23T12:00:00Z', started_at: null, finished_at: null,
      } }); return true;
    }
    return false;
  });
  await page.goto('/evidence');
  await page.getByLabel('PDF file').setInputFiles({ name: 'wrong.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') });
  await page.getByRole('button', { name: 'Attach PDF', exact: true }).click();
  await expect(page.getByText(/This file does not have a PDF header/)).toBeVisible();
  expect(uploads).toHaveLength(0);
  await page.getByLabel('PDF file').setInputFiles({ name: 'paper.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n original bytes') });
  await page.getByRole('button', { name: 'Attach PDF', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Response lost');
  await page.getByRole('button', { name: 'Attach PDF', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Download original PDF' })).toHaveAttribute('href', '/api/projects/project/research-materials/material/download');
  expect(uploads[1]).toBe(uploads[0]);
  expect(extractions).toHaveLength(0);
  await page.getByRole('button', { name: 'Extract text', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Worker admission interrupted');
  await expect(page.getByRole('link', { name: 'Download original PDF' })).toBeVisible();
  await page.getByRole('button', { name: 'Extract text', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Extraction accepted' })).toBeDisabled();
  expect(extractions[1]).toBe(extractions[0]);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Download original PDF' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({ path: 'test-results/a02-pdf-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/a02-pdf-mobile-dark.png', fullPage: true });
});

test('source draft parser rejects malformed values and preserves explicitly empty transformation lists', () => {
  for (const value of [null, [], { ...emptySource(), units: [] }, { ...emptySource(), independent_unit: {} }, { ...emptySource(), citation: {} }, { ...emptySource(), unsupported: true }]) {
    expect(() => parseSourceDraft(value)).toThrow();
  }
  expect(sourceDeclarations({ ...emptySource(), transformations: [] }, 'key').transformations.value).toEqual([]);
});

test('demo fingerprints cover LF and CRLF checkouts but reject changed data', () => {
  const lf = readFileSync(path.resolve(__dirname, '../../examples/demo.csv'), 'utf8').replaceAll('\r\n', '\n');
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  expect(isBundledDemo(hash(lf))).toBe(true);
  expect(isBundledDemo(hash(lf.replaceAll('\n', '\r\n')))).toBe(true);
  expect(isBundledDemo(hash(lf + 'changed'))).toBe(false);
});

import { selectPicker } from './picker';
import { expect, test, type Page, type Route } from '@playwright/test';
import { jobPage } from './job-page';
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
      : pathname === '/api/projects/project/artifact-previews' ? artifacts : pathname.endsWith('/job-index') ? jobPage() : [] });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sciml-theme', 'light'));
});

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
  await expect(page.getByLabel('Active project', { exact: true })).toHaveAttribute('value', 'created');
  await expect(page.getByRole('link', { name: 'Ask your research group', exact: true })).toHaveAttribute('href', '/ask');
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

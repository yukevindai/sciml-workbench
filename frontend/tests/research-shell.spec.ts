import { expect, test, type Page, type Route } from '@playwright/test';
import { shellFixture } from '../app/dev/research-shell/fixtures';
import { kinds } from '../app/lib/types';

const sample = shellFixture(false);
const project = sample.projects[0];
const dataset = kinds(sample.artifacts, 'dataset')[0];
const second = { id: 'second-project', name: 'Second study', description: 'An independent project.' };

async function mockWorkspace(page: Page, override?: (route: Route, path: string) => Promise<boolean>) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (override && await override(route, path)) return;
    if (route.request().method() !== 'GET') throw new Error('Shell must not submit work');
    const body = path === '/api/projects' ? [project, second]
      : path === `/api/projects/${project.id}/artifact-previews` ? [dataset]
      : [];
    await route.fulfill({ json: body });
  });
}

test('research is the entry point and all eight manual views remain reachable', async ({ page }) => {
  await mockWorkspace(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Research', exact: true })).toBeVisible();
  await expect(page.getByLabel('Active project', { exact: true })).toHaveValue(project.id);
  await expect(page.getByLabel('Active dataset', { exact: true })).toHaveValue(dataset.id);
  await expect(page.getByText('Unresolved declarations:')).toBeVisible();
  await expect(page.getByRole('button', { name: /Run research|Review plan|Pause|Resume|Cancel/ })).toHaveCount(0);
  const nav = page.getByRole('navigation', { name: 'Workbench sections' });
  for (const label of ['Research', 'Projects', 'Dataset audit', 'Split designer', 'Benchmarks', 'Failure memory', 'Evidence', 'Provenance', 'Reports']) {
    await expect(nav.getByRole('link', { name: label, exact: true })).toHaveCount(1);
  }
  await nav.getByRole('link', { name: 'Evidence', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evidence', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Research', exact: true })).toBeVisible();
});

test('loading does not masquerade as an empty workspace; errors can be retried', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let attempts = 0;
  await mockWorkspace(page, async (route, path) => {
    if (path !== '/api/projects') return false;
    attempts += 1;
    if (attempts === 1) {
      await gate;
      await route.fulfill({ status: 503, json: { detail: 'Temporary outage' } });
    } else await route.fulfill({ json: [] });
    return true;
  });
  await page.goto('/research');
  await expect(page.getByRole('status')).toHaveText('Loading workspace…');
  await expect(page.getByRole('heading', { name: 'Start with a project' })).toHaveCount(0);
  release();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Temporary outage');
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await expect(page.getByRole('heading', { name: 'Start with a project' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await page.getByRole('link', { name: 'Create a project', exact: true }).click();
  await expect(page.getByLabel('Project name', { exact: true })).toBeVisible();
});

test('project loading and retry reject malformed data before rendering it', async ({ page }) => {
  let good = false;
  await mockWorkspace(page, async (route, path) => {
    if (!path.endsWith('/artifact-previews')) return false;
    await route.fulfill({ json: good ? [] : [{ ...dataset, schema_version: '999.0' }] });
    return true;
  });
  await page.goto('/research');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('invalid or unsupported response');
  await expect(page.getByRole('heading', { name: 'No dataset attached' })).toHaveCount(0);
  good = true;
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await expect(page.getByRole('heading', { name: 'No dataset attached' })).toBeVisible();
});

test('late project responses cannot replace a newly selected project', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await mockWorkspace(page, async (route, path) => {
    if (path !== `/api/projects/${project.id}/artifact-previews`) return false;
    started = true;
    await gate;
    await route.fulfill({ json: [dataset] });
    return true;
  });
  await page.goto('/research');
  await expect.poll(() => started).toBe(true);
  await expect(page.getByRole('status')).toHaveText('Loading project data…');
  await page.getByLabel('Active project', { exact: true }).selectOption(second.id);
  await expect(page.getByRole('heading', { name: second.name })).toBeVisible();
  const lateResponse = page.waitForResponse(response => response.url().endsWith(`/projects/${project.id}/artifact-previews`));
  release();
  await lateResponse;
  await expect(page.getByLabel('Active dataset', { exact: true })).toBeDisabled();
  await expect(page.getByText(dataset.filename, { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Active project', { exact: true })).toHaveValue(second.id);
  await expect(page.getByRole('heading', { name: 'No dataset attached' })).toBeVisible();
});

test('dataset selection survives navigation and refresh and is scoped by project', async ({ page }) => {
  const another = { ...dataset, id: 'another-dataset', filename: 'another.csv' };
  await mockWorkspace(page, async (route, path) => {
    if (path !== `/api/projects/${project.id}/artifact-previews`) return false;
    await route.fulfill({ json: [dataset, another] });
    return true;
  });
  await page.goto('/research');
  await page.getByLabel('Active dataset', { exact: true }).selectOption(dataset.id);
  await page.getByRole('navigation').getByRole('link', { name: 'Projects', exact: true }).click();
  await expect(page.getByLabel('Active dataset', { exact: true })).toHaveValue(dataset.id);
  await page.reload();
  await expect(page.getByLabel('Active dataset', { exact: true })).toHaveValue(dataset.id);
  await page.getByLabel('Active project', { exact: true }).selectOption(second.id);
  await expect(page.getByLabel('Active dataset', { exact: true })).toHaveValue('');
});

test('a polling outage retains the last validated project data and clears on retry', async ({ page }) => {
  let outage = false;
  await mockWorkspace(page, async (route, path) => {
    if (!outage || !path.endsWith('/artifact-previews')) return false;
    await route.fulfill({ status: 503, json: { detail: 'Connection lost' } });
    return true;
  });
  await page.goto('/research');
  await expect(page.getByText(dataset.filename, { exact: true })).toBeVisible();
  outage = true;
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Previously loaded data remains visible.');
  await expect(page.getByText(dataset.filename, { exact: true })).toBeVisible();
  outage = false;
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('foreign project payloads are rejected and queued jobs are not called running', async ({ page }) => {
  let foreign = true;
  await mockWorkspace(page, async (route, path) => {
    if (path.endsWith('/artifact-previews')) {
      await route.fulfill({ json: [{ ...dataset, project_id: foreign ? second.id : project.id }] });
      return true;
    }
    if (path.endsWith('/jobs')) {
      await route.fulfill({ json: [{ id: 'queued-job', project_id: project.id, kind: 'audit', state: 'queued',
        result_id: null, error: null, created_at: '2026-09-23T12:00:00Z', started_at: null, finished_at: null }] });
      return true;
    }
    return false;
  });
  await page.goto('/research');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('different project');
  await expect(page.getByText(dataset.filename, { exact: true })).toHaveCount(0);
  foreign = false;
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await expect(page.getByText('queued', { exact: true })).toBeVisible();
  await expect(page.getByText('1 running', { exact: true })).toHaveCount(0);
});

test('mobile navigation and skip link work by keyboard in both themes', async ({ page }) => {
  await mockWorkspace(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/research');
  await expect(page.getByRole('heading', { name: project.name })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  const audit = page.getByRole('navigation').getByRole('link', { name: 'Dataset audit', exact: true });
  await audit.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Dataset audit', exact: true })).toBeVisible();
  await page.goto('/research');
  await expect(page.getByRole('heading', { name: project.name })).toBeVisible();
  for (const theme of ['dark', 'light']) {
    await page.getByRole('button', { name: `Switch to ${theme} theme` }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/a01-mobile-${theme}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/a01-desktop.png', fullPage: true });
});

test('fixtures are development-only, visibly synthetic, and never call the API', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) calls.push(request.url()); });
  const response = await page.goto('/dev/research-shell');
  if (!process.env.E2E_DEV_PREVIEW) {
    expect(response?.status()).toBe(404);
    await expect(page.getByText('Development sample project', { exact: true })).toHaveCount(0);
    return;
  }
  expect(response?.status()).toBe(200);
  await expect(page.getByText('Development-only fixture preview')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Development sample project' })).toBeVisible();
  await expect(page.getByText('partially completed', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Active project', { exact: true })).toBeDisabled();
  await page.goto('/dev/research-shell?state=empty');
  await expect(page.getByRole('heading', { name: 'Start with a project' })).toBeVisible();
  expect(calls).toEqual([]);
});

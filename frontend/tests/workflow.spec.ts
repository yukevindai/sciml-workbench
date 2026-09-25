import { test, expect } from '@playwright/test';
import path from 'node:path';
const examples = path.resolve(__dirname, '../../examples');
test('real CSV → audit → split → baseline → failure memory → report', async ({ page }) => {
  await page.goto('/projects');
  await page.getByLabel('Project name', { exact: true }).fill('Browser workflow');
  await page.getByLabel('Research question').fill('Do synthetic families remain disjoint?');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Project created');
  await page.getByRole('link', { name: 'Dataset audit', exact: true }).click();
  await page.getByLabel('CSV file').setInputFiles(path.join(examples, 'demo.csv'));
  await page.getByRole('button', { name: 'Use bundled synthetic demo declarations' }).click();
  await page.getByRole('button', { name: 'Upload dataset' }).click();
  await expect(page.getByRole('status')).toContainText('Dataset uploaded');
  await page.getByRole('button', { name: 'Run audit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Audit findings' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('link', { name: 'Split designer', exact: true }).click();
  await page.getByRole('button', { name: 'Generate partition' }).click();
  await expect(page.locator('.partition-bar')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.row-grid span')).toHaveCount(60);
  await page.getByRole('link', { name: 'Benchmarks', exact: true }).click();
  await page.getByRole('button', { name: 'Run benchmark', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ridge baseline' })).toBeVisible({ timeout: 45000 });
  await expect(page.locator('.result .badge')).toHaveText('succeeded');
  await page.getByRole('link', { name: 'Failure memory', exact: true }).click();
  // A07: the assessed run is chosen explicitly; nothing is preselected.
  await page.getByLabel('Benchmark run').selectOption({ index: 1 });
  await page.getByLabel('Why was this run unsuccessful?').fill('The toy model is not an empirical result.');
  await page.getByLabel('Uncertainty and limits').fill('Synthetic software fixture; no physical outcome.');
  await page.getByRole('button', { name: 'Save to Failure Memory' }).click();
  await expect(page.getByRole('heading', { name: 'The toy model is not an empirical result.' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  // A08: export freezes the project; the archive opens from its export job.
  await expect(page.getByRole('button', { name: 'Export project' })).toBeEnabled({ timeout: 30000 });
  await page.getByRole('button', { name: 'Export project' }).click();
  await page.getByRole('link', { name: 'Inspect archive' }).first().click({ timeout: 60000 });
  await expect(page.getByRole('link', { name: 'Download ZIP' })).toBeVisible({ timeout: 30000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download ZIP' }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/^report-.*\.zip$/);
  await page.getByRole('link', { name: 'Provenance', exact: true }).click();
  await expect(page.locator('.lineage')).not.toHaveCount(0);
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await page.screenshot({ path: '/tmp/sciml-workbench-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/sciml-workbench-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('server proxy rejects cross-origin mutations and keeps tokens out of HTML', async ({ page, request }) => {
  const rejected = await request.post('/api/projects', { headers: { Origin: 'https://untrusted.example' }, data: { name: 'forged' } });
  expect(rejected.status()).toBe(403);
  await page.goto('/');
  const html = await page.content();
  expect(html).not.toContain('WB_API_TOKEN');
  expect(html).not.toContain(process.env.WB_API_TOKEN || 'workbench-test-secret-that-must-not-appear');
});


test('hosted password gate covers pages, data and downloads', async ({ playwright }) => {
  test.skip(!process.env.WB_LOGIN_PASSWORD, 'Enable hosted login environment variables');
  // This test only runs when WB_LOGIN_PASSWORD is set, which is also when the
  // config supplies use.httpCredentials. Contexts made from the playwright
  // fixture inherit those, so the credentials have to be cleared explicitly or
  // this "anonymous" client is signed in and every gated URL answers 200.
  const anonymous = await playwright.request.newContext({
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    httpCredentials: undefined,
  });
  for (const url of ['/', '/projects', '/api/projects', '/api/projects/example/artifacts/example/download']) {
    expect((await anonymous.get(url)).status()).toBe(401);
  }
  expect((await anonymous.get('/healthz')).status()).toBe(200);
  const bad = await anonymous.get('/api/projects', { headers: { Authorization: 'Basic ' + Buffer.from('wrong:wrong').toString('base64') } });
  expect(bad.status()).toBe(401);
  await anonymous.dispose();
});

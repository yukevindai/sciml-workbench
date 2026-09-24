import { expect, test, type Page, type Route } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import reports from './fixtures/audit-reports.json';
import { shellFixture } from '../app/dev/research-shell/fixtures';
import { kinds, type Artifact, type AuditArtifact } from '../app/lib/types';
import type { ResearchRun } from '../app/lib/generated/http';
import { parseArtifacts, parseResearchRuns } from '../app/lib/decode';
import { auditFindings } from '../app/lib/result-projections';

const project = { id: 'audit-project', name: 'Audit study', description: '' };
const other = { id: 'other-project', name: 'Other study', description: '' };
const raw = readFileSync(path.resolve(__dirname, '../../backend/tests/fixtures/audit/problematic.csv'));
const sha = createHash('sha256').update(raw).digest('hex');
const dataset = { ...kinds(shellFixture(false).artifacts, 'dataset')[0], id: 'dataset-a', project_id: project.id,
  filename: 'problematic.csv', columns: ['row_id', 'x', 'source'], rows: 4, sha256: sha, blob_key: sha };
const second = { ...dataset, id: 'dataset-b', filename: 'another.csv' };
const audit: AuditArtifact = { id: 'agent-audit', kind: 'audit', schema_version: '1.0', project_id: project.id,
  created_at: '2026-09-23T12:00:00Z', parents: [dataset.id], software: {}, dataset_id: dataset.id,
  config: { numeric_columns: ['x'], bounds: { x: [0, 10] }, provenance_columns: ['source'] }, result: reports.problematic };
const run: ResearchRun = {
  id: 'research-run', project_id: project.id, contract: 'research_run', schema_version: '1.0', created_at: audit.created_at,
  objective: 'Inspect the problematic data', inputs: { material_ids: [], artifact_ids: [dataset.id], conversation_id: null, message_cutoff: null },
  policy: { policy_id: 'policy', revision: 1, sha256: 'a'.repeat(64) }, mode: 'autopilot', state: 'completed', control_revision: 1, plan_revision: 1,
  limits: { model_tokens: 10000, model_requests: 10, tool_calls: 10, coordinator_iterations: 10, specialist_assignments: 2,
    specialist_concurrency: 1, delegation_depth: 1, review_rounds: 1, scientific_attempts: 3, active_seconds: 300,
    transient_retries: 1, finalization_model_tokens: 1000, finalization_scientific_attempts: 1 },
  usage: { billed_token_categories: {}, reserved_tokens: 0, model_requests: 0, tool_calls: 0, scientific_attempts: 1,
    active_seconds: 2, unknown_request_ids: [], cost: { status: 'unknown', reason: 'Test fixture' } },
  open_question_ids: [], result_artifact_ids: [audit.id], continued_from_run_id: null, finished_at: audit.created_at, stop_reason: null,
};
const job = { id: 'audit-job', project_id: project.id, kind: 'audit', state: 'succeeded', result_id: audit.id,
  error: null, created_at: audit.created_at, started_at: audit.created_at, finished_at: audit.created_at };

async function workspace(page: Page, artifacts: Artifact[] = [dataset, audit, second], override?: (route: Route, pathname: string) => Promise<boolean>) {
  parseArtifacts(artifacts); parseResearchRuns([run]);
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (override && await override(route, pathname)) return;
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation: ${pathname}`);
    await route.fulfill({ json: pathname === '/api/projects' ? [project, other]
      : pathname === `/api/projects/${project.id}/artifact-previews` ? artifacts
        : pathname === `/api/projects/${project.id}/jobs` ? [job]
          : pathname === `/api/projects/${project.id}/agent-runs` ? [run] : [] });
  });
}

test('direct audit links choose the owning project and dataset and show real upstream findings', async ({ page }) => {
  await workspace(page);
  await page.addInitScript(() => { localStorage.setItem('sciml-project', 'other-project'); localStorage.setItem('sciml-dataset:audit-project', 'dataset-b'); });
  await page.goto(`/dataset-audit?project=${project.id}&audit=${audit.id}#audit-${audit.id}`);
  await expect(page.getByLabel('Active project', { exact: true })).toHaveValue(project.id);
  await expect(page.getByLabel('Active dataset', { exact: true })).toHaveValue(dataset.id);
  const panel = page.locator(`#audit-${audit.id}`);
  await expect(panel).toBeFocused();
  await expect(panel).toContainText('Audit execution completed · scientific acceptance not assessed');
  await expect(panel).toContainText('out_of_bounds');
  await expect(panel).toContainText('Original CSV SHA-256: ' + sha);
  const finding = reports.problematic.findings.find(value => value.code === 'out_of_bounds')!;
  await expect(panel).toContainText(finding.suggestion);
  await expect(panel).toContainText('Row positions (zero-based): 2');
  await expect(panel).toContainText('No split_column configured.');
  await expect(panel.getByRole('link', { name: 'Download audited CSV' })).toHaveAttribute('href', `/api/projects/${project.id}/artifacts/${dataset.id}/download`);
  await panel.getByText('Effective upstream configuration (including defaults)', { exact: true }).click();
  await expect(panel).toContainText('"check_missing": true');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await panel.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.screenshot({ path: 'test-results/a03-audit-desktop-viewport.png' });
  await panel.screenshot({ path: 'test-results/a03-audit-desktop.png' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.screenshot({ path: 'test-results/a03-audit-mobile-viewport.png' });
  await panel.screenshot({ path: 'test-results/a03-audit-mobile-dark.png' });
});

test('dataset changes clear every previous column choice and advanced draft even with identical columns', async ({ page }) => {
  await workspace(page, [dataset, second]);
  await page.goto('/dataset-audit');
  await page.getByLabel('Dataset', { exact: true }).selectOption(dataset.id);
  await page.getByLabel('Target column', { exact: true }).selectOption('x');
  await page.getByRole('group', { name: 'Numeric columns', exact: true }).getByRole('button', { name: 'x', exact: true }).click();
  await page.getByText('Advanced — edit audit configuration as JSON', { exact: true }).click();
  const editor = page.getByLabel('Audit configuration (JSON)', { exact: true });
  await editor.fill('{');
  await editor.blur();
  await expect(page.getByRole('button', { name: 'Run audit', exact: true })).toBeDisabled();
  await page.getByLabel('Dataset', { exact: true }).selectOption(second.id);
  await expect(page.getByLabel('Target column', { exact: true })).toHaveValue('');
  await expect(page.getByRole('group', { name: 'Numeric columns', exact: true }).getByRole('button', { name: 'x', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Run audit', exact: true })).toBeEnabled();
  await page.getByText('Advanced — edit audit configuration as JSON', { exact: true }).click();
  expect(JSON.parse(await editor.inputValue())).toEqual({ target_column: null, numeric_columns: [], feature_columns: [], provenance_columns: [] });
});

test('manual configuration rejects malformed JSON, stale columns and overlap while preserving advanced options', async ({ page }) => {
  const submissions: unknown[] = [];
  await workspace(page, [dataset], async (route, pathname) => {
    if (!pathname.endsWith('/audit') || route.request().method() !== 'POST') return false;
    submissions.push(route.request().postDataJSON());
    await route.fulfill({ status: 422, json: { detail: 'Worker configuration rejected' } }); return true;
  });
  await page.goto('/dataset-audit');
  await page.getByText('Advanced — edit audit configuration as JSON', { exact: true }).click();
  const editor = page.getByLabel('Audit configuration (JSON)', { exact: true });
  for (const invalid of ['null', '[]', '{"numeric_columns":null}', '{"target_column":5}']) {
    await editor.fill(invalid); await editor.blur();
    await expect(editor).toHaveValue(invalid);
    await expect(page.getByRole('button', { name: 'Run audit', exact: true })).toBeDisabled();
  }
  await editor.fill(JSON.stringify({ feature_columns: ['x'], target_column: 'x' }));
  await expect(page.getByText('The target cannot also be a feature.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run audit', exact: true })).toBeDisabled();
  await editor.fill(JSON.stringify({ numeric_columns: ['stale'] }));
  await expect(page.getByText('Columns not in this dataset: stale.', { exact: true })).toBeVisible();
  await editor.fill(JSON.stringify({ numeric_columns: ['x'], bounds: { x: [0, 10] }, feature_columns: ['x'] }));
  await page.getByLabel('Target column', { exact: true }).selectOption('x');
  await expect(page.getByRole('group', { name: 'Feature columns', exact: true }).getByRole('button', { name: 'x', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Run audit', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Worker configuration rejected');
  expect(submissions).toEqual([{ dataset_id: dataset.id, config: { numeric_columns: ['x'], bounds: { x: [0, 10] }, feature_columns: [], provenance_columns: [], target_column: 'x' } }]);
  expect(JSON.parse(await editor.inputValue()).bounds).toEqual({ x: [0, 10] });
});

test('empty, unsupported and incomplete lineage results never imply clean data', async ({ page }) => {
  const clean = { ...audit, id: 'clean-audit', result: reports.clean };
  const malformed = { ...audit, id: 'malformed-audit', result: { findings: [{ rows: [-1], severity: 'error' }] } };
  const broken = { ...audit, id: 'broken-audit', parents: [] };
  await workspace(page, [dataset, clean, malformed, broken]);
  await page.goto(`/dataset-audit?project=${project.id}&audit=${clean.id}`);
  await expect(page.locator('#audit-clean-audit')).toContainText('No findings for the checks you configured');
  await expect(page.locator('#audit-clean-audit')).toContainText('Empty findings are not a certificate');
  await expect(page.locator('#audit-malformed-audit')).toContainText('Findings summary unavailable');
  await expect(page.locator('#audit-broken-audit')).toContainText('Dataset lineage unavailable');
  await expect(page.locator('#audit-broken-audit').getByRole('link', { name: 'Download audited CSV' })).toHaveCount(0);
});

test('manual audit submits the selected dataset and displays its completed findings', async ({ page }) => {
  let submitted = false;
  await workspace(page, [dataset], async (route, pathname) => {
    if (pathname.endsWith('/audit') && route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ dataset_id: dataset.id, config: {
        target_column: null, numeric_columns: ['x'], feature_columns: [], provenance_columns: [],
      } });
      submitted = true;
      await route.fulfill({ json: { ...job, state: 'queued', result_id: null, started_at: null, finished_at: null } });
      return true;
    }
    if (pathname.endsWith('/artifact-previews')) {
      await route.fulfill({ json: submitted ? [dataset, audit] : [dataset] }); return true;
    }
    if (pathname.endsWith('/jobs')) {
      await route.fulfill({ json: submitted ? [job] : [] }); return true;
    }
    return false;
  });
  await page.goto('/dataset-audit');
  await page.getByRole('group', { name: 'Numeric columns', exact: true }).getByRole('button', { name: 'x', exact: true }).click();
  await page.getByRole('button', { name: 'Run audit', exact: true }).click();
  await expect(page.locator(`#audit-${audit.id}`)).toContainText('out_of_bounds');
  await expect(page.getByRole('status')).toContainText('Job queued');
  await expect(page.getByRole('button', { name: 'Run audit', exact: true })).toBeEnabled();
});

test('linked agent activity and job results open audit inspection without submitting work', async ({ page }) => {
  let unavailable = false;
  await workspace(page, [dataset, audit], async (route, pathname) => {
    if (!unavailable || !pathname.endsWith('/agent-runs')) return false;
    await route.fulfill({ status: 503, json: { detail: 'Agent read unavailable' } }); return true;
  });
  await page.goto('/dataset-audit');
  await expect(page.getByRole('link', { name: `Open audit ${audit.id}` })).toBeVisible();
  await page.getByRole('link', { name: `Open audit ${audit.id}` }).click();
  await expect(page.locator(`#audit-${audit.id}`)).toBeFocused();
  unavailable = true;
  await page.getByRole('button', { name: 'Refresh agent activity' }).click();
  await expect(page.getByText(/Agent activity unavailable:/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run audit', exact: true })).toBeEnabled();
  await page.getByText('Job activity', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Inspect audit result' })).toHaveAttribute('href', `/dataset-audit?project=${project.id}&audit=${audit.id}#audit-${audit.id}`);
});

test('unavailable project and audit links do not silently select unrelated results', async ({ page }) => {
  await workspace(page);
  await page.goto('/dataset-audit?project=missing&audit=agent-audit');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Requested project unavailable');
  await expect(page.getByLabel('Active project', { exact: true })).toHaveValue('');
  await page.goto(`/dataset-audit?project=${project.id}&audit=missing`);
  await expect(page.getByText('Requested audit unavailable', { exact: true })).toBeVisible();
  const response = await page.goto('/dataset-audit?audit=agent-audit');
  expect(response?.status()).toBe(404);
  expect((await page.goto(`/dataset-audit?project=${project.id}&audit=`))?.status()).toBe(404);
});

test('finding projection preserves upstream evidence without changing the report', () => {
  const before = structuredClone(reports.problematic);
  expect(auditFindings(reports.problematic)).toEqual(reports.problematic.findings);
  expect(reports.problematic).toEqual(before);
  expect(auditFindings({ findings: [{ rows: [1.5] }] })).toBeNull();
  expect(auditFindings({ findings: [{ severity: 'novel' }] })?.[0].severity).toBe('novel');
});

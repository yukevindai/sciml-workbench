import { expect, test, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import fixtures from './fixtures/split-reports.json';
import { parseArtifacts, parseResearchRuns } from '../app/lib/decode';
import { initialSplitConfig, parseSplitConfig, splitConfigIssues, splitDisplayIssues, splitLineage } from '../app/lib/split';
import type { Artifact, AuditArtifact, DatasetArtifact, SplitArtifact } from '../app/lib/types';
import type { ResearchRun } from '../app/lib/generated/http';

const project = { id: 'p', name: 'Split study', description: '' };
const dataset = fixtures.boundary.dataset as DatasetArtifact;
const split = fixtures.boundary.split as SplitArtifact;
const audit: AuditArtifact = { id: split.audit_id, project_id: project.id, kind: 'audit', schema_version: '1.0',
  created_at: dataset.created_at, parents: [dataset.id], software: {}, dataset_id: dataset.id, config: {}, result: { findings: [] } };
const newerAudit = { ...audit, id: 'newer-audit', created_at: '2026-09-24T13:00:00Z' };
const otherData = { ...dataset, id: 'other-data', filename: 'other.csv' };
const otherAudit = { ...audit, id: 'other-audit', dataset_id: otherData.id, parents: [otherData.id] };
const newerSplit = { ...split, id: 'newer-split', audit_id: newerAudit.id, parents: [dataset.id, newerAudit.id], created_at: '2026-09-24T14:00:00Z' };
const job = { id: 'split-job', project_id: project.id, kind: 'split', state: 'succeeded', result_id: split.id,
  error: null, created_at: split.created_at, started_at: split.created_at, finished_at: split.created_at };
const run: ResearchRun = {
  id: 'split-agent', project_id: project.id, contract: 'research_run', schema_version: '1.0', created_at: split.created_at,
  objective: 'Design a temporal holdout', inputs: { material_ids: [], artifact_ids: [dataset.id], conversation_id: null, message_cutoff: null },
  policy: { policy_id: 'policy', revision: 1, sha256: 'a'.repeat(64) }, mode: 'autopilot', state: 'completed', control_revision: 1, plan_revision: 1,
  limits: { model_tokens: 10000, model_requests: 10, tool_calls: 10, coordinator_iterations: 10, specialist_assignments: 2,
    specialist_concurrency: 1, delegation_depth: 1, review_rounds: 1, scientific_attempts: 3, active_seconds: 300,
    transient_retries: 1, finalization_model_tokens: 1000, finalization_scientific_attempts: 1 },
  usage: { billed_token_categories: {}, reserved_tokens: 0, model_requests: 0, tool_calls: 0, scientific_attempts: 1,
    active_seconds: 2, unknown_request_ids: [], cost: { status: 'unknown', reason: 'Test fixture' } },
  open_question_ids: [], result_artifact_ids: [split.id], continued_from_run_id: null, finished_at: split.created_at, stop_reason: null,
};
async function workspace(page: Page, artifacts: Artifact[] = [dataset, audit, newerAudit, split, newerSplit, otherData, otherAudit], override?: (route: Route, pathname: string) => Promise<boolean>) {
  parseArtifacts(artifacts); parseResearchRuns([run]);
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (override && await override(route, pathname)) return;
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation: ${pathname}`);
    await route.fulfill({ json: pathname === '/api/projects' ? [project]
      : pathname.endsWith('/artifacts') ? artifacts : pathname.endsWith('/jobs') ? [job]
        : pathname.endsWith('/agent-runs') ? [run] : [] });
  });
}
const link = `/split-designer?project=${project.id}&split=${split.id}#split-${split.id}`;

test('direct split inspection retains exact audit lineage, exclusions and real diagnostics with accessible counts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await workspace(page);
  await page.addInitScript(() => localStorage.setItem('sciml-dataset:p', 'other-data'));
  await page.goto(link);
  const panel = page.locator(`#split-${split.id}`);
  await expect(panel).toBeFocused();
  await expect(page.getByLabel('Active dataset', { exact: true })).toHaveValue(dataset.id);
  await expect(panel.getByRole('link', { name: `Inspect source audit ${audit.id}` })).toHaveAttribute('href', `/dataset-audit?project=p&audit=${audit.id}#audit-${audit.id}`);
  await expect(panel).toContainText(dataset.sha256);
  await expect(panel).toContainText('benchmark admission not established');
  await expect(panel).toContainText('Excluded rows remain in the original dataset');
  const counts = panel.getByRole('region', { name: 'Partition counts', exact: true });
  await expect(counts.getByRole('row', { name: 'excluded 2 25%' })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Complete row assignments', exact: true }).getByRole('row', { name: '4 excluded', exact: true })).toBeVisible();
  await expect(panel).toContainText('Investigate selection bias before interpreting performance.');
  await expect(panel).toContainText('numeric_similarity, molecular_similarity');
  await expect(panel.getByRole('region', { name: 'Pairwise overlap diagnostics' })).toContainText('train:test');
  await expect(panel.getByText('Stored split consistency could not be confirmed', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await panel.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.screenshot({ path: 'test-results/a04-split-desktop.png' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await panel.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/a04-split-mobile-dark.png' });
  await counts.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.screenshot({ path: 'test-results/a04-split-counts-mobile.png' });
  await page.getByLabel('Frozen split', { exact: true }).selectOption(newerSplit.id);
  await expect(page.locator('#split-newer-split').getByRole('link', { name: `Inspect source audit ${newerAudit.id}` })).toBeVisible();
  await page.getByRole('button', { name: 'Select the linked split and dataset' }).click();
  await expect(page.locator(`#split-${split.id}`)).toBeFocused();
});

test('dataset changes reset configuration and cannot select an unrelated or broken audit', async ({ page }) => {
  const broken = { ...otherAudit, id: 'bad-audit', parents: [dataset.id] };
  await workspace(page, [dataset, audit, otherData, broken]);
  await page.goto(link);
  await page.getByLabel('Dataset', { exact: true }).selectOption(dataset.id);
  await expect(page.getByLabel('Source audit', { exact: true })).toHaveValue(audit.id);
  await page.getByLabel('Target column', { exact: true }).selectOption('y');
  await page.getByRole('group', { name: 'Grouping columns', exact: true }).getByRole('button', { name: 'group_id', exact: true }).click();
  await page.getByText('Advanced — edit SciSplit configuration as JSON', { exact: true }).click();
  await page.getByLabel('SciSplit configuration (JSON)', { exact: true }).fill('{');
  await expect(page.getByRole('button', { name: 'Generate partition', exact: true })).toBeDisabled();
  await page.getByLabel('Dataset', { exact: true }).selectOption(otherData.id);
  await expect(page.getByLabel('Target column', { exact: true })).toHaveValue('');
  await expect(page.getByRole('group', { name: 'Grouping columns', exact: true }).getByRole('button', { name: 'group_id', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Source audit', { exact: true }).getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Generate partition', exact: true })).toBeDisabled();
});

test('manual split validates drafts, retains server-rejected options and submits the explicitly selected audit', async ({ page }) => {
  const submissions: unknown[] = [];
  await workspace(page, [dataset, audit, newerAudit], async (route, pathname) => {
    if (!pathname.endsWith('/split') || route.request().method() !== 'POST') return false;
    submissions.push(route.request().postDataJSON());
    await route.fulfill(submissions.length === 1 ? { status: 422, json: { detail: 'Invalid scientific boundary' } }
      : { json: { ...job, state: 'queued', result_id: null, started_at: null, finished_at: null } }); return true;
  });
  await page.goto('/split-designer');
  await page.getByLabel('Source audit', { exact: true }).selectOption(audit.id);
  await page.getByText('Advanced — edit SciSplit configuration as JSON', { exact: true }).click();
  const editor = page.getByLabel('SciSplit configuration (JSON)', { exact: true });
  for (const value of ['null', '[]', '{"strategy":"random","columns":null}', '{"strategy":"random","test_size":-1}', '{"strategy":"random","seed":1.5}']) {
    await editor.fill(value); await editor.blur();
    await expect(editor).toHaveValue(value);
    await expect(page.getByRole('button', { name: 'Generate partition', exact: true })).toBeDisabled();
  }
  await editor.fill(JSON.stringify({ strategy: 'random', group_columns: ['stale'] }));
  await expect(page.getByText('Columns not in this dataset: stale.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate partition', exact: true })).toBeDisabled();
  await editor.fill(JSON.stringify(split.config));
  await page.getByRole('button', { name: 'Generate partition', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Invalid scientific boundary');
  expect(JSON.parse(await editor.inputValue()).cutoff).toBe('2020-01-07');
  await page.getByRole('button', { name: 'Generate partition', exact: true }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText('Job queued');
  expect(submissions).toEqual([1, 2].map(() => ({ dataset_id: dataset.id, audit_id: audit.id, config: parseSplitConfig(split.config) })));
});

test('full assignment access extends beyond the 400-row visual preview and preserves every exported label', async ({ page }) => {
  const assignments = Array.from({ length: 451 }, (_, index) => index < 300 ? 'train' : index < 400 ? 'validation' : index < 450 ? 'test' : 'excluded') as SplitArtifact['assignments'];
  const large = { ...split, assignments, result: {} };
  await workspace(page, [{ ...dataset, rows: 451 }, audit, large]);
  await page.goto(link);
  const panel = page.locator(`#split-${split.id}`);
  await expect(panel).toContainText('Visual preview: first 400 of 451 rows');
  const assignmentsTable = panel.getByRole('region', { name: 'Complete row assignments', exact: true });
  await expect(assignmentsTable.getByRole('row')).toHaveCount(51);
  for (let i = 0; i < 9; i++) await panel.getByRole('button', { name: 'Next assignments' }).click();
  await expect(assignmentsTable.getByRole('row', { name: '450 excluded', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Next assignments' })).toBeDisabled();
  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download all assignments (JSON)' }).click();
  const download = await downloadPromise;
  const payload = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(payload).toMatchObject({ split_id: split.id, dataset_id: dataset.id, audit_id: audit.id, assignments });
});

test('broken lineage and unsupported diagnostics remain explicit without substituting another dataset audit', async ({ page }) => {
  await workspace(page, [dataset, audit, otherData, otherAudit, { ...split, audit_id: otherAudit.id, parents: [dataset.id, otherAudit.id], result: { diagnostics: { evaluation: { pairwise_overlap: { 'train:test': { exact_duplicate_pairs: null } } } } } }]);
  await page.goto(link);
  const panel = page.locator(`#split-${split.id}`);
  await expect(panel).toContainText('Split lineage unavailable or inconsistent');
  await expect(panel.getByRole('link', { name: 'Download original CSV' })).toHaveCount(0);
  await expect(panel).toContainText('Stored split consistency could not be confirmed');
  await expect(panel).toContainText('Findings unavailable or unsupported');
  await expect(panel.getByRole('region', { name: 'Pairwise overlap diagnostics' }).getByRole('row', { name: 'train:test Exact duplicate pairs Unavailable' })).toBeVisible();
  await page.goto('/split-designer?project=p&split=missing');
  await expect(page.getByText('Requested split unavailable', { exact: true })).toBeVisible();
  expect((await page.goto('/split-designer?split=missing'))?.status()).toBe(404);
});

test('agent and job results link directly to stored splits while manual design survives activity outages', async ({ page }) => {
  let unavailable = false;
  await workspace(page, [dataset, audit, split], async (route, pathname) => {
    if (!unavailable || !pathname.endsWith('/agent-runs')) return false;
    await route.fulfill({ status: 503, json: { detail: 'Snapshot unavailable' } }); return true;
  });
  await page.goto('/split-designer');
  await page.getByRole('link', { name: `Open split ${split.id}` }).click();
  await expect(page.locator(`#split-${split.id}`)).toBeFocused();
  unavailable = true;
  await page.getByRole('button', { name: 'Refresh agent activity' }).click();
  await expect(page.getByText(/Agent activity unavailable:/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate partition', exact: true })).toBeEnabled();
  await page.getByText('Job activity', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Inspect split result' })).toHaveAttribute('href', link);
});

test('split projections preserve upstream output and distinguish absent information from valid zero values', () => {
  const before = structuredClone(split);
  expect(splitDisplayIssues(split, dataset)).toEqual([]);
  expect(splitDisplayIssues(fixtures.demo.split as SplitArtifact, fixtures.demo.dataset as DatasetArtifact)).toEqual([]);
  expect(initialSplitConfig(fixtures.demo.dataset as DatasetArtifact).group_columns).toEqual(['group_id']);
  expect(splitLineage(split, [dataset, audit, split]).valid).toBe(true);
  expect(splitLineage({ ...split, audit_id: otherAudit.id }, [dataset, audit, otherAudit]).valid).toBe(false);
  expect(splitDisplayIssues({ ...split, assignments: split.assignments.slice(1) }, dataset).length).toBeGreaterThan(0);
  expect(initialSplitConfig(otherData).group_columns).toEqual([]);
  expect(parseSplitConfig({ strategy: 'random', validation_size: 0 }).validation_size).toBe(0);
  expect(splitConfigIssues({ ...initialSplitConfig(dataset), target_column: 'absent' }, dataset.columns)).toEqual(['Columns not in this dataset: absent.']);
  expect(split).toEqual(before);
});

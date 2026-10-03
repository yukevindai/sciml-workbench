import { expect, test, type Page, type Route } from '@playwright/test';
import { jobPage } from './job-page';
import fixtures from './fixtures/benchmark-reports.json';
import { parseArtifact, parseArtifactPreviews, parseEvaluationStatus, parseJobs, parseResearchRuns } from '../app/lib/decode';
import {
  benchmarkConfigIssues, benchmarkLineage, undeclaredUnits, initialBenchmarkConfig, parseBenchmarkConfig, revealedTest, scalarMetrics,
} from '../app/lib/benchmark';
import { benchmarkDefault } from '../app/lib/defaults';
import { kinds, type Artifact, type BenchmarkArtifact, type DatasetArtifact } from '../app/lib/types';
import type { ResearchRun } from '../app/lib/generated/http';

const previews = parseArtifactPreviews(fixtures.previews);
const revealed = parseArtifact(fixtures.revealed) as BenchmarkArtifact;
const before = parseEvaluationStatus(fixtures.status_before);
const after = parseEvaluationStatus(fixtures.status_after);
const jobs = parseJobs(fixtures.jobs);
const dataset = kinds(previews, 'dataset')[0];
const project = { id: dataset.project_id, name: 'Benchmark study', description: '' };
const [meanId, ridgeId] = fixtures.candidate_ids;
const ridge = kinds(previews, 'benchmark_preview').find(run => run.id === ridgeId)!;
const otherData: DatasetArtifact = { ...dataset, id: 'other-data', filename: 'other.csv', sha256: 'b'.repeat(64), blob_key: 'b'.repeat(64) };
// Formatted upstream test values from the real pinned run; none may render before reveal.
const TEST_VALUES = ['0.1334', '0.1505', '0.8782'];
const run: ResearchRun = {
  id: 'benchmark-agent', project_id: project.id, contract: 'research_run', agent_roster: null, schema_version: '1.0', created_at: ridge.created_at,
  objective: 'Compare predeclared baselines', inputs: { material_ids: [], artifact_ids: [dataset.id], conversation_id: null, message_cutoff: null },
  policy: { policy_id: 'policy', revision: 1, sha256: 'a'.repeat(64) }, mode: 'autopilot', state: 'completed', control_revision: 1, plan_revision: 1,
  limits: { model_tokens: 10000, model_requests: 10, tool_calls: 10, coordinator_iterations: 10, specialist_assignments: 2,
    specialist_concurrency: 1, delegation_depth: 1, review_rounds: 1, scientific_attempts: 3, active_seconds: 300,
    transient_retries: 1, finalization_model_tokens: 1000, finalization_scientific_attempts: 1 },
  usage: { billed_token_categories: {}, reserved_tokens: 0, model_requests: 0, tool_calls: 0, scientific_attempts: 2,
    active_seconds: 2, unknown_request_ids: [], cost: { status: 'unknown', reason: 'Test fixture' } },
  open_question_ids: [], result_artifact_ids: [ridgeId], continued_from_run_id: null, finished_at: ridge.created_at, stop_reason: null,
};
parseResearchRuns([run]);

type Seen = { reveals: number; details: string[] };
async function workspace(page: Page, artifacts: Artifact[] = previews, override?: (route: Route, pathname: string) => Promise<boolean>): Promise<Seen> {
  parseArtifactPreviews(artifacts);
  const seen: Seen = { reveals: 0, details: [] };
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (override && await override(route, pathname)) return;
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation: ${pathname}`);
    if (pathname.includes('/artifacts/')) {
      seen.details.push(pathname);
      if (pathname === `/api/projects/${project.id}/artifacts/${ridgeId}`) { seen.reveals += 1; await route.fulfill({ json: revealed }); return; }
      await route.fulfill({ status: 404, json: { detail: 'Not found' } }); return;
    }
    await route.fulfill({ json: pathname === '/api/projects' ? [project]
      : pathname.endsWith('/artifact-previews') ? artifacts : pathname.endsWith('/job-index') ? jobPage(jobs)
        : pathname.endsWith('/agent-runs') ? [run] : pathname.includes('/evaluations/') ? (seen.reveals ? after : before) : [] });
  });
  return seen;
}
const link = `/benchmark?project=${project.id}&benchmark=${ridgeId}#benchmark-${ridgeId}`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sciml-theme', 'light'));
});

test('direct benchmark link shows protocol context and validation while test output stays withheld until an explicit reveal', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seen = await workspace(page);
  await page.goto(link);
  const panel = page.locator(`#benchmark-${ridgeId}`);
  await expect(panel).toBeFocused();
  await expect(panel.getByRole('region', { name: 'Validation metrics' }).getByRole('row', { name: 'group mae 0.1698' })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Validation metrics' }).getByRole('row', { name: 'rows 12' })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Validation search' }).getByRole('row')).toHaveCount(4);
  await expect(panel).toContainText('Accepted candidate of sealed comparison');
  await expect(panel).toContainText('No warnings accepted');
  await expect(panel).toContainText('Test results withheld from this preview');
  await expect(panel).toContainText('No recorded exposure for this exact dataset and partition assignment.');
  await expect(panel.getByRole('link', { name: 'Download upstream run bundle' })).toHaveCount(0);
  const protocol = page.locator(`#protocol-${fixtures.protocol_id}`);
  await expect(protocol).toContainText('Current holdout exposure: unexposed');
  await expect(protocol).toContainText('mean (mean, seed 0); ridge (ridge, seed 0)');
  for (const value of TEST_VALUES) expect(await page.locator('main').innerText()).not.toContain(value);
  expect(seen.details).toEqual([]);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await panel.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.screenshot({ path: 'test-results/a05-benchmark-desktop.png' });

  await panel.getByRole('button', { name: 'Reveal test results…' }).click();
  await expect(panel).toContainText('This records the first exposure of this exact dataset and partition.');
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(seen.reveals).toBe(0);
  await panel.getByRole('button', { name: 'Reveal test results…' }).click();
  await panel.getByRole('button', { name: 'Record exposure and reveal' }).click();
  const testTable = panel.getByRole('region', { name: 'Test metrics' });
  await expect(testTable.getByRole('row', { name: 'group mae 0.1334' })).toBeVisible();
  await expect(testTable.getByRole('row', { name: 'r2 0.8782' })).toBeVisible();
  await expect(panel).toContainText('Group MAE 95% interval: 0.0937 to 0.1822');
  await expect(panel).toContainText('Test results revealed · exposure recorded');
  await expect(protocol).toContainText('Current holdout exposure: exposed');
  expect(seen.reveals).toBe(1);
  // Only the confirmed run was revealed; the other candidate remains withheld.
  await expect(page.locator(`#benchmark-${meanId}`)).toContainText('Test results withheld from this preview');

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await testTable.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/a05-benchmark-revealed-mobile-dark.png' });
});

test('failed admission and missing metrics are explicit rather than zero', async ({ page }) => {
  const sparse = { ...ridge, id: 'sparse-run', validation_metrics: { rmse: 0 }, method: null, protocol_ids: [] };
  const empty = { ...ridge, id: 'empty-run', validation_metrics: null, method: null, protocol_ids: [], created_at: '2020-01-01T00:00:00Z' };
  await workspace(page, [...previews, sparse, empty]);
  await page.goto(`/benchmark?project=${project.id}&benchmark=${fixtures.rejected_id}`);
  const failed = page.locator(`#benchmark-${fixtures.rejected_id}`);
  await expect(failed).toContainText('Admission or evaluation failed');
  await expect(failed).toContainText('No metrics were produced; missing metrics are not zero.');
  await expect(failed.getByRole('button', { name: 'Reveal test results…' })).toHaveCount(0);
  await expect(failed).toContainText(`temperature: kelvin`);
  const zero = page.locator('#benchmark-sparse-run').getByRole('region', { name: 'Validation metrics' });
  await expect(zero.getByRole('row', { name: 'rmse 0', exact: true })).toBeVisible();
  await expect(zero.getByRole('row', { name: 'mae Not reported', exact: true })).toBeVisible();
  await expect(page.locator('#benchmark-sparse-run')).toContainText('Not part of a sealed comparison');
  await expect(page.locator('#benchmark-empty-run')).toContainText('Validation metrics: not reported. Missing metrics are not zero.');
  for (const value of TEST_VALUES) expect(await page.locator('main').innerText()).not.toContain(value);
});

test('reveal failures show no test output and allow a retry', async ({ page }) => {
  let failures = 1;
  await workspace(page, previews, async (route, pathname) => {
    if (pathname !== `/api/projects/${project.id}/artifacts/${ridgeId}` || failures-- <= 0) return false;
    await route.fulfill({ status: 500, json: { detail: 'Exposure could not be recorded' } }); return true;
  });
  await page.goto(link);
  const panel = page.locator(`#benchmark-${ridgeId}`);
  await panel.getByRole('button', { name: 'Reveal test results…' }).click();
  await panel.getByRole('button', { name: 'Record exposure and reveal' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Exposure could not be recorded');
  await expect(panel.getByRole('region', { name: 'Test metrics' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Reveal test results…' }).click();
  await panel.getByRole('button', { name: 'Record exposure and reveal' }).click();
  await expect(panel.getByRole('region', { name: 'Test metrics' })).toBeVisible();
});

test('agent and job results link directly to benchmark inspection; unknown links substitute nothing', async ({ page }) => {
  await workspace(page);
  await page.goto('/benchmark');
  await page.getByRole('link', { name: `Open benchmark ${ridgeId}` }).click();
  await expect(page.locator(`#benchmark-${ridgeId}`)).toBeFocused();
  await page.getByText('Job activity', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Inspect benchmark result' }).first()).toHaveAttribute('href', /\/benchmark\?project=/);
  await page.goto(`/benchmark?project=${project.id}&benchmark=missing`);
  await expect(page.getByText('Requested benchmark unavailable', { exact: true })).toBeVisible();
  expect((await page.goto('/benchmark?benchmark=missing'))?.status()).toBe(404);
});

test('benchmark helpers validate declarations without inventing values or mutating stored artifacts', () => {
  const copy = structuredClone(revealed);
  expect(initialBenchmarkConfig(dataset as DatasetArtifact)).toEqual(benchmarkDefault);
  const blank = initialBenchmarkConfig(otherData);
  expect([blank.target, blank.independence_status, blank.domain, blank.limitations]).toEqual(['', '', '', []]);
  expect(benchmarkConfigIssues(benchmarkDefault, dataset.columns)).toEqual([]);
  expect(benchmarkConfigIssues({ ...benchmarkDefault, numeric_features: ['temperature', 'response'] }, dataset.columns)).toContain('Target response cannot also be a feature.');
  expect(benchmarkConfigIssues({ ...benchmarkDefault, units: {} }, dataset.columns)).toEqual([]);
  expect(undeclaredUnits({ ...benchmarkDefault, units: { temperature: 'kelvin' } })).toEqual(['response']);
  expect(benchmarkConfigIssues({ ...benchmarkDefault, group_columns: ['stale'] }, dataset.columns)).toContain('Columns not in this dataset: stale.');
  expect(() => parseBenchmarkConfig({ ...benchmarkDefault, model: 'forest' })).toThrow();
  expect(scalarMetrics({ rmse: 0, mae: null, r2: 'x' })).toEqual({ rmse: 0 });
  expect(scalarMetrics(undefined)).toBeNull();
  expect(revealedTest(revealed).metrics?.group_mae).toBeCloseTo(0.13337, 4);
  expect(benchmarkLineage(ridge, previews).valid).toBe(true);
  expect(benchmarkLineage({ ...ridge, split_id: 'other' }, previews).valid).toBe(false);
  expect(revealed).toEqual(copy);
  expect(JSON.stringify(kinds(previews, 'benchmark_preview'))).not.toContain('"test":');
  expect(() => parseArtifactPreviews([...fixtures.previews, fixtures.revealed])).toThrow();
});

test('a listing that carries a complete benchmark is rejected instead of rendered', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    await route.fulfill({ json: pathname === '/api/projects' ? [project]
      : pathname.endsWith('/artifact-previews') ? [...fixtures.previews, fixtures.revealed] : [] });
  });
  await page.goto('/benchmark');
  await expect(page.getByText('Workspace data unavailable', { exact: true })).toBeVisible();
  for (const value of TEST_VALUES) expect(await page.locator('main').innerText()).not.toContain(value);
});

import { expect, test, type Page, type Route } from '@playwright/test';
import manual from './fixtures/report-manual.json';
import agent from './fixtures/report-agent.json';
import { parseArtifactPreviews, parseJobs, parseReportSummary } from '../app/lib/decode';
import { buildLineage, neighbourhood, provenanceHref, reportHref } from '../app/lib/lineage';
import type { Artifact } from '../app/lib/types';

const manualPreviews = parseArtifactPreviews(manual.previews);
const agentPreviews = parseArtifactPreviews(agent.previews);
const manualJobs = parseJobs(manual.jobs);
const summary = parseReportSummary(manual.summary);
const tampered = parseReportSummary(manual.summary_tampered);
const agentSummary = parseReportSummary(agent.summary);
const ids = manual.ids;

type Fixture = { project: { id: string; name: string; description: string }; previews: Artifact[]; jobs: ReturnType<typeof parseJobs>; summaries: Record<string, unknown> };
type Seen = { summaries: string[]; posts: string[] };
async function workspace(page: Page, fixture: Fixture, override?: (route: Route, pathname: string) => Promise<boolean>): Promise<Seen> {
  const seen: Seen = { summaries: [], posts: [] };
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (override && await override(route, pathname)) return;
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation: ${pathname}`);
    const summaryMatch = pathname.match(/\/reports\/([^/]+)\/summary$/);
    if (summaryMatch) {
      seen.summaries.push(summaryMatch[1]);
      const value = fixture.summaries[summaryMatch[1]];
      await route.fulfill(value ? { json: value } : { status: 404, json: { error: 'Artifact not found' } });
      return;
    }
    await route.fulfill({ json: pathname === '/api/projects' ? [fixture.project]
      : pathname.endsWith('/artifact-previews') ? fixture.previews : pathname.endsWith('/jobs') ? fixture.jobs : [] });
  });
  return seen;
}
const manualFixture: Fixture = { project: manual.project, previews: manualPreviews, jobs: manualJobs, summaries: { [ids.report]: summary } };
const agentFixture: Fixture = { project: agent.project, previews: agentPreviews, jobs: parseJobs(agent.jobs), summaries: { [agent.ids.report]: agentSummary } };

test('lineage table and graph resolve dependencies and keep broken references visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Remove the audit: the split and its activity record now point at a missing artifact.
  const broken = manualPreviews.filter(a => a.id !== ids.audit);
  await workspace(page, { ...manualFixture, previews: broken });
  await page.goto(provenanceHref(manual.project.id, ids.split));
  await expect(page.getByText(/broken reference/)).toBeVisible();
  await expect(page.getByText(new RegExp(`→ ${ids.audit} \\(parent\\)`))).toBeVisible();
  const table = page.getByRole('region', { name: 'Lineage table' });
  await expect(table.getByRole('row', { name: new RegExp(`Missing reference ${ids.audit}`) })).toBeVisible();
  await expect(table.getByText(`Missing: ${ids.audit.slice(0, 8)} (not in this project listing)`).first()).toBeVisible();
  await expect(page.locator('.lineage-node--missing')).toHaveCount(1);
  await expect(page.getByLabel('Focus on')).toHaveValue(ids.split);
  const splitRow = table.getByRole('row').filter({ hasText: 'composition split' });
  await expect(splitRow).toContainText(`Dataset ${ids.dataset.slice(0, 8)}`);
  await expect(splitRow).toContainText('Benchmark');

  await page.getByLabel('Focus on').selectOption('');
  const datasetRow = table.getByRole('row').filter({ hasText: 'demo.csv · 60 rows' });
  await expect(datasetRow).toContainText('Original input');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/a08-lineage-desktop.png', fullPage: false });
});

test('unknown lineage links substitute nothing', async ({ page }) => {
  await workspace(page, manualFixture);
  await page.goto(provenanceHref(manual.project.id, 'missing-artifact'));
  await expect(page.getByText('This project has no artifact with ID missing-artifact')).toBeVisible();
  await expect(page.getByLabel('Focus on')).toHaveValue('');
});

test('a verified project export names frozen inputs, failed jobs and environment; replay is never reported as run', async ({ page }) => {
  const seen = await workspace(page, manualFixture);
  await page.goto(reportHref(manual.project.id, ids.report));
  const card = page.locator(`#report-${ids.report}`);
  await expect(card).toBeFocused();
  await expect(card).toContainText('Verified');
  await expect(card).toContainText('Project-wide manual export');
  const inputs = card.getByRole('region', { name: 'Frozen inputs' });
  await expect(inputs.getByRole('row')).toHaveCount(summary.inputs.length + 1);
  await expect(inputs.getByRole('row', { name: /demo\.csv · 60 rows/ })).toBeVisible();
  await expect(inputs.getByRole('row', { name: /ridge baseline · seed 0 · failed/ }).getByRole('link', { name: 'Open' })).toBeVisible();
  await expect(card).toContainText('1 failed');
  await expect(card).toContainText('failed (VALIDATION_FAILED). It is kept in the archive, not hidden.');
  await expect(card).toContainText(summary.python!);
  await expect(card).toContainText('a manual project export does not name agent versions');
  await expect(card).toContainText('Scientific replay');
  await expect(card).toContainText('Not run');
  expect(await page.locator('main').innerText()).not.toMatch(/replay (passed|succeeded|matched)|replayed successfully/i);
  expect(seen.summaries).toEqual([ids.report]);
  await card.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/a08-report-desktop.png' });
});

test('a tampered archive is shown as failed with no contents', async ({ page }) => {
  await workspace(page, { ...manualFixture, summaries: { [ids.report]: tampered } });
  await page.goto(reportHref(manual.project.id, ids.report));
  const card = page.locator(`#report-${ids.report}`);
  await expect(card.getByRole('alert')).toContainText('Stored archive bytes do not match their recorded digest');
  await expect(card).toContainText('Failed');
  await expect(card.getByRole('region', { name: 'Frozen inputs' })).toHaveCount(0);
  await expect(card).not.toContainText('Verified');
  await expect(card).toContainText('Not run');
});

test('an agent-run export names its frozen scope and agent versions', async ({ page }) => {
  await workspace(page, agentFixture);
  await page.goto(reportHref(agent.project.id, agent.ids.report));
  const card = page.locator(`#report-${agent.ids.report}`);
  await expect(card).toContainText('Research run export');
  await expect(card).toContainText(`Run-scoped export for research run ${agent.ids.run}`);
  await expect(card).toContainText(`event cutoff ${agentSummary.scope!.execution_cutoff}`);
  const versions = card.getByLabel(`Agent execution ${agentSummary.agent_executions[0].execution_record_id}`);
  const v = agentSummary.agent_executions[0].versions;
  await expect(versions).toContainText(`${v.provider} / ${v.model}`);
  await expect(versions).toContainText(v.prompt);
  await expect(versions).toContainText(v.runtime);
  await expect(versions).toContainText(v.workbench_revision);
  await expect(card).toContainText('1 runtime configuration recorded');
  await page.setViewportSize({ width: 375, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await versions.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/a08-agent-report-mobile-dark.png' });
  await page.goto(`/provenance?project=${agent.project.id}`);
  await expect(page.getByRole('region', { name: 'Lineage table' })).toContainText('Agent execution record');
});

test('summary read failures are explicit and retryable; unknown report links substitute nothing', async ({ page }) => {
  let fail = true;
  await workspace(page, manualFixture, async (route, pathname) => {
    if (pathname.endsWith('/summary') && fail) { fail = false; await route.fulfill({ status: 503, json: { error: 'Storage unavailable' } }); return true; }
    return false;
  });
  await page.goto(`/report?project=${manual.project.id}&report=missing-report`);
  await expect(page.getByText('This project has no report with ID missing-report')).toBeVisible();
  const card = page.locator(`#report-${ids.report}`);
  await expect(card).toContainText('Could not check: Storage unavailable');
  await expect(card).not.toContainText('Verified');
  await card.getByRole('button', { name: 'Verify and inspect' }).click();
  await expect(card).toContainText('Verified');
});

test('manual export sends one request per attempt, reuses its key on retry and waits for running work', async ({ page }) => {
  const posts: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await workspace(page, manualFixture, async (route, pathname) => {
    if (route.request().method() !== 'POST' || !pathname.endsWith('/report')) return false;
    posts.push(route.request().headers()['idempotency-key']);
    if (posts.length === 1) { await route.fulfill({ status: 503, json: { error: 'Project busy' } }); return true; }
    await gate;
    await route.fulfill({ status: 202, json: { ...manualJobs[0], id: 'export-2', state: 'queued', result_id: null, started_at: null, finished_at: null } });
    return true;
  });
  await page.goto(`/report?project=${manual.project.id}`);
  const button = page.getByRole('button', { name: 'Export project' });
  await button.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Project busy' })).toBeVisible();
  await button.dblclick();
  await expect.poll(() => posts.length).toBe(2);
  release();
  await expect(page.getByText('Export accepted.')).toBeVisible();
  expect(posts).toHaveLength(2);
  expect(posts[1]).toBe(posts[0]);
});

test('export is disabled while other work runs and failed exports show no archive', async ({ page }) => {
  const running = { ...manualJobs.find(j => j.kind === 'audit')!, id: 'running-audit', state: 'running' as const, result_id: null, finished_at: null };
  const failedExport = { ...manualJobs.find(j => j.kind === 'report')!, id: 'failed-export', state: 'failed' as const, result_id: null, error: 'Operation did not complete; inspect its safe error code.' };
  await workspace(page, { ...manualFixture, jobs: [failedExport, running, ...manualJobs] });
  await page.goto(`/report?project=${manual.project.id}`);
  await expect(page.getByRole('button', { name: 'Export project' })).toBeDisabled();
  await expect(page.getByText('Wait for 1 running job to settle')).toBeVisible();
  await expect(page.getByText('No archive: Operation did not complete')).toBeVisible();
});

test('lineage helpers report missing references and cycles without dropping nodes', () => {
  const lineage = buildLineage(manualPreviews.filter(a => a.id !== ids.audit));
  expect(lineage.nodes.get(ids.audit)?.artifact).toBeNull();
  expect(lineage.broken.some(b => b.to === ids.audit && b.via === 'parent')).toBe(true);
  expect(lineage.cyclic).toBe(false);
  const scope = neighbourhood(buildLineage(manualPreviews), ids.split);
  expect(scope.has(ids.dataset) && scope.has(ids.audit)).toBe(true);
  const dataset = manualPreviews.find(a => a.id === ids.dataset)!;
  const cyclic = buildLineage([{ ...dataset, parents: [ids.audit] }, ...manualPreviews.filter(a => a.id !== ids.dataset)]);
  expect(cyclic.cyclic).toBe(true);
  expect(cyclic.nodes.size).toBe(manualPreviews.length);
});

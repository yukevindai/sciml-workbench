import { expect, test, type Page, type Route } from '@playwright/test';
import { jobDetail, jobPage } from './job-page';
import recovery from './fixtures/job-recovery.json';
import manual from './fixtures/report-manual.json';
import { parseArtifactPreviews, parseJobPage, parseReportSummary } from '../app/lib/decode';
import { pollDelay, POLL_ACTIVE, POLL_IDLE, POLL_MAX_BACKOFF, recoveryStatus } from '../app/lib/jobs';
import { reportHref } from '../app/lib/lineage';
import type { JobDetail } from '../app/lib/generated/http';

const recoveryPage = parseJobPage(recovery.job_index);
const recoveryPreviews = parseArtifactPreviews(recovery.previews);
const rid = recovery.ids;
const retryJob = recoveryPage.items.find(job => job.retry_of_job_id === rid.interrupted)!;

const previews = parseArtifactPreviews(manual.previews);
const summary = parseReportSummary(manual.summary);
const manualJobs = manual.jobs.map(jobDetail);
const reportJob = manualJobs.find(job => job.kind === 'report')!;
const failedBenchmark = manualJobs.find(job => job.kind === 'benchmark' && job.state === 'failed')!;
const project = manual.project;
const base = `/api/projects/${project.id}`;

type Server = {
  project: { id: string; name: string; description: string };
  jobs: JobDetail[];
  previews: unknown[];
  outage: boolean;
  requests: { index: number[]; previews: number[] };
  posts: { key: string; body: string | null }[];
  post?: (count: number) => { status: number; json: unknown } | 'hang';
};

async function serve(page: Page, server: Server) {
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;
    if (route.request().method() === 'POST') {
      if (!server.post) throw new Error(`Unexpected mutation: ${pathname}`);
      server.posts.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
      const response = server.post(server.posts.length);
      if (response !== 'hang') await route.fulfill(response);
      return;
    }
    if (pathname.endsWith('/job-index')) {
      server.requests.index.push(Date.now());
      if (server.outage) { await route.fulfill({ status: 503, json: { error: 'Database unavailable' } }); return; }
      await route.fulfill({ json: jobPage(server.jobs) }); return;
    }
    if (pathname.endsWith('/artifact-previews')) {
      server.requests.previews.push(Date.now());
      if (server.outage) { await route.fulfill({ status: 503, json: { error: 'Database unavailable' } }); return; }
      await route.fulfill({ json: server.previews }); return;
    }
    if (pathname.endsWith('/summary')) { await route.fulfill({ json: summary }); return; }
    await route.fulfill({ json: pathname === '/api/projects' ? [server.project] : [] });
  });
}

function manualServer(overrides: Partial<Server> = {}): Server {
  return { project, jobs: manualJobs, previews, outage: false, requests: { index: [], previews: [] }, posts: [], ...overrides };
}

const rawReportJob = manual.jobs.find(job => job.kind === 'report')!;
const accepted = (id: string) => ({ status: 202, json: { ...rawReportJob, id, state: 'queued', result_id: null, started_at: null, finished_at: null } });

test('failed jobs, recovery decisions and agent run links are shown as recorded', async ({ page }) => {
  await serve(page, { ...manualServer(), project: recovery.project, jobs: recoveryPage.items, previews: recoveryPreviews });
  await page.goto('/research');
  const jobs = page.getByRole('list', { name: 'Jobs' });
  // Queued work opens the activity list without a click.
  await expect(jobs).toBeVisible();
  await expect(page.getByRole('main').getByText('2 active jobs')).toBeVisible();

  const interrupted = page.locator(`#job-${rid.interrupted}`);
  await expect(interrupted).toContainText('WORKER_INTERRUPTED');
  await expect(interrupted).toContainText('Recovered.');
  await expect(interrupted).toContainText('This job remains failed');
  await expect(interrupted).toContainText(`Retried as job ${retryJob.id.slice(0, 8)}`);
  await expect(interrupted).toContainText('No result artifact was published by this job.');
  await expect(interrupted).toContainText('No agent run is linked to this job.');
  await expect(interrupted.locator('.badge').last()).toHaveText('failed');

  const retry = page.locator(`#job-${retryJob.id}`);
  await expect(retry).toContainText(`New attempt of job ${rid.interrupted.slice(0, 8)}. The original keeps its own outcome.`);
  await expect(retry.locator('.badge').last()).toHaveText('queued');

  const rejected = page.locator(`#job-${rid.rejected}`);
  await expect(rejected).toContainText('ADMISSION_REJECTED');
  await expect(rejected).toContainText('Not retried automatically.');

  await expect(page.locator(`#job-${rid.agent_job}`)).toContainText(`Agent run ${rid.run} · action ${rid.agent_action.slice(0, 8)} (owned by the run)`);

  await page.getByLabel('Show', { exact: true }).selectOption('failed');
  await expect(jobs.getByRole('listitem')).toHaveCount(2);
  await page.getByLabel('Show', { exact: true }).selectOption('active');
  await expect(jobs.getByRole('listitem')).toHaveCount(2);
  await page.getByLabel('Show', { exact: true }).selectOption('all');
  await retry.getByRole('link', { name: `job ${rid.interrupted.slice(0, 8)}` }).click();
  await expect(page).toHaveURL(new RegExp(`#job-${rid.interrupted}$`));
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: 'test-results/a09-recovery-mobile.png', fullPage: true });
});

test('a failed job that recorded an outcome links to it and says the execution failed', async ({ page }) => {
  await serve(page, manualServer());
  await page.goto('/research');
  await page.getByText('Job activity', { exact: true }).click();
  const row = page.locator(`#job-${failedBenchmark.id}`);
  await expect(row.getByRole('link', { name: 'Inspect benchmark result' })).toHaveAttribute('href', new RegExp(`benchmark=${failedBenchmark.result_id}`));
  await expect(row).toContainText('The execution failed; this artifact records the unsuccessful outcome.');
  await expect(row.locator('.job-error')).toHaveCount(1);
});

test('a lost submission survives reload, is never resent automatically, and resends with its original key', async ({ page }) => {
  const server = manualServer({ post: count => count === 1 ? { status: 503, json: { error: 'Response lost' } } : accepted('export-job') });
  await serve(page, server);
  await page.goto(reportHref(project.id, manual.ids.report));
  await page.getByRole('button', { name: 'Export project' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'may already have accepted this report request' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export project' })).toBeEnabled();
  expect(server.posts).toHaveLength(1);

  await page.reload();
  const unconfirmed = page.getByRole('region', { name: 'Unconfirmed submissions' });
  await expect(unconfirmed).toContainText('Report export');
  await expect(unconfirmed).toContainText(server.posts[0].key.slice(0, 8));
  // Several poll cycles pass: nothing is resubmitted by loading the page.
  await expect.poll(() => server.requests.index.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  expect(server.posts).toHaveLength(1);

  await unconfirmed.getByRole('button', { name: 'Resend with the same key' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Confirmed: the report export request is job export-j' })).toBeVisible();
  expect(server.posts.map(post => post.key)).toEqual([server.posts[0].key, server.posts[0].key]);
  await expect(unconfirmed).toHaveCount(0);
  expect(await page.evaluate(id => localStorage.getItem(`sciml-submissions:${id}`), project.id)).toBeNull();
});

test('retrying the same inputs after reload reuses the key; a definitive refusal releases it', async ({ page }) => {
  const server = manualServer({ post: count => count === 1 ? { status: 502, json: { error: 'Backend unavailable' } }
    : count === 2 ? { status: 409, json: { error: 'Project has active work' } } : accepted('export-job') });
  await serve(page, server);
  await page.goto(`/report?project=${project.id}`);
  await page.getByRole('button', { name: 'Export project' }).click();
  await expect(page.getByRole('region', { name: 'Unconfirmed submissions' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Export project' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Project has active work' })).toBeVisible();
  expect(server.posts[1].key).toBe(server.posts[0].key);
  // 409 is an answer: nothing was accepted under that key, so it is released.
  await expect(page.getByRole('region', { name: 'Unconfirmed submissions' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Export project' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Export accepted' })).toBeVisible();
  expect(server.posts).toHaveLength(3);
  expect(server.posts[2].key).not.toBe(server.posts[0].key);
});

test('an outage keeps results visible and backs off; a terminal job refreshes artifacts', async ({ page }) => {
  test.setTimeout(120_000);
  const running = { ...reportJob, state: 'running' as const, result_id: null, finished_at: null };
  const withoutArchive = previews.filter(artifact => artifact.id !== manual.ids.report);
  const server = manualServer({ jobs: [running, ...manualJobs.filter(job => job.id !== reportJob.id)], previews: withoutArchive });
  await serve(page, server);
  await page.goto(`/report?project=${project.id}`);
  await expect(page.getByText('An export is in progress.')).toBeVisible();

  // Unchanged jobs are polled; artifacts are not re-read on every tick.
  await expect.poll(() => server.requests.index.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  expect(server.requests.previews).toHaveLength(1);

  server.outage = true;
  const outageStart = server.requests.index.length;
  await expect(page.getByRole('alert').filter({ hasText: 'Previously loaded data remains visible' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('alert').filter({ hasText: 'Retrying automatically' })).toBeVisible();
  await expect(page.getByText('An export is in progress.')).toBeVisible();
  await expect.poll(() => server.requests.index.length - outageStart, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  const times = server.requests.index.slice(outageStart);
  // 5 s then 10 s after the first two failures (2.5 s × 2^n), never the 2.5 s cadence.
  expect(times[1] - times[0]).toBeGreaterThan(4_000);
  expect(times[2] - times[1]).toBeGreaterThan(9_000);

  server.jobs = manualJobs;
  server.previews = previews;
  server.outage = false;
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Workspace data unavailable' })).toHaveCount(0);
  // The export reached a terminal state, so its archive was read without waiting for the periodic refresh.
  await expect(page.locator(`#report-${manual.ids.report}`)).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/a09-terminal-refresh.png' });
});

test('controls leave busy states when a submission fails during an outage', async ({ page }) => {
  const server = manualServer({ post: () => ({ status: 503, json: { error: 'Database unavailable' } }) });
  await serve(page, server);
  await page.goto(`/report?project=${project.id}`);
  await expect(page.getByRole('button', { name: 'Export project' })).toBeEnabled();
  server.outage = true;
  await page.getByRole('button', { name: 'Export project' }).dblclick();
  await expect(page.getByRole('alert').filter({ hasText: 'may already have accepted' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export project' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Resend with the same key' })).toBeEnabled();
  expect(server.posts).toHaveLength(1);
  await page.getByRole('button', { name: 'Forget' }).click();
  await expect(page.getByRole('region', { name: 'Unconfirmed submissions' })).toHaveCount(0);
});

test('poll cadence and recovery wording helpers', () => {
  expect(pollDelay({ failures: 0, active: true, hidden: false })).toBe(POLL_ACTIVE);
  expect(pollDelay({ failures: 0, active: false, hidden: false })).toBe(POLL_IDLE);
  expect(pollDelay({ failures: 1, active: true, hidden: false })).toBe(5_000);
  expect(pollDelay({ failures: 10, active: true, hidden: false })).toBe(POLL_MAX_BACKOFF);
  expect(pollDelay({ failures: 0, active: true, hidden: true })).toBeGreaterThan(POLL_IDLE);
  const pending = { state: 'pending' as const, eligible: true, attempts: 1, max_attempts: 3, retry_job_id: null, next_attempt_at: '2026-09-24T12:00:00Z', last_error_code: null };
  expect(recoveryStatus(pending).label).toBe('Recovery scheduled');
  expect(recoveryStatus({ ...pending, state: 'exhausted', last_error_code: 'JOB_TIMED_OUT' }).description).toContain('JOB_TIMED_OUT');
  expect(recoveryStatus({ ...pending, state: 'completed' }).description).toContain('without a new attempt');
  expect(recoveryStatus({ ...pending, eligible: false, state: 'exhausted' }).label).toBe('Not retried automatically');
});

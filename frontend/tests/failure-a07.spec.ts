import { expect, test, type Page, type Route } from '@playwright/test';
import fixtures from './fixtures/failure-receipts.json';
import { parseArtifactPreviews, parseJobPage, parseJobs } from '../app/lib/decode';
import { assessRunHref, describeFailure, draftFingerprint, failureHref, receiptStatus } from '../app/lib/failure';
import { kinds, type Artifact } from '../app/lib/types';
import type { JobDetail } from '../app/lib/generated/http';

const previews = parseArtifactPreviews(fixtures.previews);
const jobs = parseJobs(fixtures.jobs);
const index = parseJobPage(fixtures.failure_index);
const project = fixtures.project;
const ids = fixtures.ids;
const failures = kinds(previews, 'failure');
const agentRecord = failures.find(f => f.schema_version === '2.0' && f.actor.kind === 'agent')!;
const humanRecord = failures.find(f => f.schema_version === '2.0' && f.actor.kind === 'human')!;
const manualRecord = failures.find((f): f is Extract<typeof f, { schema_version: '1.0' }> => f.schema_version === '1.0' && f.benchmark_id === ids.ridge)!;
const base = `/api/projects/${project.id}`;
// Test-partition RMSE from the real run, carried inside the upstream record's outcomes text.
const TEST_RMSE = '0.15049367657183668';

type Posts = { keys: string[]; bodies: unknown[] };
type Override = (route: Route, pathname: string) => Promise<boolean>;
async function workspace(page: Page, override?: Override, artifacts: Artifact[] = previews): Promise<Posts> {
  const posts: Posts = { keys: [], bodies: [] };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (override && await override(route, url.pathname)) return;
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation: ${url.pathname}`);
    await route.fulfill({ json: url.pathname === '/api/projects' ? [project]
      : url.pathname.endsWith('/artifact-previews') ? artifacts : url.pathname.endsWith('/jobs') ? jobs
        : url.pathname.endsWith('/job-index') ? index : [] });
  });
  return posts;
}

function failurePost(posts: Posts, respond: (count: number) => Promise<{ status: number; json: unknown }>): Override {
  return async (route, pathname) => {
    if (route.request().method() !== 'POST' || pathname !== `${base}/failure`) return false;
    posts.keys.push(route.request().headers()['idempotency-key']);
    posts.bodies.push(route.request().postDataJSON());
    await route.fulfill(await respond(posts.keys.length));
    return true;
  };
}

const accepted = (id: string) => ({ status: 202, json: { ...jobs[0], id, kind: 'failure', state: 'queued', result_id: null, error: null, started_at: null, finished_at: null } });

test('records show actor, observation, uncertainty and exact run; agent and human records stay distinct', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await workspace(page);
  await page.goto(failureHref(project.id, agentRecord.id));
  const agent = page.locator(`#failure-${agentRecord.id}`);
  await expect(agent).toBeFocused();
  await expect(agent).toContainText('Recorded by agent');
  await expect(agent).toContainText('Agent run research-run-1 · action record-outcome-1');
  await expect(agent).toContainText('fixture-provider / fixture-model');
  await expect(agent).toContainText('default-autonomy revision 2 · rule objective-observations-only');
  await expect(agent).toContainText('Missed predeclared criterion');
  await expect(agent).toContainText('/result/metrics/validation/rmse · validation');
  await expect(agent).toContainText('less than 0.05');
  await expect(agent).toContainText('Unverified causal hypotheses');
  await expect(agent).toContainText('Single seed; the threshold was declared before the run.');
  await expect(agent.getByRole('link', { name: /ridge · seed 0 · succeeded/ })).toHaveAttribute('href', `/benchmark?project=${project.id}&benchmark=${ids.ridge}#benchmark-${ids.ridge}`);

  const human = page.locator(`#failure-${humanRecord.id}`);
  await expect(human).toContainText('Human-assessed');
  await expect(human).toContainText('Operator session');
  await expect(human).toContainText('ADMISSION_REJECTED');
  await expect(human).toContainText(humanRecord.schema_version === '2.0' && humanRecord.observation.kind === 'execution_failure' ? humanRecord.observation.observed_error : '');
  const manual = page.locator(`#failure-${manualRecord.id}`);
  await expect(manual).toContainText('Human-assessed (legacy record)');
  await expect(manual).toContainText('Observed: synthetic families only. Unknown: behavior on measured data.');
  await expect(manual).toContainText('Researcher assessment');
  expect(await page.locator('main').innerText()).not.toContain(TEST_RMSE);

  await page.getByLabel('Filter by who recorded it').selectOption('agent');
  await expect(page.locator('.failure-record')).toHaveCount(1);
  await page.getByLabel('Filter by who recorded it').selectOption('human');
  await expect(page.locator('.failure-record')).toHaveCount(failures.length - 1);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('Filter by who recorded it').selectOption('all');
  await agent.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.screenshot({ path: 'test-results/a07-records-desktop.png' });
});

test('unknown receipts are distinct from confirmed ones and reconciliation keeps the original failed job', async ({ page }) => {
  await workspace(page);
  await page.goto(`/failure-memory?project=${project.id}`);
  await expect(page.locator('.receipt')).toHaveCount(index.items.length);
  const unknown = page.locator(`#receipt-${ids.unknown_job}`);
  await expect(unknown).toContainText('Outcome unknown');
  await expect(unknown).toContainText('may or may not exist in Failure Memory');
  await expect(unknown).toContainText('None confirmed');
  await expect(unknown).toContainText('Not published');
  await expect(unknown).not.toContainText('Confirmed');
  const recovered = page.locator(`#receipt-${ids.recovered_job}`);
  await expect(recovered).toContainText('Confirmed');
  await expect(recovered).toContainText('The original job is still recorded as failed (INTERNAL_ERROR)');
  await expect(recovered).toContainText('Submission attempts2');
  await expect(recovered).toContainText(ids.recovered_record);
  const artifact = index.items.find(job => job.id === ids.recovered_job)!.external_receipt!.artifact_id!;
  await expect(recovered.getByRole('link', { name: artifact })).toHaveAttribute('href', `#failure-${artifact}`);
  await expect(page.getByText('1 import has an unknown outcome')).toBeVisible();

  await page.setViewportSize({ width: 375, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await unknown.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/a07-receipts-mobile-dark.png' });
});

test('double click sends one request; a lost response is retried with the same key and the draft is preserved', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const posts: Posts = { keys: [], bodies: [] };
  await workspace(page, failurePost(posts, async count => {
    if (count === 1) return { status: 503, json: { error: 'Storage unavailable' } };
    await gate;
    return accepted('new-failure-job');
  }));
  await page.goto(`/failure-memory?project=${project.id}`);
  const save = page.getByRole('button', { name: 'Save to Failure Memory' });
  await expect(page.getByLabel('Benchmark run')).toHaveValue('');
  await page.getByLabel('Why was this run unsuccessful?').fill('Missed the high-temperature objective');
  await page.getByLabel('Uncertainty and limits').fill('Observed on one seed only');
  await expect(save).toBeDisabled();
  await page.getByLabel('Benchmark run').selectOption(ids.ridge);

  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Storage unavailable' })).toBeVisible();
  await expect(page.getByLabel('Why was this run unsuccessful?')).toHaveValue('Missed the high-temperature objective');
  await expect(page.getByLabel('Uncertainty and limits')).toHaveValue('Observed on one seed only');

  await save.dblclick();
  await expect.poll(() => posts.keys.length).toBe(2);
  release();
  await expect(page.getByRole('status').filter({ hasText: 'Accepted as job new-failure-job' })).toBeVisible();
  expect(posts.keys).toHaveLength(2);
  expect(posts.keys[1]).toBe(posts.keys[0]);
  expect(posts.bodies[1]).toEqual({ benchmark_id: ids.ridge, reason: 'Missed the high-temperature objective', uncertainty_notes: 'Observed on one seed only' });
  await expect(page.getByLabel('Why was this run unsuccessful?')).toHaveValue('');
});

test('editing a failed draft starts a new request key', async ({ page }) => {
  const posts: Posts = { keys: [], bodies: [] };
  await workspace(page, failurePost(posts, async count => count === 1 ? { status: 503, json: { error: 'Storage unavailable' } } : accepted('edited-job')));
  await page.goto(assessRunHref(project.id, ids.rejected));
  await expect(page.getByLabel('Benchmark run')).toHaveValue(ids.rejected);
  await page.getByLabel('Why was this run unsuccessful?').fill('First wording');
  await page.getByLabel('Uncertainty and limits').fill('Unknown');
  await page.getByRole('button', { name: 'Save to Failure Memory' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Storage unavailable' })).toBeVisible();
  await page.getByLabel('Why was this run unsuccessful?').fill('Second wording');
  await page.getByRole('button', { name: 'Save to Failure Memory' }).click();
  await expect(page.getByText('Accepted as job edited-job')).toBeVisible();
  expect(posts.keys[1]).not.toBe(posts.keys[0]);
});

test('unknown run and record links substitute nothing; receipt read failures are explicit and retryable', async ({ page }) => {
  let failIndex = true;
  await workspace(page, async (route, pathname) => {
    if (pathname.endsWith('/job-index') && failIndex) { failIndex = false; await route.fulfill({ status: 503, json: { error: 'Database unavailable' } }); return true; }
    return false;
  });
  await page.goto(`/failure-memory?project=${project.id}&benchmark=missing-run&failure=missing-record`);
  await expect(page.getByText('This project has no benchmark with ID missing-run')).toBeVisible();
  await expect(page.getByText('This project has no confirmed failure record with ID missing-record')).toBeVisible();
  await expect(page.getByLabel('Benchmark run')).toHaveValue('');
  await expect(page.getByRole('alert').filter({ hasText: 'Receipts unavailable: Database unavailable' })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh receipts' }).click();
  await expect(page.locator('.receipt')).toHaveCount(index.items.length);
});

test('job activity and benchmark outcome history link to failure records and to assessing the run', async ({ page }) => {
  await workspace(page);
  await page.goto(`/benchmark?project=${project.id}&benchmark=${ids.ridge}#benchmark-${ids.ridge}`);
  const run = page.locator(`#benchmark-${ids.ridge}`);
  await expect(run.getByRole('link', { name: /Record that this run did not meet my objective/ })).toHaveAttribute('href', assessRunHref(project.id, ids.ridge));
  await expect(run.getByRole('link', { name: agentRecord.reason })).toHaveAttribute('href', failureHref(project.id, agentRecord.id));
  await page.getByText('Job activity').click();
  const hrefs = await page.getByRole('link', { name: 'Inspect failure record' }).evaluateAll(links => links.map(link => link.getAttribute('href')));
  expect(hrefs).toContain(failureHref(project.id, agentRecord.id));
});

test('failure helpers never infer agent authorship or success', () => {
  expect(describeFailure(manualRecord).origin).toBe('legacy');
  const noNotes = describeFailure({ ...manualRecord, record: { record: {} } });
  expect(noNotes.uncertainty).toBeNull();
  expect(describeFailure(agentRecord).observation.details.find(([label]) => label === 'Required')?.[1]).toBe('less than 0.05');
  const job = index.items.find(value => value.id === ids.unknown_job)!;
  expect(receiptStatus(job).label).toBe('Outcome unknown');
  const confirmed = index.items.find(value => value.id === ids.recovered_job)!;
  const unpublished: JobDetail = { ...confirmed, external_receipt: { ...confirmed.external_receipt!, artifact_id: null } };
  expect(receiptStatus(unpublished).label).toBe('Confirmed, not yet published');
  const prepared: JobDetail = { ...job, external_receipt: { ...job.external_receipt!, state: 'prepared', reconciliation_required: false } };
  expect(receiptStatus(prepared).label).toBe('Prepared, not sent');
  expect(receiptStatus({ ...job, state: 'queued', external_receipt: null }).label).toBe('Not yet journaled');
  expect(receiptStatus({ ...job, external_receipt: null }).label).toBe('No receipt recorded');
  expect(draftFingerprint('a', 'b', 'c')).not.toBe(draftFingerprint('a', 'b ', 'c'));
});

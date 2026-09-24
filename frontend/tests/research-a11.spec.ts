import { expect, test, type Page, type Route } from '@playwright/test';
import fixture from './fixtures/research-request.json';
import {
  parseArtifactPreviews, parseExecutionPolicy, parseJobPage, parseMaterials, parseResearchRun, parseResearchRuns, parseRunDetail, parseRunEvents,
} from '../app/lib/decode';
import { authorized, chooseRun, runInput, runPollDelay, scopeItems, RUN_POLL_ACTIVE, RUN_POLL_MAX_BACKOFF } from '../app/lib/runs';
import { mergeEvents } from '../app/components/research-run';
import type { ResearchRun } from '../app/lib/generated/http';

// Captured through the real API, scheduler, tool registry and worker (SQLite); validated on load.
const ids = fixture.ids;
const project = fixture.project;
const policy = parseExecutionPolicy(fixture.policy);
const materials = parseMaterials(fixture.materials);
const runs = parseResearchRuns(fixture.runs);
const details = Object.fromEntries(Object.entries(fixture.details).map(([id, value]) => [id, parseRunDetail(value)]));
const events = Object.fromEntries(Object.entries(fixture.events).map(([id, value]) => [id, parseRunEvents(value)]));
const jobIndex = parseJobPage(fixture.job_index);
const previews = parseArtifactPreviews(fixture.previews);
const accepted = parseResearchRun(fixture.accepted);
const base = `/api/projects/${project.id}`;

type Post = { path: string; key: string; body: string | null; headers: Record<string, string> };
type Server = {
  policy: unknown;
  runs: ResearchRun[];
  posts: Post[];
  reads: string[];
  onPost?: (post: Post, count: number) => { status: number; json: unknown } | 'hang' | 'abort';
};

async function serve(page: Page, server: Server) {
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === 'POST') {
      const post = { path, key: request.headers()['idempotency-key'], body: request.postData(), headers: request.headers() };
      server.posts.push(post);
      const response = server.onPost?.(post, server.posts.length);
      if (!response) throw new Error(`Unexpected mutation: ${path}`);
      if (response === 'abort') await route.abort('connectionreset');
      else if (response !== 'hang') await route.fulfill(response);
      return;
    }
    server.reads.push(path + url.search);
    const detail = /\/agent-runs\/([^/]+)$/.exec(path);
    const eventRead = /\/agent-runs\/([^/]+)\/events$/.exec(path);
    const body = path === '/api/projects' ? [project]
      : path === `${base}/job-index` ? jobIndex
      : path === `${base}/artifact-previews` ? previews
      : path === `${base}/research-materials` ? materials
      : path === `${base}/execution-policy` ? server.policy
      : path === `${base}/agent-runs` ? server.runs
      : eventRead ? (events[eventRead[1]] ?? []).filter(event => event.sequence > Number(url.searchParams.get('after') ?? 0))
      : detail ? details[detail[1]]
      : undefined;
    if (body === undefined) await route.fulfill({ status: 404, json: { error: 'Not found' } });
    else await route.fulfill({ json: body });
  });
}

const server = (overrides: Partial<Server> = {}): Server => ({ policy, runs: [], posts: [], reads: [], ...overrides });
/** The newest dataset (unreviewed.csv, outside the policy) starts selected; choose the authorized one. */
async function chooseDemo(page: Page) {
  const inputs = page.getByRole('list', { name: 'Inputs' });
  await expect(inputs.getByRole('checkbox', { name: /unreviewed\.csv/ })).toBeChecked();
  await inputs.getByRole('checkbox', { name: /unreviewed\.csv/ }).uncheck();
  await inputs.getByRole('checkbox', { name: /demo\.csv/ }).check();
}

const runPosts = (s: Server) => s.posts.filter(post => post.path === `${base}/agent-runs`);

test('saved policy, input authority and one Run research click start Autopilot without another approval', async ({ page }) => {
  const s = server({ onPost: post => post.path === `${base}/agent-runs` ? { status: 202, json: fixture.accepted } : undefined as never });
  await serve(page, s);
  await page.goto('/research');

  await expect(page.getByText('Autopilot policy revision 2')).toBeVisible();
  await expect(page.getByText(/20 model requests · 60 tool calls · 8 scientific attempts · 10 active minutes/)).toBeVisible();
  await page.getByText('Policy details').click();
  await expect(page.getByText('Column schema and aggregate statistics only')).toBeVisible();
  // The project enables automatic failure records but the server ceiling does not; the intersection wins.
  await expect(page.getByText('not recorded automatically', { exact: true })).toBeVisible();

  const inputs = page.getByRole('list', { name: 'Inputs' });
  await expect(inputs.getByText('demo.csv')).toBeVisible();
  await expect(inputs.getByRole('listitem').filter({ hasText: 'unreviewed.csv' })).toContainText('not authorized by the saved policy');
  // The active (newest) dataset starts selected; here the policy does not cover it, and nothing runs without a goal.
  await expect(page.getByLabel('Active dataset', { exact: true })).toHaveValue(fixture.previews.filter(a => a.kind === 'dataset').at(-1)!.id);
  await expect(inputs.getByRole('checkbox', { name: /unreviewed\.csv/ })).toBeChecked();
  await expect(inputs.getByRole('checkbox', { name: /demo\.csv/ })).not.toBeChecked();
  const run = page.getByRole('button', { name: 'Run research' });
  await expect(run).toBeDisabled();
  const blockers = page.getByRole('list', { name: 'Before you can run' });
  await expect(blockers).toContainText('Describe the research goal.');
  await expect(blockers).toContainText('does not authorize: unreviewed.csv');

  await page.getByRole('button', { name: 'Audit a CSV' }).click();
  await expect(run).toBeDisabled();
  await inputs.getByRole('checkbox', { name: /unreviewed\.csv/ }).uncheck();
  await inputs.getByRole('checkbox', { name: /demo\.csv/ }).check();
  await page.getByLabel('Research goal').fill(fixture.request.objective);
  expect(s.posts).toHaveLength(0);

  await run.click();
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'No further approval is needed' })).toBeVisible();
  expect(runPosts(s)).toHaveLength(1);
  const body = JSON.parse(runPosts(s)[0].body!);
  expect(body).toEqual({ ...fixture.request, inputs: { material_ids: [ids.material], artifact_ids: [ids.dataset] } });
  expect(body.mode).toBe('autopilot');

  // The accepted run is shown from its durable record: plan, ordered activity, linked job and result.
  const current = page.locator(`#run-${ids.completed_run}`);
  await expect(current.getByText('completed', { exact: true }).first()).toBeVisible();
  await expect(current.getByText('Run the declared ChemData audit checks')).toBeVisible();
  const activity = current.getByRole('list', { name: 'Run events' });
  await expect(activity.getByRole('listitem')).toHaveCount(events[ids.completed_run].length);
  await expect(activity.getByRole('listitem').last()).toContainText('Result published');
  await expect(current.getByRole('link', { name: `Open Audit ${ids.audit.slice(0, 8)}` })).toHaveAttribute('href', new RegExp(`audit=${ids.audit}`));
  await expect(current.getByRole('link', { name: new RegExp(`audit job ${ids.job.slice(0, 8)}`) })).toHaveAttribute('href', `#job-${ids.job}`);
  await expect(current.getByRole('button', { name: /Accept plan/ })).toHaveCount(0);
  // No approval or other mutation followed the single click.
  await page.waitForTimeout(500);
  expect(s.posts).toHaveLength(1);
});

test('a running session survives reload without resubmission, and a lost response keeps its key', async ({ page }) => {
  const s = server({ onPost: (_post, count) => count === 1 ? 'abort' : { status: 202, json: fixture.accepted } });
  await serve(page, s);
  await page.goto('/research');
  await chooseDemo(page);
  await page.getByLabel('Research goal').fill(fixture.request.objective);
  await page.getByRole('button', { name: 'Run research' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('may already have accepted this research request');
  await expect(page.getByText('Unconfirmed research request')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Unconfirmed research request')).toBeVisible();
  await page.waitForTimeout(1_000);
  expect(s.posts).toHaveLength(1);

  // Same goal and inputs reuse the retained key.
  await chooseDemo(page);
  await page.getByLabel('Research goal').fill(fixture.request.objective);
  await page.getByRole('button', { name: 'Run research' }).click();
  await expect(page.locator(`#run-${ids.completed_run}`)).toBeVisible();
  expect(s.posts.map(post => post.key)).toEqual([s.posts[0].key, s.posts[0].key]);
  await expect(page.getByText('Unconfirmed research request')).toHaveCount(0);

  // After a reload the remembered run is read again from history; nothing is posted.
  s.runs = runs;
  await page.reload();
  await expect(page.getByLabel('Research run')).toHaveValue(ids.completed_run);
  await expect(page.locator(`#run-${ids.completed_run}`).getByRole('list', { name: 'Run events' }).getByRole('listitem')).toHaveCount(events[ids.completed_run].length);
  expect(s.posts).toHaveLength(2);
});

test('an unfinished run is found from server history in a fresh browser and polled by sequence', async ({ page }) => {
  const s = server({ runs });
  await serve(page, s);
  await page.goto('/research');
  // No remembered run in this browser: the unfinished review run is chosen over the finished one.
  await expect(page.getByLabel('Research run')).toHaveValue(ids.review_run);
  const current = page.locator(`#run-${ids.review_run}`);
  await expect(current.getByText('waiting for input', { exact: true }).first()).toBeVisible();
  await expect.poll(() => s.reads.filter(read => read.startsWith(`${base}/agent-runs/${ids.review_run}/events`)).length, { timeout: 10_000 }).toBeGreaterThan(1);
  const cursors = s.reads.filter(read => read.includes(`${ids.review_run}/events`)).map(read => Number(new URLSearchParams(read.split('?')[1]).get('after')));
  expect(cursors[0]).toBe(0);
  expect(cursors.at(-1)).toBe(events[ids.review_run].at(-1)!.sequence);
  await expect(current.getByRole('list', { name: 'Run events' }).getByRole('listitem')).toHaveCount(events[ids.review_run].length);
});

test('optional Review plan sends the mode and accepts exactly the reviewed revision', async ({ page }) => {
  const reviewDetail = details[ids.review_run];
  const s = server({ runs, onPost: post => post.path.endsWith('/review-plan')
    ? { status: 200, json: { ...reviewDetail.run, state: 'queued', control_revision: reviewDetail.run.control_revision + 1 } }
    : { status: 202, json: fixture.review_accepted } });
  await serve(page, s);
  await page.goto('/research');
  const current = page.locator(`#run-${ids.review_run}`);
  await expect(current.getByText('Plan ready for your review')).toBeVisible();
  await current.getByRole('button', { name: 'Accept plan revision 1' }).click();
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'Plan revision 1 accepted.' })).toBeVisible();
  const review = s.posts.find(post => post.path.endsWith('/review-plan'))!;
  expect(review.path).toBe(`${base}/agent-runs/${ids.review_run}/review-plan`);
  expect(JSON.parse(review.body!)).toEqual({ expected_run_revision: reviewDetail.run.control_revision, expected_plan_revision: 1 });

  await chooseDemo(page);
  await page.getByLabel('Research goal').fill('Audit demo.csv, then split it by formulation and compare mean and ridge baselines.');
  await page.getByRole('checkbox', { name: /Review the plan before scientific work starts/ }).check();
  await page.getByRole('button', { name: 'Run research' }).click();
  expect(JSON.parse(runPosts(s)[0].body!).mode).toBe('review_plan');
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'pause once for your review' })).toBeVisible();
});

test('missing policy or unavailable agents keep Run research disabled with the reason; manual tools stay linked', async ({ page }) => {
  const s = server({ policy: { project_id: project.id, policy: null, agent_available: false, unavailable_reason: 'Agent execution is disabled (WB_AGENTS_ENABLED=0); use the manual workflow.' } });
  await serve(page, s);
  await page.goto('/research');
  await page.getByLabel('Research goal').fill('Audit the dataset.');
  const blockers = page.getByRole('list', { name: 'Before you can run' });
  await expect(blockers).toContainText('No saved execution policy covers this project');
  await expect(blockers).toContainText('WB_AGENTS_ENABLED=0');
  await expect(page.getByRole('button', { name: 'Run research' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Inspect dataset' })).toBeVisible();
  await expect(page.getByText('No research has been requested in this project yet.')).toBeVisible();
});

test('dropped files are attached without starting research; provenance is left unknown', async ({ page }) => {
  const s = server({ onPost: post => post.path === `${base}/research-materials` ? { status: 201, json: fixture.materials[1] } : undefined as never });
  await serve(page, s);
  await page.goto('/research');
  await expect(page.getByText('Autopilot policy revision 2')).toBeVisible();
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['x,y\n1,2\n2,3\n3,4\n'], 'dropped.csv', { type: 'text/csv' }));
    return data;
  });
  await page.locator('.dropzone').dispatchEvent('drop', { dataTransfer: transfer });
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'Attaching does not start research' })).toBeVisible();
  expect(s.posts.map(post => post.path)).toEqual([`${base}/research-materials`]);
  const { headers } = s.posts[0];
  expect(headers['content-type']).toBe('text/csv');
  expect(headers['x-filename']).toBe('dropped.csv');
  expect(headers['x-source']).toBeUndefined();
  expect(headers['idempotency-key']).toBeTruthy();
  expect(runPosts(s)).toHaveLength(0);
});

test('keyboard reaches the composer controls and the workspace fits a phone', async ({ page }) => {
  await serve(page, server({ runs }));
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/research');
  await expect(page.getByText('Autopilot policy revision 2')).toBeVisible();
  await page.getByLabel('Research goal').focus();
  await page.keyboard.type('Audit demo.csv.');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Audit a CSV' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/a11-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/a11-desktop.png', fullPage: true });
});

test('run helpers: scope authority, request body, run choice, event merge and poll cadence', () => {
  const items = scopeItems(materials, []);
  const demo = items.find(item => item.id === ids.material)!;
  expect(demo.artifact_ids).toEqual([ids.dataset]);
  expect(authorized(demo, policy.policy)).toBe(true);
  expect(authorized(items.find(item => item.id === ids.unauthorized)!, policy.policy)).toBe(false);
  expect(authorized(demo, null)).toBe(false);
  expect(runInput('  Goal  ', [demo, demo], policy.policy!, 'autopilot')).toEqual({
    objective: 'Goal', mode: 'autopilot', inputs: { material_ids: [ids.material], artifact_ids: [ids.dataset] },
    policy_revision: 2, limits: policy.policy!.limits,
  });
  expect(chooseRun(runs, ids.completed_run)?.id).toBe(ids.completed_run);
  expect(chooseRun(runs, 'forgotten')?.id).toBe(ids.review_run);
  const all = events[ids.completed_run];
  expect(mergeEvents(all.slice(0, 4), all.slice(2)).map(e => e.sequence)).toEqual(all.map(e => e.sequence));
  expect(runPollDelay({ failures: 0, hidden: false })).toBe(RUN_POLL_ACTIVE);
  expect(runPollDelay({ failures: 10, hidden: false })).toBe(RUN_POLL_MAX_BACKOFF);
  expect(accepted.state).toBe('queued');
});

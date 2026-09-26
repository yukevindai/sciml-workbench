/**
 * A10 browser acceptance against a real local stack: Compose PostgreSQL, API, scientific
 * worker and web, with no request interception. Agent runs are advanced by the scripted
 * coordinator (scripts/acceptance/scripted_coordinator.py); no model provider is called.
 * Run through scripts/acceptance/run_a10.sh, which sets E2E_REAL_STACK and the compose command.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const ROOT = resolve(__dirname, '../..');
const COMPOSE = (process.env.A10_COMPOSE ?? 'docker compose').split(' ');
const stamp = Date.now().toString(36);

test.skip(!process.env.E2E_REAL_STACK, 'Requires the A10 local stack (scripts/acceptance/run_a10.sh).');
test.describe.configure({ mode: 'serial' });

function compose(args: string[], input?: string | Buffer): string {
  return execFileSync(COMPOSE[0], [...COMPOSE.slice(1), ...args], { cwd: ROOT, input, timeout: 180_000 }).toString('utf8');
}
const provision = (pid: string) => compose(['exec', '-T', 'api', 'python', '-', pid], readFileSync(resolve(ROOT, 'scripts/acceptance/provision_policy.py'), 'utf8'));

async function json<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/${path}`);
  expect(response.status(), path).toBe(200);
  return response.json() as Promise<T>;
}

type Run = { id: string; state: string; objective: string; result_artifact_ids: string[] };
const state: { a?: string; b?: string; completed?: Run; posts: string[] } = { posts: [] };

async function createProject(page: Page, name: string): Promise<string> {
  await page.goto('/projects');
  await page.getByLabel('Project name').fill(name);
  await page.getByLabel('Research question').fill('Can a single request audit this table end to end?');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByLabel('Active project', { exact: true }).locator('option:checked')).toHaveText(name);
  return page.getByLabel('Active project', { exact: true }).inputValue();
}

async function attach(page: Page, file: string) {
  await page.goto('/research');
  await page.getByLabel('Attach files').setInputFiles(file);
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'Attaching does not start research' })).toBeVisible({ timeout: 30_000 });
}

function countPosts(page: Page) {
  page.on('request', request => { if (request.method() === 'POST') state.posts.push(new URL(request.url()).pathname); });
}

async function runRequest(page: Page, goal: string, { review = false } = {}) {
  await page.goto('/research');
  await expect(page.getByText(/Autopilot policy revision \d+/)).toBeVisible();
  const inputs = page.getByRole('list', { name: 'Inputs' });
  for (const box of await inputs.getByRole('checkbox').all()) if (!(await box.isChecked())) await box.check();
  await page.getByLabel('Research goal').fill(goal);
  if (review) await page.getByRole('checkbox', { name: /Review the plan/ }).check();
  await page.getByRole('button', { name: 'Run research' }).click();
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: /Research accepted/ })).toBeVisible();
  const runs = await json<Run[]>(page, `projects/${state.a}/agent-runs?limit=100`);
  const run = runs.find(value => value.objective === goal);
  expect(run, 'accepted run is persisted').toBeTruthy();
  return { run: run!, card: page.locator(`#run-${run!.id}`) };
}

test('private access: anonymous requests are refused; health stays public', async ({ browser, baseURL }) => {
  const anonymous = await browser.newContext({ baseURL, httpCredentials: undefined });
  for (const path of ['/', '/research', '/api/projects', '/api/projects/x/agent-runs/y/events', '/api/projects/x/agent-runs/y/stream', '/api/projects/x/artifacts/y/download']) {
    expect((await anonymous.request.get(path)).status(), path).toBe(401);
  }
  expect((await anonymous.request.post('/api/projects', { data: { name: 'x', description: '' } })).status()).toBe(401);
  const health = await anonymous.request.get('/healthz');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok' });
  await anonymous.close();
});

test('one request completes under Autopilot and the browser matches persisted results', async ({ page }) => {
  test.setTimeout(300_000);
  countPosts(page);
  state.a = await createProject(page, `A10 electrolyte ${stamp}`);
  await attach(page, resolve(ROOT, 'examples/demo.csv'));
  await page.goto('/research');
  await expect(page.getByRole('list', { name: 'Before you can run' })).toContainText('does not authorize: demo.csv');
  provision(state.a);   // The operator grants the new attachment; the product has no policy-write route.
  await page.reload();
  await expect(page.getByRole('list', { name: 'Inputs' })).toContainText('authorized by the saved policy');
  await expect(page.getByRole('list', { name: 'Inputs' })).not.toContainText('not authorized');
  await expect(page.getByText(/Autopilot policy revision \d+/)).toBeVisible();

  // Keyboard only: goal, then Run research.
  await page.getByLabel('Research goal').focus();
  await page.keyboard.type('Audit demo.csv for missing values and duplicate rows.');
  const run = page.getByRole('button', { name: 'Run research' });
  await expect(run).toBeEnabled();
  for (let i = 0; i < 30 && !(await run.evaluate(el => el === document.activeElement)); i += 1) await page.keyboard.press('Tab');
  await expect(run).toBeFocused();
  const before = state.posts.length;
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'No further approval is needed' })).toBeVisible();
  const runs = await json<Run[]>(page, `projects/${state.a}/agent-runs?limit=100`);
  expect(runs).toHaveLength(1);
  const card = page.locator(`#run-${runs[0].id}`);
  await expect(card.getByRole('group', { name: 'Run status' }).getByText('completed', { exact: true })).toBeVisible({ timeout: 180_000 });
  // Exactly one mutation after the click: the run itself. No approval followed.
  expect(state.posts.slice(before)).toEqual([`/api/projects/${state.a}/agent-runs`]);

  const result = await json<{ state: string; artifact_ids: string[] }>(page, `projects/${state.a}/agent-runs/${runs[0].id}/result`);
  expect(result.state).toBe('completed');
  expect(result.artifact_ids).toHaveLength(1);
  const audit = await json<{ kind: string; id: string }>(page, `projects/${state.a}/artifacts/${result.artifact_ids[0]}`);
  expect(audit.kind).toBe('audit');
  await expect(card.getByRole('link', { name: `Open Audit ${audit.id.slice(0, 8)}` })).toBeVisible();
  const events = await json<{ sequence: number }[]>(page, `projects/${state.a}/agent-runs/${runs[0].id}/events?after=0&limit=500`);
  await expect(card.getByRole('list', { name: 'Run events' }).getByRole('listitem')).toHaveCount(events.length);
  state.completed = { ...runs[0], state: 'completed' };

  // A reload returns to the same run and submits nothing.
  const mark = state.posts.length;
  await page.reload();
  await expect(page.getByLabel('Research run')).toHaveValue(runs[0].id);
  await expect(page.locator(`#run-${runs[0].id}`).getByRole('list', { name: 'Run events' }).getByRole('listitem')).toHaveCount(events.length);
  expect(state.posts.slice(mark)).toEqual([]);
});

test('optional Review plan waits once, then completes after acceptance', async ({ page }) => {
  test.setTimeout(300_000);
  const { run, card } = await runRequest(page, `Audit demo.csv after I review the plan (${stamp}).`, { review: true });
  expect(run.state).toBe('queued');
  await expect(card.getByText('Plan ready for your review')).toBeVisible({ timeout: 60_000 });
  await card.getByRole('button', { name: 'Accept plan revision 1' }).click();
  await expect(card.getByRole('group', { name: 'Run status' }).getByText('completed', { exact: true })).toBeVisible({ timeout: 180_000 });
});

test('a targeted question is answered once and the run completes; a double click submits one run', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/research');
  await expect(page.getByText(/Autopilot policy revision \d+/)).toBeVisible();
  const goal = `Audit demo.csv and report conductivity units (${stamp}).`;
  await page.getByLabel('Research goal').fill(goal);
  const before = (await json<Run[]>(page, `projects/${state.a}/agent-runs?limit=100`)).length;
  await page.getByRole('button', { name: 'Run research' }).dblclick();
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: /Research accepted/ })).toBeVisible();
  const runs = await json<Run[]>(page, `projects/${state.a}/agent-runs?limit=100`);
  expect(runs).toHaveLength(before + 1);
  const run = runs.find(value => value.objective === goal)!;
  const card = page.locator(`#run-${run.id}`);
  const question = card.locator('.clarification');
  await expect(question).toBeVisible({ timeout: 60_000 });
  await question.getByRole('radio', { name: /mS\/cm/ }).check();
  await page.reload();
  await expect(question.getByRole('radio', { name: /mS\/cm/ })).toBeChecked();
  await question.getByRole('button', { name: 'Submit answers' }).click();
  await expect(card.getByRole('group', { name: 'Run status' }).getByText('completed', { exact: true })).toBeVisible({ timeout: 180_000 });
});

test('pause, resume and cancel act on a run whose job is waiting; cancellation fences the owned job', async ({ page }) => {
  test.setTimeout(300_000);
  compose(['stop', 'worker']);   // Keep the audit job queued so the controls act on in-flight work.
  try {
    const { run, card } = await runRequest(page, `Audit demo.csv; I may stop this (${stamp}).`);
    await expect(card.getByRole('group', { name: 'Run status' }).getByText('waiting for job', { exact: true })).toBeVisible({ timeout: 60_000 });
    await card.getByRole('button', { name: 'Pause' }).click();
    const ack = card.getByRole('status', { name: 'Control acknowledgment' });
    await expect(ack).toContainText(/Recorded state\s*paused/);
    await expect(ack).toContainText(/audit job [0-9a-f]{8} \(queued\)/);
    await card.getByRole('button', { name: 'Resume' }).click();
    await expect(ack).toContainText(/Recorded state\s*queued/);
    await card.getByRole('button', { name: 'Cancel run…' }).click();
    await card.getByRole('button', { name: 'Cancel this run' }).click();
    await expect(ack).toContainText(/Recorded state\s*cancelled/);
    const detail = await json<{ run: { state: string }; actions: { job_id: string; state: string }[] }>(page, `projects/${state.a}/agent-runs/${run.id}`);
    expect(detail.run.state).toBe('cancelled');
    const job = await json<{ state: string; error_code: string }>(page, `projects/${state.a}/jobs/${detail.actions[0].job_id}`);
    expect(job).toMatchObject({ state: 'failed', error_code: 'RUN_CANCELLED' });
  } finally {
    compose(['start', 'worker']);
  }
});

test('an API outage is survived without resubmission and events reconnect without duplicates', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/research');
  await page.getByLabel('Research run').selectOption(state.completed!.id);
  const card = page.locator(`#run-${state.completed!.id}`);
  const events = card.getByRole('list', { name: 'Run events' }).getByRole('listitem');
  const persisted = await json<{ sequence: number }[]>(page,
    `projects/${state.a}/agent-runs/${state.completed!.id}/events?after=0&limit=500`);
  const count = persisted.length;
  expect(count, 'completed run has persisted events before the outage').toBeGreaterThan(0);
  await expect(events).toHaveCount(count);
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  compose(['stop', 'api']);
  try {
    await page.reload();
    await expect(page.getByRole('main').getByRole('alert').first()).toBeVisible({ timeout: 60_000 });
  } finally {
    compose(['start', 'api']);
  }
  await expect.poll(async () => (await page.request.get('/api/projects')).status(), { timeout: 120_000 }).toBe(200);
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await page.getByLabel('Research run').selectOption(state.completed!.id);
  await expect(page.locator(`#run-${state.completed!.id}`).getByRole('list', { name: 'Run events' }).getByRole('listitem')).toHaveCount(count, { timeout: 60_000 });
  const sequences = await page.locator(`#run-${state.completed!.id} .run-event-seq`).allTextContents();
  expect(new Set(sequences).size).toBe(sequences.length);
  expect(posts).toEqual([]);
});

test('two projects and datasets never leak selection, inputs or runs', async ({ page }) => {
  test.setTimeout(300_000);
  const dir = resolve(ROOT, 'frontend/test-results/a10');
  mkdirSync(dir, { recursive: true });
  const second = resolve(dir, `membranes-${stamp}.csv`);
  writeFileSync(second, ['sample_id,membrane,thickness_um,permeance', ...Array.from({ length: 24 }, (_, i) =>
    `m-${i},${['PA', 'PES', 'PVDF'][i % 3]},${(80 + i * 1.5).toFixed(1)},${(2 + (i % 5) * 0.3).toFixed(2)}`)].join('\n') + '\n');
  state.b = await createProject(page, `A10 membranes ${stamp}`);
  await attach(page, second);
  await page.goto('/research');
  const inputs = page.getByRole('list', { name: 'Inputs' });
  await expect(inputs).toContainText(`membranes-${stamp}.csv`);
  await expect(inputs).not.toContainText('demo.csv');
  await expect(page.getByText('No research has been requested in this project yet.')).toBeVisible();
  // Only the disabled placeholder and B's own dataset.
  await expect(page.getByLabel('Active dataset', { exact: true }).locator('option')).toHaveText(['No dataset selected', new RegExp(`^membranes-${stamp}\.csv · `)]);
  // B's attachment is not authorized by A's grants.
  await expect(page.getByRole('list', { name: 'Before you can run' })).toContainText(`does not authorize: membranes-${stamp}.csv`);

  await page.getByLabel('Active project', { exact: true }).selectOption(state.a!);
  await expect(page.getByLabel('Research run')).toBeVisible();
  const aRuns = await json<Run[]>(page, `projects/${state.a}/agent-runs?limit=100`);
  expect(await page.getByLabel('Research run').locator('option').count()).toBe(aRuns.length);
  await expect(page.getByRole('list', { name: 'Inputs' })).not.toContainText('membranes');
  const bRuns = await json<Run[]>(page, `projects/${state.b}/agent-runs?limit=100`);
  expect(bRuns).toEqual([]);
});

test('a manual project export downloads and verifies against its recorded digest', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/report');
  await page.getByLabel('Active project', { exact: true }).selectOption(state.a!);
  await page.getByRole('button', { name: 'Export project' }).click();
  const inspect = page.getByRole('link', { name: 'Inspect archive' }).first();
  await expect(inspect).toBeVisible({ timeout: 180_000 });
  await inspect.click();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download ZIP' }).first().click();
  const file = await (await download).path();
  const bytes = readFileSync(file!);
  const reportId = new URL(page.url()).searchParams.get('report')!;
  const report = await json<{ kind: string; sha256: string }>(page, `projects/${state.a}/artifacts/${reportId}`);
  expect(report.kind).toBe('report');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(report.sha256);
  const target = `/tmp/a10-${stamp}.zip`;
  compose(['exec', '-T', 'api', 'sh', '-c', `cat > ${target}`], bytes);
  const verified = compose(['exec', '-T', 'api', 'python', '-m', 'workbench.replay', target, '--verify-only']);
  expect(verified).toContain('Report structure verified; scientific replay not run.');
});

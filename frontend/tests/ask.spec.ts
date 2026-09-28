import { expect, test, type Page, type Route } from '@playwright/test';
import fixture from './fixtures/research-request.json';
import { parseExecutionPolicy } from '../app/lib/decode';

// The simple Ask home against the same captured A11 responses: one prompt box does
// everything the detailed request form does, and refuses with plain words when it can't.
const project = fixture.project;
const base = `/api/projects/${project.id}`;
const policy = parseExecutionPolicy(fixture.policy);
const both = { ...policy, policy: { ...policy.policy!, material_ids: fixture.materials.map(m => m.id),
  artifact_ids: fixture.materials.map(m => m.dataset_id!), project_policy_revision: 3,
  reference: { ...policy.policy!.reference, policy_id: 'auto-project', revision: 3 } } };

type Post = { path: string; body: string | null };

async function serve(page: Page, onPost: (post: Post) => { status: number; json: unknown } | undefined,
  savedPolicy: unknown = fixture.policy) {
  const posts: Post[] = [];
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === 'POST') {
      const post = { path, body: request.postData() };
      posts.push(post);
      const response = onPost(post);
      if (!response) throw new Error(`Unexpected mutation: ${path}`);
      await route.fulfill(response);
      return;
    }
    const detail = /\/agent-runs\/([^/]+)$/.exec(path);
    const body = path === '/api/projects' ? [project]
      : path === `${base}/job-index` ? fixture.job_index
      : path === `${base}/artifact-previews` ? fixture.previews
      : path === `${base}/research-materials` ? fixture.materials
      : path === `${base}/execution-policy` ? savedPolicy
      : path === `${base}/agent-runs` ? []
      : /\/events$/.test(path) ? []
      : detail ? (fixture.details as Record<string, unknown>)[detail[1]]
      : undefined;
    if (body === undefined) await route.fulfill({ status: 404, json: { error: 'Not found' } });
    else await route.fulfill({ json: body });
  });
  return posts;
}

const runPosts = (posts: Post[]) => posts.filter(post => post.path === `${base}/agent-runs`);

test('one prompt starts the assistant with the files the person kept switched on', async ({ page }) => {
  const posts = await serve(page, post => post.path === `${base}/agent-runs` ? { status: 202, json: fixture.accepted } : undefined);
  await page.goto('/ask');
  await expect(page.getByRole('heading', { name: 'What would you like to find out?' })).toBeVisible();
  // Earlier files are offered, all on; the one outside the saved permissions is switched off.
  const unreviewed = page.getByRole('button', { name: 'unreviewed.csv' });
  await expect(unreviewed).toHaveAttribute('aria-pressed', 'true');
  await unreviewed.click();
  await expect(unreviewed).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Check my data for problems' }).click();
  await expect(page.getByLabel('What would you like to find out?')).toHaveValue(/Check the attached spreadsheet/);
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByRole('article', { name: /Your request/ })).toBeVisible();
  // The captured record of this run has since finished, so the reply reads it back in plain words.
  await expect(page.getByRole('status').filter({ hasText: 'Done' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The plan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
  const [sent] = runPosts(posts);
  const body = JSON.parse(sent.body!);
  expect(body.mode).toBe('autopilot');
  expect(body.inputs.material_ids).toEqual([fixture.materials[0].id]);
  expect(body.policy_revision).toBe(policy.policy!.project_policy_revision);
  expect(posts.some(post => post.path.endsWith('/execution-policy/auto'))).toBe(false);
});

test('files outside the saved permissions are granted automatically when the server allows it', async ({ page }) => {
  const posts = await serve(page, post => post.path === `${base}/execution-policy/auto` ? { status: 200, json: both }
    : post.path === `${base}/agent-runs` ? { status: 202, json: fixture.accepted } : undefined);
  await page.goto('/ask');
  await page.getByLabel('What would you like to find out?').fill('Compare both spreadsheets.');
  await page.getByRole('checkbox', { name: 'Show me the plan first' }).check();
  await page.getByLabel('What would you like to find out?').press('Enter');
  await expect(page.getByRole('article', { name: /Your request/ })).toBeVisible();
  const body = JSON.parse(runPosts(posts)[0].body!);
  expect(body.mode).toBe('review_plan');
  expect(body.policy_revision).toBe(3);
  expect(body.inputs.material_ids.sort()).toEqual(fixture.materials.map(m => m.id).sort());
  // Automatic policies cap each request below the project-wide allowance.
  expect(body.limits.model_requests).toBeLessThanOrEqual(40);
});

test('a refused grant is explained in plain words and nothing is started', async ({ page }) => {
  const posts = await serve(page, post => post.path === `${base}/execution-policy/auto`
    ? { status: 409, json: { error: 'Automatic agent access is turned off on this server.' } } : undefined);
  await page.goto('/ask');
  await page.getByLabel('What would you like to find out?').fill('Compare both spreadsheets.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('isn’t allowed to use these files yet');
  await expect(page.getByLabel('What would you like to find out?')).toHaveValue('Compare both spreadsheets.');
  expect(runPosts(posts)).toHaveLength(0);
});

test('existing automatic policies refresh and submit a shared specialist budget', async ({ page }) => {
  const refreshed = { ...both, policy: { ...both.policy, limits: {
    ...both.policy.limits, model_requests: 1000, specialist_assignments: 1000, specialist_concurrency: 2,
  } } };
  const posts = await serve(page, post => post.path === `${base}/execution-policy/auto`
    ? { status: 200, json: refreshed }
    : post.path === `${base}/agent-runs` ? { status: 202, json: fixture.accepted } : undefined, both);
  await page.goto('/ask');
  await page.getByLabel('What would you like to find out?').fill('Check independent aspects of both spreadsheets.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('article', { name: /Your request/ })).toBeVisible();
  expect(posts.filter(post => post.path.endsWith('/execution-policy/auto'))).toHaveLength(1);
  const body = JSON.parse(runPosts(posts)[0].body!);
  expect(body.limits.specialist_assignments).toBe(body.limits.model_requests);
  expect(body.limits.specialist_assignments).toBe(40);
  expect(body.limits.specialist_concurrency).toBe(2);
});

test('an existing policy still works when automatic refresh has been disabled', async ({ page }) => {
  const posts = await serve(page, post => post.path === `${base}/execution-policy/auto`
    ? { status: 409, json: { error: 'Automatic access disabled' } }
    : post.path === `${base}/agent-runs` ? { status: 202, json: fixture.accepted } : undefined, both);
  await page.goto('/ask');
  await page.getByLabel('What would you like to find out?').fill('Check the permitted files.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('article', { name: /Your request/ })).toBeVisible();
  expect(JSON.parse(runPosts(posts)[0].body!).limits.specialist_assignments).toBe(4);
});

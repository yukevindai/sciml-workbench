import { expect, test, type Page, type Route } from '@playwright/test';
import fixture from './fixtures/research-request.json';
import {
  parseArtifactPreviews, parseExecutionPolicy, parseJobPage, parseMaterials, parseResearchRun, parseResearchRuns, parseRunDetail, parseRunEvents,
} from '../app/lib/decode';
import { authorized, chooseRun, runInput, runPollDelay, scopeItems, RUN_POLL_ACTIVE, RUN_POLL_MAX_BACKOFF } from '../app/lib/runs';
import { mergeEvents } from '../app/lib/run-feed';
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

test('an unfinished run is found from server history in a fresh browser and polled by sequence', async ({ page }) => {
  const s = server({ runs });
  await serve(page, s);
  await page.goto('/research');
  // No remembered run in this browser: the unfinished review run is chosen over the finished one.
  await expect(page.getByLabel('Research run')).toHaveAttribute('value', ids.review_run);
  const current = page.locator(`#run-${ids.review_run}`);
  await expect(current.getByText('waiting for input', { exact: true }).first()).toBeVisible();
  await expect.poll(() => s.reads.filter(read => read.startsWith(`${base}/agent-runs/${ids.review_run}/events`)).length, { timeout: 10_000 }).toBeGreaterThan(1);
  const cursors = s.reads.filter(read => read.includes(`${ids.review_run}/events`)).map(read => Number(new URLSearchParams(read.split('?')[1]).get('after')));
  expect(cursors[0]).toBe(0);
  expect(cursors.at(-1)).toBe(events[ids.review_run].at(-1)!.sequence);
  await expect(current.getByText('Research team', { exact: true })).toBeVisible();
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

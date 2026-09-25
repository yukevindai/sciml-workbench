import { expect, test, type Page, type Route } from '@playwright/test';
import fixture from './fixtures/run-controls.json';
import {
  parseArtifactPreviews, parseExecutionPolicy, parseJobPage, parseMaterials, parseResearchRun, parseResearchRuns, parseRunDetail, parseRunEvents,
} from '../app/lib/decode';
import { controlsFor } from '../app/components/run-controls';
import type { JobPage, ResearchRun, RunDetail } from '../app/lib/generated/http';

// Captured through the real API, scheduler, specialist service, tool registry and worker (SQLite).
const ids = fixture.ids;
const project = fixture.project;
const base = `/api/projects/${project.id}`;
const events = Object.fromEntries(Object.entries(fixture.events).map(([id, value]) => [id, parseRunEvents(value)]));
const detail = (value: unknown) => parseRunDetail(value);

type Post = { path: string; key: string; body: string | null };
type Server = {
  runs: ResearchRun[];
  details: Record<string, RunDetail>;
  jobs: JobPage;
  stream: (runId: string, after: string, count: number) => { status: number; body: string } | null;
  streams: { runId: string; lastEventId: string | undefined; url: string }[];
  reads: string[];
  posts: Post[];
  onPost?: (post: Post, count: number) => { status: number; json: unknown };
};

async function serve(page: Page, server: Server) {
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === 'POST') {
      const post = { path, key: request.headers()['idempotency-key'], body: request.postData() };
      server.posts.push(post);
      const response = server.onPost?.(post, server.posts.length);
      if (!response) throw new Error(`Unexpected mutation: ${path}`);
      await route.fulfill(response);
      return;
    }
    server.reads.push(path + url.search);
    const stream = /\/agent-runs\/([^/]+)\/stream$/.exec(path);
    if (stream) {
      const lastEventId = (await request.allHeaders())['last-event-id'];
      server.streams.push({ runId: stream[1], lastEventId, url: url.search });
      // As the backend does: the later of the query cursor and Last-Event-ID.
      const after = String(Math.max(Number(url.searchParams.get('after') ?? 0), Number(lastEventId ?? 0)));
      const reply = server.stream(stream[1], after, server.streams.filter(s => s.runId === stream[1]).length);
      if (!reply) { await route.fulfill({ status: 503, json: { error: 'Stream unavailable' } }); return; }
      await route.fulfill({ status: reply.status, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' }, body: reply.body });
      return;
    }
    const eventRead = /\/agent-runs\/([^/]+)\/events$/.exec(path);
    const detailRead = /\/agent-runs\/([^/]+)$/.exec(path);
    const body = path === '/api/projects' ? [project]
      : path === `${base}/job-index` ? server.jobs
      : path === `${base}/artifact-previews` ? parseArtifactPreviews(fixture.previews)
      : path === `${base}/research-materials` ? parseMaterials(fixture.materials)
      : path === `${base}/execution-policy` ? parseExecutionPolicy(fixture.policy)
      : path === `${base}/agent-runs` ? server.runs
      : eventRead ? (events[eventRead[1]] ?? []).filter(event => event.sequence > Number(url.searchParams.get('after') ?? 0))
      : detailRead ? server.details[detailRead[1]]
      : undefined;
    if (body === undefined) await route.fulfill({ status: 404, json: { error: 'Not found' } });
    else await route.fulfill({ json: body });
  });
}

/** SSE text exactly as the backend frames it: bounded replay after the cursor, then close. */
function sse(runId: string, after: number) {
  return 'retry: 2000\n\n' + events[runId].filter(e => e.sequence > after)
    .map(e => `id: ${e.sequence}\nevent: ${e.event_type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

function server(selected: string, overrides: Partial<Server> = {}): Server {
  const runs = parseResearchRuns(fixture.runs);
  return {
    runs,
    details: {
      [ids.partial]: detail(fixture.partial_detail),
      [ids.asking]: detail(fixture.asking_detail),
      [ids.control]: detail(fixture.control_running),
    },
    jobs: parseJobPage(fixture.job_index),
    stream: (runId, after) => ({ status: 200, body: sse(runId, Number(after ?? 0)) }),
    streams: [], reads: [], posts: [],
    ...overrides,
  };
}

async function open(page: Page, s: Server, runId: string) {
  await page.addInitScript(([pid, rid]) => localStorage.setItem(`sciml-run:${pid}`, rid), [project.id, runId]);
  await serve(page, s);
  await page.goto('/research');
  await expect(page.getByLabel('Research run')).toHaveValue(runId);
  return page.locator(`#run-${runId}`);
}

test('events stream over SSE, reconnect from the last sequence, and replays never duplicate', async ({ page }) => {
  // The first two connections replay everything regardless of the cursor, as a restarted server might.
  const s = server(ids.asking, { stream: (runId, after, count) => ({ status: 200, body: count <= 2 ? sse(runId, 0) : sse(runId, Number(after)) }) });
  const current = await open(page, s, ids.asking);
  const expected = events[ids.asking];
  await expect(current.getByText(/^Live: events arrive over the activity stream/)).toBeVisible();
  await expect.poll(() => s.streams.filter(entry => entry.runId === ids.asking).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  const list = current.getByRole('list', { name: 'Run events' });
  await expect(list.getByRole('listitem')).toHaveCount(expected.length);
  const sequences = await list.locator('.run-event-seq').allTextContents();
  expect(sequences).toEqual(expected.map(e => `#${e.sequence}`));
  // Each reconnect asks for events after the last one received.
  const reconnects = s.streams.filter(entry => entry.runId === ids.asking).slice(1);
  expect(reconnects.every(entry => entry.url === `?after=${expected.at(-1)!.sequence}`)).toBe(true);
  // Streaming replaces event polling for an unfinished run.
  expect(s.reads.filter(read => read.includes(`${ids.asking}/events`))).toHaveLength(0);
  // The backend's captured framing (taken before the answer added events) matches this replay's prefix.
  expect(sse(ids.asking, 0).startsWith(fixture.asking_stream)).toBe(true);
  expect(sse(ids.asking, 3).startsWith(fixture.asking_stream_after)).toBe(true);
  expect(fixture.asking_stream_after).not.toMatch(/^id: [123]$/m);
});

test('a refused stream falls back to polling by sequence', async ({ page }) => {
  const s = server(ids.asking, { stream: () => null });
  const current = await open(page, s, ids.asking);
  await expect(current.getByText(/^Polling: the activity stream is unavailable/)).toBeVisible();
  await expect(current.getByRole('list', { name: 'Run events' }).getByRole('listitem')).toHaveCount(events[ids.asking].length);
  await expect.poll(() => s.reads.filter(read => read.includes(`${ids.asking}/events`)).length, { timeout: 10_000 }).toBeGreaterThan(1);
  const cursors = s.reads.filter(read => read.includes(`${ids.asking}/events`)).map(read => Number(new URLSearchParams(read.split('?')[1]).get('after')));
  expect(cursors[0]).toBe(0);
  expect(cursors.at(-1)).toBe(events[ids.asking].at(-1)!.sequence);
});

test('one clarification card keeps drafts across refresh, reports a stale revision, then records the answer', async ({ page }) => {
  const s = server(ids.asking, { onPost: (post, count) => {
    expect(post.path).toBe(`${base}/agent-runs/${ids.asking}/questions/${ids.question}/answer`);
    if (count === 1) return { status: fixture.answer_stale.status, json: fixture.answer_stale.body };
    s.details[ids.asking] = detail(fixture.answered_detail);
    return { status: 200, json: fixture.answered_run };
  } });
  const current = await open(page, s, ids.asking);
  const card = current.locator('.clarification');
  await expect(card.getByRole('heading', { name: 'Your input is needed' })).toBeVisible();
  await expect(card).toContainText('Steps not blocked by them can continue: Audit the dataset.');
  await expect(card.getByRole('group', { name: 'Is conductivity recorded in mS/cm or S/m?' })).toContainText('Values are converted before reporting.');
  await expect(current.getByText('Answering the open question resumes eligible work')).toBeVisible();
  const submit = card.getByRole('button', { name: 'Submit answers' });
  await card.getByRole('radio', { name: /mS\/cm/ }).check();
  await expect(submit).toBeDisabled();

  await page.reload();
  await expect(card.getByRole('radio', { name: /mS\/cm/ })).toBeChecked();
  await card.getByRole('textbox', { name: 'Answer' }).fill('formulation_id');
  await submit.click();
  await expect(card.getByRole('alert')).toContainText('Question is no longer current');
  await expect(card.getByRole('alert')).toContainText('your draft is kept');
  await expect(card.getByRole('textbox', { name: 'Answer' })).toHaveValue('formulation_id');

  await submit.click();
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'Answer recorded; the run now reads queued.' })).toBeVisible();
  expect(s.posts).toHaveLength(2);
  expect(JSON.parse(s.posts[1].body!)).toEqual(fixture.answer_body);
  expect(s.posts[1].key).toBe(s.posts[0].key);
  await expect(current.locator('.clarification')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('sciml-answer:')))).toEqual([]);
});

test('pause, resume and cancel send expected revisions and separate requested from recorded state', async ({ page }) => {
  const running = detail(fixture.control_running);
  const s = server(ids.control, { onPost: (post, count) => {
    if (post.path.endsWith('/pause')) {
      s.details[ids.control] = detail(fixture.control_paused);
      s.jobs = parseJobPage(fixture.job_index_paused);
      return { status: 200, json: fixture.pause_response };
    }
    if (post.path.endsWith('/resume')) {
      if (count === 2) return { status: fixture.resume_conflict.status, json: fixture.resume_conflict.body };
      s.details[ids.control] = detail(fixture.control_resumed);
      return { status: 200, json: fixture.resume_response };
    }
    s.details[ids.control] = detail(fixture.control_cancelled);
    s.jobs = parseJobPage(fixture.job_index);
    return { status: 200, json: fixture.cancel_response };
  } });
  s.jobs = parseJobPage(fixture.job_index_paused);
  const current = await open(page, s, ids.control);
  await expect(current.getByRole('button', { name: 'Resume' })).toHaveCount(0);

  await current.getByRole('button', { name: 'Pause' }).click();
  const ack = current.getByRole('status', { name: 'Control acknowledgment' });
  await expect(ack).toContainText(`pause at run revision ${running.run.control_revision}`);
  await expect(ack).toContainText(/Recorded state\s*paused/);
  await expect(ack).toContainText('Scientific jobs already accepted keep running until their fixed deadlines');
  await expect(ack).toContainText(`audit job ${ids.control_job.slice(0, 8)} (queued)`);
  await expect(ack).toContainText('New dispatch is fenced; accepted jobs drain under their fixed deadlines.');
  expect(JSON.parse(s.posts[0].body!)).toEqual({ expected_run_revision: running.run.control_revision });

  // The first resume is refused as stale: nothing applied, state reloaded.
  await current.getByRole('button', { name: 'Resume' }).click();
  await expect(current.getByRole('alert')).toContainText('nothing was applied');
  await current.getByRole('button', { name: 'Resume' }).click();
  await expect(ack).toContainText(/Recorded state\s*queued/);
  expect(JSON.parse(s.posts[2].body!)).toEqual({ expected_run_revision: fixture.pause_response.control_revision });

  await current.getByRole('button', { name: 'Cancel run…' }).click();
  const confirm = current.getByRole('group', { name: 'Confirm cancellation' });
  await expect(confirm).toContainText('are not rolled back');
  await confirm.getByRole('button', { name: 'Cancel this run' }).click();
  await expect(ack).toContainText(/Recorded state\s*cancelled/);
  expect(JSON.parse(s.posts[3].body!)).toEqual({ expected_run_revision: fixture.resume_response.control_revision });
  await expect(current.getByRole('button', { name: /Pause|Resume|Cancel run/ })).toHaveCount(0);
  await expect(current.getByText('Run cancelled', { exact: true })).toBeVisible();
  await expect(current.getByText('RUN_CANCELLED').first()).toBeVisible();
  expect(s.posts.map(post => post.path.split('/').at(-1))).toEqual(['pause', 'resume', 'resume', 'cancel']);
});

test('partial completion, plan revisions, specialists and tool actions are shown as recorded', async ({ page }) => {
  const s = server(ids.partial);
  const current = await open(page, s, ids.partial);
  const partial = detail(fixture.partial_detail);
  await expect(current.getByText('Partially completed', { exact: true })).toBeVisible();
  await expect(current).toContainText(partial.run.stop_reason!);
  await expect(current.getByRole('link', { name: `Open Audit ${ids.audit.slice(0, 8)}` })).toBeVisible();
  await expect(current.getByRole('heading', { name: 'Plan · revision 2' })).toBeVisible();
  await current.getByText('Earlier plan revisions (1)').click();
  await expect(current.getByText('Start with an audit before choosing a split.')).toBeVisible();
  const specialists = current.getByRole('region', { name: 'Specialist activity' });
  await expect(specialists).toContainText('Data evaluation');
  await expect(specialists).toContainText('Check whether any column identifies independent formulations.');
  await expect(current.getByRole('list', { name: 'Run events' })).toContainText('Tool action · run audit');
  await current.getByText('Tool actions (1)').click();
  await expect(current).toContainText('Tool arguments are recorded for provenance but are not shown here.');
  await expect(current.getByText(/^The run has finished/)).toBeVisible();
  await expect(current.getByRole('button', { name: /Pause|Resume|Cancel run/ })).toHaveCount(0);
  // A finished run is drained once and not streamed.
  expect(s.streams.filter(entry => entry.runId === ids.partial)).toHaveLength(0);
});

test('specialist activity is conditional and the question card fits a phone', async ({ page }) => {
  const s = server(ids.asking);
  await page.setViewportSize({ width: 375, height: 900 });
  const current = await open(page, s, ids.asking);
  await expect(current.locator('.clarification')).toBeVisible();
  await expect(current.getByRole('region', { name: 'Specialist activity' })).toHaveCount(0);
  await current.getByRole('radio', { name: /S\/m/ }).first().focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/a12-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/a12-desktop.png', fullPage: true });
});

test('control availability follows recorded state', () => {
  const state = (value: ResearchRun['state']) => ({ ...parseResearchRun(fixture.pause_response), state: value });
  expect(controlsFor(state('running'))).toEqual(['pause', 'cancel']);
  expect(controlsFor(state('paused'))).toEqual(['resume', 'cancel']);
  expect(controlsFor(state('waiting_for_input'))).toEqual(['pause', 'cancel']);
  expect(controlsFor(parseResearchRun(fixture.cancel_response))).toEqual([]);
});

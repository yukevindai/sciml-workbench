import { expect, test, type Page } from '@playwright/test';
import fixture from './fixtures/research-request.json';
import market from './fixtures/agent-market.json';
import { parseAgentMarket } from '../app/lib/decode';
const pid = fixture.project.id;
const draft = { name: 'Evidence comparison', description: 'Compare cited findings.', instructions: 'Compare supplied papers with citations and flag missing conditions.', capabilities: ['inspect_project'] };
async function setup(page: Page, options: { answer?: string; running?: boolean; lost?: boolean } = {}) {
  const posts: { path: string; body: any; key: string | undefined }[] = [];
  const catalog = parseAgentMarket(structuredClone(market));
  const accepted = { ...fixture.accepted, created_at: new Date().toISOString() };
  const completed = fixture.details[fixture.accepted.id as keyof typeof fixture.details];
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() === 'POST') {
      posts.push({ path, body: req.postDataJSON(), key: req.headers()['idempotency-key'] });
      if (path.endsWith('/agent-runs')) return route.fulfill(options.lost
        ? { status: 503, json: { error: 'Provider temporarily unavailable' } } : { status: 202, json: accepted });
      if (path.endsWith('/cancel')) return route.fulfill({ json: { ...accepted, state: 'cancelled', control_revision: 2, finished_at: new Date().toISOString() } });
      if (path.endsWith('/agent-market/tools')) {
        const tool = { ...req.postDataJSON(), id: 'new-tool', revision: 1, archived: false };
        catalog.custom_tools.push(tool);
        return route.fulfill({ status: 201, json: tool });
      }
    }
    const result = path === '/api/projects' ? [fixture.project] : path === '/api/agent-market' ? catalog :
      path.endsWith('/job-index') ? { items: [], next_cursor: null } : path.endsWith('/artifact-previews') ? [] :
      path.endsWith('/execution-policy') ? fixture.policy : path.endsWith('/research-materials') ? fixture.materials :
      path.endsWith('/' + accepted.id) ? { ...completed, plan: null, actions: [], run: options.running ? accepted : { ...completed.run, result_artifact_ids: [] }, answer: options.running ? null : options.answer ?? JSON.stringify(draft) } : undefined;
    return result === undefined ? route.fulfill({ status: 404, json: { error: 'Not mocked' } }) : route.fulfill({ json: result });
  });
  await page.goto(`/tools?project=${pid}`);
  await page.getByRole('button', { name: 'Create with AI', exact: true }).click();
  await page.getByLabel('What should your tool do?').fill('Compare experimental conditions from the papers I provide.');
  return posts;
}

test('prompt drafts use an isolated agent run and require review before an edited tool is saved', async ({ page }) => {
  const posts = await setup(page);
  await page.getByRole('button', { name: 'Generate draft', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Generated tool draft' })).toContainText('Nothing has been saved.');
  expect(posts).toHaveLength(1);
  expect(posts[0].body.agent_selection).toEqual({ kind: 'agent', id: 'tool-builder', exclusive: true });
  expect(posts[0].body.inputs).toEqual({ material_ids: [], artifact_ids: [] });
  await page.getByRole('button', { name: 'Review and edit draft' }).click();
  await expect(page.getByLabel('Research instructions')).toHaveValue(draft.instructions);
  await page.getByLabel('Name', { exact: true }).fill('My reviewed tool');
  await page.getByRole('button', { name: 'Save tool', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My reviewed tool', exact: true })).toBeVisible();
  expect(posts).toHaveLength(2);
  expect(posts[1].body).toEqual({ ...draft, name: 'My reviewed tool' });
});
for (const answer of ['Not JSON', JSON.stringify({ ...draft, capabilities: ['search_evidence'] })]) {
  test(`invalid draft cannot be saved: ${answer === 'Not JSON' ? 'malformed' : 'unavailable capability'}`, async ({ page }) => {
    const posts = await setup(page, { answer });
    await page.getByRole('button', { name: 'Generate draft', exact: true }).click();
    await expect(page.locator('#main').getByRole('alert')).toContainText('did not return a usable tool draft');
    await expect(page.getByRole('button', { name: 'Review and edit draft' })).toHaveCount(0);
    expect(posts).toHaveLength(1);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Create tool', exact: true }).click();
    await expect(page.getByLabel('Research instructions')).toBeEditable();
  });
}
test('working drafts display elapsed time, restore after reload, and can be stopped', async ({ page }) => {
  const posts = await setup(page, { running: true });
  await page.getByRole('button', { name: 'Generate draft', exact: true }).click();
  await expect(page.getByRole('timer', { name: 'Elapsed', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Create with AI', exact: true }).click();
  await page.getByRole('button', { name: 'Stop generation' }).click();
  await expect(page.getByText('Generation ended without a draft.', { exact: false })).toBeVisible();
  expect(posts).toHaveLength(2);
  expect(posts[1].path).toContain('/cancel');
  expect(posts[1].body).toEqual({ expected_run_revision: 1 });
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
});
test('uncertain acceptance retries the same request and key after reload', async ({ page }) => {
  const posts = await setup(page, { lost: true });
  await page.getByRole('button', { name: 'Generate draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry previous draft' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Create with AI', exact: true }).click();
  await page.getByRole('button', { name: 'Retry previous draft' }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]).toEqual(posts[0]);
});
test.describe('anonymous tool builder', () => {
  test.use({ extraHTTPHeaders: {} });
test('public demo provides an editable sample with no API traffic and fits mobile', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) calls.push(r.url()); });
  await page.route('**/api/**', route => route.abort());
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto('/demo/tools');
  await page.getByRole('button', { name: 'Create with AI', exact: true }).click();
  await expect(page.getByText('Demo: generation returns', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Try a paper comparison' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/tool-prompt-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Generate draft', exact: true }).click();
  await expect(page.getByRole('timer', { name: 'Elapsed', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review and edit draft' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Paper comparison');
  await page.getByLabel('Name', { exact: true }).fill('Demo paper reviewer');
  await page.getByRole('button', { name: 'Save tool', exact: true }).click();
  const card = page.locator('.market-card').filter({ has: page.getByRole('heading', { name: 'Demo paper reviewer', exact: true }) });
  await card.getByRole('link', { name: 'Use in workflow' }).click();
  await expect(page.getByRole('region', { name: 'Workflow designer' })).toBeVisible();
  expect(calls).toEqual([]);
});

});

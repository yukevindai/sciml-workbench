import { expect, test, type Page } from '@playwright/test';
import fixture from './fixtures/run-controls.json';
import { parseRunDetail } from '../app/lib/decode';

async function workspace(page: Page, answer = false) {
  const detail = parseRunDetail(structuredClone(fixture.partial_detail));
  if (answer) {
    detail.answer = 'Graphene can be incorporated into textile coatings. Comfort and durability depend on construction.';
    detail.run.state = 'completed';
    detail.run.plan_revision = 0;
    detail.run.result_artifact_ids = [];
    detail.run.objective = 'Can graphene be used to make socks?';
    detail.plan = null;
    detail.assignments = [];
    detail.actions = [];
  } else {
    const assignment = detail.assignments[0];
    assignment.state = 'completed';
    assignment.findings = ['Some formulations occur in both batches.'];
    assignment.uncertainty = 'Batch independence still needs confirmation.';
    assignment.recommended_actions = ['Group the split by formulation.'];
  }
  const other = { ...detail.run, id: 'another-request', objective: 'Review the experimental protocol' };
  const recorded = fixture.events[fixture.ids.partial as keyof typeof fixture.events];
  const sample = recorded.at(-1)!;
  const activity = [...recorded,
    ...['Checked available source coverage.', 'Checked available source coverage.', 'State changed', 'Usage updated'].map((summary, index) => ({
      ...sample, sequence: sample.sequence + index + 1, event_type: 'state_changed', summary,
    }))];
  await page.addInitScript(([pid, rid]) => localStorage.setItem(`sciml-run:${pid}`, rid), [fixture.project.id, detail.run.id]);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/projects' ? [fixture.project, { ...fixture.project, id: 'second', name: 'Membrane experiments' }]
      : path.endsWith('/job-index') ? fixture.job_index
      : path.endsWith('/artifact-previews') ? fixture.previews
      : path.endsWith('/research-materials') ? fixture.materials
      : path.endsWith('/execution-policy') ? fixture.policy
      : path.endsWith('/agent-runs') ? [detail.run, other]
      : path.endsWith('/events') ? activity
      : path.endsWith('/another-request') ? { ...detail, run: other }
      : path.endsWith(`/agent-runs/${detail.run.id}`) ? detail : null;
    await route.fulfill(body === null ? { status: 503, json: {} } : { json: body });
  });
  await page.goto('/ask');
  await expect(page.getByRole('article')).toBeVisible();
}

test('agent activity shows delegation and findings without duplicate bookkeeping', async ({ page }, testInfo) => {
  await workspace(page);
  await page.getByText('Research team', { exact: true }).click();
  await expect(page.getByText('Data analyst 1', { exact: true })).toBeVisible();
  await page.getByText('Assignment and findings', { exact: true }).click();
  await expect(page.getByText('Some formulations occur in both batches.')).toBeVisible();
  await expect(page.getByText('Batch independence still needs confirmation.', { exact: false })).toBeVisible();
  await expect(page.getByText('Group the split by formulation.')).toBeVisible();
  for (const text of ['Request accepted', 'State changed', 'Usage updated', 'Usage and limits', 'Private workspace', 'Nothing is hidden']) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  }
  await expect(page.locator('.agent-tools li')).toHaveCount(1);
  await expect(page.getByText('Checked available source coverage.', { exact: true })).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('research-team-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('research-team-mobile.png'), fullPage: true });
});

test('direct answer is visible without opening activity', async ({ page }) => {
  await workspace(page, true);
  await expect(page.getByRole('region', { name: 'Answer' })).toContainText('Graphene can be incorporated');
  await expect(page.getByRole('heading', { name: 'The plan' })).toHaveCount(0);
});

test('project and request pickers support search, keyboard selection and creation', async ({ page }, testInfo) => {
  await workspace(page);
  const project = page.getByRole('button', { name: 'Active project', exact: true });
  await project.click();
  await expect(page.getByRole('textbox', { name: 'Search active project' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Search active project' }).fill('Membrane');
  await expect(page.locator('.picker-option')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Membrane experiments' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(project).toBeFocused();
  await project.click();
  await page.screenshot({ path: testInfo.outputPath('project-picker.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Earlier requests', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search earlier requests' }).fill('protocol');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('article')).toContainText('Review the experimental protocol');
  await project.click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What would you like to find out?' })).toBeVisible();
  await expect(project).toContainText('New project');
});

test('the lab-group landing is stable, responsive, and keyboard navigable', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your personal AI lab group');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'Ask a question' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Guide the research' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('Define the objective');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/sign-in/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Back to home' }).click();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.screenshot({ path: testInfo.outputPath('landing-mobile-dark.png'), fullPage: true });
});

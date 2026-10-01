import { expect, test } from '@playwright/test';
import catalog from './fixtures/agent-market.json';
import type { AgentMarket, AgentProfile, AgentSelection, AgentTeam } from '../app/lib/generated/http';

test('custom agents, teams and project assignment survive navigation', async ({ page }) => {
  const market = structuredClone(catalog) as AgentMarket;
  let selection: AgentSelection = { kind: 'automatic', id: null, exclusive: true };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    let value: unknown;
    if (path === '/api/projects') value = [{ id: 'p', name: 'Battery research', description: '' }];
    else if (path === '/api/projects/p/job-index') value = { items: [], next_cursor: null };
    else if (path === '/api/projects/p/artifact-previews' || path.endsWith('/agent-runs') || path.endsWith('/research-materials')) value = [];
    else if (path === '/api/agent-market') value = market;
    else if (path === '/api/agent-market/agents') {
      const created = { ...body, id: 'custom-researcher', revision: 1, built_in: false, archived: false } as AgentProfile;
      market.agents.push(created); value = created;
    } else if (path === '/api/agent-market/teams') {
      const created = { ...body, id: 'battery-team', revision: 1, archived: false } as AgentTeam;
      market.teams.push(created); value = created;
    } else if (path.endsWith('/agent-selection')) {
      if (body) selection = body;
      value = { project_id: 'p', selection };
    } else if (path.endsWith('/execution-policy')) value = { project_id: 'p', policy: null, agent_available: false, unavailable_reason: 'Fixture' };
    else return route.fulfill({ status: 404, json: { error: `Unexpected route: ${path}` } });
    await route.fulfill({ json: value });
  });
  await page.goto('/agent-market');
  await expect(page.getByRole('heading', { name: 'Principal Investigator', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create agent', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Electrolyte Researcher');
  await page.getByLabel('Role', { exact: true }).fill('Researcher');
  await page.getByLabel('Working instructions').fill('Flag composition aliasing and explain uncertainty.');
  await page.getByRole('checkbox', { name: /inspect project/ }).check();
  await page.getByRole('button', { name: 'Save agent', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Electrolyte Researcher', exact: true })).toBeVisible();
  expect(market.agents.at(-1)?.tools).toEqual(['inspect_project']);
  await page.getByRole('button', { name: 'Create team', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Battery Literature Team');
  await page.getByRole('checkbox', { name: 'Electrolyte Researcher Researcher', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Scientific Reviewer Reviewer', exact: true }).check();
  await page.getByRole('button', { name: 'Save team', exact: true }).click();
  await page.getByRole('button', { name: 'Teams 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Battery Literature Team' })).toBeVisible();
  await page.getByRole('link', { name: 'Assign a task', exact: true }).click();
  await expect(page.getByLabel('Assign to', { exact: true })).toHaveValue('team:battery-team');
  await expect(page.getByRole('checkbox', { name: 'Only use this team' })).toBeChecked();
  await page.getByRole('button', { name: 'Use as project default' }).click();
  expect(selection).toEqual({ kind: 'team', id: 'battery-team', exclusive: true });
  await page.reload();
  await expect(page.getByLabel('Assign to', { exact: true })).toContainText('Project default · Battery Literature Team');
});

test('catalog and agent editor fit mobile, desktop and dark mode', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path === '/api/agent-market' ? catalog : [] });
  });
  await page.goto('/agent-market');
  await expect(page.getByRole('heading', { name: 'Principal Investigator', exact: true })).toBeVisible();
  for (const width of [1440, 375, 812]) {
    await page.setViewportSize({ width, height: width === 812 ? 375 : 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '/tmp/agent-market-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Create agent', exact: true }).click();
  await page.setViewportSize({ width: 375, height: 850 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/agent-market-mobile.png', fullPage: true });
});

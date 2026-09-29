// Regenerate landing-page images from the actual UI using synthetic test data.
// Run the dev server first, then: node scripts/capture-product.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(new URL('../tests/fixtures/research-request.json', import.meta.url)));
const login = process.env.WB_LOGIN_USERNAME && process.env.WB_LOGIN_PASSWORD
  ? { Authorization: `Basic ${Buffer.from(`${process.env.WB_LOGIN_USERNAME}:${process.env.WB_LOGIN_PASSWORD}`).toString('base64')}` } : {};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', extraHTTPHeaders: login });
  await page.addInitScript(t => localStorage.setItem('sciml-theme', t), theme);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') throw new Error('Product capture must be read-only');
    const body = path === '/api/projects' ? [fixture.project]
      : path.endsWith('/artifact-previews') ? fixture.previews
      : path.endsWith('/job-index') ? fixture.job_index
      : path.endsWith('/execution-policy') ? fixture.policy
      : path.endsWith('/research-materials') ? fixture.materials.slice(0, 1)
      : [];
    await route.fulfill({ json: body });
  });
  for (const [route, name] of [['ask', 'ask'], ['research', 'research'], ['dataset-audit', 'audit']]) {
    await page.goto(`http://localhost:3000/${route}`);
    await page.locator('.page h1').waitFor();
    await page.getByText('Loading workspace…', { exact: true }).waitFor({ state: 'hidden' });
    await page.getByText('Loading project data…', { exact: true }).waitFor({ state: 'hidden' });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    if (route === 'ask') {
      await page.getByLabel('What would you like to find out?', { exact: true }).fill('Check my electrolyte dataset for quality issues, then suggest a fair way to evaluate a baseline model.');
      await page.waitForFunction(() => !document.querySelector('button[aria-label="Send"]')?.disabled);
    }
    await page.screenshot({ path: `public/images/workspace-${name}-${theme}.png` });
    console.log(`Captured ${name} (${theme})`);
  }
  await page.close();
}
await browser.close();

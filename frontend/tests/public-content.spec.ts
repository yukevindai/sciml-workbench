import { expect, test } from '@playwright/test';

function pixelFingerprint(canvas: HTMLCanvasElement) {
  const image = canvas.toDataURL();
  let hash = 0;
  for (let i = 0; i < image.length; i++) hash = (hash * 31 + image.charCodeAt(i)) | 0;
  return hash;
}

for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 900 }, { width: 1440, height: 1000 }, { width: 2048, height: 1154 }]) {
  test(`hero owns the first viewport at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const hero = await page.locator('.hero').boundingBox();
    const next = await page.locator('.research-strip').boundingBox();
    expect(hero!.y + hero!.height).toBeGreaterThanOrEqual(viewport.height - 1);
    expect(next!.y).toBeGreaterThanOrEqual(viewport.height - 1);
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    await expect(page.locator('.hero-cta')).toBeInViewport();
  });
}

test('public navigation, all guides, articles and history work without authentication', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000', extraHTTPHeaders: {}, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  for (const [name, href] of [['Docs', '/docs'], ['Blog', '/blog'], ['Changelog', '/changelog']]) {
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
    await nav.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  await page.goto('/docs');
  const guides = await page.locator('.guide-card').evaluateAll(links => links.map(a => a.getAttribute('href')!));
  expect(guides).toHaveLength(6);
  for (const href of guides) {
    await page.goto(href);
    await expect(page.locator('.article-body section')).toHaveCount(href.includes('troubleshooting') ? 5 : 4);
    await expect(page.locator('.guide-sidebar a[aria-current="page"]')).toHaveAttribute('href', href);
  }
  await page.goto('/blog');
  const articles = await page.locator('.blog-card').evaluateAll(links => links.map(a => a.getAttribute('href')!));
  expect(articles).toHaveLength(3);
  for (const href of articles) {
    await page.goto(href);
    await expect(page.locator('.article-body section')).toHaveCount(3);
    await page.getByRole('link', { name: 'Continue with the step-by-step guide' }).click();
    await expect(page).toHaveURL(/\/docs\//);
  }
  expect((await page.goto('/docs/not-a-guide'))?.status()).toBe(404);
  expect((await page.goto('/blog/not-a-post'))?.status()).toBe(404);
  await page.goto('/ask');
  await expect(page).toHaveURL(/sign-in/);
  expect(errors).toEqual([]);
  await context.close();
});

test('pixel artwork moves, can be paused, persists between pages, and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  const scene = page.locator('.hero-pixels');
  const pixels = () => scene.evaluate(pixelFingerprint);
  const first = await pixels();
  await expect.poll(pixels).not.toBe(first);
  await page.locator('.hero-bottom').getByRole('button', { name: 'Pause animations' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  const frozen = await pixels();
  await page.waitForTimeout(160);
  expect(await pixels()).toBe(frozen);
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Blog', exact: true }).click();
  // The shared motion attribute is already off on the landing page. Wait for
  // client navigation to finish before reloading, or reload can cancel it.
  await expect(page).toHaveURL(/\/blog$/);
  await expect(page.locator('.blog-card')).toHaveCount(3);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await page.reload();
  await expect(page).toHaveURL(/\/blog$/);
  await expect(page.locator('.blog-card')).toHaveCount(3);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  const footer = page.getByRole('contentinfo');
  await footer.getByRole('button', { name: 'Play animations' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await expect(footer.getByRole('button', { name: 'Reduced motion enabled' })).toBeDisabled();
});

test('mobile navigation supports keyboard escape and public pages fit both themes', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Docs' }).click();
  await expect(page).toHaveURL(/\/docs$/);
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light theme' }).click();
    for (const route of ['/docs', '/docs/getting-started', '/blog', '/blog/a-score-needs-a-split', '/changelog']) {
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${route.replaceAll('/', '-')}-${theme}.png`), fullPage: true });
    }
  }
});

test('blog pixel scenes animate without shifting their cards', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Blog', exact: true }).click();
  await expect(page).toHaveURL(/\/blog$/);
  for (const variant of ['network', 'wave', 'document']) {
    const canvas = page.locator(`[data-pixel-scene="${variant}"]`);
    const frame = await canvas.evaluate(pixelFingerprint);
    await expect.poll(() => canvas.evaluate(pixelFingerprint)).not.toBe(frame);
  }
  const card = page.locator('.blog-card').first();
  await card.hover();
  const before = await card.boundingBox();
  await page.mouse.move(1100, 100);
  const after = await card.boundingBox();
  expect(after!.width).toBe(before!.width);
  expect(after!.height).toBe(before!.height);
  await card.click();
  await expect(page.locator('.article-body section')).toHaveCount(3);
});

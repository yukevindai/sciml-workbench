import { expect, test } from '@playwright/test';

for (const width of [375, 768, 1024, 1440]) {
  test(`public pages fit at ${width}px in both themes`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your personal AI lab group');
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.getByRole('button', { name: 'Switch to light theme' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // Check each real product capture loads, including the alternate-theme images.
      for (const label of ['Ask a question', 'Guide the research', 'Inspect the evidence']) {
        await page.getByRole('tab', { name: label }).click();
        await expect.poll(() => page.locator(`.preview-${theme}`).evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      }
      await page.getByRole('tab', { name: 'Ask a question' }).click();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: info.outputPath(`landing-${width}-${theme}.png`), fullPage: true });
      await page.goto('/sign-in?next=%2Fresearch');
      await expect(page.locator('input[name="next"]')).toHaveValue('/research');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`signin-${width}-${theme}.png`), fullPage: true });
      await page.getByRole('link', { name: 'Back to home' }).click();
    }
    expect(errors).toEqual([]);
  });
}

test('sign-in returns to the intended workspace and sign-out returns home', async ({ browser }) => {
  test.skip(!process.env.WB_LOGIN_USERNAME || !process.env.WB_LOGIN_PASSWORD, 'Needs a local test login');
  // Deliberately omit the runner's Basic header: exercise the actual browser form.
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000', extraHTTPHeaders: {} });
  const page = await context.newPage();
  await page.route('**/api/**', route => route.fulfill({ json: [] }));
  await page.goto('/research');
  await expect(page).toHaveURL(/sign-in\?next=%2Fresearch/);
  await page.getByLabel('Username', { exact: true }).fill(process.env.WB_LOGIN_USERNAME!);
  await page.getByLabel('Password', { exact: true }).fill('incorrect-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not right');
  await expect(page.locator('input[name="next"]')).toHaveValue('/research');
  await page.getByLabel('Username', { exact: true }).fill(process.env.WB_LOGIN_USERNAME!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.WB_LOGIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/research$/);
  await expect(page.getByRole('heading', { name: 'Your research workspace', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your personal AI lab group');
  await page.goto('/ask');
  await expect(page).toHaveURL(/sign-in/);
  await context.close();
});

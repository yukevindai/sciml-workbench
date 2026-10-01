import { expect, test } from '@playwright/test';

for (const width of [320, 375, 1440]) {
  test(`admin login opens, fits and closes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Admin login', exact: true });
    await trigger.click();
    const panel = page.getByRole('region', { name: 'Admin login', exact: true });
    await expect(panel).toBeVisible();
    await expect(panel.getByLabel('Username', { exact: true })).toBeFocused();
    await expect(panel.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await panel.getByRole('button', { name: 'Close admin login' }).click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
}

test('admin form uses the protected session and opens the workspace', async ({ browser }) => {
  test.skip(!process.env.WB_LOGIN_USERNAME || !process.env.WB_LOGIN_PASSWORD, 'Needs a local test login');
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000', extraHTTPHeaders: {} });
  const page = await context.newPage();
  await page.route('**/api/**', route => route.fulfill({ json: [] }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin login', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(process.env.WB_LOGIN_USERNAME!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.WB_LOGIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/ask$/);
  const session = (await context.cookies()).find(cookie => cookie.name === 'wb_session');
  expect(session?.httpOnly).toBe(true);
  await context.close();
});

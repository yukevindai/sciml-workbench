import { expect, test } from '@playwright/test';

test.use({ extraHTTPHeaders: {} });
test('all six IBM Plex faces load from the deployment without a font CDN', async ({ page, baseURL }) => {
  const external: string[] = [];
  const fontResponses: { url: string; status: number }[] = [];
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => {
    external.push(route.request().url());
    return route.abort();
  });
  page.on('response', response => {
    if (response.request().resourceType() === 'font') fontResponses.push({ url: response.url(), status: response.status() });
  });
  await page.goto('/');
  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    const style = getComputedStyle(document.documentElement);
    const results = [];
    for (const [variable, weights] of [['--font-sans', ['400', '500', '600', '700']], ['--font-mono', ['400', '500']]] as const) {
      const family = style.getPropertyValue(variable).split(',')[0].trim();
      for (const weight of weights) {
        const loaded = await document.fonts.load(`${weight} 16px ${family}`, 'Research 123');
        results.push({ variable, weight, count: loaded.length, loaded: loaded.every(face => face.status === 'loaded') });
      }
    }
    return results;
  });
  expect(faces).toHaveLength(6);
  for (const face of faces) {
    expect(face.count, `${face.variable} ${face.weight}`).toBeGreaterThan(0);
    expect(face.loaded).toBe(true);
  }
  expect(fontResponses.length).toBeGreaterThanOrEqual(6);
  for (const response of fontResponses) {
    expect(new URL(response.url).origin).toBe(new URL(baseURL!).origin);
    expect(response.status).toBe(200);
  }
  expect(external).toEqual([]);
});

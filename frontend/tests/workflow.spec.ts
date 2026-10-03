import { test, expect } from '@playwright/test';
import path from 'node:path';
const examples = path.resolve(__dirname, '../../examples');

test('server proxy rejects cross-origin mutations and keeps tokens out of HTML', async ({ page, request }) => {
  const rejected = await request.post('/api/projects', { headers: { Origin: 'https://untrusted.example' }, data: { name: 'forged' } });
  expect(rejected.status()).toBe(403);
  await page.goto('/');
  const html = await page.content();
  expect(html).not.toContain('WB_API_TOKEN');
  expect(html).not.toContain(process.env.WB_API_TOKEN || 'workbench-test-secret-that-must-not-appear');
});


test('hosted password gate covers pages, data and downloads', async ({ playwright }) => {
  test.skip(!process.env.WB_LOGIN_PASSWORD, 'Enable hosted login environment variables');
  // This test only runs when WB_LOGIN_PASSWORD is set, which is also when the
  // config supplies the login header. Contexts made from the playwright
  // fixture inherit those, so the credentials have to be cleared explicitly or
  // this "anonymous" client is signed in and every gated URL answers 200.
  const anonymous = await playwright.request.newContext({
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    httpCredentials: undefined, extraHTTPHeaders: {},
  });
  for (const url of ['/api/projects', '/api/projects/example/artifacts/example/download']) {
    expect((await anonymous.get(url)).status()).toBe(401);
  }
  // Pages send anonymous visitors to the sign-in form rather than a browser pop-up.
  for (const url of ['/ask', '/projects']) {
    expect((await anonymous.get(url, { maxRedirects: 0 })).status()).toBe(303);
  }
  expect((await anonymous.get('/')).status()).toBe(200);
  expect((await anonymous.get('/healthz')).status()).toBe(200);
  const bad = await anonymous.get('/api/projects', { headers: { Authorization: 'Basic ' + Buffer.from('wrong:wrong').toString('base64') } });
  expect(bad.status()).toBe(401);
  await anonymous.dispose();
});

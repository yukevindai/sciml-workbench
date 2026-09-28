import { test, expect, request } from '@playwright/test';

test('anonymous production clients cannot read pages, streams, or downloads', async () => {
  // Explicitly anonymous: under the test runner a new context otherwise inherits the config's login credentials.
  const anonymous = await request.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000', httpCredentials: undefined, extraHTTPHeaders: {} });
  try {
    expect(await (await anonymous.get('/healthz')).json()).toEqual({ status: 'ok' });
    for (const path of ['/api/projects', '/api/projects/p/agent-runs/r/stream',
      '/api/projects/p/agent-runs/r/events', '/api/projects/p/artifacts/a/download']) {
      const response = await anonymous.get(path, { headers: { 'Last-Event-ID': '999999' } });
      expect(response.status()).toBe(401);
      expect(response.headers()['cache-control']).toBe('no-store');
      expect(response.headers()['www-authenticate']).toBeUndefined();
    }
    // Workspace pages redirect to the sign-in page; the landing page is public.
    for (const path of ['/ask', '/research']) {
      const response = await anonymous.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(303);
      expect(response.headers()['location']).toContain('/sign-in?next=');
    }
    expect((await anonymous.get('/')).status()).toBe(200);
    expect((await anonymous.get('/sign-in')).status()).toBe(200);
  } finally {
    await anonymous.dispose();
  }
});

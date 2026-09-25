import { test, expect, request } from '@playwright/test';

test('anonymous production clients cannot read pages, streams, or downloads', async () => {
  // Explicitly anonymous: under the test runner a new context otherwise inherits the config's login credentials.
  const anonymous = await request.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000', httpCredentials: undefined });
  try {
    expect(await (await anonymous.get('/healthz')).json()).toEqual({ status: 'ok' });
    for (const path of ['/', '/api/projects', '/api/projects/p/agent-runs/r/stream',
      '/api/projects/p/agent-runs/r/events', '/api/projects/p/artifacts/a/download']) {
      const response = await anonymous.get(path, { headers: { 'Last-Event-ID': '999999' } });
      expect(response.status()).toBe(401);
      expect(response.headers()['cache-control']).toBe('no-store');
    }
  } finally {
    await anonymous.dispose();
  }
});

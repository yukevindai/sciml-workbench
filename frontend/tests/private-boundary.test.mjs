import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

// Execute the real handlers against NextRequest/NextResponse, mocking only the
// backend transport. TypeScript is transpiled with the installed compiler.
const require = createRequire(import.meta.url);
const { NextRequest } = require('next/server');
function load(file) {
  const filename = resolve(file);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    name => name.startsWith('.') ? load(resolve(dirname(filename), name + '.ts')) : require(name),
    module, module.exports);
  return module.exports;
}
const { proxy } = load('proxy.ts');
const { GET, POST } = load('app/api/[...path]/route.ts');
const original = { ...process.env };
const originalFetch = globalThis.fetch;
const auth = 'Basic ' + Buffer.from('operator:a-private-password-for-tests').toString('base64');
const request = (path, headers = {}, method = 'GET') => new NextRequest('https://private.example' + path, { method, headers });
const params = { params: Promise.resolve({ path: ['projects', 'p', 'agent-runs', 'r', 'stream'] }) };

test('production operator gate and server proxy enforce the private boundary', async () => {
  try {
    Object.assign(process.env, { NODE_ENV: 'production', WB_REQUIRE_LOGIN: '0', WB_LOGIN_USERNAME: 'operator',
      WB_LOGIN_PASSWORD: 'a-private-password-for-tests', WB_PUBLIC_ORIGIN: 'https://private.example',
      WB_API_TOKEN: 'private-backend-token-longer-than-32-characters', WB_API_URL: 'http://backend:8000' });
    for (const path of ['/', '/api/projects', '/api/projects/p/agent-runs/r/stream', '/api/projects/p/artifacts/a/download']) {
      assert.equal(proxy(request(path)).status, 401);
      assert.equal(proxy(request(path, { authorization: 'Bearer attacker' })).status, 401);
    }
    assert.deepEqual(await proxy(request('/healthz')).json(), { status: 'ok' });
    delete process.env.WB_LOGIN_PASSWORD;
    assert.equal(proxy(request('/')).status, 503);
    process.env.WB_LOGIN_PASSWORD = 'a-private-password-for-tests';
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(url, 'http://backend:8000/api/v1/projects/p/agent-runs/r/stream?after=4');
      assert.equal(init.headers.get('authorization'), 'Bearer ' + process.env.WB_API_TOKEN);
      assert.equal(init.headers.get('last-event-id'), '7');
      assert.equal(init.headers.get('cookie'), null);
      assert.equal(init.headers.get('x-forwarded-host'), null);
      assert.equal(init.redirect, 'error');
      return new Response('id: 8\nevent: state_changed\n\n', { headers: { 'Content-Type': 'text/event-stream', 'Set-Cookie': 'private=value' } });
    };
    assert.equal((await GET(request('/api/private'), params)).status, 401);
    assert.equal((await POST(request('/api/private', { authorization: auth, origin: 'https://evil.example' }, 'POST'), params)).status, 403);
    assert.equal((await POST(request('/api/private', { authorization: auth }, 'POST'), params)).status, 403);
    assert.equal((await GET(request('/api/private', { authorization: auth, origin: 'https://evil.example' }), params)).status, 403);
    assert.equal(calls, 0);
    const response = await GET(request('/api/private?after=4', { authorization: auth, 'last-event-id': '7', cookie: 'secret=value', 'x-forwarded-host': 'evil' }), params);
    assert.equal(calls, 1);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.match(await response.text(), /id: 8/);
    delete process.env.WB_PUBLIC_ORIGIN;
    assert.equal((await GET(request('/api/private', { authorization: auth }), params)).status, 503);
    process.env.WB_PUBLIC_ORIGIN = 'https://private.example';
    process.env.WB_API_TOKEN = 'short';
    assert.equal((await GET(request('/api/private', { authorization: auth }), params)).status, 503);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});

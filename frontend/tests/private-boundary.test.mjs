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

test('login and API accept equivalent configured origins without trusting other sites', async () => {
  const { POST: signIn } = load('app/auth/session/route.ts');
  try {
    Object.assign(process.env, { NODE_ENV: 'production', WB_LOGIN_USERNAME: 'operator',
      WB_LOGIN_PASSWORD: 'a-private-password-for-tests', WB_API_TOKEN: 'private-backend-token-longer-than-32-characters' });
    globalThis.fetch = async () => new Response('{}');
    for (const configured of ['https://private.example/', '  https://private.example/\n', 'https://PRIVATE.example:443']) {
      process.env.WB_PUBLIC_ORIGIN = configured;
      const form = new NextRequest('https://private.example/auth/session', {
        method: 'POST', headers: { origin: 'https://private.example', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: 'operator', password: 'a-private-password-for-tests', next: '/ask' }).toString(),
      });
      const response = await signIn(form);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), 'https://private.example/ask');
      assert.match(response.headers.get('set-cookie'), /; HttpOnly/i);
      assert.match(response.headers.get('set-cookie'), /; Secure/i);
      assert.equal((await POST(request('/api/private', { authorization: auth, origin: 'https://private.example' }, 'POST'), params)).status, 200);
      for (const origin of ['https://evil.example', 'https://private.example.evil.example', 'http://private.example', 'null']) {
        assert.equal((await signIn(request('/auth/session', { origin, host: 'private.example', 'x-forwarded-host': 'private.example' }, 'POST'))).status, 403);
        assert.equal((await POST(request('/api/private', { authorization: auth, origin }, 'POST'), params)).status, 403);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});

test('missing or invalid production origin is a setup error and fails closed', async () => {
  const { POST: signIn } = load('app/auth/session/route.ts');
  try {
    Object.assign(process.env, { NODE_ENV: 'production', WB_LOGIN_USERNAME: 'operator', WB_LOGIN_PASSWORD: 'a-private-password-for-tests' });
    for (const origin of [undefined, '', ' ', 'not-a-url', 'https://private.example/ask', 'https://user:pass@private.example', 'https://private.example?x=1', 'https://private.example#x', 'ftp://private.example']) {
      if (origin === undefined) delete process.env.WB_PUBLIC_ORIGIN;
      else process.env.WB_PUBLIC_ORIGIN = origin;
      const response = await signIn(request('/auth/session', { origin: 'https://private.example' }, 'POST'));
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('set-cookie'), null);
      assert.match((await response.json()).error, /WB_PUBLIC_ORIGIN/);
      assert.equal((await GET(request('/api/private', { authorization: auth }), params)).status, 503);
    }
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});

test('production operator gate and server proxy enforce the private boundary', async () => {
  try {
    Object.assign(process.env, { NODE_ENV: 'production', WB_REQUIRE_LOGIN: '0', WB_LOGIN_USERNAME: 'operator',
      WB_LOGIN_PASSWORD: 'a-private-password-for-tests', WB_PUBLIC_ORIGIN: 'https://private.example',
      WB_API_TOKEN: 'private-backend-token-longer-than-32-characters', WB_API_URL: 'http://backend:8000' });
    for (const path of ['/api/projects', '/api/projects/p/agent-runs/r/stream', '/api/projects/p/artifacts/a/download']) {
      const refused = proxy(request(path));
      assert.equal(refused.status, 401);
      // No challenge header: browsers never show their own sign-in pop-up.
      assert.equal(refused.headers.get('www-authenticate'), null);
      assert.equal(proxy(request(path, { authorization: 'Bearer attacker' })).status, 401);
      assert.equal(proxy(request(path, { cookie: 'wb_session=v1.9999999999.forged' })).status, 401);
    }
    // Workspace pages send anonymous visitors to the sign-in page instead.
    for (const path of ['/ask', '/research', '/dataset-audit']) {
      const redirect = proxy(request(path + '?project=p'));
      assert.equal(redirect.status, 303);
      assert.equal(redirect.headers.get('location'), 'https://private.example/sign-in?next=' + encodeURIComponent(path + '?project=p'));
    }
    // The landing and sign-in pages are public.
    for (const path of ['/', '/demo', '/demo/ask', '/demo/workflows', '/demo/stress-test', '/demo/agent-market', '/demo/tools', '/demo/report', '/sign-in', '/auth/session', '/docs', '/docs/getting-started', '/blog', '/blog/a-better-first-question', '/changelog']) assert.equal(proxy(request(path)).status, 200);
    for (const path of ['/images/lab-orbitals.png', '/images/workspace-ask-dark.png', '/images/workspace-audit-light.png', '/images/product-ask-dark-desktop.jpg', '/images/product-stress-test-light-mobile.jpg']) {
      assert.equal(proxy(request(path)).status, 200);
    }
    assert.equal(proxy(request('/images/private-research.png')).status, 303);
    for (const path of ['/docs-private', '/blogger', '/changelog-private', '/demo-private', '/demo/api/projects', '/demo/ask/private']) assert.equal(proxy(request(path)).status, 303);
    assert.equal(proxy(request('/ask', { authorization: auth })).status, 200);
    assert.deepEqual(await proxy(request('/healthz')).json(), { status: 'ok' });
    delete process.env.WB_LOGIN_PASSWORD;
    assert.equal(proxy(request('/ask')).status, 503);
    assert.equal(proxy(request('/demo')).status, 200);
    assert.equal(proxy(request('/demo/ask')).status, 200);
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

test('sign-in issues a signed session cookie that the gate accepts', async () => {
  const session = load('app/lib/session.ts');
  const { POST: signIn } = load('app/auth/session/route.ts');
  try {
    Object.assign(process.env, { NODE_ENV: 'production', WB_LOGIN_USERNAME: 'operator',
      WB_LOGIN_PASSWORD: 'a-private-password-for-tests', WB_PUBLIC_ORIGIN: 'https://private.example' });
    const form = (fields, origin = 'https://private.example') => new NextRequest('https://private.example/auth/session', {
      method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
    assert.equal((await signIn(form({ username: 'operator', password: 'a-private-password-for-tests' }, 'https://evil.example'))).status, 403);
    const wrong = await signIn(form({ username: 'operator', password: 'wrong-password', next: '/ask' }));
    assert.equal(wrong.status, 303);
    assert.match(wrong.headers.get('location'), /\/sign-in\?error=invalid/);
    assert.equal(wrong.headers.get('set-cookie'), null);
    const ok = await signIn(form({ username: 'operator', password: 'a-private-password-for-tests', next: '//evil.example' }));
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.get('location'), 'https://private.example/ask');
    const cookie = ok.headers.get('set-cookie');
    assert.match(cookie, /wb_session=v1\.\d+\./);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    const value = cookie.split(';')[0].split('=')[1];
    assert.equal(proxy(request('/ask', { cookie: `wb_session=${value}` })).status, 200);
    assert.equal(proxy(request('/api/projects', { cookie: `wb_session=${value}` })).status, 200);
    // A password change signs every session out; expired sessions are refused.
    process.env.WB_LOGIN_PASSWORD = 'a-different-private-password';
    assert.equal(proxy(request('/api/projects', { cookie: `wb_session=${value}` })).status, 401);
    const login = session.configuredLogin();
    const old = session.createSession(login, Date.now() - 8 * 24 * 3600 * 1000);
    assert.equal(session.validSession(old, login), false);
    assert.equal(session.validSession(session.createSession(login), login), true);
    const out = await signIn(form({ intent: 'sign-out' }));
    assert.equal(out.headers.get('location'), 'https://private.example/');
    assert.match(out.headers.get('set-cookie'), /wb_session=;.*Max-Age=0/i);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});

test('Vercel proxy caps uploads and keeps protection bypass server-side', async () => {
  try {
    Object.assign(process.env, { NODE_ENV: 'production', VERCEL: '1', WB_LOGIN_USERNAME: 'operator',
      WB_LOGIN_PASSWORD: 'a-private-password-for-tests', WB_PUBLIC_ORIGIN: 'https://private.example',
      WB_API_TOKEN: 'private-backend-token-longer-than-32-characters', WB_API_URL: 'https://backend.example',
      WB_MAX_UPLOAD_BYTES: String(10 * 1024 * 1024), WB_VERCEL_PROTECTION_BYPASS: 'server-only-bypass' });
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(init.headers.get('x-vercel-protection-bypass'), 'server-only-bypass');
      return new Response('ok', { headers: { 'x-vercel-protection-bypass': 'must-not-escape' } });
    };
    const response = await GET(request('/api/private', { authorization: auth,
      'x-vercel-protection-bypass': 'attacker-value' }), params);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-vercel-protection-bypass'), null);
    const oversized = new NextRequest('https://private.example/api/private', { method: 'POST',
      headers: { authorization: auth, origin: 'https://private.example' },
      body: new Uint8Array(4 * 1024 * 1024 + 1) });
    assert.equal((await POST(oversized, params)).status, 413);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});

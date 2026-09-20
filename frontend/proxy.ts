import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

function equal(a: string, b: string) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

export function proxy(request: NextRequest) {
  // Constant liveness response; no workspace data or backend access.
  if (request.nextUrl.pathname === '/healthz') return NextResponse.json({ status: 'ok' });
  const required = process.env.NODE_ENV === 'production' || process.env.WB_REQUIRE_LOGIN === '1';
  if (!required) return NextResponse.next();
  const username = process.env.WB_LOGIN_USERNAME;
  const password = process.env.WB_LOGIN_PASSWORD;
  if (!username || username.includes(':') || !password || password.length < 16) {
    return new NextResponse('Workspace access is not configured.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const header = request.headers.get('authorization') || '';
  const encoded = header.startsWith('Basic ') ? header.slice(6) : '';
  const supplied = Buffer.from(encoded, 'base64').toString('utf8');
  if (!encoded || !equal(supplied, `${username}:${password}`)) {
    return new NextResponse('Sign in to this private research workspace.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="SciML Workbench", charset="UTF-8"', 'Cache-Control': 'no-store' }
    });
  }
  return NextResponse.next();
}

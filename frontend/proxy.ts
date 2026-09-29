import { NextRequest, NextResponse } from 'next/server';
import { configuredLogin, loginRequired, SESSION_COOKIE, validBasic, validSession } from './app/lib/session';

// Public without signing in: the landing page, the sign-in page and its form
// handler, liveness, and the static assets those pages need.
const PUBLIC = new Set([
  '/', '/sign-in', '/auth/session', '/favicon.ico', '/robots.txt',
  // Bundled marketing assets only. Uploaded research files stay behind /api/.
  '/images/lab-orbitals.png',
  ...['ask', 'research', 'audit'].flatMap(view =>
    ['dark', 'light'].map(theme => `/images/workspace-${view}-${theme}.png`)),
]);
const isPublic = (path: string) => PUBLIC.has(path) || path.startsWith('/_next/') || path.startsWith('/icon');

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Constant liveness response; no workspace data or backend access.
  if (path === '/healthz') return NextResponse.json({ status: 'ok' });
  if (!loginRequired() || isPublic(path)) return NextResponse.next();
  const login = configuredLogin();
  if (!login) {
    return new NextResponse('Workspace access is not configured.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (validSession(request.cookies.get(SESSION_COOKIE)?.value, login) || validBasic(request.headers.get('authorization'), login)) {
    return NextResponse.next();
  }
  // No WWW-Authenticate header: the browser never shows its own sign-in pop-up.
  if (path.startsWith('/api/')) {
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const target = new URL('/sign-in', request.url);
  target.searchParams.set('next', path + request.nextUrl.search);
  const response = NextResponse.redirect(target, 303);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

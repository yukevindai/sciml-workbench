import { NextRequest, NextResponse } from 'next/server';
import { configuredLogin, cookieOptions, createSession, equal, loginRequired, safeNext, SESSION_COOKIE } from '../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function redirect(request: NextRequest, path: string) {
  const origin = process.env.WB_PUBLIC_ORIGIN || request.nextUrl.origin;
  const response = NextResponse.redirect(new URL(path, origin), 303);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/** Sign in (form fields username, password, next) or sign out (intent=sign-out). */
export async function POST(request: NextRequest) {
  const expected = process.env.WB_PUBLIC_ORIGIN || (process.env.NODE_ENV !== 'production' ? request.nextUrl.origin : undefined);
  if (!expected || request.headers.get('origin') !== expected) {
    return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 });
  }
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: 'Invalid form' }, { status: 400 }); }
  const next = safeNext(form.get('next'));

  if (form.get('intent') === 'sign-out') {
    const response = redirect(request, '/');
    response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
    return response;
  }
  if (!loginRequired()) return redirect(request, next);
  const login = configuredLogin();
  if (!login) return redirect(request, `/sign-in?error=setup&next=${encodeURIComponent(next)}`);
  const username = String(form.get('username') ?? '');
  const password = String(form.get('password') ?? '');
  // Both comparisons always run, so timing does not reveal which field was wrong.
  const userOk = equal(username, login.username);
  const passwordOk = equal(password, login.password);
  if (!userOk || !passwordOk) {
    await new Promise(resolve => setTimeout(resolve, 600));
    return redirect(request, `/sign-in?error=invalid&next=${encodeURIComponent(next)}`);
  }
  const response = redirect(request, next);
  response.cookies.set(SESSION_COOKIE, createSession(login), cookieOptions());
  return response;
}

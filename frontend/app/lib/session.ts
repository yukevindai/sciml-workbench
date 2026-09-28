import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/* Server-only. A signed, expiring session cookie replaces the browser's HTTP
   Basic pop-up. The signing key is derived from the configured web login, so
   changing the password signs everyone out. Nothing secret is sent to the browser. */

export const SESSION_COOKIE = 'wb_session';
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

export function loginRequired() {
  return process.env.NODE_ENV === 'production' || process.env.WB_REQUIRE_LOGIN === '1';
}

type Login = { username: string; password: string };

/** The configured login, or null when it is missing or too weak to protect a workspace. */
export function configuredLogin(): Login | null {
  const username = process.env.WB_LOGIN_USERNAME;
  const password = process.env.WB_LOGIN_PASSWORD;
  if (!username || username.includes(':') || !password || password.length < 16) return null;
  return { username, password };
}

export function equal(a: string, b: string) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

function sign(login: Login, expires: number) {
  const key = createHash('sha256').update(`sciml-session:${login.username}:${login.password}`).digest();
  return createHmac('sha256', key).update(`v1.${expires}`).digest('base64url');
}

export function createSession(login: Login, now = Date.now()) {
  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  return `v1.${expires}.${sign(login, expires)}`;
}

export function validSession(value: string | undefined, login: Login, now = Date.now()) {
  if (!value) return false;
  const [version, rawExpires, signature, ...rest] = value.split('.');
  const expires = Number(rawExpires);
  if (version !== 'v1' || rest.length || !signature || !Number.isSafeInteger(expires) || expires * 1000 <= now) return false;
  return equal(signature, sign(login, expires));
}

/** Scripted clients may still send the same login as an Authorization: Basic header. */
export function validBasic(header: string | null, login: Login) {
  const encoded = header?.startsWith('Basic ') ? header.slice(6) : '';
  return Boolean(encoded) && equal(Buffer.from(encoded, 'base64').toString('utf8'), `${login.username}:${login.password}`);
}

export function cookieOptions() {
  return {
    httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge: SESSION_SECONDS,
    secure: process.env.NODE_ENV === 'production' && !(process.env.WB_PUBLIC_ORIGIN || '').startsWith('http://'),
  };
}

/** Only same-site relative paths; anything else returns to the workspace home. */
export function safeNext(value: unknown) {
  return typeof value === 'string' && /^\/(?![/\\])[\w\-./?=&%#]*$/.test(value) && !value.startsWith('/sign-in') ? value : '/ask';
}

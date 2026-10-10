/** Server configuration only; never trust a client-supplied Host or Origin as a production fallback. */
export function publicOrigin(developmentOrigin = 'http://localhost:3000'): string | undefined {
  const configured = process.env.WB_PUBLIC_ORIGIN;
  const value = configured ?? (process.env.NODE_ENV !== 'production' ? developmentOrigin : undefined);
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) return undefined;
    return url.origin;
  } catch { return undefined; }
}

/** Safe diagnostics only: never read the form body, cookies, or authorization. */
export function originRejection(request: Request, expectedOrigin: string): Response {
  const origin = request.headers.get('origin');
  let receivedOrigin: string | null = origin === null ? null : 'invalid';
  if (origin === 'null') receivedOrigin = 'null';
  else if (origin !== null) {
    try {
      const url = new URL(origin);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
          url.pathname === '/' && !url.search && !url.hash) receivedOrigin = url.origin;
    } catch { /* Do not reflect arbitrary header content. */ }
  }
  const reason = origin === null ? 'missing_origin' : origin === 'null' ? 'opaque_origin' : 'origin_mismatch';
  return Response.json({
    error: 'Cross-origin request rejected',
    code: 'ORIGIN_REJECTED',
    reason,
    expectedOrigin,
    receivedOrigin,
    deployment: {
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || null,
    },
  }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}

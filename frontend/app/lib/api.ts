/** A response the server actually sent; `status` separates a refusal from an outage. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Every request goes to the same-origin Next route handler, which attaches the
 *  backend bearer credential server-side. No token is ever visible to the browser.
 *  `timeoutMs` bounds requests whose callers hold a busy state or a poll slot. */
export async function api<T>(path: string, decode: (value: unknown) => T, init?: RequestInit, timeoutMs?: number): Promise<T> {
  const signal = timeoutMs ? (init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)) : init?.signal;
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, { ...init, signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('The server did not respond in time.');
    throw e;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const payload = (data && typeof data === 'object' ? data : {}) as { error?: unknown; detail?: unknown };
    const detail = payload.error ?? payload.detail;
    const message = typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map(issue => {
          if (!issue || typeof issue !== 'object' || typeof issue.msg !== 'string') return '';
          const path = Array.isArray(issue.loc) ? issue.loc.filter((part: unknown) => typeof part === 'string' && part !== 'body').join(' · ') : '';
          return `${path ? path + ': ' : ''}${issue.msg}`;
        }).filter(Boolean).join('; ') : '';
    throw new ApiError(message || `Request failed (${response.status})`, response.status);
  }
  return decode(data);
}

export function json(body: unknown, extra: Record<string, string> = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), ...extra },
    body: JSON.stringify(body),
  };
}

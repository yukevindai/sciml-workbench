/** Every request goes to the same-origin Next route handler, which attaches the
 *  backend bearer credential server-side. No token is ever visible to the browser. */
export async function api<T>(path: string, decode: (value: unknown) => T, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, init);
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
    throw new Error(message || `Request failed (${response.status})`);
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

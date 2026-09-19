/** Every request goes to the same-origin Next route handler, which attaches the
 *  backend bearer credential server-side. No token is ever visible to the browser. */
export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (data as { error?: string; detail?: string }).error ||
      (data as { detail?: string }).detail ||
      `Request failed (${response.status})`
    );
  }
  return data as T;
}

export function json(body: unknown, extra: Record<string, string> = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), ...extra },
    body: JSON.stringify(body),
  };
}

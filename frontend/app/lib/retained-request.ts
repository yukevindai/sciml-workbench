import { api, ApiError } from './api';

/** Keep the exact question and key until acceptance is known. Retrying never creates a new run. */
export function hasRetainedRequest(namespace: string): boolean {
  try { return !!sessionStorage.getItem(namespace); } catch { return false; }
}
export async function retainedPost<T>(namespace: string, path: string, makeBody: () => Promise<unknown>, decode: (value: unknown) => T): Promise<T> {
  const raw = sessionStorage.getItem(namespace);
  const pending: { path: string; key: string; body: unknown } = raw ? JSON.parse(raw) : { path, key: crypto.randomUUID(), body: await makeBody() };
  if (pending.path !== path || typeof pending.key !== 'string') throw new Error('A different request is awaiting confirmation. Return to its original selection to retry.');
  sessionStorage.setItem(namespace, JSON.stringify(pending));
  try {
    const result = await api(path, decode, { method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':pending.key}, body:JSON.stringify(pending.body) },60_000);
    sessionStorage.removeItem(namespace); return result;
  } catch (error) {
    if (error instanceof ApiError && error.status>=400 && error.status<500 && ![408,429].includes(error.status)) sessionStorage.removeItem(namespace);
    throw error;
  }
}

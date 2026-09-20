import { NextRequest } from 'next/server';
import { proxy as operatorGate } from '../../../proxy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const gate = operatorGate(request);
  if (gate.status !== 200) return gate;
  const { path } = await params;
  if (path.some(p => !/^[a-zA-Z0-9_-]+$/.test(p))) return Response.json({ error: 'Invalid route' }, { status: 400 });
  const publicOrigin = process.env.WB_PUBLIC_ORIGIN || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : undefined);
  if (!publicOrigin) return Response.json({ error: 'Public origin is not configured' }, { status: 503 });
  if ((request.method !== 'GET' || request.headers.has('origin')) && request.headers.get('origin') !== publicOrigin)
    return Response.json({ error: 'Cross-origin request rejected' }, { status: 403 });
  const token = process.env.WB_API_TOKEN;
  if (!token || (process.env.NODE_ENV === 'production' && (token.trim().length < 32 || token.startsWith('replace-with-'))))
    return Response.json({ error: 'Server API connection is not configured' }, { status: 503 });
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  for (const name of ['content-type', 'x-filename', 'x-source', 'x-title', 'idempotency-key', 'last-event-id']) {
    const value = request.headers.get(name); if (value) headers.set(name, value);
  }
  try {
    let body: Uint8Array | undefined;
    if (request.method !== 'GET') {
      const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      if (reader) while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 10 * 1024 * 1024) { await reader.cancel(); return Response.json({ error: 'Maximum upload is 10 MiB' }, { status: 413 }); }
        chunks.push(value);
      }
      body = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    }
    const response = await fetch(`${process.env.WB_API_URL || 'http://localhost:8000'}/api/v1/${path.join('/')}${request.nextUrl.search}`, {
      method: request.method, headers, body: body as BodyInit | undefined, cache: 'no-store', redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(60000)])
    });
    const out = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    for (const name of ['content-type', 'content-disposition']) { const value = response.headers.get(name); if (value) out.set(name, value); }
    return new Response(response.body, { status: response.status, headers: out });
  } catch { return Response.json({ error: 'Backend unavailable. Check that the API and database are running.' }, { status: 502 }); }
}
export const GET = proxy;
export const POST = proxy;

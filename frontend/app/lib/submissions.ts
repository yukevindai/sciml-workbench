import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { parseJob } from './decode';
import type { LegacyJobResponse } from './generated/http';

/** Operations submitted through the shared B04 service with a browser request key. */
export type OperationKind = 'audit' | 'split' | 'benchmark' | 'failure' | 'report';

/**
 * A request whose acceptance is not yet known. The key and exact body are kept
 * (in this browser) until the server answers definitively, so a retry after a lost
 * response or a reload resolves to the original job instead of creating another.
 * Nothing is ever resent automatically.
 */
export type PendingSubmission = {
  key: string;
  project_id: string;
  kind: OperationKind;
  body: string | null;
  fingerprint: string;
  created_at: string;
  /** `sending` survives only if the page closed mid-request; it is as uncertain as `uncertain`. */
  status: 'sending' | 'uncertain';
  detail: string;
};

const STORAGE_PREFIX = 'sciml-submissions:';
const CHANGE_EVENT = 'sciml-submissions';
const MAX_PENDING = 20;
const SUBMIT_TIMEOUT = 60_000;
const memory = new Map<string, PendingSubmission[]>();

/** Thrown when the server may or may not have accepted the request. */
export class UncertainSubmission extends Error {}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  }
  return value;
}

export function fingerprint(kind: OperationKind, payload?: object): string {
  return JSON.stringify([kind, payload === undefined ? null : canonical(payload)]);
}

function valid(value: unknown, projectId: string): value is PendingSubmission {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.key === 'string' && entry.project_id === projectId && typeof entry.kind === 'string'
    && (entry.body === null || typeof entry.body === 'string') && typeof entry.fingerprint === 'string'
    && typeof entry.created_at === 'string' && (entry.status === 'sending' || entry.status === 'uncertain');
}

export function pendingSubmissions(projectId: string): PendingSubmission[] {
  if (!projectId) return [];
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + projectId);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(entry => valid(entry, projectId)).map(entry => ({ ...entry, detail: typeof entry.detail === 'string' ? entry.detail : '' })) : [];
    }
  } catch { /* storage unavailable or corrupt: fall back to this page's memory */ }
  return memory.get(projectId) ?? [];
}

function store(projectId: string, entries: PendingSubmission[]) {
  const kept = entries.slice(-MAX_PENDING);
  memory.set(projectId, kept);
  try {
    if (kept.length) localStorage.setItem(STORAGE_PREFIX + projectId, JSON.stringify(kept));
    else localStorage.removeItem(STORAGE_PREFIX + projectId);
  } catch { /* storage unavailable: keys survive only while this page stays open */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function upsert(entry: PendingSubmission) {
  store(entry.project_id, [...pendingSubmissions(entry.project_id).filter(value => value.key !== entry.key), entry]);
}

export function discardSubmission(projectId: string, key: string) {
  store(projectId, pendingSubmissions(projectId).filter(value => value.key !== key));
}

/** The retained entry for exactly this operation and payload, if any. */
export function pendingFor(projectId: string, kind: OperationKind, payload?: object): PendingSubmission | undefined {
  const print = fingerprint(kind, payload);
  return pendingSubmissions(projectId).find(value => value.fingerprint === print);
}

/** A definitive refusal means nothing was accepted under this key; anything else may have been. */
function definitive(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
}

async function send(entry: PendingSubmission): Promise<LegacyJobResponse> {
  upsert({ ...entry, status: 'sending' });
  let job: LegacyJobResponse;
  try {
    job = await api(`projects/${entry.project_id}/${entry.kind}`, parseJob, {
      method: 'POST',
      headers: { ...(entry.body === null ? {} : { 'Content-Type': 'application/json' }), 'Idempotency-Key': entry.key },
      ...(entry.body === null ? {} : { body: entry.body }),
    }, SUBMIT_TIMEOUT);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The request did not complete';
    if (definitive(error)) {
      discardSubmission(entry.project_id, entry.key);
      throw error;
    }
    upsert({ ...entry, status: 'uncertain', detail: message });
    throw new UncertainSubmission(`${message}. The server may already have accepted this ${entry.kind} request. `
      + 'Retrying the same inputs, or resending it from unconfirmed submissions, reuses its request key and returns the original job instead of starting another.');
  }
  if (job.project_id !== entry.project_id || job.kind !== entry.kind) {
    // A malformed answer is not a refusal: keep the key so a retry resolves to the original job.
    upsert({ ...entry, status: 'uncertain', detail: 'The server returned a different job.' });
    throw new UncertainSubmission('The server returned a different job. The request key is kept for a safe retry.');
  }
  discardSubmission(entry.project_id, entry.key);
  return job;
}

/**
 * Submits one operation. The same kind and payload reuse a retained key until the
 * server accepts or definitively refuses it; different inputs are a new request.
 */
export function submitOperation(projectId: string, kind: OperationKind, payload?: object): Promise<LegacyJobResponse> {
  const existing = pendingFor(projectId, kind, payload);
  return send(existing ?? {
    key: crypto.randomUUID(), project_id: projectId, kind,
    body: payload === undefined ? null : JSON.stringify(payload),
    fingerprint: fingerprint(kind, payload), created_at: new Date().toISOString(), status: 'sending', detail: '',
  });
}

/** Resends exactly the retained key and body. Safe: an accepted request returns its original job. */
export function resendSubmission(entry: PendingSubmission): Promise<LegacyJobResponse> {
  return send(entry);
}

/** Live view of this browser's retained submissions for a project, across tabs. */
export function usePendingSubmissions(projectId: string): PendingSubmission[] {
  const [entries, setEntries] = useState<PendingSubmission[]>([]);
  useEffect(() => {
    const update = () => setEntries(pendingSubmissions(projectId));
    update();
    const storage = (event: StorageEvent) => { if (event.key === null || event.key === STORAGE_PREFIX + projectId) update(); };
    window.addEventListener(CHANGE_EVENT, update);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener(CHANGE_EVENT, update); window.removeEventListener('storage', storage); };
  }, [projectId]);
  return entries;
}

import { api, ApiError } from './api';
import { parseResearchRun, parseResearchRuns } from './decode';
import type { EffectivePolicy, MaterialResponse, ResearchRun } from './generated/http';
import type { RunInput } from './generated/contracts';
import type { DatasetArtifact } from './types';

export const TERMINAL_RUN_STATES = new Set<ResearchRun['state']>(['completed', 'partially_completed', 'failed', 'cancelled']);
export const isTerminalRun = (run: Pick<ResearchRun, 'state'>) => TERMINAL_RUN_STATES.has(run.state);

/** Poll cadence for the current run. A12 replaces the event read with SSE and keeps this as its fallback. */
export const RUN_POLL_ACTIVE = 3_000;
export const RUN_POLL_HIDDEN = 15_000;
export const RUN_POLL_MAX_BACKOFF = 60_000;

export function runPollDelay({ failures, hidden }: { failures: number; hidden: boolean }): number {
  if (failures > 0) return Math.min(RUN_POLL_ACTIVE * 2 ** failures, RUN_POLL_MAX_BACKOFF);
  return hidden ? RUN_POLL_HIDDEN : RUN_POLL_ACTIVE;
}

export const EXAMPLE_GOALS = [
  'Audit the attached CSV for missing values, duplicate rows and outliers. Report the findings; do not train models.',
  'Audit the attached dataset, create a grouped train/validation/test split, and compare the supported mean and ridge baselines on validation data.',
  'Extract the attached PDF, cite the passages that describe the measurement conditions, and note any gaps.',
] as const;

/* ------------------------------- input scope ------------------------------ */

/** One selectable input: an attachment (with its dataset when it is a CSV), or a dataset without an attachment record. */
export type ScopeItem = {
  id: string;
  label: string;
  media: 'csv' | 'pdf';
  material_ids: string[];
  artifact_ids: string[];
};

export function scopeItems(materials: MaterialResponse[], datasets: DatasetArtifact[]): ScopeItem[] {
  const items: ScopeItem[] = materials.map(m => ({
    id: m.id, label: m.filename, media: m.media_type === 'application/pdf' ? 'pdf' : 'csv',
    material_ids: [m.id], artifact_ids: m.dataset_id ? [m.dataset_id] : [],
  }));
  const attached = new Set(materials.flatMap(m => m.dataset_id ? [m.dataset_id] : []));
  for (const dataset of datasets) {
    if (!attached.has(dataset.id)) items.push({ id: dataset.id, label: dataset.filename, media: 'csv', material_ids: [], artifact_ids: [dataset.id] });
  }
  return items;
}

/** True when the saved policy grants every ID this input needs. */
export function authorized(item: ScopeItem, policy: EffectivePolicy | null | undefined): boolean {
  if (!policy) return false;
  return item.material_ids.every(id => policy.material_ids.includes(id)) && item.artifact_ids.every(id => policy.artifact_ids.includes(id));
}

export function runInput(objective: string, items: ScopeItem[], policy: EffectivePolicy, mode: 'autopilot' | 'review_plan'): RunInput {
  const unique = (values: string[]) => [...new Set(values)].sort();
  return {
    objective: objective.trim(), mode,
    inputs: { material_ids: unique(items.flatMap(i => i.material_ids)), artifact_ids: unique(items.flatMap(i => i.artifact_ids)) },
    policy_revision: policy.project_policy_revision,
    limits: policy.limits,
  };
}

/* --------------------------- retained run request ------------------------- */

/**
 * The key and exact body of a Run research request whose acceptance is not yet known.
 * Kept in this browser until the server accepts or definitively refuses it, so a
 * retry after a lost response or reload returns the original run. Never resent automatically.
 */
export type PendingRun = { key: string; project_id: string; body: string; created_at: string; status: 'sending' | 'uncertain'; detail: string };

const PENDING_PREFIX = 'sciml-run-request:';
const CURRENT_PREFIX = 'sciml-run:';
export const RUN_CHANGE_EVENT = 'sciml-run-request';
const SUBMIT_TIMEOUT = 60_000;
const memory = new Map<string, PendingRun>();

export class UncertainRun extends Error {}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  }
  return value;
}
const encode = (input: RunInput) => JSON.stringify(canonical(input));

export function pendingRun(projectId: string): PendingRun | null {
  if (!projectId) return null;
  try {
    const raw = localStorage.getItem(PENDING_PREFIX + projectId);
    if (raw !== null) {
      const value: unknown = JSON.parse(raw);
      if (value && typeof value === 'object') {
        const entry = value as Record<string, unknown>;
        if (typeof entry.key === 'string' && entry.project_id === projectId && typeof entry.body === 'string'
          && typeof entry.created_at === 'string' && (entry.status === 'sending' || entry.status === 'uncertain')) {
          return { ...(entry as PendingRun), detail: typeof entry.detail === 'string' ? entry.detail : '' };
        }
      }
      return null;
    }
  } catch { /* storage unavailable or corrupt: fall back to this page's memory */ }
  return memory.get(projectId) ?? null;
}

function storePending(projectId: string, entry: PendingRun | null) {
  if (entry) memory.set(projectId, entry); else memory.delete(projectId);
  try {
    if (entry) localStorage.setItem(PENDING_PREFIX + projectId, JSON.stringify(entry));
    else localStorage.removeItem(PENDING_PREFIX + projectId);
  } catch { /* storage unavailable: the key survives only while this page stays open */ }
  window.dispatchEvent(new Event(RUN_CHANGE_EVENT));
}

export const forgetPendingRun = (projectId: string) => storePending(projectId, null);

const definitive = (error: unknown) => error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;

async function sendRun(entry: PendingRun): Promise<ResearchRun> {
  storePending(entry.project_id, { ...entry, status: 'sending' });
  let run: ResearchRun;
  try {
    run = await api(`projects/${entry.project_id}/agent-runs`, parseResearchRun, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': entry.key }, body: entry.body,
    }, SUBMIT_TIMEOUT);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The request did not complete';
    if (definitive(error)) { storePending(entry.project_id, null); throw error; }
    storePending(entry.project_id, { ...entry, status: 'uncertain', detail: message });
    throw new UncertainRun(`${message}. The server may already have accepted this research request. `
      + 'Choosing Run research again with the same goal and inputs, or resending it below, reuses its request key and returns the original run instead of starting another.');
  }
  if (run.project_id !== entry.project_id) {
    storePending(entry.project_id, { ...entry, status: 'uncertain', detail: 'The server returned a run for another project.' });
    throw new UncertainRun('The server returned a run for another project. The request key is kept for a safe retry.');
  }
  storePending(entry.project_id, null);
  return run;
}

/** Same body reuses the retained key; a different goal, input set, mode or policy is a new request. */
export function submitRun(projectId: string, input: RunInput): Promise<ResearchRun> {
  const body = encode(input);
  const existing = pendingRun(projectId);
  return sendRun(existing && existing.body === body ? existing : {
    key: crypto.randomUUID(), project_id: projectId, body, created_at: new Date().toISOString(), status: 'sending', detail: '',
  });
}

export const resendRun = (entry: PendingRun) => sendRun(entry);

/* ------------------------------ current run ------------------------------- */

export function rememberedRun(projectId: string): string {
  try { return localStorage.getItem(CURRENT_PREFIX + projectId) ?? ''; } catch { return ''; }
}
export function rememberRun(projectId: string, runId: string) {
  try { localStorage.setItem(CURRENT_PREFIX + projectId, runId); } catch { /* storage unavailable */ }
}

const HISTORY_PAGE = 100;
const HISTORY_PAGES = 5;

/** Newest first. The history route pages by run ID, so every loaded page is sorted here. */
export async function loadRunHistory(projectId: string, signal?: AbortSignal): Promise<{ runs: ResearchRun[]; truncated: boolean }> {
  const runs: ResearchRun[] = [];
  let after = '';
  for (let page = 0; page < HISTORY_PAGES; page += 1) {
    const batch = await api(`projects/${projectId}/agent-runs?limit=${HISTORY_PAGE}${after ? `&after=${encodeURIComponent(after)}` : ''}`,
      parseResearchRuns, { signal }, 30_000);
    if (batch.some(run => run.project_id !== projectId)) throw new Error('The server returned runs for another project.');
    runs.push(...batch);
    if (batch.length < HISTORY_PAGE) return { runs: sortRuns(runs), truncated: false };
    after = batch[batch.length - 1].id;
  }
  return { runs: sortRuns(runs), truncated: true };
}

const sortRuns = (runs: ResearchRun[]) => [...runs].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));

/** The remembered run if it is still listed, otherwise the newest unfinished run, otherwise the newest. */
export function chooseRun(runs: ResearchRun[], remembered: string): ResearchRun | undefined {
  return runs.find(run => run.id === remembered) ?? runs.find(run => !isTerminalRun(run)) ?? runs[0];
}

export function awaitingPlanReview(run: ResearchRun, planRevision: number | undefined): boolean {
  return run.mode === 'review_plan' && run.state === 'waiting_for_input' && run.open_question_ids.length === 0
    && run.plan_revision > 0 && planRevision === run.plan_revision;
}

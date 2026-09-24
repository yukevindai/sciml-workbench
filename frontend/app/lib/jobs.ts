import { api } from './api';
import { parseJobPage } from './decode';
import type { JobPage } from './generated/http';
import { auditHref } from './audit';
import { splitHref } from './split';
import { benchmarkHref } from './benchmark';
import { evidenceHref } from './evidence';
import { failureHref } from './failure';
import { reportHref } from './lineage';
import type { Job } from './types';

/** Newest jobs first; older history beyond this is reported as not loaded, never guessed. */
export const MAX_JOB_PAGES = 5;
const PAGE_SIZE = 100;
const READ_TIMEOUT = 30_000;

export const POLL_ACTIVE = 2_500;
export const POLL_IDLE = 10_000;
export const POLL_HIDDEN = 30_000;
export const POLL_MAX_BACKOFF = 60_000;
/** Artifacts are reloaded on any job change, and at least this often for work created outside jobs. */
export const ARTIFACT_REFRESH = 30_000;

export const isActive = (job: Pick<Job, 'state'>) => job.state === 'queued' || job.state === 'running';

export type JobListing = { jobs: Job[]; truncated: boolean };

/** Scoped B09 job reads with receipts, run links and recovery decisions. */
export async function loadJobs(projectId: string, signal?: AbortSignal): Promise<JobListing> {
  const jobs: Job[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page: JobPage = await api(`projects/${projectId}/job-index?order=desc&limit=${PAGE_SIZE}${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`,
      parseJobPage, { signal }, READ_TIMEOUT);
    if (page.items.some(job => job.project_id !== projectId)) throw new Error('The server returned data for a different project.');
    jobs.push(...page.items);
    cursor = page.next_cursor ?? null;
  } while (cursor && ++pages < MAX_JOB_PAGES);
  return { jobs, truncated: Boolean(cursor) };
}

/** Changes whenever a job appears, changes state, gains a result or a recovery decision. */
export function jobFingerprint(jobs: Job[]): string {
  return jobs.map(job => `${job.id}:${job.state}:${job.result_id ?? ''}:${job.recovery?.state ?? ''}:${job.external_receipt?.state ?? ''}:${job.external_receipt?.artifact_id ?? ''}`).join('|');
}

/** Doubles after each consecutive failure; slows down when nothing is running or the tab is hidden. */
export function pollDelay({ failures, active, hidden }: { failures: number; active: boolean; hidden: boolean }): number {
  if (failures > 0) return Math.min(POLL_ACTIVE * 2 ** failures, POLL_MAX_BACKOFF);
  if (hidden) return POLL_HIDDEN;
  return active ? POLL_ACTIVE : POLL_IDLE;
}

const RESULT_LINKS: Record<string, [(project: string, id: string) => string, string]> = {
  audit: [auditHref, 'audit result'], split: [splitHref, 'split result'], benchmark: [benchmarkHref, 'benchmark result'],
  report: [reportHref, 'report archive'], failure: [failureHref, 'failure record'], evidence: [evidenceHref, 'extracted evidence'],
};

/** Where a job's recorded result can be inspected, for succeeded and failed jobs alike. */
export function resultLink(job: Job): { href: string; label: string } | null {
  const target = RESULT_LINKS[job.kind];
  if (!job.result_id || !target) return null;
  return { href: target[0](job.project_id, job.result_id), label: target[1] };
}

export const JOB_KIND_LABEL: Record<Job['kind'], string> = {
  audit: 'Dataset audit', split: 'Split', benchmark: 'Benchmark', evidence: 'Evidence extraction', failure: 'Failure Memory import',
  report: 'Report export', report_verify: 'Report verification', scientific_replay: 'Scientific replay',
};

type Recovery = NonNullable<Job['recovery']>;

/** D04 recovery wording. A recovered job keeps its original failed outcome. */
export function recoveryStatus(recovery: Recovery): { label: string; description: string } {
  if (!recovery.eligible) return { label: 'Not retried automatically', description: 'This failure is not eligible for automatic recovery (for example, a deterministic rejection, a cancelled run or agent-owned work).' };
  const attempts = `${recovery.attempts} of ${recovery.max_attempts} recovery attempts used.`;
  switch (recovery.state) {
    case 'pending':
      return { label: 'Recovery scheduled', description: `${attempts}${recovery.next_attempt_at ? ` Next attempt no earlier than ${new Date(recovery.next_attempt_at).toLocaleString()}.` : ''}` };
    case 'running':
      return { label: 'Recovery in progress', description: attempts };
    case 'completed':
      return { label: 'Recovered', description: recovery.retry_job_id
        ? 'A new attempt was submitted with the original inputs. This job remains failed; the new attempt has its own outcome.'
        : 'The original external outcome was reconciled without a new attempt. This job remains failed as originally recorded.' };
    case 'exhausted':
      return { label: 'Recovery stopped', description: `${attempts}${recovery.last_error_code ? ` Last error: ${recovery.last_error_code}.` : ''} No further automatic attempts.` };
  }
}

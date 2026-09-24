import type { JobDetail } from '../app/lib/generated/http';

/** Legacy fixtures predate B09 detail fields; absent fields read as "none recorded", never invented.
 *  Inputs are untyped JSON: the workbench validates every page it receives. */
export function jobDetail(job: object): JobDetail {
  return { error_code: null, retry_of_job_id: null, deadline_at: null, external_receipt: null, run_links: [], recovery: null, ...job } as unknown as JobDetail;
}

/** One newest-first `job-index` page, as the workbench poller reads it. */
export function jobPage(jobs: object[] = [], nextCursor: string | null = null) {
  return { items: jobs.map(jobDetail), next_cursor: nextCursor };
}

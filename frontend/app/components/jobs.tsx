'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { Workbench } from '../lib/context';
import { failureHref, receiptStatus } from '../lib/failure';
import { JOB_KIND_LABEL, isActive, recoveryStatus, resultLink } from '../lib/jobs';
import { discardSubmission, resendSubmission, usePendingSubmissions, type PendingSubmission } from '../lib/submissions';
import type { Job } from '../lib/types';
import { kinds } from '../lib/types';
import { formatDate, shortId } from '../lib/format';
import { Badge, Disclosure } from './ui';

type Filter = 'all' | 'active' | 'failed';
const PAGE = 10;

export function JobActivity({ wb }: { wb: Workbench }) {
  const { jobs } = wb;
  const pending = usePendingSubmissions(wb.projectId);
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  if (!jobs.length && !pending.length) return null;

  const active = jobs.filter(isActive);
  const failed = jobs.filter(job => job.state === 'failed');
  const visible = filter === 'active' ? active : filter === 'failed' ? failed : jobs;
  // Recovery attempts point back at their original; show that link from both sides.
  const retriedAs = new Map<string, string[]>();
  for (const job of jobs) if (job.retry_of_job_id) retriedAs.set(job.retry_of_job_id, [...(retriedAs.get(job.retry_of_job_id) ?? []), job.id]);
  const failureRecords = new Map<string, string>();
  for (const failure of kinds(wb.artifacts, 'failure')) if (failure.schema_version === '2.0') failureRecords.set(failure.source_job_id, failure.id);

  return (
    <Disclosure
      defaultOpen={active.length > 0 || pending.length > 0}
      summary={
        <>
          <span>Job activity</span>
          {active.length > 0 && (
            <>
              <Loader2 size={13} className="spin" aria-hidden="true" />
              <span>{active.length} active jobs</span>
            </>
          )}
          {pending.length > 0 && <span className="badge badge--warning">{pending.length} unconfirmed</span>}
          <span className="dim" style={{ marginLeft: 'auto' }}>{jobs.length}{wb.jobsTruncated ? '+' : ''} total</span>
        </>
      }
    >
      <div className="stack stack--tight">
        {pending.length > 0 && <UnconfirmedSubmissions wb={wb} pending={pending} />}
        {jobs.length > 0 && <div className="cluster">
          <label className="field-label" htmlFor="job-filter">Show</label>
          <select id="job-filter" className="select" style={{ width: 'auto' }} value={filter}
            onChange={event => { setFilter(event.target.value as Filter); setShown(PAGE); }}>
            <option value="all">All jobs ({jobs.length})</option>
            <option value="active">Queued or running ({active.length})</option>
            <option value="failed">Failed ({failed.length})</option>
          </select>
          {wb.lastUpdated && <span className="field-hint">Status read at {new Date(wb.lastUpdated).toLocaleTimeString()}.</span>}
        </div>}
        {wb.jobsTruncated && <p className="field-hint">Only the newest {jobs.length} jobs are loaded. Older jobs are not listed here.</p>}
        {jobs.length > 0 && !visible.length && <p className="field-hint">No {filter === 'active' ? 'queued or running' : 'failed'} jobs.</p>}
        <ul aria-label="Jobs">
          {visible.slice(0, shown).map(job => (
            <JobRow key={job.id} job={job} retriedAs={retriedAs.get(job.id) ?? []} failureRecord={failureRecords.get(job.id)} />
          ))}
        </ul>
        {visible.length > shown && <div>
          <button type="button" className="button button--secondary button--sm" onClick={() => setShown(value => value + PAGE * 2)}>
            Show more ({visible.length - shown} not shown)
          </button>
        </div>}
      </div>
    </Disclosure>
  );
}

function JobRow({ job, retriedAs, failureRecord }: { job: Job; retriedAs: string[]; failureRecord?: string }) {
  const result = resultLink(job);
  const recovery = job.recovery ? recoveryStatus(job.recovery) : null;
  const receipt = job.kind === 'failure' ? receiptStatus(job) : null;
  return (
    <li className="job" id={`job-${job.id}`}>
      <span className="job-text">
        <span className="job-kind">{JOB_KIND_LABEL[job.kind] ?? job.kind}</span>
        <span className="meta-list">
          <span className="meta-id" title={job.id}>{shortId(job.id)}</span>
          <span>Queued {formatDate(job.created_at)}</span>
          {job.finished_at ? <span>Finished {formatDate(job.finished_at)}</span>
            : job.started_at ? <span>Started {formatDate(job.started_at)}</span> : null}
          {job.state === 'running' && job.deadline_at && <span>Deadline {formatDate(job.deadline_at)}</span>}
        </span>
        {job.state === 'failed' && (job.error || job.error_code) && <span className="job-error">
          {job.error_code ? `${job.error_code}: ` : ''}{job.error ?? 'Operation did not complete.'}
        </span>}
        {result && <span>
          <Link className="text-link" href={result.href}>Inspect {result.label}</Link>
          {job.state === 'failed' && <span className="field-hint"> The execution failed; this artifact records the unsuccessful outcome.</span>}
        </span>}
        {job.state === 'failed' && !result && <span className="field-hint">No result artifact was published by this job.</span>}
        {failureRecord && job.kind !== 'failure' && <Link className="text-link" href={failureHref(job.project_id, failureRecord)}>Inspect failure record for this job</Link>}
        {receipt && <span className="field-hint"><Badge state={receipt.label} tone={receipt.tone} /> {receipt.description}</span>}
        {job.retry_of_job_id && <span className="field-hint">New attempt of <a className="text-link" href={`#job-${job.retry_of_job_id}`}>job {shortId(job.retry_of_job_id)}</a>. The original keeps its own outcome.</span>}
        {retriedAs.map(id => <span key={id} className="field-hint">Retried as <a className="text-link" href={`#job-${id}`}>job {shortId(id)}</a>.</span>)}
        {recovery && <span className="field-hint"><strong>{recovery.label}.</strong> {recovery.description}
          {job.recovery?.retry_job_id && !retriedAs.includes(job.recovery.retry_job_id) && <> New attempt: job {shortId(job.recovery.retry_job_id)} (not in the loaded list).</>}
        </span>}
        <span className="field-hint">{job.run_links.length
          ? job.run_links.map(link => `Agent run ${link.run_id} · action ${shortId(link.action_id)} (${OWNERSHIP[link.ownership]})`).join('; ')
          : 'No agent run is linked to this job.'}</span>
      </span>
      <Badge state={job.state} />
    </li>
  );
}

const OWNERSHIP = { owned: 'owned by the run', shared: 'shared with other work', detached: 'detached from the run' } as const;

function UnconfirmedSubmissions({ wb, pending }: { wb: Workbench; pending: PendingSubmission[] }) {
  return (
    <section className="alert alert--warning" aria-labelledby="unconfirmed-title">
      <AlertTriangle size={17} className="alert-icon" aria-hidden="true" />
      <div className="alert-body stack stack--tight">
        <strong id="unconfirmed-title">Unconfirmed submissions</strong>
        <p>The server may or may not have accepted these requests; the page did not receive an answer. Nothing is resent automatically.
          Resending uses the original request key, so an accepted request returns its original job rather than starting another.</p>
        <ul className="stack stack--tight">
          {pending.map(entry => (
            <li key={entry.key} className="cluster">
              <span><strong>{JOB_KIND_LABEL[entry.kind]}</strong> · requested {formatDate(entry.created_at)} · key <span className="mono" title={entry.key}>{shortId(entry.key)}</span>
                {entry.detail ? ` · ${entry.detail}` : ''}</span>
              <button type="button" className="button button--secondary button--sm" disabled={wb.busy}
                onClick={() => void wb.act(async () => {
                  const job = await resendSubmission(entry);
                  wb.setNotice(`Confirmed: the ${JOB_KIND_LABEL[entry.kind].toLowerCase()} request is job ${shortId(job.id)}.`);
                })}>Resend with the same key</button>
              <button type="button" className="button button--secondary button--sm" disabled={wb.busy}
                onClick={() => discardSubmission(entry.project_id, entry.key)}>Forget</button>
            </li>
          ))}
        </ul>
        <p className="field-hint">Forgetting only removes the key from this browser. If the request was accepted, its job still appears in the list; submitting the same inputs again afterwards starts a new operation.</p>
      </div>
    </section>
  );
}

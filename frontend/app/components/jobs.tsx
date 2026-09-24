'use client';

import { Loader2 } from 'lucide-react';
import type { Job } from '../lib/types';
import { shortId } from '../lib/format';
import { Badge, Disclosure } from './ui';

const ACTIVE = ['queued', 'running'];

export function JobActivity({ jobs }: { jobs: Job[] }) {
  if (!jobs.length) return null;
  const active = jobs.filter(job => ACTIVE.includes(job.state));

  return (
    <Disclosure
      defaultOpen={active.length > 0}
      summary={
        <>
          <span>Job activity</span>
          {active.length > 0 && (
            <>
              <Loader2 size={13} className="spin" aria-hidden="true" />
              <span>{active.length} active jobs</span>
            </>
          )}
          <span className="dim" style={{ marginLeft: 'auto' }}>{jobs.length} total</span>
        </>
      }
    >
      <ul>
        {jobs.slice(0, 10).map(job => (
          <li className="job" key={job.id}>
            <span className="job-text">
              <span className="job-kind">{job.kind}</span>
              <span className="meta-list"><span className="meta-id">{shortId(job.id)}</span></span>
              {job.error && <span className="job-error">{job.error}</span>}
            </span>
            <Badge state={job.state} />
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}

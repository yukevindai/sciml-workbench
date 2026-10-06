'use client';

import { Select } from '../components/select';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from '../components/workspace-link';
import { FlaskConical, Search } from 'lucide-react';
import type { Workbench } from '../lib/context';
import type { JobDetail, JobPage } from '../lib/generated/http';
import { api } from '../lib/api';
import { parseJobPage } from '../lib/decode';
import { benchmarkHref } from '../lib/benchmark';
import { describeFailure } from '../lib/failure';
import { fingerprint, submitOperation, usePendingSubmissions } from '../lib/submissions';
import { kinds } from '../lib/types';
import { shortId } from '../lib/format';
import { Alert, EmptyState, Field, Panel } from '../components/ui';
import { StageGate } from '../components/workflow';
import { FailureRecord, ReceiptRow, UnknownImportsNotice } from '../components/failure-inspection';

const MAX_PAGES = 10;
type Filter = 'all' | 'human' | 'agent';

export function FailureMemoryView({ wb, requestedFailureId, requestedBenchmarkId }: { wb: Workbench; requestedFailureId?: string; requestedBenchmarkId?: string }) {




  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [receipts, setReceipts] = useState<JobDetail[]>([]);
  const [receiptsLoaded, setReceiptsLoaded] = useState(false);
  const [receiptsError, setReceiptsError] = useState('');
  const [truncated, setTruncated] = useState(false);


  const sequence = useRef(0);

  const stage = wb.workflow.stages.find(s => s.view === 'failure-memory');
  const failures = kinds(wb.artifacts, 'failure').sort((a, b) => b.created_at.localeCompare(a.created_at));

  const described = failures.map(failure => ({ failure, view: describeFailure(failure) }));
  const needle = query.trim().toLowerCase();
  const matches = described.filter(({ failure, view }) =>
    (filter === 'all' || (filter === 'agent' ? view.origin === 'agent' : view.origin !== 'agent'))
    && (!needle || [view.reason, view.uncertainty ?? '', view.observation.label, view.actor, failure.benchmark_id, failure.id,
      ...view.hypotheses, ...view.observation.details.map(([, value]) => value)].join(' ').toLowerCase().includes(needle)));
  const unknown = receipts.filter(job => job.external_receipt?.state === 'unknown').length;

  // Every page of failure jobs with their receipts; reloaded when a failure job changes state.
  const loadReceipts = useCallback(async () => {
    if (!wb.projectId) return;
    const current = ++sequence.current;
    setReceiptsError('');
    try {
      const items: JobDetail[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page: JobPage = await api(`projects/${wb.projectId}/job-index?kind=failure&limit=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`, parseJobPage);
        if (page.items.some(job => job.project_id !== wb.projectId || job.kind !== 'failure')) throw new Error('The server returned jobs outside this project or kind.');
        items.push(...page.items);
        cursor = page.next_cursor ?? null;
      } while (cursor && ++pages < MAX_PAGES);
      if (current !== sequence.current) return;
      setReceipts(items.reverse());
      setTruncated(Boolean(cursor));
      setReceiptsLoaded(true);
    } catch (e) {
      if (current === sequence.current) setReceiptsError(e instanceof Error ? e.message : 'Could not load import receipts.');
    }
  }, [wb.projectId]);
  const failureJobs = wb.jobs.filter(job => job.kind === 'failure').map(job => `${job.id}:${job.state}`).join(',');
  useEffect(() => { void loadReceipts(); }, [loadReceipts, failureJobs]);
  useEffect(() => () => { sequence.current += 1; }, []);

  return <>
    <UnknownImportsNotice count={unknown} />
    {requestedBenchmarkId && !wb.runs.some(run => run.id === requestedBenchmarkId) && <Alert variant="error">This project has no benchmark with ID {requestedBenchmarkId}</Alert>}
    <Panel title="Import receipts" description="Every Failure Memory import in this project, with its confirmation state. Unknown outcomes are kept separate from confirmed records."
      aside={<button type="button" className="button button--secondary button--sm" onClick={() => void loadReceipts()}>Refresh receipts</button>}>
      {receiptsError && <Alert variant="error" role="alert">Receipts unavailable: {receiptsError}{receiptsLoaded ? ' Previously loaded receipts remain visible.' : ''}</Alert>}
      {!receiptsLoaded && !receiptsError && <p>Loading receipts…</p>}
      {receiptsLoaded && !receipts.length && <p>No Failure Memory imports have been requested in this project.</p>}
      {truncated && <Alert variant="warning">Showing the first {receipts.length} imports only. Older receipts are not listed here.</Alert>}
      {receipts.length > 0 && <ul className="stack">{receipts.map(job => <ReceiptRow key={job.id} job={job} artifacts={failures} />)}</ul>}
    </Panel>

    <Panel title="Recorded failures" description={failures.length ? `${failures.length} confirmed record${failures.length === 1 ? '' : 's'} in this project` : undefined}
      aside={failures.length > 0 ? <div className="cluster">
        <Select className="select" aria-label="Filter by who recorded it" value={filter} onChange={event => setFilter(event.target.value as Filter)}>
          <option value="all">All records</option><option value="human">Human-assessed</option><option value="agent">Recorded by agent</option>
        </Select>
        <Search size={15} aria-hidden="true" className="dim" />
        <input className="input" style={{ width: '14rem' }} aria-label="Search recorded failures" placeholder="Search records…" value={query} onChange={event => setQuery(event.target.value)} />
      </div> : undefined}>
      {requestedFailureId && !failures.some(value => value.id === requestedFailureId) && <Alert variant="error" title="Requested record unavailable">
        This project has no confirmed failure record with ID {requestedFailureId}. An import with an unknown outcome has no record yet. No other record is substituted.
      </Alert>}
      {failures.length === 0 ? <EmptyState icon={FlaskConical} title="Nothing recorded yet">
        Ask your research group to retain unsuccessful results and what they learned.
      </EmptyState> : matches.length === 0 ? <p className="field-hint">No record matches this filter{needle ? ` and “${query}”` : ''}.</p>
        : <div className="stack stack--tight">{matches.map(({ failure }) => <FailureRecord key={failure.id} wb={wb} failure={failure} focus={failure.id === requestedFailureId} />)}</div>}
    </Panel>
  </>;
}

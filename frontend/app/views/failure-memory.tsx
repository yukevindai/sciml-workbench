'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FlaskConical, Search } from 'lucide-react';
import type { Workbench } from '../lib/context';
import type { JobDetail, JobPage } from '../lib/generated/http';
import { api } from '../lib/api';
import { parseJob, parseJobPage } from '../lib/decode';
import { benchmarkHref } from '../lib/benchmark';
import { describeFailure, draftFingerprint } from '../lib/failure';
import { kinds } from '../lib/types';
import { shortId } from '../lib/format';
import { Alert, EmptyState, Field, Panel } from '../components/ui';
import { StageGate } from '../components/workflow';
import { FailureRecord, ReceiptRow, UnknownImportsNotice } from '../components/failure-inspection';

const MAX_PAGES = 10;
type Filter = 'all' | 'human' | 'agent';

export function FailureMemoryView({ wb, requestedFailureId, requestedBenchmarkId }: { wb: Workbench; requestedFailureId?: string; requestedBenchmarkId?: string }) {
  const [runId, setRunId] = useState(() => requestedBenchmarkId ?? '');
  const [reason, setReason] = useState('');
  const [uncertainty, setUncertainty] = useState('');
  const [accepted, setAccepted] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [receipts, setReceipts] = useState<JobDetail[]>([]);
  const [receiptsLoaded, setReceiptsLoaded] = useState(false);
  const [receiptsError, setReceiptsError] = useState('');
  const [truncated, setTruncated] = useState(false);
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const submitting = useRef(false);
  const sequence = useRef(0);

  const stage = wb.workflow.stages.find(s => s.view === 'failure-memory');
  const failures = kinds(wb.artifacts, 'failure').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const run = wb.runs.find(value => value.id === runId);
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

  const submit = () => {
    if (submitting.current || !run) return;
    const fingerprint = draftFingerprint(run.id, reason, uncertainty);
    // The same draft always reuses its key, so a double click or a retry after a lost
    // response resolves to the one original job. Any edit is a new request.
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    const key = request.current.key;
    submitting.current = true;
    setAccepted('');
    void wb.act(async () => {
      const job = await api(`projects/${wb.projectId}/failure`, parseJob, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ benchmark_id: run.id, reason, uncertainty_notes: uncertainty }),
      });
      if (job.project_id !== wb.projectId || job.kind !== 'failure') throw new Error('The server returned a different job.');
      request.current = null;
      setReason(''); setUncertainty(''); setAccepted(job.id);
      wb.setNotice('Assessment accepted. Its import status appears under import receipts; acceptance is not a confirmed record.');
    }).finally(() => { submitting.current = false; });
  };

  return <>
    <StageGate stage={stage} />

    <Panel id="assess" title="Record a researcher assessment"
      description="A run can finish perfectly and still fail your scientific objective. Record that judgement while the reasoning is fresh.">
      <Alert variant="info" title="Computational outcome, not an experiment">
        This record is labeled as your judgement of a computational run. It does not change the run&rsquo;s execution status or claim that a physical experiment failed. Agents record only objective observations and cannot write this.
      </Alert>
      {requestedBenchmarkId && !wb.runs.some(value => value.id === requestedBenchmarkId) && <Alert variant="error" title="Requested run unavailable">
        This project has no benchmark with ID {requestedBenchmarkId}. No other run was selected.
      </Alert>}
      <fieldset className="intake-fields" disabled={wb.busy || !wb.projectId}>
        <Field label="Benchmark run" hint="Choose the exact run you are assessing. Nothing is selected for you.">
          {props => <select className="select" value={runId} onChange={event => setRunId(event.target.value)} {...props}>
            <option value="">Select a run</option>
            {[...wb.runs].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(value =>
              <option key={value.id} value={value.id}>{value.model} · seed {value.seed} · {value.status} · {shortId(value.id)}</option>)}
          </select>}
        </Field>
        {run && <p className="field-hint">Dataset {run.dataset_id} · split {run.split_id} · <Link className="text-link" href={benchmarkHref(wb.projectId, run.id)}>inspect this run</Link></p>}
        <div className="split">
          <Field label="Why was this run unsuccessful?" hint="Which objective went unmet? Describe the outcome, not a fix.">
            {props => <textarea className="textarea" maxLength={3000} value={reason} onChange={event => setReason(event.target.value)}
              placeholder="The model beat the mean baseline overall but failed on every held-out family above 320 K, which is the regime we care about." {...props} />}
          </Field>
          <Field label="Uncertainty and limits" hint="Separate what you observed from what you suspect. What is still unknown?">
            {props => <textarea className="textarea" maxLength={3000} value={uncertainty} onChange={event => setUncertainty(event.target.value)}
              placeholder="Observed: error grows with temperature. Suspected but untested: too few high-temperature families to learn from." {...props} />}
          </Field>
        </div>
        <UnknownImportsNotice count={unknown} />
        <div className="panel-foot">
          <span className="field-hint">{request.current && request.current.fingerprint === (run ? draftFingerprint(run.id, reason, uncertainty) : '')
            ? 'Retrying reuses the original request, so it cannot create a duplicate record.'
            : 'Saved to the independent Failure Memory service, which keeps its own records. Your draft is kept if saving fails.'}</span>
          <button type="button" className="button" disabled={wb.busy || !run || !reason.trim() || !uncertainty.trim()} onClick={submit}>
            <FlaskConical size={15} aria-hidden="true" />Save to Failure Memory
          </button>
        </div>
        {accepted && <p className="field-hint" role="status">Accepted as job {accepted}. See <a className="text-link" href={`#receipt-${accepted}`}>its receipt</a>.</p>}
      </fieldset>
    </Panel>

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
        <select className="select" aria-label="Filter by who recorded it" value={filter} onChange={event => setFilter(event.target.value as Filter)}>
          <option value="all">All records</option><option value="human">Human-assessed</option><option value="agent">Recorded by agent</option>
        </select>
        <Search size={15} aria-hidden="true" className="dim" />
        <input className="input" style={{ width: '14rem' }} aria-label="Search recorded failures" placeholder="Search records…" value={query} onChange={event => setQuery(event.target.value)} />
      </div> : undefined}>
      {requestedFailureId && !failures.some(value => value.id === requestedFailureId) && <Alert variant="error" title="Requested record unavailable">
        This project has no confirmed failure record with ID {requestedFailureId}. An import with an unknown outcome has no record yet. No other record is substituted.
      </Alert>}
      {failures.length === 0 ? <EmptyState icon={FlaskConical} title="Nothing recorded yet">
        The runs that did not work are usually the ones worth remembering. Save the first one above.
      </EmptyState> : matches.length === 0 ? <p className="field-hint">No record matches this filter{needle ? ` and “${query}”` : ''}.</p>
        : <div className="stack stack--tight">{matches.map(({ failure }) => <FailureRecord key={failure.id} wb={wb} failure={failure} focus={failure.id === requestedFailureId} />)}</div>}
    </Panel>
  </>;
}

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { parseResearchRun, parseRunDetail, parseRunEvents } from '../lib/decode';
import type { Workbench } from '../lib/context';
import type { ResearchRun, RunDetail, RunEvent } from '../lib/generated/http';
import { artifactHref, KIND_LABEL, provenanceHref } from '../lib/lineage';
import { awaitingPlanReview, isTerminalRun, runPollDelay } from '../lib/runs';
import { executionStatus } from '../lib/status';
import { Alert, Badge, Disclosure, Panel } from './ui';

const READ_TIMEOUT = 30_000;
const EVENT_PAGE = 200;

const EVENT_LABEL: Record<RunEvent['event_type'], string> = {
  accepted: 'Request accepted', state_changed: 'State changed', plan_changed: 'Plan published',
  action_changed: 'Tool action', question_changed: 'Question', usage_changed: 'Usage updated', result_published: 'Result published',
};

function time(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Merge by sequence. The server's event order is authoritative; replays never duplicate a row. */
export function mergeEvents(current: RunEvent[], incoming: RunEvent[]): RunEvent[] {
  const bySequence = new Map(current.map(event => [event.sequence, event]));
  for (const event of incoming) bySequence.set(event.sequence, event);
  return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
}

/**
 * The selected run: state, plan, recorded activity, linked jobs and results. Reads
 * the durable run record and its ordered events, so leaving and returning, or a
 * reload, shows the same run without resubmitting anything.
 */
export function ResearchRunPanel({ wb, runs, runId, truncated, historyError, onSelect, onChanged }: {
  wb: Workbench; runs: ResearchRun[]; runId: string; truncated: boolean; historyError: string;
  onSelect: (id: string) => void; onChanged: (run: ResearchRun) => void;
}) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [error, setError] = useState('');
  const [lastRead, setLastRead] = useState('');
  const [pollAt, setPollAt] = useState(0);
  const reviewKeys = useRef(new Map<string, string>());
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  useEffect(() => {
    setDetail(null); setEvents([]); setError(''); setLastRead('');
    if (!runId || !wb.projectId || wb.preview) return;
    const pid = wb.projectId;
    let disposed = false;
    let failures = 0;
    let cursor = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polling = false;
    const poll = async () => {
      if (disposed || polling) return;
      polling = true;
      clearTimeout(timer);
      let terminal = false;
      try {
        const next = await api(`projects/${pid}/agent-runs/${runId}`, parseRunDetail, undefined, READ_TIMEOUT);
        if (disposed) return;
        if (next.run.id !== runId || next.run.project_id !== pid) throw new Error('The server returned a different run.');
        for (let page = 0; page < 10; page += 1) {
          const batch = await api(`projects/${pid}/agent-runs/${runId}/events?after=${cursor}&limit=${EVENT_PAGE}`, parseRunEvents, undefined, READ_TIMEOUT);
          if (disposed) return;
          if (batch.some(event => event.run_id !== runId)) throw new Error('The server returned events for a different run.');
          if (batch.length) {
            cursor = Math.max(cursor, ...batch.map(event => event.sequence));
            setEvents(current => mergeEvents(current, batch));
          }
          if (batch.length < EVENT_PAGE) break;
        }
        setDetail(next);
        onChangedRef.current(next.run);
        setLastRead(new Date().toISOString());
        setError('');
        failures = 0;
        terminal = isTerminalRun(next.run);
      } catch (e) {
        if (disposed) return;
        failures += 1;
        setError(e instanceof Error ? e.message : 'Could not read this run');
      } finally {
        polling = false;
      }
      if (disposed || terminal) return;
      timer = setTimeout(() => void poll(), runPollDelay({ failures, hidden: document.visibilityState === 'hidden' }));
    };
    const visible = () => { if (document.visibilityState === 'visible') void poll(); };
    document.addEventListener('visibilitychange', visible);
    void poll();
    return () => { disposed = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [runId, wb.projectId, wb.preview, pollAt]);

  const listed = runs.find(value => value.id === runId);
  const run = detail?.run ?? listed;

  const picker = runs.length > 0 && <div className="field">
    <label className="field-label" htmlFor="research-run-select">Research run</label>
    <div className="select-wrap">
      <select id="research-run-select" className="select" value={runId} onChange={event => onSelect(event.target.value)}>
        {runs.map(value => <option key={value.id} value={value.id}>
          {time(value.created_at)} · {executionStatus(value.state)?.label ?? value.state} · {value.objective.slice(0, 60)}{value.objective.length > 60 ? '…' : ''}
        </option>)}
      </select>
    </div>
    {truncated && <p className="field-hint">Only the most recent 500 runs are listed.</p>}
  </div>;

  if (!run) {
    return <Panel title="Research runs" description="Accepted requests appear here with their plan, activity and results.">
      <div className="stack">
        {historyError && <Alert variant="warning">Run history unavailable: {historyError}</Alert>}
        {picker}
        {!historyError && !runs.length && <p className="field-hint">No research has been requested in this project yet.</p>}
      </div>
    </Panel>;
  }

  const plan = detail?.plan ?? null;
  const review = awaitingPlanReview(run, plan?.revision);
  const jobs = wb.jobs.filter(job => job.run_links.some(link => link.run_id === run.id));
  const results = run.result_artifact_ids.map(id => wb.artifacts.find(value => value.id === id) ?? { id, kind: undefined });
  const status = executionStatus(run.state);

  return <Panel title="Current research" id={`run-${run.id}`} description="Recorded run state, plan and activity. This view shows summaries the run records; it never shows hidden model reasoning.">
    <div className="stack">
      {historyError && <Alert variant="warning">Run history unavailable: {historyError}. The selected run is still read directly.</Alert>}
      {picker}
      <div className="stack stack--tight">
        <p className="claim-statement">{run.objective}</p>
        <div className="button-row"><Badge state={run.state} /><span className="field-hint">{run.mode === 'review_plan' ? 'Review plan' : 'Autopilot'} · accepted {time(run.created_at)}{run.finished_at ? ` · finished ${time(run.finished_at)}` : ''}</span></div>
        <p className="field-hint">{status?.description} Run status does not establish scientific validity.</p>
        {run.stop_reason && <p><strong>Stop reason:</strong> {run.stop_reason}</p>}
        <p className="meta-id">Run {run.id}{run.continued_from_run_id ? ` · continues ${run.continued_from_run_id}` : ''}</p>
      </div>

      {error && <Alert variant="warning" title="Run temporarily unreadable">
        {error}.{lastRead ? ` Showing the state read at ${new Date(lastRead).toLocaleTimeString()}; it may be out of date.` : ''} Reading again automatically.
      </Alert>}
      {error && <div><button type="button" className="button button--secondary" onClick={() => setPollAt(Date.now())}>Retry now</button></div>}

      {review && plan && <Alert variant="info" title="Plan ready for your review">
        You chose to review the plan. Scientific work starts after you accept revision {plan.revision}. Accepting cannot widen the saved policy.
      </Alert>}
      {review && plan && <div>
        <button type="button" className="button" disabled={wb.busy} onClick={() => void wb.act(async () => {
          const identity = `${run.id}:${run.control_revision}:${plan.revision}`;
          const key = reviewKeys.current.get(identity) ?? crypto.randomUUID();
          reviewKeys.current.set(identity, key);
          const updated = await api(`projects/${wb.projectId}/agent-runs/${run.id}/review-plan`, parseResearchRun, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
            body: JSON.stringify({ expected_run_revision: run.control_revision, expected_plan_revision: plan.revision }),
          }, 60_000);
          onChangedRef.current(updated);
          setPollAt(Date.now());
          wb.setNotice(`Plan revision ${plan.revision} accepted.`);
        })}>Accept plan revision {plan.revision}</button>
      </div>}

      {run.open_question_ids.length > 0 && <Alert variant="warning" title="The run is waiting for an answer">
        {detail?.questions.filter(q => q.status === 'open').flatMap(q => q.questions.map(item => item.prompt)).join(' ') || 'A question is open.'}
      </Alert>}

      <section className="panel-section" aria-labelledby="run-plan-heading">
        <h3 className="panel-section-title" id="run-plan-heading">Plan{plan ? ` · revision ${plan.revision}` : ''}</h3>
        {!plan ? <p className="field-hint">{isTerminalRun(run) ? 'No plan was published for this run.' : 'No plan has been published yet. The coordinator publishes one after inspecting the inputs.'}</p> : <>
          <p className="prose">{plan.rationale_summary}</p>
          <ol className="run-steps">{plan.steps.map(step => <li key={step.id} className="run-step">
            <div>
              <strong>{step.objective}</strong>
              {step.depends_on.length > 0 && <p className="field-hint">After: {step.depends_on.join(', ')}</p>}
              <p className="field-hint">Done when: {step.completion_criteria.join('; ')}</p>
            </div>
            <Badge state={step.status} />
          </li>)}</ol>
        </>}
      </section>

      <section className="panel-section" aria-labelledby="run-results-heading">
        <h3 className="panel-section-title" id="run-results-heading">Results</h3>
        {!results.length ? <p className="field-hint">{isTerminalRun(run) ? 'This run published no result artifacts.' : 'Results are linked here when the run publishes them.'}</p>
          : <ul className="stack stack--tight">{results.map(result => {
            const href = result.kind ? artifactHref(wb.projectId, { id: result.id, kind: result.kind }) : null;
            return <li key={result.id}>
              <Link className="text-link" href={href ?? provenanceHref(wb.projectId, result.id)}>
                {result.kind ? `Open ${KIND_LABEL[result.kind] ?? result.kind}` : 'Trace artifact'} {result.id.slice(0, 8)}
              </Link>
              {!result.kind && <span className="field-hint"> · not in the loaded project snapshot yet</span>}
            </li>;
          })}</ul>}
        {jobs.length > 0 && <>
          <p className="field-hint">Scientific jobs submitted by this run:</p>
          <ul className="stack stack--tight">{jobs.map(job => <li key={job.id}>
            <a className="text-link" href={`#job-${job.id}`}>{job.kind} job {job.id.slice(0, 8)}</a> <Badge state={job.state} />
          </li>)}</ul>
        </>}
      </section>

      <section className="panel-section" aria-labelledby="run-activity-heading">
        <h3 className="panel-section-title" id="run-activity-heading">Activity</h3>
        {!events.length ? <p className="field-hint">{lastRead ? 'No events recorded.' : 'Reading activity…'}</p>
          : <ol className="run-events" aria-label="Run events">{events.map(event => <li key={event.sequence} className="run-event">
            <div>
              <span className="run-event-seq">#{event.sequence}</span> <strong>{EVENT_LABEL[event.event_type]}</strong>
              {event.summary && <p>{event.summary}</p>}
              <p className="field-hint">{time(event.created_at)}{event.action_id ? ` · action ${event.action_id.slice(0, 8)}` : ''}{event.artifact_ids.length ? ` · ${event.artifact_ids.length} artifact${event.artifact_ids.length === 1 ? '' : 's'}` : ''}</p>
            </div>
            <Badge state={event.state} />
          </li>)}</ol>}
      </section>

      <Disclosure summary="Usage and limits">
        <dl className="definition-list">
          <div><dt>Model requests</dt><dd>{run.usage.model_requests} of {run.limits.model_requests}</dd></div>
          <div><dt>Tool calls</dt><dd>{run.usage.tool_calls} of {run.limits.tool_calls}</dd></div>
          <div><dt>Scientific attempts</dt><dd>{run.usage.scientific_attempts} of {run.limits.scientific_attempts}</dd></div>
          <div><dt>Active time</dt><dd>{Math.round(run.usage.active_seconds / 60)} of {Math.round(run.limits.active_seconds / 60)} minutes</dd></div>
          <div><dt>Cost</dt><dd>{run.usage.cost.status === 'estimated' ? `${run.usage.cost.amount.toFixed(4)} ${run.usage.cost.currency} (estimated, pricing ${run.usage.cost.pricing_revision})` : `unknown: ${run.usage.cost.reason}`}</dd></div>
          {run.usage.unknown_request_ids.length > 0 && <div><dt>Unsettled requests</dt><dd>{run.usage.unknown_request_ids.length} with unknown billing</dd></div>}
          {detail && <div><dt>Stop controls</dt><dd>{detail.control_effect}</dd></div>}
        </dl>
      </Disclosure>
      {lastRead && <p className="field-hint">Last read {new Date(lastRead).toLocaleTimeString()}{isTerminalRun(run) ? '; the run has finished, so it is no longer re-read.' : '.'}</p>}
    </div>
  </Panel>;
}

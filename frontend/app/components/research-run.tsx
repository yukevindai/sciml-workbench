'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { parseResearchRun } from '../lib/decode';
import type { Workbench } from '../lib/context';
import type { ResearchPlan, ResearchRun, RunEvent } from '../lib/generated/http';
import { artifactHref, KIND_LABEL, provenanceHref } from '../lib/lineage';
import { useRunFeed, type Transport } from '../lib/run-feed';
import { awaitingPlanReview, isTerminalRun } from '../lib/runs';
import { executionStatus } from '../lib/status';
import { Alert, Badge, Disclosure, Panel } from './ui';
import { RunControls, RunQuestions } from './run-controls';

const EVENT_LABEL: Record<RunEvent['event_type'], string> = {
  accepted: 'Request accepted', state_changed: 'State changed', plan_changed: 'Plan published',
  action_changed: 'Tool action', question_changed: 'Question', usage_changed: 'Usage updated', result_published: 'Result published',
};

const ROLE_LABEL: Record<string, string> = {
  data_evaluation: 'Data evaluation', evidence: 'Evidence', failure_memory: 'Failure memory', scientific_reviewer: 'Scientific review',
};

const TRANSPORT_LABEL: Record<Transport, string> = {
  connecting: 'Connecting to run activity…',
  stream: 'Live: events arrive over the activity stream and reconnect from the last event received.',
  polling: 'Polling: the activity stream is unavailable, so events are read by sequence every few seconds.',
  finished: 'The run has finished; its record is no longer re-read.',
};

function time(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const tool = (name: string) => name.replaceAll('_', ' ');

function PlanSteps({ plan }: { plan: ResearchPlan }) {
  return <ol className="run-steps">{plan.steps.map(step => <li key={step.id} className="run-step">
    <div>
      <strong>{step.objective}</strong>
      {step.depends_on.length > 0 && <p className="field-hint">After: {step.depends_on.join(', ')}</p>}
      <p className="field-hint">Done when: {step.completion_criteria.join('; ')}</p>
    </div>
    <Badge state={step.status} />
  </li>)}</ol>;
}

/**
 * The selected run: state, controls, questions, plan (with earlier revisions),
 * specialist activity when any was assigned, ordered activity, linked jobs and
 * results. Everything shown is a recorded summary; hidden model reasoning is
 * never requested or displayed.
 */
export function ResearchRunPanel({ wb, runs, runId, truncated, historyError, onSelect, onChanged }: {
  wb: Workbench; runs: ResearchRun[]; runId: string; truncated: boolean; historyError: string;
  onSelect: (id: string) => void; onChanged: (run: ResearchRun) => void;
}) {
  const feed = useRunFeed(wb.projectId, runId, wb.preview);
  const { detail, events } = feed;
  const reviewKeys = useRef(new Map<string, string>());

  const listed = runs.find(value => value.id === runId);
  const run = detail?.run ?? listed;
  const reported = detail?.run;
  useEffect(() => { if (reported) onChanged(reported); }, [reported, onChanged]);

  const { setDetail, refresh } = feed;
  const updated = useCallback((next: ResearchRun) => {
    if (next.id === runId) {
      setDetail(current => current && current.run.control_revision <= next.control_revision ? { ...current, run: next } : current);
      onChanged(next);
    }
    refresh();
    wb.refreshJobs();
  }, [runId, setDetail, onChanged, refresh, wb]);

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
  const actions = new Map((detail?.actions ?? []).map(action => [action.id, action]));
  const status = executionStatus(run.state);

  return <Panel title="Current research" id={`run-${run.id}`} description="Recorded run state, plan and activity. This view shows summaries the run records; it never shows hidden model reasoning.">
    <div className="stack">
      {historyError && <Alert variant="warning">Run history unavailable: {historyError}. The selected run is still read directly.</Alert>}
      {picker}
      <div className="stack stack--tight">
        <p className="claim-statement">{run.objective}</p>
        <div className="button-row"><Badge state={run.state} /><span className="field-hint">{run.mode === 'review_plan' ? 'Review plan' : 'Autopilot'} · accepted {time(run.created_at)}{run.finished_at ? ` · finished ${time(run.finished_at)}` : ''}</span></div>
        <p className="field-hint">{status?.description} Run status does not establish scientific validity.</p>
        <p className="meta-id">Run {run.id} · revision {run.control_revision}{run.continued_from_run_id ? ` · continues ${run.continued_from_run_id}` : ''}</p>
        <p className="field-hint" aria-live="polite">{TRANSPORT_LABEL[isTerminalRun(run) && feed.transport !== 'connecting' ? 'finished' : feed.transport]}</p>
      </div>

      {run.state === 'partially_completed' && <Alert variant="warning" title="Partially completed">
        {run.stop_reason} The results below are complete for what they cover; the remaining steps did not run.
      </Alert>}
      {(run.state === 'failed' || run.state === 'cancelled') && run.stop_reason && <Alert variant={run.state === 'failed' ? 'error' : 'info'} title={run.state === 'failed' ? 'Run failed' : 'Run cancelled'}>
        {run.stop_reason}{run.result_artifact_ids.length ? ' Results published before it stopped remain available below.' : ''}
      </Alert>}

      {feed.error && <Alert variant="warning" title="Run temporarily unreadable">
        {feed.error}.{feed.lastRead ? ` Showing the state read at ${new Date(feed.lastRead).toLocaleTimeString()}; it may be out of date.` : ''} Reading again automatically.
      </Alert>}
      {feed.error && <div><button type="button" className="button button--secondary" onClick={feed.restart}>Reconnect now</button></div>}

      <RunControls wb={wb} run={run} detail={detail} onUpdated={updated} />
      {detail && <RunQuestions wb={wb} run={run} detail={detail} onUpdated={updated} />}

      {review && plan && <Alert variant="info" title="Plan ready for your review">
        You chose to review the plan. Scientific work starts after you accept revision {plan.revision}. Accepting cannot widen the saved policy.
      </Alert>}
      {review && plan && <div>
        <button type="button" className="button" disabled={wb.busy} onClick={() => void wb.act(async () => {
          const identity = `${run.id}:${run.control_revision}:${plan.revision}`;
          const key = reviewKeys.current.get(identity) ?? crypto.randomUUID();
          reviewKeys.current.set(identity, key);
          const next = await api(`projects/${wb.projectId}/agent-runs/${run.id}/review-plan`, parseResearchRun, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
            body: JSON.stringify({ expected_run_revision: run.control_revision, expected_plan_revision: plan.revision }),
          }, 60_000);
          updated(next);
          wb.setNotice(`Plan revision ${plan.revision} accepted.`);
        })}>Accept plan revision {plan.revision}</button>
      </div>}

      <section className="panel-section" aria-labelledby="run-plan-heading">
        <h3 className="panel-section-title" id="run-plan-heading">Plan{plan ? ` · revision ${plan.revision}` : ''}</h3>
        {!plan ? <p className="field-hint">{isTerminalRun(run) ? 'No plan was published for this run.' : 'No plan has been published yet. The coordinator publishes one after inspecting the inputs.'}</p> : <>
          <p className="prose">{plan.rationale_summary}</p>
          <PlanSteps plan={plan} />
        </>}
        {detail && detail.earlier_plans.length > 0 && <Disclosure summary={`Earlier plan revisions (${detail.earlier_plans.length})`}>
          <div className="stack">{detail.earlier_plans.map(earlier => <div key={earlier.id} className="stack stack--tight">
            <strong>Revision {earlier.revision} · {time(earlier.created_at)}</strong>
            <p className="prose">{earlier.rationale_summary}</p>
            <PlanSteps plan={earlier} />
          </div>)}</div>
          <p className="field-hint">Results already produced stay tied to the inputs and plan revision they ran under.</p>
        </Disclosure>}
      </section>

      {detail && detail.assignments.length > 0 && <section className="panel-section" aria-labelledby="run-specialists-heading">
        <h3 className="panel-section-title" id="run-specialists-heading">Specialist activity</h3>
        <p className="field-hint">The coordinator delegated these independent checks. Specialists read only the inputs listed for them and cannot run science; their findings are advisory.</p>
        <ul className="run-steps">{detail.assignments.map(assignment => <li key={assignment.id} className="run-step">
          <div>
            <strong>{ROLE_LABEL[assignment.role] ?? assignment.role}</strong>
            <p>{assignment.objective}</p>
            <p className="field-hint">Plan revision {assignment.plan_revision} · due {time(assignment.deadline_at)}</p>
          </div>
          <Badge state={assignment.state} />
        </li>)}</ul>
      </section>}

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
            {job.error_code && <span className="field-hint"> · {job.error_code}</span>}
          </li>)}</ul>
        </>}
      </section>

      <section className="panel-section" aria-labelledby="run-activity-heading">
        <h3 className="panel-section-title" id="run-activity-heading">Activity</h3>
        {!events.length ? <p className="field-hint">{feed.lastRead ? 'No events received yet.' : 'Reading activity…'}</p>
          : <ol className="run-events" aria-label="Run events">{events.map(event => {
            const action = event.action_id ? actions.get(event.action_id) : undefined;
            return <li key={event.sequence} className="run-event">
              <div>
                <span className="run-event-seq">#{event.sequence}</span> <strong>{EVENT_LABEL[event.event_type]}</strong>
                {action && <span> · {tool(action.tool)}{action.attempt > 1 ? ` (attempt ${action.attempt})` : ''}</span>}
                {event.summary && <p>{event.summary}</p>}
                <p className="field-hint">{time(event.created_at)}{event.action_id && !action ? ` · action ${event.action_id.slice(0, 8)}` : ''}{event.artifact_ids.length ? ` · ${event.artifact_ids.length} artifact${event.artifact_ids.length === 1 ? '' : 's'}` : ''}</p>
              </div>
              <Badge state={event.state} />
            </li>;
          })}</ol>}
        {detail && detail.actions.length > 0 && <Disclosure summary={`Tool actions (${detail.actions.length})`}>
          <ul className="run-steps">{detail.actions.map(action => <li key={action.id} className="run-step">
            <div>
              <strong>{tool(action.tool)}</strong>{action.attempt > 1 ? ` · attempt ${action.attempt}` : ''}
              <p className="field-hint">{action.job_id ? `Job ${action.job_id.slice(0, 8)}` : 'No scientific job'}{action.artifact_ids.length ? ` · ${action.artifact_ids.length} artifact${action.artifact_ids.length === 1 ? '' : 's'}` : ''}{action.error_code ? ` · ${action.error_code}` : ''}{action.assignment_id ? ' · for a specialist' : ''}</p>
            </div>
            <Badge state={action.state} />
          </li>)}</ul>
          <p className="field-hint">Tool arguments are recorded for provenance but are not shown here.</p>
        </Disclosure>}
      </section>

      <Disclosure summary="Usage and limits">
        <dl className="definition-list">
          <div><dt>Model requests</dt><dd>{run.usage.model_requests} of {run.limits.model_requests}</dd></div>
          <div><dt>Tool calls</dt><dd>{run.usage.tool_calls} of {run.limits.tool_calls}</dd></div>
          <div><dt>Scientific attempts</dt><dd>{run.usage.scientific_attempts} of {run.limits.scientific_attempts}</dd></div>
          <div><dt>Active time</dt><dd>{Math.round(run.usage.active_seconds / 60)} of {Math.round(run.limits.active_seconds / 60)} minutes</dd></div>
          <div><dt>Cost</dt><dd>{run.usage.cost.status === 'estimated' ? `${run.usage.cost.amount.toFixed(4)} ${run.usage.cost.currency} (estimated, pricing ${run.usage.cost.pricing_revision})` : `unknown: ${run.usage.cost.reason}`}</dd></div>
          {run.usage.unknown_request_ids.length > 0 && <div><dt>Unsettled requests</dt><dd>{run.usage.unknown_request_ids.length} with unknown billing</dd></div>}
        </dl>
      </Disclosure>
      {feed.lastRead && <p className="field-hint">Run record last read {new Date(feed.lastRead).toLocaleTimeString()}.</p>}
    </div>
  </Panel>;
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, Circle, CircleAlert, CircleDot, ExternalLink, Pause, Play, Sparkles, Square, User } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { RESULT_LABEL, STEP_LABEL } from '../lib/ask';
import { parseResearchRun } from '../lib/decode';
import type { Workbench } from '../lib/context';
import type { ResearchRun } from '../lib/generated/http';
import { artifactHref, provenanceHref } from '../lib/lineage';
import { useRunFeed } from '../lib/run-feed';
import { awaitingPlanReview, isTerminalRun } from '../lib/runs';
import { controlsFor, RunQuestions, type Control } from './run-controls';
import { ResearchRunPanel } from './research-run';
import { RunProgress } from './run-progress';
import { AgentActivity } from './agent-activity';

const STEP_ICON = { done: CheckCircle2, active: CircleDot, todo: Circle, problem: CircleAlert } as const;
function stepTone(status: string): keyof typeof STEP_ICON {
  if (status === 'completed') return 'done';
  if (status === 'running') return 'active';
  if (status === 'failed' || status === 'blocked') return 'problem';
  return 'todo';
}

const CONTROL_LABEL: Record<Control, string> = { pause: 'Pause', resume: 'Resume', cancel: 'Stop' };

/** One request shown as a conversation: what you asked, then what the assistant is doing and found. */
export function AskRun({ wb, run: listed, runs, onChanged, onSelect }: {
  wb: Workbench; run: ResearchRun; runs: ResearchRun[]; onChanged: (run: ResearchRun) => void; onSelect: (id: string) => void;
}) {
  const feed = useRunFeed(wb.projectId, listed.id, wb.preview);
  const { detail, events, setDetail, refresh } = feed;
  const run = detail?.run ?? listed;
  const reported = detail?.run;
  useEffect(() => { if (reported) onChanged(reported); }, [reported, onChanged]);
  const [controlError, setControlError] = useState('');
  const [pending, setPending] = useState<Control | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [technical, setTechnical] = useState(false);
  const keys = useRef(new Map<string, string>());

  // Newly published results may not be in the project snapshot yet.
  const missing = run.result_artifact_ids.filter(id => !wb.artifacts.some(a => a.id === id)).join(' ');
  const asked = useRef('');
  const { refreshJobs } = wb;
  useEffect(() => {
    if (!missing || asked.current === missing) return;
    asked.current = missing;
    refreshJobs();
  }, [missing, refreshJobs]);

  const updated = useCallback((next: ResearchRun) => {
    if (next.id === run.id) {
      setDetail(current => current && current.run.control_revision <= next.control_revision ? { ...current, run: next } : current);
      onChanged(next);
    }
    refresh();
    wb.refreshJobs();
  }, [run.id, setDetail, onChanged, refresh, wb]);

  const control = async (which: Control) => {
    if (pending || wb.preview) return;
    setPending(which); setControlError('');
    const identity = `${run.id}:${which}:${run.control_revision}`;
    const key = keys.current.get(identity) ?? crypto.randomUUID();
    keys.current.set(identity, key);
    try {
      const next = await api(`projects/${wb.projectId}/agent-runs/${run.id}/${which}`, parseResearchRun, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ expected_run_revision: run.control_revision }),
      }, 60_000);
      setConfirmStop(false);
      updated(next);
    } catch (e) {
      setControlError(e instanceof ApiError && e.status === 409
        ? 'The request changed while you clicked. We refreshed it, so please try again.'
        : e instanceof Error ? e.message : 'That didn’t go through. Please try again.');
      refresh();
    } finally {
      setPending(null);
    }
  };

  const plan = detail?.plan ?? null;
  const review = awaitingPlanReview(run, plan?.revision);
  const controls = controlsFor(run);
  const results = run.result_artifact_ids.map(id => wb.artifacts.find(value => value.id === id) ?? { id, kind: undefined });
  // A CSV upload is both a file and its dataset, so count files when there are any.
  const files = run.inputs.material_ids.length || run.inputs.artifact_ids.length;

  const acceptPlan = () => plan && void wb.act(async () => {
    const identity = `${run.id}:${run.control_revision}:${plan.revision}`;
    const key = keys.current.get(identity) ?? crypto.randomUUID();
    keys.current.set(identity, key);
    const next = await api(`projects/${wb.projectId}/agent-runs/${run.id}/review-plan`, parseResearchRun, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ expected_run_revision: run.control_revision, expected_plan_revision: plan.revision }),
    }, 60_000);
    updated(next);
    wb.setNotice('Plan approved. The assistant is getting to work.');
  });

  return (
    <article className="thread" id={`run-${run.id}`} aria-label="Your request and the assistant’s reply">
      <div className="message message--you">
        <span className="avatar avatar--you" aria-hidden="true"><User size={15} /></span>
        <div className="bubble">
          <p>{run.objective}</p>
          {run.agent_roster && <p className="bubble-meta">Assigned to {run.agent_roster.name} · {run.agent_roster.selection.exclusive ? 'Selected agents only' : 'Built-in assistance allowed'}</p>}
          {files > 0 && <p className="bubble-meta">{files} file{files === 1 ? '' : 's'} attached</p>}
        </div>
      </div>

      <div className="message message--ai">
        <span className="avatar avatar--ai" aria-hidden="true"><Sparkles size={15} /></span>
        <div className="reply">
          <RunProgress run={run} detail={detail} events={events} error={feed.error} lastRead={feed.lastRead} />

          {run.stop_reason && (run.state === 'failed' || run.state === 'partially_completed') && <p className="reply-note">Reason given: {run.stop_reason}</p>}
          {feed.error && <p className="reply-note">We lost touch with this request for a moment and are reconnecting…</p>}

          {detail && <div className="reply-questions"><RunQuestions wb={wb} run={run} detail={detail} onUpdated={updated} /></div>}

          {detail?.answer && <section className="reply-section" aria-label="Answer">
            <p className="reply-answer">{detail.answer}</p>
            <p className="field-hint">General knowledge ? no project analysis or source search performed</p>
          </section>}

          {plan && <section className="reply-section" aria-labelledby={`plan-${run.id}`}>
            <h3 id={`plan-${run.id}`}>The plan</h3>
            {plan.rationale_summary && <p className="reply-text">{plan.rationale_summary}</p>}
            <ol className="checklist">
              {plan.steps.map(step => {
                const tone = stepTone(step.status);
                const Icon = STEP_ICON[tone];
                return <li key={step.id} className={`check check--${tone}`}>
                  <Icon size={16} aria-hidden="true" className={tone === 'active' ? 'pulse' : undefined} />
                  <span>{step.objective}</span>
                  <span className="check-state">{STEP_LABEL[step.status] ?? step.status}</span>
                </li>;
              })}
            </ol>
          </section>}

          {review && plan && <div className="reply-cta">
            <p>You asked to see the plan first. Nothing has been changed yet. Does this look right?</p>
            <div className="button-row">
              <button type="button" className="button" disabled={wb.busy} onClick={acceptPlan}>Looks good, go ahead</button>
              <button type="button" className="button button--ghost" disabled={Boolean(pending)} onClick={() => setConfirmStop(true)}>Stop</button>
            </div>
          </div>}

          {results.length > 0 && <section className="reply-section" aria-labelledby={`results-${run.id}`}>
            <h3 id={`results-${run.id}`}>Results</h3>
            <ul className="result-cards">{results.map(result => {
              const href = result.kind ? artifactHref(wb.projectId, { id: result.id, kind: result.kind }) : null;
              return <li key={result.id}>
                <Link className="result-card" href={href ?? provenanceHref(wb.projectId, result.id)}>
                  <span>{result.kind ? RESULT_LABEL[result.kind] ?? 'Result' : 'New result'}</span>
                  <ExternalLink size={14} aria-hidden="true" />
                </Link>
              </li>;
            })}</ul>
          </section>}

          <AgentActivity run={run} detail={detail} events={events} />

          {(controls.length > 0 || controlError) && <div className="reply-controls">
            {controls.includes('pause') && <button type="button" className="button button--sm button--secondary" disabled={Boolean(pending)} onClick={() => void control('pause')}>
              <Pause size={14} aria-hidden="true" /> {pending === 'pause' ? 'Pausing…' : CONTROL_LABEL.pause}</button>}
            {controls.includes('resume') && <button type="button" className="button button--sm" disabled={Boolean(pending)} onClick={() => void control('resume')}>
              <Play size={14} aria-hidden="true" /> {pending === 'resume' ? 'Resuming…' : CONTROL_LABEL.resume}</button>}
            {controls.includes('cancel') && !confirmStop && !review && <button type="button" className="button button--sm button--ghost" disabled={Boolean(pending)} onClick={() => setConfirmStop(true)}>
              <Square size={13} aria-hidden="true" /> {CONTROL_LABEL.cancel}</button>}
            {controlError && <p className="reply-note" role="alert">{controlError}</p>}
          </div>}
          {confirmStop && controls.includes('cancel') && <div className="reply-cta" role="group" aria-label="Confirm stop">
            <p>Stop this request? Anything already finished stays available, but nothing new will start.</p>
            <div className="button-row">
              <button type="button" className="button button--danger button--sm" disabled={Boolean(pending)} onClick={() => void control('cancel')}>{pending === 'cancel' ? 'Stopping…' : 'Yes, stop it'}</button>
              <button type="button" className="button button--ghost button--sm" disabled={Boolean(pending)} onClick={() => setConfirmStop(false)}>Keep going</button>
            </div>
          </div>}

          {/* Mounted only when opened: the full panel keeps its own live connection. */}
          <details className="disclosure" onToggle={event => setTechnical(event.currentTarget.open)}>
            <summary><ChevronRight size={14} className="disclosure-chevron" aria-hidden="true" />Full technical details</summary>
            {technical && <div className="disclosure-body">
              <ResearchRunPanel wb={wb} runs={runs} runId={run.id} truncated={false} historyError="" onSelect={onSelect} onChanged={onChanged} />
            </div>}
          </details>
          {isTerminalRun(run) && <p className="reply-text reply-text--muted">Want to go further? Ask a follow-up below.</p>}
        </div>
      </div>
    </article>
  );
}

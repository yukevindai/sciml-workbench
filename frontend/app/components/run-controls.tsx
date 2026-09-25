'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { parseResearchRun } from '../lib/decode';
import type { Workbench } from '../lib/context';
import type { ResearchQuestion, ResearchRun, RunDetail } from '../lib/generated/http';
import { isTerminalRun } from '../lib/runs';
import { executionStatus } from '../lib/status';
import { Alert, Badge } from './ui';

export type Control = 'pause' | 'resume' | 'cancel';
const CONTROL_TIMEOUT = 60_000;
const ACTIVE_RUN_STATES = new Set<ResearchRun['state']>(['queued', 'running', 'waiting_for_job', 'waiting_for_input']);

/** What each acknowledged control does and does not do, stated once. */
export const CONTROL_EFFECT: Record<Control, string> = {
  pause: 'New tool dispatch is fenced at the next safe boundary. Scientific jobs already accepted keep running until their fixed deadlines, and completed work stays visible.',
  resume: 'The same run continues with its original inputs, remaining budget and operation keys. Usage is not reset.',
  cancel: 'Future work is stopped. Jobs owned only by this run are fenced and shared jobs are detached. Effects already committed, such as published artifacts or imported records, are not rolled back.',
};

export function controlsFor(run: ResearchRun): Control[] {
  if (isTerminalRun(run)) return [];
  return [...(ACTIVE_RUN_STATES.has(run.state) ? ['pause' as const] : []), ...(run.state === 'paused' ? ['resume' as const] : []), 'cancel'];
}

function failureMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.status === 409) return `${e.message}. The run changed before this request was recorded, so nothing was applied. The current state has been reloaded; review it and try again.`;
  return e instanceof Error ? e.message : fallback;
}

type Ack = { control: Control; requestedAt: number; recorded: ResearchRun['state']; revision: number };

/**
 * Pause, resume and cancel with the expected run revision. The acknowledgment
 * separates what was requested from the state the server recorded, and from
 * what that state means for work already under way.
 */
export function RunControls({ wb, run, detail, onUpdated }: {
  wb: Workbench; run: ResearchRun; detail: RunDetail | null; onUpdated: (run: ResearchRun) => void;
}) {
  const [ack, setAck] = useState<Ack | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Control | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const inFlight = useRef(false);
  const keys = useRef(new Map<string, string>());
  useEffect(() => { setAck(null); setError(''); setConfirmCancel(false); }, [run.id]);

  const send = async (control: Control) => {
    if (inFlight.current || wb.preview) return;
    inFlight.current = true;
    setPending(control); setError('');
    const identity = `${run.id}:${control}:${run.control_revision}`;
    const key = keys.current.get(identity) ?? crypto.randomUUID();
    keys.current.set(identity, key);
    try {
      const updated = await api(`projects/${wb.projectId}/agent-runs/${run.id}/${control}`, parseResearchRun, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ expected_run_revision: run.control_revision }),
      }, CONTROL_TIMEOUT);
      if (updated.id !== run.id) throw new Error('The server acknowledged a different run.');
      setAck({ control, requestedAt: run.control_revision, recorded: updated.state, revision: updated.control_revision });
      setConfirmCancel(false);
      onUpdated(updated);
    } catch (e) {
      // A lost response keeps its key for this revision, so trying again cannot apply the control twice.
      setError(failureMessage(e, `The ${control} request did not complete. Trying again reuses its request key.`));
      if (e instanceof ApiError) onUpdated(run);
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  };

  const available = controlsFor(run);
  const drainingJobs = wb.jobs.filter(job => (job.state === 'queued' || job.state === 'running') && job.run_links.some(link => link.run_id === run.id));

  return <section className="panel-section" aria-labelledby="run-controls-heading">
    <h3 className="panel-section-title" id="run-controls-heading">Run controls</h3>
    {available.length === 0 && !ack && <p className="field-hint">This run has finished; controls no longer apply. Continue the research as a new request.</p>}
    {available.length > 0 && <div className="button-row">
      {available.includes('pause') && <button type="button" className="button button--secondary" disabled={Boolean(pending) || wb.preview} onClick={() => void send('pause')}>
        {pending === 'pause' ? 'Pausing…' : 'Pause'}</button>}
      {available.includes('resume') && <button type="button" className="button" disabled={Boolean(pending) || wb.preview} onClick={() => void send('resume')}>
        {pending === 'resume' ? 'Resuming…' : 'Resume'}</button>}
      {available.includes('cancel') && !confirmCancel && <button type="button" className="button button--ghost" disabled={Boolean(pending) || wb.preview} onClick={() => setConfirmCancel(true)}>Cancel run…</button>}
    </div>}
    {confirmCancel && available.includes('cancel') && <div className="stack stack--tight" role="group" aria-label="Confirm cancellation">
      <p>{CONTROL_EFFECT.cancel}</p>
      <div className="button-row">
        <button type="button" className="button button--danger" disabled={Boolean(pending)} onClick={() => void send('cancel')}>{pending === 'cancel' ? 'Cancelling…' : 'Cancel this run'}</button>
        <button type="button" className="button button--ghost" disabled={Boolean(pending)} onClick={() => setConfirmCancel(false)}>Keep running</button>
      </div>
    </div>}
    {run.state === 'waiting_for_input' && run.open_question_ids.length > 0 && <p className="field-hint">Answering the open question resumes eligible work; Resume is not needed.</p>}
    {error && <Alert variant="error" role="alert" title="Control not applied">{error}</Alert>}
    {ack && <div className="control-ack" role="status" aria-label="Control acknowledgment">
      <dl className="definition-list">
        <div><dt>Requested</dt><dd>{ack.control} at run revision {ack.requestedAt}</dd></div>
        <div><dt>Recorded state</dt><dd><Badge state={ack.recorded} /> {executionStatus(ack.recorded)?.description} (revision {ack.revision})</dd></div>
        <div><dt>What this means</dt><dd>{CONTROL_EFFECT[ack.control]}</dd></div>
        {detail && <div><dt>Server statement</dt><dd>{detail.control_effect}</dd></div>}
        {ack.control !== 'resume' && <div><dt>Jobs still settling</dt><dd>{drainingJobs.length
          ? drainingJobs.map(job => <a key={job.id} className="text-link" href={`#job-${job.id}`}>{job.kind} job {job.id.slice(0, 8)} ({job.state}) </a>)
          : 'None of this run’s jobs are queued or running in the latest job read.'}</dd></div>}
      </dl>
    </div>}
  </section>;
}

/* ------------------------------ clarification ----------------------------- */

const draftKey = (runId: string, question: ResearchQuestion) => `sciml-answer:${runId}:${question.id}:${question.revision}`;

function loadDraft(runId: string, question: ResearchQuestion): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(draftKey(runId, question)) ?? '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    }
  } catch { /* storage unavailable or corrupt */ }
  return {};
}

/**
 * One card for all open questions of a run. Answers are drafted per question
 * revision and survive refresh; a superseded revision returns a clear conflict.
 */
export function RunQuestions({ wb, run, detail, onUpdated }: {
  wb: Workbench; run: ResearchRun; detail: RunDetail; onUpdated: (run: ResearchRun) => void;
}) {
  const open = detail.questions.filter(question => question.status === 'open' && run.open_question_ids.includes(question.id));
  if (!open.length) return null;
  const steps = new Map((detail.plan?.steps ?? []).map(step => [step.id, step]));
  const blocked = new Set(open.flatMap(question => question.questions.flatMap(item => item.blocked_step_ids)));
  const independent = (detail.plan?.steps ?? []).filter(step => !blocked.has(step.id) && !['completed', 'failed', 'skipped'].includes(step.status));
  return <section className="panel-section clarification" aria-labelledby="run-questions-heading">
    <h3 className="panel-section-title" id="run-questions-heading">Your input is needed</h3>
    <p className="field-hint">These facts change the scientific meaning of the result. {independent.length
      ? `Steps not blocked by them can continue: ${independent.map(step => step.objective).join('; ')}.`
      : 'No other step is ready to continue meanwhile.'}</p>
    {open.map(question => <QuestionForm key={`${question.id}:${question.revision}`} wb={wb} run={run} question={question} steps={steps} onUpdated={onUpdated} />)}
  </section>;
}

const OTHER = '__other__';

function QuestionForm({ wb, run, question, steps, onUpdated }: {
  wb: Workbench; run: ResearchRun; question: ResearchQuestion; steps: Map<string, { objective: string }>; onUpdated: (run: ResearchRun) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() => loadDraft(run.id, question));
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const keys = useRef(new Map<string, string>());
  const expired = question.expires_at ? new Date(question.expires_at).getTime() <= Date.now() : false;

  const update = (next: Record<string, string>) => {
    setDraft(next);
    try { localStorage.setItem(draftKey(run.id, question), JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  const answerFor = (id: string, options: { id: string; label: string }[]) => {
    const choice = draft[`choice:${id}`];
    if (options.length && choice && choice !== OTHER) return options.find(option => option.id === choice)?.label ?? '';
    return (draft[`text:${id}`] ?? '').trim();
  };
  const answers = Object.fromEntries(question.questions.map(item => [item.id, answerFor(item.id, item.options)]));
  const missing = question.questions.filter(item => !answers[item.id]);

  const submit = async () => {
    if (sending || missing.length || wb.preview) return;
    setSending(true); setError('');
    const body = { expected_run_revision: run.control_revision, expected_question_revision: question.revision, answers };
    const identity = JSON.stringify(body);
    const key = keys.current.get(identity) ?? crypto.randomUUID();
    keys.current.set(identity, key);
    try {
      const updated = await api(`projects/${wb.projectId}/agent-runs/${run.id}/questions/${question.id}/answer`, parseResearchRun, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: identity,
      }, CONTROL_TIMEOUT);
      try { localStorage.removeItem(draftKey(run.id, question)); } catch { /* storage unavailable */ }
      wb.setNotice(`Answer recorded; the run now reads ${executionStatus(updated.state)?.label ?? updated.state}.`);
      onUpdated(updated);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(`${e.message}. This question changed, expired or the run moved on before your answer was recorded. Nothing was applied; your draft is kept and the current question is reloaded.`);
        onUpdated(run);
      } else setError(e instanceof Error ? `${e.message}. Submitting again reuses the same request key.` : 'The answer was not confirmed.');
    } finally {
      setSending(false);
    }
  };

  return <form className="stack" aria-label={`Question revision ${question.revision}`} onSubmit={event => { event.preventDefault(); void submit(); }}>
    {question.questions.map(item => {
      const choice = draft[`choice:${item.id}`] ?? '';
      const name = `${question.id}-${item.id}`;
      return <fieldset key={item.id} className="question">
        <legend>{item.prompt}</legend>
        <p className="field-hint">Affects: {item.blocked_step_ids.map(id => steps.get(id)?.objective ?? id).join('; ')}{item.evidence.length ? ` · ${item.evidence.length} cited source${item.evidence.length === 1 ? '' : 's'}` : ''}</p>
        {item.options.map(option => <label key={option.id} className="scope-item">
          <input type="radio" name={name} checked={choice === option.id} onChange={() => update({ ...draft, [`choice:${item.id}`]: option.id })} />
          <span className="scope-text"><span>{option.label}</span><span className="field-hint">{option.consequence}</span></span>
        </label>)}
        {item.options.length > 0 && <label className="scope-item">
          <input type="radio" name={name} checked={choice === OTHER} onChange={() => update({ ...draft, [`choice:${item.id}`]: OTHER })} />
          <span className="scope-text"><span>Another answer</span></span>
        </label>}
        {(!item.options.length || choice === OTHER) && <div className="field">
          <label className="field-label" htmlFor={`${name}-text`}>{item.options.length ? 'Your answer' : 'Answer'}</label>
          <input id={`${name}-text`} className="input" maxLength={4000} value={draft[`text:${item.id}`] ?? ''}
            onChange={event => update({ ...draft, [`text:${item.id}`]: event.target.value })} />
        </div>}
      </fieldset>;
    })}
    {expired && <Alert variant="warning">This question has expired. Its answer will be refused; the run needs a new question or a new request.</Alert>}
    {error && <Alert variant="error" role="alert" title="Answer not recorded">{error}</Alert>}
    <div className="panel-foot">
      <span className="field-hint">{missing.length ? `Answer every part to submit (${missing.length} remaining). Drafts are kept in this browser.` : 'Answers are stored as attributed operator messages.'}</span>
      <button type="submit" className="button" disabled={sending || missing.length > 0 || wb.preview}>{sending ? 'Submitting…' : 'Submit answers'}</button>
    </div>
  </form>;
}

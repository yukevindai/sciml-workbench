'use client';

import { useEffect, useState } from 'react';
import { Clock3, Loader2 } from 'lucide-react';
import type { ResearchRun, RunDetail, RunEvent, WorkflowRun } from '../lib/generated/http';
import { PHASE } from '../lib/ask';
import { isTerminalRun } from '../lib/runs';
import { meaningfulUpdates } from './agent-activity';

/** Wall time, never a claim about model compute time or percentage complete. */
export function elapsed(start: string, end: number): string {
  const stamp = Date.parse(start);
  if (!Number.isFinite(stamp)) return 'Unavailable';
  const seconds = Math.max(0, Math.floor((end - stamp) / 1000));
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return hours ? `${hours}h ${minutes}m ${seconds % 60}s` : minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}
function useClock(ticking: boolean) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}
function Timer({ start, now, label = 'Elapsed' }: { start: string; now: number | null; label?: string }) {
  return <span className="progress-time" role="timer" aria-live="off" aria-label={label}><Clock3 size={14} aria-hidden="true" />{label} {now === null ? '…' : elapsed(start, now)}</span>;
}

export function PendingProgress({ label = 'Sending your request', description = 'Preparing inputs and waiting for the server to accept your request.' }: { label?: string; description?: string }) {
  const [started] = useState(() => new Date().toISOString());
  const now = useClock(true);
  return <div className="run-progress" aria-label="Request submission" role="region"><div className="progress-heading"><span role="status"><Loader2 className="spin" size={16} aria-hidden="true" /> {label}</span><Timer start={started} now={now} /></div><p className="field-hint">{description}</p></div>;
}

export function RunProgress({ run, detail, events = [], error = '', lastRead = '', support = false }: {
  run: ResearchRun; detail: RunDetail | null; events?: RunEvent[]; error?: string; lastRead?: string; support?: boolean;
}) {
  const terminal = isTerminalRun(run);
  const now = useClock(!terminal);
  const phase = PHASE[run.state];
  const working = ['running', 'waiting_for_job'].includes(run.state) && !error;
  const latest = meaningfulUpdates(events).at(-1);
  const lastEvent = events.at(-1);
  const steps = detail?.plan?.steps ?? [];
  const runningSteps = steps.filter(step => step.status === 'running');
  const label = error ? 'Updates interrupted' : run.state === 'queued' ? 'Queued' : support && run.state === 'running' ? 'Preparing your answer' : phase.label;
  const description = error ? 'Reconnecting. The last recorded state is shown below; current activity is unconfirmed.'
    : run.state === 'queued' ? 'Waiting for the next available agent step.'
    : run.state === 'waiting_for_job' ? 'Waiting for a scientific job to finish. Its latest recorded status appears in activity.'
    : support && run.state === 'running' ? 'The support agent is responding using the product guide.' : phase.detail;
  const clockEnd = terminal ? (run.finished_at ? Date.parse(run.finished_at) : null) : now;
  return <section className="run-progress" aria-label="Run progress" data-state={run.state}>
    <div className="progress-heading">
      <span className={`phase phase--${error ? 'waiting' : phase.tone}`} role="status">{working ? <Loader2 className="spin" size={16} aria-hidden="true" /> : <span className="phase-dot" aria-hidden="true" />}<strong>{label}</strong></span>
      {(!terminal || run.finished_at) && <Timer start={run.created_at} now={clockEnd} label={terminal ? 'Total elapsed' : 'Elapsed'} />}
    </div>
    <p>{description}</p>
    <p className="field-hint">Time since this request was accepted, including queueing and waits.</p>
    {!terminal && <>
      {steps.length > 0 && <p className="progress-count">{steps.filter(step => step.status === 'completed').length} of {steps.length} plan steps completed</p>}
      {runningSteps.length > 0 && <ul className="progress-list" aria-label="Current steps">{runningSteps.map(step => <li key={step.id}>{step.objective}</li>)}</ul>}
      {detail && detail.assignments.length > 0 && <ul className="progress-list" aria-label="Agent status">{detail.assignments.map(agent => <li key={agent.id}><strong>{agent.agent_name ?? agent.role.replaceAll('_', ' ')}</strong><span>{agent.state}</span>{['queued', 'running', 'waiting'].includes(agent.state) && <Timer start={agent.created_at} now={now} label="Since assigned" />}</li>)}</ul>}
      {latest && <p className="progress-update">Latest activity: {latest.summary}</p>}
      {now !== null && <p className="field-hint">{lastEvent ? `Last recorded activity ${elapsed(lastEvent.created_at, now)} ago.` : 'Waiting for the next recorded activity update.'} {lastRead && `Last checked ${elapsed(lastRead, now)} ago.`} Longer model calls may not report intermediate steps.</p>}
    </>}
  </section>;
}

export function WorkflowProgress({ run, error = '' }: { run: WorkflowRun; error?: string }) {
  const active = ['running', 'waiting'].includes(run.state);
  const now = useClock(active);
  const nodes = Object.values(run.nodes);
  return <section className="run-progress" aria-label="Workflow progress"><div className="progress-heading"><span role="status">{active && !error && <Loader2 size={16} className="spin" aria-hidden="true" />} {error ? 'Updates interrupted' : run.state === 'running' ? 'Research in progress' : run.state === 'waiting' ? 'Waiting for research updates' : run.state.replaceAll('_', ' ')}</span>{active && <Timer start={run.created_at} now={now} />}</div><p>{nodes.filter(node => node.state === 'completed').length} of {nodes.length} workflow steps completed · {nodes.filter(node => node.state === 'running').length} running · {nodes.filter(node => node.state === 'skipped').length} skipped</p>{active && <p className="field-hint">Time since this workflow started, including waits. {error ? 'Current activity is unconfirmed while reconnecting.' : 'Individual reviews below show their latest recorded state.'}</p>}</section>;
}

'use client';

import Link from '../components/workspace-link';
import { AgentSelector } from '../components/agent-selection';
import type { AgentSelection } from '../lib/agent-market';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Clock, FlaskConical, Plus, Wrench } from 'lucide-react';
import type { Workbench } from '../lib/context';
import type { ExecutionPolicySummary, MaterialResponse, ResearchRun } from '../lib/generated/http';
import { api } from '../lib/api';
import { parseExecutionPolicy } from '../lib/decode';
import { ask, AskBlocked, createProject, listFiles, PHASE, SUGGESTIONS } from '../lib/ask';
import { chooseRun, loadRunHistory, rememberedRun, rememberRun } from '../lib/runs';
import { AskComposer, type Draft } from '../components/ask-composer';
import { AskRun } from '../components/ask-run';
import { Alert } from '../components/ui';
import { WorkspacePicker } from '../components/workspace-picker';

/* A message that must survive the remount when a first request creates its project. */
let carried: { projectId: string; error: string; prompt: string } | null = null;

function friendly(error: unknown): string {
  if (error instanceof AskBlocked) return error.message;
  const text = error instanceof Error ? error.message : '';
  return text ? `That didn’t go through: ${text}` : 'That didn’t go through. Please try again.';
}

function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The default workspace: one prompt box, then a conversation-style view of each request. */
export function AskView({ wb }: { wb: Workbench }) {
  const [agentSelection, setAgentSelection] = useState<AgentSelection | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const agent = query.get('agent'), team = query.get('team');
    if (agent || team) setAgentSelection({ kind: team ? 'team' : 'agent', id: (team || agent)!, exclusive: true });
  }, []);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [runId, setRunId] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [files, setFiles] = useState<MaterialResponse[]>([]);
  const [summary, setSummary] = useState<ExecutionPolicySummary | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(() => carried && carried.projectId === wb.projectId ? carried.error : '');
  const [suggestion, setSuggestion] = useState<string | undefined>(() => carried && carried.projectId === wb.projectId ? carried.prompt : undefined);
  const pid = wb.projectId;

  useEffect(() => { carried = null; }, []);

  const loadFiles = useCallback(async (signal?: AbortSignal) => {
    if (!pid || wb.preview) { setFiles([]); return; }
    try {
      const list = await listFiles(pid, signal);
      if (!signal?.aborted) setFiles(list.filter(file => file.project_id === pid));
    } catch { /* the composer still works without the list */ }
  }, [pid, wb.preview]);

  useEffect(() => {
    setRuns([]); setRunId(''); setHistoryError(''); setSummary(null);
    if (!pid || wb.preview) return;
    const controller = new AbortController();
    loadRunHistory(pid, controller.signal)
      .then(history => {
        if (controller.signal.aborted) return;
        setRuns(history.runs);
        const requested = new URLSearchParams(window.location.search).get('run');
        const remembered = requested ?? rememberedRun(pid);
        // Reopen the request someone was looking at, or one still in progress.
        const open = history.runs.find(run => run.id === remembered) ?? chooseRun(history.runs.filter(run => !['completed', 'failed', 'cancelled', 'partially_completed'].includes(run.state)), '');
        setRunId(current => current || open?.id || '');
      })
      .catch(e => { if (!controller.signal.aborted) setHistoryError(e instanceof Error ? e.message : 'Could not load earlier requests'); });
    api(`projects/${pid}/execution-policy`, parseExecutionPolicy, { signal: controller.signal }, 30_000)
      .then(value => { if (!controller.signal.aborted && value.project_id === pid) setSummary(value); })
      .catch(() => { /* shown only if sending fails */ });
    void loadFiles(controller.signal);
    return () => controller.abort();
  }, [pid, wb.preview, loadFiles]);

  const select = useCallback((id: string) => {
    setRunId(id);
    if (pid) rememberRun(pid, id);
  }, [pid]);

  const changed = useCallback((run: ResearchRun) => {
    if (run.project_id !== pid) return;
    setRuns(current => [run, ...current.filter(value => value.id !== run.id)]
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)));
  }, [pid]);

  const send = async (draft: Draft): Promise<boolean> => {
    if (sending || wb.preview) return false;
    setSending(true); setError(''); setSuggestion(undefined);
    let target = pid;
    let created = false;
    try {
      if (!target) {
        const project = await createProject(draft.prompt);
        target = project.id; created = true;
        wb.setProjects(list => [...list.filter(p => p.id !== project.id), project]);
      }
      const run = await ask({ projectId: target, prompt: draft.prompt, files: draft.files, earlier: draft.earlier, reviewPlan: draft.reviewPlan, agentSelection });
      rememberRun(target, run.id);
      if (created) { wb.setProjectId(target); return true; }
      changed(run); select(run.id);
      void loadFiles();
      wb.refreshJobs();
      return true;
    } catch (e) {
      const message = friendly(e);
      if (created) { carried = { projectId: target, error: message, prompt: draft.prompt }; wb.setProjectId(target); return false; }
      setError(message);
      void loadFiles();
      return false;
    } finally {
      setSending(false);
    }
  };

  const current = runs.find(run => run.id === runId);
  const unavailable = summary && !summary.agent_available;
  const notice = unavailable && <Alert variant="warning" title="The AI assistant isn’t switched on yet">
    Ask the workspace owner to configure the AI provider and enable your research group. Your saved projects and agents remain available.
  </Alert>;

  if (current) {
    return <div className="ask ask--thread">
      <div className="ask-top">
        <button type="button" className="button button--ghost button--sm" onClick={() => select('')}>
          <ArrowLeft size={15} aria-hidden="true" /> New request
        </button>
        {runs.length > 1 && <div className="ask-history">
          <WorkspacePicker label="Earlier requests" value={current.id} onChange={select}
            options={runs.map(run => ({ value: run.id, label: run.objective, detail: `${PHASE[run.state].label} · ${when(run.created_at)}` }))} />
        </div>}
      </div>
      <AskRun key={current.id} wb={wb} run={current} runs={runs} onChanged={changed} onSelect={select} />
      <div className="ask-dock">
        {error && <Alert variant="error" role="alert">{error}</Alert>}
        <AgentSelector projectId={pid} value={agentSelection} onChange={setAgentSelection} disabled={sending} preview={wb.preview} />
        <AskComposer compact onSend={send} busy={sending} disabled={wb.preview} projectFiles={files}
          placeholder="Ask a follow-up, or start something new…" />
      </div>
    </div>;
  }

  return <div className="ask">
    <div className="ask-hero">
      <span className="ask-emblem" aria-hidden="true"><FlaskConical size={26} strokeWidth={1.5} /></span>
      <p className="ask-kicker">Your personal AI lab group</p>
      <h1 className="ask-title">What would you like to find out?</h1>
      <p className="ask-lede">Bring your data, papers, and questions. We’ll work through the next step together.</p>
    </div>
    {notice}
    {error && <Alert variant="error" role="alert">{error}</Alert>}
    <AgentSelector projectId={pid} value={agentSelection} onChange={setAgentSelection} disabled={sending} preview={wb.preview} />
    <AskComposer onSend={send} busy={sending} disabled={wb.preview} projectFiles={files} initial={suggestion} />
    <div className="suggestions" role="group" aria-label="Ideas to get started">
      {SUGGESTIONS.map(item => <button key={item.label} type="button" className="suggestion" disabled={sending || wb.preview}
        onClick={() => setSuggestion(item.prompt)}>{item.label}</button>)}
    </div>

    {(runs.length > 0 || historyError) && <section className="recent" aria-labelledby="recent-title">
      <div className="recent-head">
        <h2 id="recent-title"><Clock size={15} aria-hidden="true" /> Recent requests{wb.activeProject ? ` in ${wb.activeProject.name}` : ''}</h2>
      </div>
      {historyError && <p className="field-hint">Earlier requests couldn’t be loaded: {historyError}</p>}
      <ul className="recent-list">{runs.slice(0, 8).map(run => <li key={run.id}>
        <button type="button" className="recent-item" onClick={() => select(run.id)}>
          <span className="recent-text">{run.objective}</span>
          <span className={`recent-state phase--${PHASE[run.state].tone}`}>{PHASE[run.state].label}</span>
          <span className="recent-time">{when(run.created_at)}</span>
        </button>
      </li>)}</ul>
    </section>}

    <div className="ask-foot">
      {wb.projects.length > 0 && <button type="button" className="button button--ghost button--sm" disabled={!pid || sending} onClick={() => wb.setProjectId('')}>
        <Plus size={14} aria-hidden="true" /> Start a new project
      </button>}
    </div>
  </div>;
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { WandSparkles } from 'lucide-react';
import Link from './workspace-link';
import { Alert, Panel } from './ui';
import { PendingProgress, RunProgress } from './run-progress';
import { api, ApiError, json } from '../lib/api';
import { permissions, perRun } from '../lib/ask';
import { isDemo, workspaceSession } from '../lib/demo-mode';
import { parseResearchRun, parseRunDetail } from '../lib/decode';
import { hasRetainedRequest, retainedPost } from '../lib/retained-request';
import { isTerminalRun, runInput } from '../lib/runs';
import { readToolDraft, type ToolDraft } from '../lib/tool-draft';
import type { MarketTool, ResearchRun, RunDetail } from '../lib/generated/http';

const example = 'Compare battery papers: extract cell chemistry, electrolyte, test conditions and reported performance into a cited table. Flag missing details and comparisons that are not fair.';

export function ToolPromptBuilder({ projectId, capabilities, onDraft, onClose }: {
  projectId: string; capabilities: MarketTool[]; onDraft: (draft: ToolDraft) => void; onClose: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [runId, setRunId] = useState('');
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [readError, setReadError] = useState('');
  const [lastRead, setLastRead] = useState('');
  const alive = useRef(true), flight = useRef(false);
  const requestKey = `tool-builder-request:${projectId}`, savedKey = `tool-builder-run:${projectId}`;
  const active = !!runId && (!run || !isTerminalRun(run));
  useEffect(() => {
    alive.current = true;
    setPending(hasRetainedRequest(requestKey));
    try { setRunId(workspaceSession.getItem(savedKey) ?? ''); } catch { /* Storage is optional for restoration. */ }
    return () => { alive.current = false; };
  }, [requestKey, savedKey]);
  useEffect(() => {
    if (!projectId || !runId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const value = await api(`projects/${projectId}/agent-runs/${runId}`, parseRunDetail, { signal: controller.signal }, 30_000);
        if (controller.signal.aborted) return;
        if (value.run.project_id !== projectId || value.run.id !== runId) throw new Error('The draft response belongs to a different request.');
        setRun(value.run); setDetail(value); setReadError(''); setLastRead(new Date().toISOString());
        if (isTerminalRun(value.run)) return;
      } catch (e) {
        if (controller.signal.aborted) return;
        if (e instanceof ApiError && e.status === 404) {
          setRunId(''); setRun(null); setDetail(null);
          setError('This draft run is no longer available. Generate a new draft or build it manually.');
          try { workspaceSession.removeItem(savedKey); } catch { /* Best effort. */ }
          return;
        }
        setReadError(e instanceof Error ? e.message : 'Could not refresh the draft.');
      }
      timer = setTimeout(poll, document.hidden ? 15_000 : 1_000);
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, runId, savedKey]);
  const result = useMemo(() => {
    if (run?.state !== 'completed') return null;
    try { return { draft: readToolDraft(detail?.answer ?? '', capabilities), error: '' }; }
    catch { return { draft: null, error: 'The agent did not return a usable tool draft. Refine your description and generate again, or use the manual builder.' }; }
  }, [run?.state, detail?.answer, capabilities]);
  const generate = async () => {
    if (flight.current || active || !projectId || (!prompt.trim() && !pending)) return;
    flight.current = true; setBusy(true); setError('');
    try {
      const accepted = await retainedPost(requestKey, `projects/${projectId}/agent-runs`, async () => {
        const policy = perRun(await permissions(projectId, []));
        return { ...runInput(`Design a reusable tool, without executing it. User description:\n${prompt.trim()}`, [], policy, 'autopilot'),
          agent_selection: { kind: 'agent', id: 'tool-builder', exclusive: true } };
      }, parseResearchRun);
      if (accepted.project_id !== projectId) throw new Error('The draft response belongs to another project.');
      try { workspaceSession.setItem(savedKey, accepted.id); } catch { /* The current request remains usable. */ }
      if (!alive.current) return;
      setRun(accepted); setDetail(null); setRunId(accepted.id); setReadError(''); setLastRead('');
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Could not generate a draft.');
    } finally {
      flight.current = false;
      if (alive.current) { setBusy(false); setPending(hasRetainedRequest(requestKey)); }
    }
  };
  const stop = async () => {
    if (!run || flight.current) return;
    flight.current = true; setBusy(true); setError('');
    try {
      const stopped = await api(`projects/${projectId}/agent-runs/${run.id}/cancel`, parseResearchRun, json({ expected_run_revision: run.control_revision }), 30_000);
      if (alive.current) { setRun(stopped); setDetail(null); setRunId(''); }
      try { workspaceSession.removeItem(savedKey); } catch { /* Best effort. */ }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Could not stop generation.'); }
    finally { flight.current = false; if (alive.current) setBusy(false); }
  };
  return <Panel title="Describe your tool"><div className="stack">
    <p>Tell us what the tool should do, what you will give it, and what a good result looks like. Review its instructions and capabilities before saving.</p>
    {isDemo() && <Alert>Demo: generation returns a prewritten paper-comparison example. No AI calls are made.</Alert>}
    <form className="stack" onSubmit={e => { e.preventDefault(); void generate(); }}>
      <label>What should your tool do?<textarea autoFocus className="textarea" rows={5} maxLength={2500} required={!pending} disabled={busy || active || pending} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={example} /></label>
      <div className="market-actions"><button type="button" className="button button--ghost button--sm" disabled={busy || active || pending} onClick={() => setPrompt(example)}>Try a paper comparison</button></div>
      {!projectId && <p className="field-hint">Choose or create a project at the top to generate a draft. You can still build a tool manually.</p>}
      <p className="field-hint">Drafts use integrated capabilities. Requests stay in this project’s activity; no research files are attached.</p>
      <div className="market-actions"><button className="button button--primary" disabled={!projectId || busy || active || (!pending && !prompt.trim())}><WandSparkles size={16} aria-hidden="true" />{busy ? 'Working…' : active ? 'Generating draft…' : pending ? 'Retry previous draft' : 'Generate draft'}</button>
        {active && <button type="button" className="button button--secondary" disabled={busy || !run} onClick={() => void stop()}>Stop generation</button>}
        <button type="button" className="button button--ghost" disabled={busy || active} onClick={onClose}>Cancel</button></div>
    </form>
    {busy && !active && <PendingProgress label="Preparing your tool draft" />}
    {run && <RunProgress run={run} detail={detail} error={readError} lastRead={lastRead} />}
    {active && !run && <p role="status">{readError || 'Restoring draft generation…'}</p>}
    {error && <Alert variant="error" role="alert">{error}{pending && ' Retry uses the same request and avoids generating a duplicate.'}</Alert>}
    {run?.state === 'waiting_for_input' && <Alert variant="warning">The agent needs attention before it can produce a draft. Open generation activity, or stop generation and try a more specific description.</Alert>}
    {result?.error && <Alert variant="error" role="alert">{result.error}</Alert>}
    {run && isTerminalRun(run) && run.state !== 'completed' && <Alert variant="warning">Generation ended without a draft. You can try again or build it manually.</Alert>}
    {result?.draft && !busy && <section className="stack" aria-label="Generated tool draft"><h3>{result.draft.name}</h3><p>{result.draft.description}</p><p className="field-hint">{result.draft.capabilities.length} suggested capabilities. Nothing has been saved.</p><button className="button button--primary" onClick={() => { onDraft(result.draft!); try { workspaceSession.removeItem(savedKey); } catch { /* Best effort. */ } }}>Review and edit draft</button></section>}
    {run && <Link className="text-link" href={`/ask?project=${projectId}&run=${run.id}`}>Open generation activity</Link>}
  </div></Panel>;
}

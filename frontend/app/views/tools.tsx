'use client';
import Link from '../components/workspace-link';
import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Wrench, Copy } from 'lucide-react';
import type { Workbench } from '../lib/context';
import type { AgentMarket, ResearchTool } from '../lib/generated/http';
import { loadMarket, saveTool, archiveTool } from '../lib/agent-market';
import { Alert, Panel, Badge } from '../components/ui';

type Draft = Pick<ResearchTool, 'name' | 'description' | 'instructions' | 'capabilities'>;
const blank = (): Draft => ({ name: '', description: '', instructions: '', capabilities: [] });
export function ToolsView({ wb }: { wb: Workbench }) {
  const [market, setMarket] = useState<AgentMarket | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<ResearchTool | null>(null);
  const [archiving, setArchiving] = useState<ResearchTool | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = async () => setMarket(await loadMarket());
  useEffect(() => { const c = new AbortController(); if (!wb.preview) loadMarket(c.signal).then(setMarket).catch(e => { if (!c.signal.aborted) setError(e.message); }); return () => c.abort(); }, [wb.preview]);
  const open = (tool?: ResearchTool, copy = false) => {
    setEditing(copy ? null : tool ?? null); setDraft(tool ? { name: copy ? `${tool.name} copy`.slice(0,80) : tool.name, description: tool.description, instructions: tool.instructions, capabilities: tool.capabilities } : blank()); setError(''); setNotice('');
  };
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!draft || busy) return; setBusy(true); setError('');
    try { await saveTool({ ...draft, ...(editing ? { expected_revision: editing.revision } : {}) }, editing?.id); setDraft(null); await reload(); setNotice('Tool saved. Add it to an agent or a workflow step.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save tool.'); } finally { setBusy(false); }
  };
  const matches = (name: string, description: string) => `${name} ${description}`.toLowerCase().includes(search.toLowerCase());
  return <div className="stack market">
    <div className="market-intro"><div><p className="page-eyebrow">A toolkit for your research group</p><h2>Teach your agents how you work.</h2><p>Create reusable research tools with your instructions and the capabilities they need.</p></div><button className="button button--primary" disabled={!market || busy} onClick={() => open()}><Plus size={16} aria-hidden="true" />Create tool</button></div>
    {error && <Alert variant="error" role="alert">{error}{!market && <button className="text-link" onClick={() => void reload().catch(e => setError(e.message))}>Retry</button>}</Alert>}
    {notice && <Alert variant="success" role="status">{notice}</Alert>}
    {!market && !error && <p role="status">Loading tools…</p>}
    {draft && market && <Panel title={editing ? 'Edit research tool' : 'Create research tool'}><form onSubmit={save}><fieldset disabled={busy} className="market-fieldset stack">
      <label>Name<input className="input" autoFocus required maxLength={80} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Battery paper comparison" /></label>
      <label>Description<input className="input" maxLength={500} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="When should an agent use this tool?" /></label>
      <label>Research instructions<textarea className="textarea" required maxLength={4000} rows={5} value={draft.instructions} onChange={e => setDraft({ ...draft, instructions: e.target.value })} placeholder="Compare experimental conditions, extract reported performance, and cite the supporting passages. Return a comparison table and list unresolved differences." /></label>
      <fieldset className="market-fieldset"><legend>Capabilities · {draft.capabilities.length} selected</legend><p className="field-hint">These are the capabilities available when the tool runs. Existing project permissions and budgets still apply.</p><div className="market-choice-grid market-tools">{market.tools.map(t => <label key={t.id} className="market-check"><input type="checkbox" checked={draft.capabilities.includes(t.id)} onChange={() => setDraft({ ...draft, capabilities: draft.capabilities.includes(t.id) ? draft.capabilities.filter(id => id !== t.id) : [...draft.capabilities, t.id] })} /><span><strong>{t.id.replaceAll('_',' ')}</strong><small>{t.description}</small></span></label>)}</div></fieldset>
      <div className="market-actions"><button className="button button--primary" disabled={!draft.capabilities.length}>{busy ? 'Saving…' : 'Save tool'}</button><button type="button" className="button button--ghost" onClick={() => setDraft(null)}>Cancel</button></div>
    </fieldset></form></Panel>}
    <label className="market-search">Search tools<input className="input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or purpose" /></label>
    {archiving && <Alert variant="warning" title={`Archive ${archiving.name}?`}>Agents and workflows using this tool will need another tool for future runs. Existing runs keep their saved version. <button className="button button--secondary" disabled={busy} onClick={async () => { setBusy(true); try { await archiveTool(archiving.id,archiving.revision); setArchiving(null); await reload(); } catch(e) { setError(e instanceof Error ? e.message : 'Could not archive.'); } finally { setBusy(false); } }}>Archive</button><button className="button button--ghost" disabled={busy} onClick={() => setArchiving(null)}>Keep tool</button></Alert>}
    <h2>My research tools</h2>
    <div className="market-grid">{market?.custom_tools?.filter(t => matches(t.name,t.description)).map(t => <Panel key={t.id} className="market-card" title={<><Wrench size={18} aria-hidden="true" />{t.name}</>} description={t.description} aside={<Badge state="Custom" />}><p className="field-hint">{t.capabilities.length} capabilities · Revision {t.revision}</p><div className="market-card-actions"><Link className="button button--primary button--sm" href={`/workflows?tool=${t.id}`}>Use in workflow</Link><button className="button button--ghost button--sm" onClick={() => open(t)}>Edit</button><button className="button button--ghost button--sm" aria-label={`Copy ${t.name}`} onClick={() => open(t,true)}><Copy size={15} /></button><button className="button button--ghost button--sm" onClick={() => setArchiving(t)}>Archive</button></div></Panel>)}</div>
    {market && !market.custom_tools?.length && <p className="field-hint">Your first tool can standardize a literature review, data assessment, or experiment comparison.</p>}
    <h2>Integrated capabilities</h2><div className="tool-catalog">{market?.tools.filter(t => matches(t.id,t.description)).map(t => <div className="tool-catalog-row" key={t.id}><Wrench size={16} aria-hidden="true" /><div><strong>{t.id.replaceAll('_',' ')}</strong><p>{t.description}</p></div><Badge state="Built-in" /></div>)}</div>
  </div>;
}

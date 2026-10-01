'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, Copy, Plus, Users, X } from 'lucide-react';
import type { Workbench } from '../lib/context';
import { loadMarket, saveAgent, saveTeam, archiveAgent, archiveTeam, type AgentMarket, type AgentProfile, type AgentTeam } from '../lib/agent-market';
import { Alert, Badge, Panel } from '../components/ui';

type AgentDraft = Pick<AgentProfile, 'name' | 'role' | 'description' | 'instructions' | 'skills' | 'tools'>;
type TeamDraft = Pick<AgentTeam, 'name' | 'description' | 'agent_ids' | 'lead_agent_id'>;
const blankAgent = (): AgentDraft => ({ name: '', role: 'Specialist', description: '', instructions: '', skills: ['evidence'], tools: [] });
const blankTeam = (): TeamDraft => ({ name: '', description: '', agent_ids: [], lead_agent_id: '' });
const toggle = <T,>(items: T[], item: T) => items.includes(item) ? items.filter(i => i !== item) : [...items, item];

export function AgentMarketView({ wb }: { wb: Workbench }) {
  const [market, setMarket] = useState<AgentMarket | null>(null);
  const [tab, setTab] = useState<'all' | 'custom' | 'teams'>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<'agent' | 'team' | null>(null);
  const [editing, setEditing] = useState<AgentProfile | AgentTeam | null>(null);
  const [agent, setAgent] = useState<AgentDraft>(blankAgent);
  const [team, setTeam] = useState<TeamDraft>(blankTeam);
  const [archive, setArchive] = useState<{ kind: 'agent' | 'team'; item: AgentProfile | AgentTeam } | null>(null);
  const editorRef = useRef<HTMLElement>(null);
  const reload = async () => setMarket(await loadMarket());
  useEffect(() => {
    if (wb.preview) return;
    const controller = new AbortController();
    loadMarket(controller.signal).then(setMarket).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [wb.preview]);
  useEffect(() => { if (editor) { editorRef.current?.scrollIntoView({ block: 'start' }); editorRef.current?.querySelector('input')?.focus(); } }, [editor, editing]);
  const openAgent = (source?: AgentProfile, duplicate = false) => {
    setEditing(source && !source.built_in && !duplicate ? source : null);
    setAgent(source ? { name: duplicate || source.built_in ? `${source.name} copy`.slice(0, 80) : source.name, role: source.role, description: source.description, instructions: source.instructions, skills: source.skills, tools: source.tools } : blankAgent());
    setEditor('agent'); setError(''); setNotice('');
  };
  const openTeam = (source?: AgentTeam) => { setEditing(source ?? null); setTeam(source ? { name: source.name, description: source.description, agent_ids: source.agent_ids, lead_agent_id: source.lead_agent_id } : blankTeam()); setEditor('team'); setError(''); setNotice(''); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const revision = editing ? { expected_revision: editing.revision } : {};
      if (editor === 'agent') await saveAgent({ ...agent, ...revision }, editing?.id);
      else await saveTeam({ ...team, ...revision }, editing?.id);
      setEditor(null); setNotice(`${editor === 'agent' ? 'Agent' : 'Team'} saved. You can assign it to a prompt or project.`);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  };
  const match = (value: { name: string; description?: string }) => `${value.name} ${value.description}`.toLowerCase().includes(search.toLowerCase());
  const agents = market?.agents.filter(a => (tab !== 'custom' || !a.built_in) && match(a)) ?? [];
  const teams = market?.teams.filter(match) ?? [];
  return <div className="market stack">
    <div className="market-intro">
      <div><p className="page-eyebrow">Build your lab group</p><h2>The right minds for your next question.</h2><p>Start with an integrated agent, make it your own, or bring a small team together.</p></div>
      <div className="market-actions"><button className="button button--secondary" disabled={!market || busy} onClick={() => openTeam()}><Users size={16} aria-hidden="true" /> Create team</button><button className="button button--primary" disabled={!market || busy} onClick={() => openAgent()}><Plus size={16} aria-hidden="true" /> Create agent</button></div>
    </div>
    {error && <Alert variant="error" role="alert">{error}</Alert>}
    {notice && <Alert variant="success" role="status">{notice}</Alert>}
    {!market && !error && <p role="status">{wb.preview ? 'Agent editing is available in the live workspace.' : 'Loading your agents…'}</p>}
    {!market && error && <button className="button button--secondary" onClick={() => { setError(''); void reload().catch(e => setError(e.message)); }}>Retry</button>}
    {editor && market && <section className="panel market-editor" ref={editorRef} aria-labelledby="market-editor-title">
      <div className="panel-head"><h2 id="market-editor-title">{editing ? 'Edit' : 'Create'} {editor}</h2><button className="button button--ghost" aria-label="Close editor" disabled={busy} onClick={() => setEditor(null)}><X size={18} /></button></div>
      <form className="panel-body stack" onSubmit={save}><fieldset disabled={busy} className="market-fieldset stack">
        <div className="market-form-grid">
          <label>Name<input className="input" required maxLength={80} value={editor === 'agent' ? agent.name : team.name} onChange={e => editor === 'agent' ? setAgent({ ...agent, name: e.target.value }) : setTeam({ ...team, name: e.target.value })} placeholder={editor === 'agent' ? 'e.g. Electrolyte Researcher' : 'e.g. Battery Literature Team'} /></label>
          {editor === 'agent' && <label>Role<input className="input" required maxLength={80} value={agent.role} onChange={e => setAgent({ ...agent, role: e.target.value })} placeholder="PI, Researcher, Specialist…" /></label>}
        </div>
        <label>Description<textarea className="textarea" maxLength={500} rows={2} value={editor === 'agent' ? agent.description : team.description} onChange={e => editor === 'agent' ? setAgent({ ...agent, description: e.target.value }) : setTeam({ ...team, description: e.target.value })} placeholder="What kind of work is this for?" /></label>
        {editor === 'agent' ? <>
          <fieldset className="market-fieldset"><legend>Skills <span className="field-hint">Choose at least one</span></legend><div className="market-choice-grid">{market.skills.map(skill => <label className="market-check" key={skill.id}><input type="checkbox" checked={agent.skills.includes(skill.id)} onChange={() => setAgent({ ...agent, skills: toggle(agent.skills, skill.id) })} /><span><strong>{skill.name}</strong><small>{skill.description}</small></span></label>)}</div></fieldset>
          <label>Working instructions<textarea className="textarea" maxLength={4000} rows={4} value={agent.instructions} onChange={e => setAgent({ ...agent, instructions: e.target.value })} placeholder="e.g. Focus on lithium-ion electrolytes. Explain assumptions and flag composition aliasing. Prefer concise summaries with exact citations." /></label>
          <fieldset className="market-fieldset"><legend>Tools <span className="field-hint">{agent.tools.length} selected</span></legend><p className="field-hint">Choose integrated tools this agent may use. No tools means advice from the supplied context. Project permissions still apply; teams execute tools through their lead.</p><div className="market-choice-grid market-tools">{market.tools.map(tool => <label className="market-check" key={tool.id}><input type="checkbox" checked={agent.tools.includes(tool.id)} onChange={() => setAgent({ ...agent, tools: toggle(agent.tools, tool.id) })} /><span><strong>{tool.id.replaceAll('_', ' ')}</strong><small>{tool.description}</small></span></label>)}</div></fieldset>
        </> : <>
          <fieldset className="market-fieldset"><legend>Team members <span className="field-hint">{team.agent_ids.length} of 8</span></legend><div className="market-choice-grid">{market.agents.map(member => <label className="market-check" key={member.id}><input type="checkbox" checked={team.agent_ids.includes(member.id)} disabled={!team.agent_ids.includes(member.id) && team.agent_ids.length >= 8} onChange={() => { const ids = toggle(team.agent_ids, member.id); setTeam({ ...team, agent_ids: ids, lead_agent_id: ids.includes(team.lead_agent_id) ? team.lead_agent_id : ids[0] ?? '' }); }} /><span><strong>{member.name}</strong><small>{member.role}</small></span></label>)}</div></fieldset>
          {team.agent_ids.some(id => !market.agents.some(a => a.id === id)) && <Alert variant="warning">This team includes an archived agent. <button type="button" className="text-link" onClick={() => { const ids = team.agent_ids.filter(id => market.agents.some(a => a.id === id)); setTeam({ ...team, agent_ids: ids, lead_agent_id: ids.includes(team.lead_agent_id) ? team.lead_agent_id : ids[0] ?? '' }); }}>Remove unavailable members</button></Alert>}
          <label>Team lead<select className="select" required value={team.lead_agent_id} onChange={e => setTeam({ ...team, lead_agent_id: e.target.value })}><option value="">Choose a team member</option>{market.agents.filter(a => team.agent_ids.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <p className="field-hint">The lead coordinates work using the combined team tools. Members contribute their selected skills. Include a Scientific Reviewer for independently reviewed findings.</p>
        </>}
        <div className="market-actions"><button className="button button--primary" disabled={editor === 'agent' ? !agent.skills.length : !team.agent_ids.length}>{busy ? 'Saving…' : `Save ${editor}`}</button><button type="button" className="button button--ghost" onClick={() => setEditor(null)}>Cancel</button></div>
      </fieldset></form>
    </section>}
    {market && <>
      <div className="market-toolbar"><div className="market-filters" role="group" aria-label="Catalog view">{([['all', 'All agents'], ['custom', 'My agents'], ['teams', 'Teams']] as const).map(([value, label]) => <button key={value} className={`button ${tab === value ? 'button--secondary' : 'button--ghost'}`} aria-pressed={tab === value} onClick={() => setTab(value)}>{label} <span className="market-count">{value === 'teams' ? market.teams.length : value === 'custom' ? market.agents.filter(a => !a.built_in).length : market.agents.length}</span></button>)}</div><label className="market-search">Search catalog<input className="input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find an agent or team" /></label></div>
      {archive && <Alert variant="warning" title={`Archive ${archive.item.name}?`}>Existing runs keep their saved agents. Projects and teams using this item will need a new assignment. <button className="button button--secondary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await (archive.kind === 'agent' ? archiveAgent : archiveTeam)(archive.item.id, archive.item.revision); setArchive(null); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not archive.'); } finally { setBusy(false); } }}>Archive</button> <button className="button button--ghost" disabled={busy} onClick={() => setArchive(null)}>Keep it</button></Alert>}
      <div className="market-grid">{tab === 'teams' ? teams.map(t => <Panel key={t.id} className="market-card" title={<><Users size={20} aria-hidden="true" /> {t.name}</>} description={t.description}>
        <div className="market-members">{t.agent_ids.map(id => <span className="badge" key={id}>{market.agents.find(a => a.id === id)?.name ?? 'Archived agent'}{id === t.lead_agent_id ? ' · lead' : ''}</span>)}</div>
        <div className="market-card-actions"><Link className="button button--primary button--sm" href={`/ask?team=${t.id}`}>Assign a task</Link><button className="button button--ghost button--sm" disabled={busy} onClick={() => openTeam(t)}>Edit</button><button className="button button--ghost button--sm" disabled={busy} onClick={() => setArchive({ kind: 'team', item: t })}>Archive</button></div>
      </Panel>) : agents.map(a => <Panel key={a.id} className="market-card" title={<><Bot size={20} aria-hidden="true" /> {a.name}</>} aside={<Badge state={a.built_in ? 'Built-in' : 'Custom'} />} description={a.description}>
        <p className="market-role">{a.role}</p><div className="market-members">{a.skills.map(s => <span className="badge" key={s}>{market.skills.find(skill => skill.id === s)?.name ?? s}</span>)}</div><p className="field-hint">{a.tools.length} tools · {a.built_in ? 'Ready to customize' : `Revision ${a.revision}`}</p>
        <div className="market-card-actions"><Link className="button button--primary button--sm" href={`/ask?agent=${a.id}`}>Assign a task</Link><button className="button button--ghost button--sm" disabled={busy} onClick={() => openAgent(a)}>{a.built_in ? 'Customize' : 'Edit'}</button>{!a.built_in && <><button className="button button--ghost button--sm" disabled={busy} aria-label={`Duplicate ${a.name}`} onClick={() => openAgent(a, true)}><Copy size={15} /></button><button className="button button--ghost button--sm" disabled={busy} onClick={() => setArchive({ kind: 'agent', item: a })}>Archive</button></>}</div>
      </Panel>)}</div>
      {(tab === 'teams' ? teams : agents).length === 0 && <Panel title={search ? 'No matching results' : tab === 'teams' ? 'Your first team starts here' : 'Make an agent your own'} description={search ? 'Try a different name or clear the search.' : 'Create one above, or customize a built-in agent to get started.'}>{null}</Panel>}
      <p className="field-hint">Saved privately in this workspace. Names and instructions guide behavior; tool access always stays within project permissions.</p>
    </>}
  </div>;
}

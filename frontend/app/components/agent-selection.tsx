'use client';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { loadMarket, loadAssignment, assignProject, selectionKey, fromKey, type AgentMarket, type AgentSelection } from '../lib/agent-market';

/** Null inherits the project default; explicit automatic overrides it. */
export function AgentSelector({ projectId, value, onChange, disabled = false, preview = false, projectOnly = false }: {
  projectId: string; value: AgentSelection | null; onChange: (value: AgentSelection | null) => void;
  disabled?: boolean; preview?: boolean; projectOnly?: boolean;
}) {
  const id = useId();
  const [market, setMarket] = useState<AgentMarket | null>(null);
  const [saved, setSaved] = useState<AgentSelection>({ kind: 'automatic', id: null, exclusive: true });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    setMarket(null); setError(''); setNotice('');
    Promise.all([loadMarket(controller.signal), projectId ? loadAssignment(projectId, controller.signal) : Promise.resolve(null)])
      .then(([catalog, assignment]) => {
        if (controller.signal.aborted) return;
        setMarket(catalog); setSaved(assignment?.selection ?? { kind: 'automatic', id: null, exclusive: true });
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [projectId, preview]);
  const name = (selection: AgentSelection) => selection.kind === 'automatic' ? 'Automatic'
    : (selection.kind === 'agent' ? market?.agents : market?.teams)?.find(a => a.id === selection.id)?.name ?? 'Unavailable assignment';
  const effective = value ?? saved;
  const missing = effective.kind !== 'automatic' && market && !(effective.kind === 'agent' ? market.agents : market.teams).some(a => a.id === effective.id);
  return <div className="agent-selector">
    <div className="agent-selector-row">
      <label htmlFor={id}>{projectOnly ? 'Project agents' : 'Assign to'}</label>
      <select className="select" id={id} value={selectionKey(value)} disabled={disabled || !market || saving}
        onChange={e => { onChange(fromKey(e.target.value, value?.exclusive ?? true)); setNotice(''); }}>
        <option value="project">Project default · {name(saved)}</option>
        <option value="automatic">Automatic · built-in lab group</option>
        <optgroup label="Agents">{market?.agents.map(a => <option key={a.id} value={`agent:${a.id}`}>{a.name} · {a.role}</option>)}</optgroup>
        <optgroup label="Teams">{market?.teams.map(t => <option key={t.id} value={`team:${t.id}`}>{t.name}</option>)}</optgroup>
        {missing && value && <option value={selectionKey(value)}>Unavailable assignment</option>}
      </select>
      <Link className="text-link" href="/agent-market">Manage agents</Link>
    </div>
    {value && value.kind !== 'automatic' && <label className="market-check market-check--compact">
      <input type="checkbox" checked={value.exclusive ?? true} disabled={disabled || saving} onChange={e => onChange({ ...value, exclusive: e.target.checked })} />
      Only use {value.kind === 'team' ? 'this team' : 'this agent'}
    </label>}
    {!value && saved.kind !== 'automatic' && <p className="field-hint">{saved.exclusive ? 'Only the assigned agents will work on new requests.' : 'The assigned agents may use the built-in specialists.'}</p>}
    {value?.kind !== 'automatic' && value?.exclusive === false && <p className="field-hint">Built-in agents and their tools may also be used.</p>}
    {projectId && value && <button type="button" className="button button--ghost button--sm" disabled={disabled || saving || !!missing} onClick={async () => {
      setSaving(true); setError('');
      try { const result = await assignProject(projectId, value); setSaved(result.selection); onChange(null); setNotice('Project default saved for new requests.'); }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not save project assignment.'); }
      finally { setSaving(false); }
    }}>{saving ? 'Saving…' : 'Use as project default'}</button>}
    {missing && <p className="field-hint" role="alert">This assignment is unavailable. Choose another agent or team before sending.</p>}
    {error && <p className="field-hint" role="status">Could not load or save agents: {error}</p>}
    {notice && <p className="field-hint" role="status">{notice}</p>}
  </div>;
}

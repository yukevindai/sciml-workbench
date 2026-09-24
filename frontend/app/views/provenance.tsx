'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Layers } from 'lucide-react';
import type { Workbench } from '../lib/context';
import { formatDate, shortId } from '../lib/format';
import { kinds } from '../lib/types';
import { artifactHref, artifactLabel, buildLineage, KIND_LABEL, neighbourhood, type Lineage, type LineageNode } from '../lib/lineage';
import { Alert, EmptyState, JsonBox, Panel } from '../components/ui';

const GRAPH_LIMIT = 60;
const W = 190, H = 46, GAP_X = 56, GAP_Y = 14;

function Ref({ wb, lineage, id, onSelect }: { wb: Workbench; lineage: Lineage; id: string; onSelect: (id: string) => void }) {
  const target = lineage.nodes.get(id)?.artifact;
  if (!target) return <span className="lineage-missing" title={id}>Missing: {shortId(id)} (not in this project listing)</span>;
  return <button type="button" className="text-link link-button" title={id} onClick={() => onSelect(id)}>
    {KIND_LABEL[target.kind] ?? target.kind} {shortId(id)}
  </button>;
}

/** Decorative layered drawing; the table below is the complete accessible equivalent. */
function Graph({ nodes, selected, onSelect }: { nodes: LineageNode[]; selected: string; onSelect: (id: string) => void }) {
  const ids = new Set(nodes.map(n => n.id));
  const columns = new Map<number, LineageNode[]>();
  for (const n of [...nodes].sort((a, b) => (a.artifact?.created_at ?? '').localeCompare(b.artifact?.created_at ?? '') || a.id.localeCompare(b.id))) {
    columns.set(n.depth, [...(columns.get(n.depth) ?? []), n]);
  }
  const depths = [...columns.keys()].sort((a, b) => a - b);
  const position = new Map<string, { x: number; y: number }>();
  depths.forEach((depth, column) => columns.get(depth)!.forEach((n, row) => position.set(n.id, { x: column * (W + GAP_X), y: row * (H + GAP_Y) })));
  const width = depths.length * (W + GAP_X) - GAP_X;
  const height = Math.max(...[...columns.values()].map(c => c.length)) * (H + GAP_Y) - GAP_Y;
  return <div className="lineage-graph" aria-hidden="true">
    <svg width={width + 4} height={height + 4} viewBox={`-2 -2 ${width + 4} ${height + 4}`}>
      {nodes.flatMap(n => n.parents.filter(p => ids.has(p)).map(p => {
        const from = position.get(p)!, to = position.get(n.id)!;
        return <path key={`${p}->${n.id}`} className="lineage-edge" d={`M${from.x + W},${from.y + H / 2} C${from.x + W + GAP_X / 2},${from.y + H / 2} ${to.x - GAP_X / 2},${to.y + H / 2} ${to.x},${to.y + H / 2}`} />;
      }))}
      {nodes.map(n => {
        const { x, y } = position.get(n.id)!;
        const label = n.artifact ? artifactLabel(n.artifact) : 'Missing reference';
        return <g key={n.id} className={`lineage-node${n.artifact ? '' : ' lineage-node--missing'}${n.id === selected ? ' lineage-node--selected' : ''}`}
          transform={`translate(${x},${y})`} onClick={() => onSelect(n.id)}>
          <rect width={W} height={H} rx={6} />
          <text x={10} y={18} className="lineage-node-kind">{n.artifact ? KIND_LABEL[n.artifact.kind] ?? n.artifact.kind : 'Missing'} · {shortId(n.id)}</text>
          <text x={10} y={35} className="lineage-node-label">{label.length > 26 ? label.slice(0, 25) + '…' : label}</text>
        </g>;
      })}
    </svg>
  </div>;
}

export function ProvenanceView({ wb, requestedArtifactId }: { wb: Workbench; requestedArtifactId?: string }) {
  const lineage = useMemo(() => buildLineage(wb.artifacts), [wb.artifacts]);
  const [selected, setSelected] = useState(requestedArtifactId ?? '');
  const activities = kinds(wb.artifacts, 'provenance');
  const entries = [...lineage.nodes.values()].filter(n => n.artifact?.kind !== 'provenance')
    .sort((a, b) => a.depth - b.depth || (a.artifact?.created_at ?? '').localeCompare(b.artifact?.created_at ?? '') || a.id.localeCompare(b.id));
  const scope = selected && lineage.nodes.has(selected) ? neighbourhood(lineage, selected) : null;
  const shown = scope ? entries.filter(n => scope.has(n.id)) : entries;
  const select = (id: string) => setSelected(id);
  useEffect(() => {
    if (!requestedArtifactId || !lineage.nodes.get(requestedArtifactId)?.artifact) return;
    document.getElementById('lineage-selected')?.scrollIntoView({ block: 'start' });
  }, [requestedArtifactId, lineage]);

  if (!wb.artifacts.length) return <Panel title="Artifact lineage">
    <EmptyState icon={Layers} title="No lineage yet">Upload a dataset or ingest a document, and each step will be recorded here as it happens.</EmptyState>
  </Panel>;

  return <>
    <Panel title="Artifact lineage" description="Each result lists the exact artifacts it was derived from. Links resolve within this project; a reference that does not resolve is shown as missing, never hidden or replaced."
      aside={<span className="badge">{entries.filter(n => n.artifact).length} artifacts</span>}>
      <div className="stack">
        {requestedArtifactId && !lineage.nodes.get(requestedArtifactId)?.artifact && <Alert variant="error" title="Requested artifact unavailable">
          This project has no artifact with ID {requestedArtifactId}. No other artifact was selected.
        </Alert>}
        {lineage.broken.length > 0 && <Alert variant="error" title={`${lineage.broken.length} broken reference${lineage.broken.length === 1 ? '' : 's'}`}>
          {lineage.broken.map(b => `${shortId(b.from)} → ${b.to} (${b.via})`).join('; ')}. These references stay visible. Nothing was substituted for them.
        </Alert>}
        {lineage.cyclic && <Alert variant="error" title="Cyclic dependency">The recorded parents form a cycle. Depth-based layout is approximate.</Alert>}

        <div className="cluster" id="lineage-selected">
          <label className="field-label" htmlFor="lineage-focus">Focus on</label>
          <select id="lineage-focus" className="select" value={scope ? selected : ''} onChange={event => setSelected(event.target.value)}>
            <option value="">Whole project</option>
            {entries.filter(n => n.artifact).map(n => <option key={n.id} value={n.id}>{KIND_LABEL[n.artifact!.kind] ?? n.artifact!.kind} · {artifactLabel(n.artifact!)} · {shortId(n.id)}</option>)}
          </select>
          {scope && <span className="field-hint">Showing {shown.length} artifacts it depends on or that depend on it.</span>}
        </div>

        {shown.length <= GRAPH_LIMIT
          ? <Graph nodes={shown} selected={selected} onSelect={select} />
          : <p className="field-hint">The graph is drawn for up to {GRAPH_LIMIT} artifacts. Focus on one artifact to draw its lineage; the table lists everything.</p>}

        <div className="table-scroll" tabIndex={0} role="region" aria-label="Lineage table">
          <table className="table lineage-table"><caption>Graph alternative. &ldquo;Depends on&rdquo; lists recorded parents; &ldquo;Used by&rdquo; lists artifacts that record this one as a parent.</caption>
            <thead><tr><th scope="col">Artifact</th><th scope="col">Created</th><th scope="col">Depends on</th><th scope="col">Used by</th></tr></thead>
            <tbody>{shown.map(n => {
              const href = n.artifact ? artifactHref(wb.projectId, n.artifact) : null;
              return <tr key={n.id} aria-current={n.id === selected ? 'true' : undefined} className={n.artifact ? undefined : 'lineage-row--missing'}>
                <th scope="row">{n.artifact ? <>
                  <span className="dim">{KIND_LABEL[n.artifact.kind] ?? n.artifact.kind}</span><br />
                  {href ? <Link className="text-link" href={href}>{artifactLabel(n.artifact)}</Link> : artifactLabel(n.artifact)}<br />
                  <button type="button" className="text-link link-button mono" onClick={() => select(n.id)} aria-label={`Focus lineage on ${n.id}`}>{n.id}</button>
                </> : <span className="lineage-missing">Missing reference<br /><span className="mono">{n.id}</span></span>}</th>
                <td>{n.artifact ? formatDate(n.artifact.created_at) : 'Unknown'}</td>
                <td>{n.parents.length ? <ul>{n.parents.map(p => <li key={p}><Ref wb={wb} lineage={lineage} id={p} onSelect={select} /></li>)}</ul> : n.artifact ? 'Original input' : '—'}</td>
                <td>{n.children.filter(c => lineage.nodes.get(c)?.artifact?.kind !== 'provenance').length
                  ? <ul>{n.children.filter(c => lineage.nodes.get(c)?.artifact?.kind !== 'provenance').map(c => <li key={c}><Ref wb={wb} lineage={lineage} id={c} onSelect={select} /></li>)}</ul> : 'Nothing yet'}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </div>
    </Panel>

    <Panel title="Activity records" description="Each operation's recorded inputs and outputs. Source assertions remain user-supplied and are never independently verified.">
      {activities.length === 0 ? <p>No activity records.</p> : <ul>
        {[...activities].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(record => <li className="lineage lineage--plain" key={record.id}>
          <div className="lineage-body">
            <div><span className="lineage-title">{record.activity.replaceAll('_', ' ')}</span>
              <span className="meta-list"><span>{formatDate(record.created_at)}</span><span className="meta-id">{record.id}</span></span></div>
            <div className="lineage-flow">
              <span className="dim">Inputs</span>
              <span className="lineage-ids">{record.inputs.length ? record.inputs.map(id => <Ref key={id} wb={wb} lineage={lineage} id={id} onSelect={select} />) : <span className="dim">original upload</span>}</span>
              <ArrowRight size={13} aria-hidden="true" className="dim" />
              <span className="dim">Outputs</span>
              <span className="lineage-ids">{record.outputs.map(id => <Ref key={id} wb={wb} lineage={lineage} id={id} onSelect={select} />)}</span>
            </div>
            <JsonBox value={record} summary="Inspect parameters and full IDs" />
          </div>
        </li>)}
      </ul>}
    </Panel>
  </>;
}

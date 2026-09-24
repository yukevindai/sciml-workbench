import type { Artifact } from './types';
import { auditHref } from './audit';
import { splitHref } from './split';
import { benchmarkHref } from './benchmark';
import { claimSetHref, evidenceHref } from './evidence';
import { failureHref } from './failure';

export function reportHref(project: string, report: string) {
  return `/report?project=${encodeURIComponent(project)}&report=${encodeURIComponent(report)}#report-${encodeURIComponent(report)}`;
}

export function provenanceHref(project: string, artifact: string) {
  return `/provenance?project=${encodeURIComponent(project)}&artifact=${encodeURIComponent(artifact)}#lineage-selected`;
}

export const KIND_LABEL: Record<string, string> = {
  dataset: 'Dataset', audit: 'Audit', split: 'Split', benchmark_preview: 'Benchmark', benchmark: 'Benchmark',
  evidence: 'Evidence', failure: 'Failure record', provenance: 'Activity record', report: 'Report',
  evaluation_protocol: 'Sealed comparison', claim_set: 'Claim set', agent_execution: 'Agent execution record',
};

export function artifactLabel(a: Artifact): string {
  switch (a.kind) {
    case 'dataset': return `${a.filename} · ${a.rows} rows`;
    case 'audit': return `Audit of ${a.dataset_id}`;
    case 'split': return typeof a.config.strategy === 'string' ? `${a.config.strategy} split` : 'Split';
    case 'benchmark_preview': case 'benchmark': return `${a.model} baseline · seed ${a.seed} · ${a.status}`;
    case 'evidence': return a.title;
    case 'failure': return a.reason;
    case 'claim_set': return `${a.claims.length} claim${a.claims.length === 1 ? '' : 's'} · run ${a.run_id}`;
    case 'evaluation_protocol': return `Comparison on split ${a.split_id}`;
    case 'agent_execution': return a.objective;
    case 'provenance': return a.activity.replaceAll('_', ' ');
    case 'report': return `Archive ${a.sha256.slice(0, 12)}`;
  }
}

export function artifactHref(project: string, a: Pick<Artifact, 'id' | 'kind'>): string | null {
  switch (a.kind) {
    case 'audit': return auditHref(project, a.id);
    case 'split': return splitHref(project, a.id);
    case 'benchmark_preview': case 'benchmark': return benchmarkHref(project, a.id);
    case 'evidence': return evidenceHref(project, a.id);
    case 'claim_set': return claimSetHref(project, a.id);
    case 'failure': return failureHref(project, a.id);
    case 'report': return reportHref(project, a.id);
    default: return null;
  }
}

export type LineageNode = { id: string; artifact: Artifact | null; parents: string[]; children: string[]; depth: number };
export type BrokenReference = { from: string; to: string; via: 'parent' | 'activity input' | 'activity output' };
export type Lineage = { nodes: Map<string, LineageNode>; broken: BrokenReference[]; cyclic: boolean };

/** Dependency graph from each artifact's recorded parents. References that do not
 *  resolve in this project listing stay as explicit missing nodes; nothing is dropped. */
export function buildLineage(artifacts: Artifact[]): Lineage {
  const nodes = new Map<string, LineageNode>();
  const node = (id: string) => {
    let value = nodes.get(id);
    if (!value) { value = { id, artifact: null, parents: [], children: [], depth: 0 }; nodes.set(id, value); }
    return value;
  };
  for (const a of artifacts) node(a.id).artifact = a;
  const broken: BrokenReference[] = [];
  const present = new Set(artifacts.map(a => a.id));
  for (const a of artifacts) {
    for (const parent of new Set(a.parents)) {
      node(a.id).parents.push(parent);
      node(parent).children.push(a.id);
      if (!present.has(parent)) broken.push({ from: a.id, to: parent, via: 'parent' });
    }
    if (a.kind === 'provenance') {
      for (const id of a.inputs) if (!present.has(id)) broken.push({ from: a.id, to: id, via: 'activity input' });
      for (const id of a.outputs) if (!present.has(id)) broken.push({ from: a.id, to: id, via: 'activity output' });
    }
  }
  // Longest-path depth for layout; a cycle is reported instead of looping.
  let cyclic = false;
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): number => {
    const mark = state.get(id);
    const current = nodes.get(id)!;
    if (mark === 2) return current.depth;
    if (mark === 1) { cyclic = true; return 0; }
    state.set(id, 1);
    current.depth = current.parents.length ? Math.max(...current.parents.map(p => visit(p) + 1)) : 0;
    state.set(id, 2);
    return current.depth;
  };
  for (const id of nodes.keys()) visit(id);
  return { nodes, broken, cyclic };
}

/** The selected node, everything it depends on, and everything derived from it. */
export function neighbourhood(lineage: Lineage, id: string): Set<string> {
  const out = new Set<string>([id]);
  const walk = (start: string, next: (n: LineageNode) => string[]) => {
    const stack = [start];
    while (stack.length) {
      const current = lineage.nodes.get(stack.pop()!);
      if (!current) continue;
      for (const other of next(current)) if (!out.has(other)) { out.add(other); stack.push(other); }
    }
  };
  walk(id, n => n.parents);
  walk(id, n => n.children);
  return out;
}

import { api, json } from './api';
import { parseAgentMarket, parseAgentProfile, parseAgentTeam, parseProjectAgentSelection } from './decode';
import type { AgentSelection } from './generated/http';

export type { AgentMarket, AgentProfile, AgentTeam, AgentSelection } from './generated/http';
export const loadMarket = (signal?: AbortSignal) => api('agent-market', parseAgentMarket, { signal }, 30_000);
export const loadAssignment = (pid: string, signal?: AbortSignal) =>
  api(`projects/${pid}/agent-selection`, parseProjectAgentSelection, { signal }, 30_000);
export const assignProject = (pid: string, selection: AgentSelection) =>
  api(`projects/${pid}/agent-selection`, parseProjectAgentSelection, json(selection), 30_000);
export const saveAgent = (body: unknown, id?: string) =>
  api(`agent-market/agents${id ? `/${id}` : ''}`, parseAgentProfile, json(body), 30_000);
export const saveTeam = (body: unknown, id?: string) =>
  api(`agent-market/teams${id ? `/${id}` : ''}`, parseAgentTeam, json(body), 30_000);
export const archiveAgent = (id: string, revision: number) =>
  api(`agent-market/agents/${id}/archive`, parseAgentProfile, json({ expected_revision: revision }), 30_000);
export const archiveTeam = (id: string, revision: number) =>
  api(`agent-market/teams/${id}/archive`, parseAgentTeam, json({ expected_revision: revision }), 30_000);
export const selectionKey = (selection: AgentSelection | null) => selection ? `${selection.kind}${selection.id ? `:${selection.id}` : ''}` : 'project';
export function fromKey(key: string, exclusive = true): AgentSelection | null {
  if (key === 'project') return null;
  if (key === 'automatic') return { kind: 'automatic', id: null, exclusive };
  const [kind, id] = key.split(':');
  return { kind: kind as 'agent' | 'team', id, exclusive };
}

'use client';

import { Bot, GitBranch, Wrench } from 'lucide-react';
import type { ResearchRun, RunDetail, RunEvent } from '../lib/generated/http';
import { PHASE, TOOL_LABEL } from '../lib/ask';
import { Badge, Disclosure } from './ui';

const ROLES: Record<string, string> = {
  data_evaluation: 'Data analyst', evidence: 'Evidence researcher',
  failure_memory: 'Research memory', scientific_reviewer: 'Scientific reviewer',
};

/** Only descriptive updates survive; ledger bookkeeping remains in the saved record. */
export function meaningfulUpdates(events: RunEvent[]) {
  const seen = new Set<string>();
  return events.filter(event => {
    const text = event.summary?.trim();
    if (!text || event.event_type === 'usage_changed' || event.event_type === 'accepted'
      || event.event_type === 'result_published' || event.action_id
      || /^(request accepted|state changed|usage updated|update|running|queued|completed)[.!]?$/i.test(text)) return false;
    const key = text.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function AgentActivity({ run, detail, events }: { run: ResearchRun; detail: RunDetail | null; events: RunEvent[] }) {
  const assignments = detail?.assignments ?? [];
  const actions = detail?.actions ?? [];
  const updates = meaningfulUpdates(events).filter(event => event.summary !== detail?.plan?.rationale_summary);
  return <Disclosure summary={<span className="team-summary"><GitBranch size={16} aria-hidden="true" />
    <strong>Research team</strong><span>Orchestrator{assignments.length ? ` + ${assignments.length} specialist${assignments.length === 1 ? '' : 's'}` : ''}</span>
  </span>}>
    <div className="agent-card">
      <div className="agent-card-head"><Bot size={17} aria-hidden="true" /><strong>Orchestrator</strong><Badge state={run.state} /></div>
      <p>{detail?.answer ? 'Answered directly from general knowledge; no tools or specialists were needed.'
        : detail?.plan?.rationale_summary ?? (run.state === 'completed' ? 'Finished coordinating this request.' : PHASE[run.state].detail)}</p>
      {updates.length > 0 && <ul className="agent-updates">{updates.map(event => <li key={event.sequence}>{event.summary}</li>)}</ul>}
    </div>
    {assignments.map((assignment, index) => <div className="agent-card agent-card--specialist" key={assignment.id}>
      <div className="agent-card-head"><GitBranch size={17} aria-hidden="true" />
        <strong>{ROLES[assignment.role] ?? assignment.role} <span className="agent-number">{index + 1}</span></strong>
        <Badge state={assignment.state} />
      </div>
      <p>{assignment.objective}</p>
      <Disclosure summary="Assignment and findings">
        <p className="field-hint">Delegated by the orchestrator · plan {assignment.plan_revision}</p>
        {assignment.findings?.length > 0 && <ul className="agent-updates">{assignment.findings.map((finding, i) => <li key={i}>{finding}</li>)}</ul>}
        {assignment.uncertainty && <p><strong>Uncertainty:</strong> {assignment.uncertainty}</p>}
        {assignment.unresolved_issues?.length > 0 && <div><strong>Open issues</strong><ul className="agent-updates">{assignment.unresolved_issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul></div>}
        {assignment.recommended_actions?.length > 0 && <div><strong>Recommended next steps</strong><ul className="agent-updates">{assignment.recommended_actions.map((action, i) => <li key={i}>{action}</li>)}</ul></div>}
        {!assignment.uncertainty && !assignment.findings?.length && <p className="field-hint">{assignment.state === 'completed' ? 'No findings were recorded.' : 'Findings will appear when this assignment reports back.'}</p>}
        <p className="field-hint">Specialist findings are advisory; the orchestrator decides the next action.</p>
      </Disclosure>
    </div>)}
    {actions.length > 0 && <section className="agent-tools" aria-label="Tool activity">
      <h3><Wrench size={15} aria-hidden="true" /> Tools and outcomes</h3>
      <ol>{actions.map((action, index) => <li key={action.id}>
        <span className="agent-number">{index + 1}</span>
        <div><strong>{action.state === 'completed' ? TOOL_LABEL[action.tool] ?? action.tool.replaceAll('_', ' ') : action.tool.replaceAll('_', ' ')}</strong>
          <p className="field-hint">{action.assignment_id ? ROLES[assignments.find(a => a.id === action.assignment_id)?.role ?? ''] ?? 'Specialist' : 'Orchestrator'}
            {action.attempt > 1 ? ` · attempt ${action.attempt}` : ''}
            {action.artifact_ids.length ? ` · ${action.artifact_ids.length} saved result${action.artifact_ids.length === 1 ? '' : 's'}` : ''}
            {action.error_code ? ` · ${action.error_code.replaceAll('_', ' ').toLowerCase()}` : ''}</p>
        </div><Badge state={action.state} />
      </li>)}</ol>
    </section>}
    {!detail && <p className="field-hint">Loading recorded agent activity…</p>}
  </Disclosure>;
}

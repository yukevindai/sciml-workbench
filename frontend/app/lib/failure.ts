import type { ExternalReceiptProjection, JobDetail } from './generated/http';
import type { FailureArtifact } from './types';

export function failureHref(project: string, failure: string) {
  return `/failure-memory?project=${encodeURIComponent(project)}&failure=${encodeURIComponent(failure)}#failure-${encodeURIComponent(failure)}`;
}

export function assessRunHref(project: string, benchmark: string) {
  return `/failure-memory?project=${encodeURIComponent(project)}&benchmark=${encodeURIComponent(benchmark)}#assess`;
}

export type Origin = 'human' | 'agent' | 'legacy';

export type FailureView = {
  origin: Origin;
  /** Short attribution, e.g. "Researcher" or "Agent run r · action a". */
  actor: string;
  actorDetails: [string, string][];
  observation: { label: string; details: [string, string][] };
  reason: string;
  uncertainty: string | null;
  hypotheses: string[];
  sourceJobId: string | null;
  externalProjectId: string;
  externalRecordId: string;
  /** The workbench job ID sent as the idempotent upstream import ID, when recorded. */
  externalId: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Failure 1.0 predates actor attribution. It is a manual researcher assessment by construction, so it is never shown as agent-recorded. */
export function describeFailure(value: FailureArtifact): FailureView {
  if (value.schema_version === '1.0') {
    const inner = isRecord(value.record) && isRecord(value.record.record) ? value.record.record : {};
    return {
      origin: 'legacy', actor: 'Researcher (manual record; actor details not stored)', actorDetails: [],
      observation: { label: 'Researcher assessment', details: [] },
      reason: value.reason,
      uncertainty: typeof inner.uncertainty_notes === 'string' && inner.uncertainty_notes.trim() ? inner.uncertainty_notes : null,
      hypotheses: [], sourceJobId: null,
      externalProjectId: value.external_project_id, externalRecordId: value.external_record_id, externalId: null,
    };
  }
  const { actor, observation } = value;
  const actorDetails: [string, string][] = actor.kind === 'human'
    ? [['Operator session', actor.operator_session_reference]]
    : [['Research run', actor.run_id], ['Action', actor.action_id], ['Assignment', actor.assignment_id ?? 'Coordinator (none)'],
      ['Provider / model', `${actor.provider} / ${actor.model}`], ['Prompt version', actor.prompt_version],
      ['Policy', `${actor.policy.policy_id} revision ${actor.policy.revision} · rule ${actor.policy_rule_id}`]];
  const described = observation.kind === 'execution_failure'
    ? { label: 'Execution failure', details: [['Error code', observation.error_code], ['Recorded error', observation.observed_error]] as [string, string][] }
    : observation.kind === 'criterion_missed'
      ? { label: 'Missed predeclared criterion', details: [
        ['Criterion', `${observation.criterion_id} (protocol ${observation.protocol_id}, revision ${observation.protocol_revision})`],
        ['Metric', `${observation.metric.field_path} · ${observation.metric.partition}`],
        ['Observed', String(observation.metric.value) + (observation.metric.units ? ` ${observation.metric.units}` : '')],
        ['Required', `${COMPARISON[observation.success_comparison]} ${observation.threshold}`],
      ] as [string, string][] }
      : { label: 'Researcher assessment', details: [['Statement', observation.statement]] as [string, string][] };
  return {
    origin: actor.kind, actor: actor.kind === 'human' ? 'Researcher' : `Agent run ${actor.run_id} · action ${actor.action_id}`,
    actorDetails, observation: described, reason: value.reason, uncertainty: value.uncertainty_notes,
    hypotheses: value.causal_hypotheses, sourceJobId: value.source_job_id,
    externalProjectId: value.receipt.external_project_id, externalRecordId: value.receipt.external_record_id,
    externalId: value.receipt.external_id,
  };
}

const COMPARISON = { lt: 'less than', lte: 'at most', gt: 'greater than', gte: 'at least' } as const;

export type ReceiptStatus = { label: string; tone: string; description: string };

/** Unknown is never collapsed into confirmed or failed: the import may or may not exist upstream. */
export function receiptStatus(job: JobDetail): ReceiptStatus {
  const receipt: ExternalReceiptProjection | null | undefined = job.external_receipt;
  if (!receipt) {
    return job.state === 'queued' || job.state === 'running'
      ? { label: 'Not yet journaled', tone: 'badge--info', description: 'The import has not been prepared yet.' }
      : { label: 'No receipt recorded', tone: '', description: 'This job has no import journal (for example, a legacy job or one rejected before preparation). No upstream record is assumed.' };
  }
  if (receipt.state === 'confirmed') {
    return receipt.artifact_id
      ? { label: 'Confirmed', tone: 'badge--success', description: `Failure Memory confirmed record ${receipt.external_record_id} and it is published in this project.` }
      : { label: 'Confirmed, not yet published', tone: 'badge--warning', description: `Failure Memory confirmed record ${receipt.external_record_id}, but no workbench record is linked yet. Automatic recovery can publish it without importing again.` };
  }
  if (receipt.state === 'unknown') {
    return { label: 'Outcome unknown', tone: 'badge--danger', description: 'The import was sent but no confirmation was saved. It may or may not exist in Failure Memory. Reconciliation repeats the exact original request; submitting a new assessment does not resolve it.' };
  }
  return { label: 'Prepared, not sent', tone: 'badge--info', description: 'The exact request is saved but has not been submitted to Failure Memory.' };
}

/** A stable request key per draft: retries and double clicks reuse it; any edit starts a new request. */
export function draftFingerprint(benchmarkId: string, reason: string, uncertainty: string) {
  return JSON.stringify([benchmarkId, reason, uncertainty]);
}

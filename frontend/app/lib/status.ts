import type { ResearchRun } from './generated/http';
import type { JobState } from './types';

export type ExecutionState = ResearchRun['state'] | JobState;
type StatusDisplay = { label: string; tone: string; description: string };

/** Shared display vocabulary; a terminal state does not establish scientific validity. */
export const EXECUTION_STATUS = {
  queued: { label: 'queued', tone: 'badge--info', description: 'Accepted and waiting to start.' },
  running: { label: 'running', tone: 'badge--info', description: 'Work is in progress.' },
  waiting_for_job: { label: 'waiting for job', tone: 'badge--info', description: 'Waiting for a scientific job to finish.' },
  waiting_for_input: { label: 'waiting for input', tone: 'badge--warning', description: 'A response is needed before work can continue.' },
  paused: { label: 'paused', tone: 'badge--warning', description: 'Execution is paused.' },
  completed: { label: 'completed', tone: 'badge--success', description: 'Research execution finished. Inspect the results and their limitations.' },
  partially_completed: { label: 'partially completed', tone: 'badge--warning', description: 'Some work finished; the full objective was not completed.' },
  succeeded: { label: 'succeeded', tone: 'badge--success', description: 'The job finished successfully. This does not establish scientific validity.' },
  failed: { label: 'failed', tone: 'badge--danger', description: 'Execution failed. Available artifacts may still be useful.' },
  cancelled: { label: 'cancelled', tone: '', description: 'Execution was cancelled.' },
} satisfies Record<ExecutionState, StatusDisplay>;

export function executionStatus(state: string): StatusDisplay | undefined {
  return Object.hasOwn(EXECUTION_STATUS, state)
    ? EXECUTION_STATUS[state as ExecutionState] : undefined;
}

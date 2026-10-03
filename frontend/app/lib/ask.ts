import type { AgentSelection } from './generated/http';
import { api, ApiError } from './api';
import { parseExecutionPolicy, parseMaterial, parseMaterials, parseProject } from './decode';
import type { EffectivePolicy, ExecutionPolicySummary, MaterialResponse, ResearchRun } from './generated/http';
import type { Project } from './types';
import { authorized, runInput, scopeItems, submitRun, type ScopeItem } from './runs';

/* The simple "ask" flow. Everything the manual Research panel asks a person to
   do by hand (make a project, attach inputs, check permissions, submit) happens
   here in one step, using the same server routes and the same safety checks. */

const READ_TIMEOUT = 30_000;
const UPLOAD_TIMEOUT = 60_000;
export const MAX_PDF = 10 * 1024 * 1024;
/** Policies the server grants automatically carry this ID (backend auto_policy.py). */
export const AUTO_POLICY_ID = 'auto-project';
/** Per-request allowance under an automatic policy; its project totals are larger and cumulative. */
const MODEL_REQUESTS = 40;
export const RUN_LIMITS: EffectivePolicy['limits'] = {
  model_tokens: 400_000, model_requests: MODEL_REQUESTS, tool_calls: 80, coordinator_iterations: 40,
  specialist_assignments: MODEL_REQUESTS, specialist_concurrency: 2, delegation_depth: 1, review_rounds: 1,
  scientific_attempts: 8, active_seconds: 1800, transient_retries: 4,
  finalization_model_tokens: 40_000, finalization_scientific_attempts: 0,
};

export const SUGGESTIONS = [
  { label: 'Check my data for problems', prompt: 'Check the attached spreadsheet for problems such as missing values, duplicate rows and unusual numbers. Explain what you find in plain language. Do not build any models.' },
  { label: 'Build and compare simple models', prompt: 'Check the attached data, keep part of it aside for a fair test, then build and compare the simple prediction models that are available. Tell me which one did better on the held-out data.' },
  { label: 'Pull key facts from a paper', prompt: 'Read the attached PDF and quote the passages that describe how the measurements were made. Point out anything that is missing or unclear.' },
] as const;

export class AskBlocked extends Error {}

/** The first words of a request, as a readable project name. */
export function projectName(prompt: string): string {
  const words = prompt.trim().replace(/\s+/g, ' ');
  return words.length <= 60 ? words : `${words.slice(0, 57).replace(/\s+\S*$/, '')}…`;
}

export function acceptedFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const pdf = file.type === 'application/pdf' || name.endsWith('.pdf');
  const csv = file.type === 'text/csv' || name.endsWith('.csv');
  if (!pdf && !csv) return `${file.name} isn’t a CSV spreadsheet or a PDF, so it wasn’t added.`;
  if (!file.size) return `${file.name} is empty, so it wasn’t added.`;
  if (pdf && file.size > MAX_PDF) return `${file.name} is larger than 10 MB, so it wasn’t added.`;
  return null;
}

export async function createProject(prompt: string): Promise<Project> {
  return api('projects', parseProject, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ name: projectName(prompt), description: prompt.trim().slice(0, 2000) }),
  }, READ_TIMEOUT);
}

const uploadKeys = new Map<string, string>();

export async function uploadFile(projectId: string, file: File): Promise<MaterialResponse> {
  const pdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (pdf && !(await file.slice(0, 5).text()).startsWith('%PDF-')) throw new AskBlocked(`${file.name} doesn’t look like a real PDF file.`);
  const identity = `${projectId}:${file.name}:${file.size}:${file.lastModified}`;
  const key = uploadKeys.get(identity) ?? crypto.randomUUID();
  uploadKeys.set(identity, key);
  const material = await api(`projects/${projectId}/research-materials`, parseMaterial, {
    method: 'POST', body: file,
    headers: { 'Content-Type': pdf ? 'application/pdf' : 'text/csv', 'X-Filename': file.name, 'Idempotency-Key': key },
  }, UPLOAD_TIMEOUT);
  if (material.project_id !== projectId) throw new Error('The server returned a file for another project.');
  return material;
}

export const listFiles = (projectId: string, signal?: AbortSignal) =>
  api(`projects/${projectId}/research-materials`, parseMaterials, { signal }, READ_TIMEOUT);

const readPolicy = (projectId: string) =>
  api(`projects/${projectId}/execution-policy`, parseExecutionPolicy, undefined, READ_TIMEOUT);

/** The saved permissions, extended automatically when the server allows it. */
export async function permissions(projectId: string, items: ScopeItem[]): Promise<EffectivePolicy> {
  let summary: ExecutionPolicySummary = await readPolicy(projectId);
  if (!summary.agent_available) {
    throw new AskBlocked('The AI assistant isn’t switched on for this workspace yet. Ask the person who runs it to add a DeepSeek key, and enable agents.');
  }
  const needsAccess = !summary.policy || items.some(item => !authorized(item, summary.policy));
  const refreshAutomaticLimits = summary.policy?.reference.policy_id === AUTO_POLICY_ID
    && summary.policy.limits.specialist_assignments < summary.policy.limits.model_requests;
  if (needsAccess || refreshAutomaticLimits) {
    try {
      summary = await api(`projects/${projectId}/execution-policy/auto`, parseExecutionPolicy, { method: 'POST' }, READ_TIMEOUT);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && !needsAccess) {
        // Automatic access may have been disabled since this policy was saved.
        // Its existing grants and stricter limits still apply.
      } else if (e instanceof ApiError && e.status === 409) {
        throw new AskBlocked('The assistant isn’t allowed to use these files yet. Ask the person who runs this workspace to turn on automatic access (WB_AGENT_AUTO_POLICY=1) or to grant access to them.');
      } else {
        throw e;
      }
    }
  }
  if (!summary.policy || summary.project_id !== projectId) throw new AskBlocked('The assistant’s permissions for this project could not be read.');
  const uncovered = items.filter(item => !authorized(item, summary.policy));
  if (uncovered.length) throw new AskBlocked(`The assistant isn’t allowed to use ${uncovered.map(i => i.label).join(', ')}. Remove ${uncovered.length === 1 ? 'it' : 'them'} or ask the workspace owner for access.`);
  return summary.policy;
}

export function perRun(policy: EffectivePolicy): EffectivePolicy {
  if (policy.reference.policy_id !== AUTO_POLICY_ID) return policy;
  const limits = { ...policy.limits };
  for (const key of Object.keys(RUN_LIMITS) as (keyof typeof RUN_LIMITS)[]) limits[key] = Math.min(limits[key], RUN_LIMITS[key]);
  return { ...policy, limits };
}

/** Uploads new files, makes sure the assistant may use them and the chosen earlier files, then starts it. */
export async function ask({ projectId, prompt, files, earlier, reviewPlan, agentSelection }: {
  projectId: string; prompt: string; files: File[]; earlier: MaterialResponse[]; reviewPlan: boolean; agentSelection?: AgentSelection | null;
}): Promise<ResearchRun> {
  const uploaded: MaterialResponse[] = [];
  for (const file of files) uploaded.push(await uploadFile(projectId, file));
  const materials = [...new Map([...earlier, ...uploaded].map(m => [m.id, m])).values()];
  const items = scopeItems(materials, []);
  const policy = perRun(await permissions(projectId, items));
  return submitRun(projectId, { ...runInput(prompt, items, policy, reviewPlan ? 'review_plan' : 'autopilot'), agent_selection: agentSelection });
}

/* ------------------------------ plain words ------------------------------ */

type Phase = { label: string; tone: 'working' | 'waiting' | 'done' | 'problem' | 'stopped'; detail: string };

export const PHASE: Record<ResearchRun['state'], Phase> = {
  queued: { label: 'Getting started', tone: 'working', detail: 'Your request is in line and will start in a moment.' },
  running: { label: 'Working on it', tone: 'working', detail: 'Your research team is working on the request.' },
  waiting_for_job: { label: 'Crunching numbers', tone: 'working', detail: 'A calculation is running. This can take a few minutes.' },
  waiting_for_input: { label: 'Needs your input', tone: 'waiting', detail: 'The assistant has a question or a plan for you to look at.' },
  paused: { label: 'Paused', tone: 'waiting', detail: 'Nothing new will start until you resume.' },
  completed: { label: 'Done', tone: 'done', detail: 'Your response and saved results are ready.' },
  partially_completed: { label: 'Partly done', tone: 'problem', detail: 'Some steps finished, but not everything you asked for.' },
  failed: { label: 'Something went wrong', tone: 'problem', detail: 'The request stopped early. Anything it finished is still listed below.' },
  cancelled: { label: 'Stopped', tone: 'stopped', detail: 'You stopped this request. Finished results are still available.' },
};

export const RESULT_LABEL: Record<string, string> = {
  dataset: 'Your data', audit: 'Data check report', split: 'How the data was split', benchmark_preview: 'Model test results',
  benchmark: 'Model test results', evidence: 'Extracted text from the paper', failure: 'Lesson recorded',
  provenance: 'Step record', report: 'Downloadable report', evaluation_protocol: 'Fair comparison setup',
  claim_set: 'Findings with sources', agent_execution: 'Record of what the assistant did',
};

export const STEP_LABEL: Record<string, string> = {
  pending: 'To do', ready: 'To do', running: 'In progress', in_progress: 'In progress', completed: 'Done', done: 'Done',
  skipped: 'Skipped', failed: 'Didn’t work', blocked: 'Waiting', cancelled: 'Stopped',
};

export const TOOL_LABEL: Record<string, string> = {
  inspect_project: 'Looked at the project', inspect_dataset: 'Looked at your data', list_artifacts: 'Listed results',
  read_artifact: 'Read a result', read_job: 'Checked a calculation', run_audit: 'Checked the data for problems',
  generate_split: 'Split the data for a fair test', seal_evaluation: 'Locked in the comparison rules',
  run_baseline: 'Built and tested a model', read_evaluation: 'Read the test scores', ingest_evidence: 'Read a PDF',
  search_evidence: 'Searched the paper', read_evidence_span: 'Quoted the paper', search_failures: 'Looked up past lessons',
  read_memory: 'Recalled earlier work', record_outcome: 'Recorded a lesson', build_report: 'Put together a report',
  replay_science: 'Re-checked earlier results',
};

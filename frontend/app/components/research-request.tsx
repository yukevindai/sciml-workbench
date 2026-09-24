'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Paperclip, Play } from 'lucide-react';
import { api } from '../lib/api';
import { parseExecutionPolicy, parseMaterial, parseMaterials } from '../lib/decode';
import type { Workbench } from '../lib/context';
import type { ExecutionPolicySummary, MaterialResponse, ResearchRun } from '../lib/generated/http';
import {
  authorized, EXAMPLE_GOALS, forgetPendingRun, pendingRun, resendRun, RUN_CHANGE_EVENT, runInput, scopeItems,
  submitRun, type PendingRun, type ScopeItem,
} from '../lib/runs';
import { Alert, Disclosure, Field, FieldGroup, Panel } from './ui';

const MAX_PDF = 10 * 1024 * 1024;
const READ_TIMEOUT = 30_000;

const EXPOSURE: Record<string, string> = {
  schema_aggregates: 'Column schema and aggregate statistics only',
  selected_excerpts: 'Schema, aggregates and selected excerpts',
  raw_project_content: 'Raw project content',
};

function usePendingRun(projectId: string): PendingRun | null {
  const [entry, setEntry] = useState<PendingRun | null>(null);
  useEffect(() => {
    const update = () => setEntry(pendingRun(projectId));
    update();
    const storage = (event: StorageEvent) => { if (event.key === null || event.key.endsWith(projectId)) update(); };
    window.addEventListener(RUN_CHANGE_EVENT, update);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener(RUN_CHANGE_EVENT, update); window.removeEventListener('storage', storage); };
  }, [projectId]);
  return entry;
}

/** Goal composer, attachments, input scope and the saved-policy summary. Run research is the one consent to spend. */
export function ResearchRequest({ wb, onRun }: { wb: Workbench; onRun: (run: ResearchRun) => void }) {
  const [objective, setObjective] = useState('');
  const [reviewPlan, setReviewPlan] = useState(false);
  const [summary, setSummary] = useState<ExecutionPolicySummary | null>(null);
  const [policyError, setPolicyError] = useState('');
  const [policyLoading, setPolicyLoading] = useState(!wb.preview);
  const [materials, setMaterials] = useState<MaterialResponse[]>([]);
  const [materialsError, setMaterialsError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);
  const touched = useRef(false);
  const uploadKeys = useRef(new Map<string, string>());
  const sequence = useRef(0);
  const pending = usePendingRun(wb.projectId);

  const load = useCallback(async () => {
    if (wb.preview || !wb.projectId) { setPolicyLoading(false); return; }
    const request = ++sequence.current;
    const current = () => request === sequence.current;
    setPolicyLoading(true);
    const [policy, listing] = await Promise.allSettled([
      api(`projects/${wb.projectId}/execution-policy`, parseExecutionPolicy, undefined, READ_TIMEOUT),
      api(`projects/${wb.projectId}/research-materials`, parseMaterials, undefined, READ_TIMEOUT),
    ]);
    if (!current()) return;
    if (policy.status === 'fulfilled' && policy.value.project_id === wb.projectId) { setSummary(policy.value); setPolicyError(''); }
    else setPolicyError(policy.status === 'rejected' && policy.reason instanceof Error ? policy.reason.message : 'The server returned a policy for another project.');
    if (listing.status === 'fulfilled' && listing.value.every(m => m.project_id === wb.projectId)) { setMaterials(listing.value); setMaterialsError(''); }
    else setMaterialsError(listing.status === 'rejected' && listing.reason instanceof Error ? listing.reason.message : 'The server returned attachments for another project.');
    setPolicyLoading(false);
  }, [wb.projectId, wb.preview]);

  useEffect(() => { void load(); return () => { sequence.current += 1; }; }, [load]);

  const items = scopeItems(materials, wb.datasets);
  const policy = summary?.policy ?? null;

  // Start with the active dataset selected, until the researcher changes the selection.
  // Item IDs change when attachment records load (a dataset then belongs to its attachment).
  const activeDataset = wb.selectedDataset?.id;
  const itemKey = items.map(item => item.id).join(' ');
  useEffect(() => {
    if (touched.current || !activeDataset) return;
    const item = items.find(value => value.artifact_ids.includes(activeDataset));
    setSelected(item ? [item.id] : []);
  }, [activeDataset, itemKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = items.filter(item => selected.includes(item.id));  // unlisted IDs are ignored
  const uncovered = chosen.filter(item => !authorized(item, policy));
  const blockers = [
    !wb.projectId && 'Select a project.',
    !objective.trim() && 'Describe the research goal.',
    objective.length > 4000 && 'Shorten the goal to 4,000 characters or fewer.',
    policyLoading && 'Reading the saved policy…',
    !policyLoading && !policy && 'No saved execution policy covers this project. An operator must install one before agents can run; manual tools remain available.',
    summary && !summary.agent_available && `Agent execution is unavailable: ${summary.unavailable_reason ?? 'no reason given'}`,
    uncovered.length > 0 && `The saved policy does not authorize: ${uncovered.map(item => item.label).join(', ')}. Deselect them or ask an operator to extend the policy.`,
  ].filter((value): value is string => Boolean(value));

  const toggle = (item: ScopeItem, on: boolean) => {
    touched.current = true;
    setSelected(values => on ? [...new Set([...values, item.id])] : values.filter(id => id !== item.id));
  };

  const upload = (files: File[]) => {
    setFileError('');
    if (!files.length) return;
    void wb.act(async () => {
      const added: string[] = [];
      for (const file of files) {
        const pdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const csv = file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv');
        if (!pdf && !csv) { setFileError(`${file.name} is not a CSV or PDF file; it was not attached.`); continue; }
        if (!file.size) { setFileError(`${file.name} is empty; it was not attached.`); continue; }
        if (pdf && (file.size > MAX_PDF || !(await file.slice(0, 5).text()).startsWith('%PDF-'))) {
          setFileError(`${file.name} is not a PDF of at most 10 MiB; it was not attached.`); continue;
        }
        const identity = `${wb.projectId}:${file.name}:${file.size}:${file.lastModified}`;
        const key = uploadKeys.current.get(identity) ?? crypto.randomUUID();
        uploadKeys.current.set(identity, key);
        // No declarations are sent: provenance stays unknown until the researcher or a source states it.
        const material = await api(`projects/${wb.projectId}/research-materials`, parseMaterial, {
          method: 'POST', body: file,
          headers: { 'Content-Type': pdf ? 'application/pdf' : 'text/csv', 'X-Filename': file.name, 'Idempotency-Key': key },
        }, 60_000);
        if (material.project_id !== wb.projectId) throw new Error('The server returned an attachment for another project.');
        added.push(material.id);
      }
      if (added.length) {
        touched.current = true;
        setSelected(values => [...new Set([...values, ...added])]);
        wb.setNotice(`Attached ${added.length} file${added.length === 1 ? '' : 's'}. Attaching does not start research or spend model budget.`);
      }
      await load();
    });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (wb.busy || !wb.projectId) return;
    upload(Array.from(event.dataTransfer.files));
  };

  const run = () => {
    if (blockers.length || !policy) return;
    void wb.act(async () => {
      const created = await submitRun(wb.projectId, runInput(objective, chosen, policy, reviewPlan ? 'review_plan' : 'autopilot'));
      onRun(created);
      wb.setNotice(reviewPlan
        ? 'Research accepted. It will pause once for your review after planning.'
        : 'Research accepted and queued. No further approval is needed under the saved policy.');
    });
  };

  return <Panel title="Ask a research question" description="Describe the goal, attach or choose inputs, and choose Run research. The coordinator works within the saved project policy; you do not choose an agent, model or every scientific parameter.">
    <div className="stack">
      <Field label="Research goal" hint="Include any criterion you want applied, for example a predeclared metric threshold or the columns that identify independent samples.">
        {props => <textarea className="textarea" rows={4} maxLength={4000} value={objective} disabled={wb.preview}
          onChange={event => setObjective(event.target.value)} {...props} />}
      </Field>
      <div className="stack stack--tight">
        <span className="field-hint" id="example-goals">Example goals (fills the goal; nothing runs until you choose Run research):</span>
        <div className="button-row" role="group" aria-labelledby="example-goals">
          {EXAMPLE_GOALS.map((goal, index) => <button key={goal} type="button" className="button button--ghost button--sm" disabled={wb.preview}
            title={goal} onClick={() => setObjective(goal)}>{['Audit a CSV', 'Audit, split and compare baselines', 'Cite a PDF'][index]}</button>)}
        </div>
      </div>

      <div className={`dropzone${dragging ? ' dropzone--active' : ''}`}
        onDragOver={event => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)} onDrop={onDrop}>
        <Paperclip size={22} className="dropzone-icon" aria-hidden="true" />
        <span className="dropzone-title">Drop CSV or PDF files here</span>
        <span className="dropzone-hint">Originals are preserved exactly. Unknown provenance stays unknown. PDFs up to 10 MiB.</span>
        <Field label="Attach files" error={fileError || undefined}>
          {props => <input type="file" multiple className="input-file" accept=".csv,text/csv,.pdf,application/pdf"
            disabled={wb.busy || !wb.projectId || wb.preview} {...props}
            onChange={event => { upload(Array.from(event.target.files ?? [])); event.target.value = ''; }} />}
        </Field>
      </div>

      <FieldGroup label="Inputs for this request" hint="Only selected inputs are offered to the coordinator. Datasets derived during the run are tracked automatically.">
        {materialsError && <Alert variant="warning">Attachments unavailable: {materialsError}{materials.length ? ' Previously loaded attachments remain listed.' : ''}</Alert>}
        {!items.length ? <p className="field-hint">No attachments or datasets in this project yet. A goal without inputs can still inspect existing project records the policy allows.</p>
          : <ul className="scope-list" aria-label="Inputs">
            {items.map(item => {
              const covered = authorized(item, policy);
              return <li key={item.id}>
                <label className="scope-item">
                  <input type="checkbox" checked={selected.includes(item.id)} disabled={wb.preview} onChange={event => toggle(item, event.target.checked)} />
                  <span className="scope-text">
                    <span className="truncate">{item.label}</span>
                    <span className="field-hint">{item.media.toUpperCase()}{item.material_ids.length ? '' : ' · dataset without an attachment record'} · {policy ? (covered ? 'authorized by the saved policy' : 'not authorized by the saved policy') : 'policy unknown'}</span>
                  </span>
                </label>
              </li>;
            })}
          </ul>}
      </FieldGroup>

      <PolicySummary summary={summary} loading={policyLoading} error={policyError} onRetry={() => void load()} />

      <label className="scope-item">
        <input type="checkbox" checked={reviewPlan} disabled={wb.preview} onChange={event => setReviewPlan(event.target.checked)} />
        <span className="scope-text">
          <span>Review the plan before scientific work starts</span>
          <span className="field-hint">Optional. Autopilot is the default: routine audit, split, baseline, failure recording and report steps run without further clicks. With review, the run pauses once after planning.</span>
        </span>
      </label>

      {pending && <Alert variant="warning" title="Unconfirmed research request">
        {pending.status === 'sending' ? 'A request was being sent when this page closed.' : pending.detail} The server may already have accepted it.
        Resending uses the original request key, so an accepted request returns its original run instead of starting another.
      </Alert>}
      {pending && <div className="button-row">
        <button type="button" className="button button--secondary" disabled={wb.busy} onClick={() => void wb.act(async () => {
          onRun(await resendRun(pending));
          wb.setNotice('The server confirmed the research request.');
        })}>Resend with the same key</button>
        <button type="button" className="button button--ghost" disabled={wb.busy} onClick={() => forgetPendingRun(wb.projectId)}>Forget</button>
      </div>}

      <div className="panel-foot">
        <div className="stack stack--tight">
          {blockers.length > 0 && !wb.preview
            ? <ul className="field-hint" aria-label="Before you can run">{blockers.map(text => <li key={text}>{text}</li>)}</ul>
            : <span className="field-hint">Run research is your consent to spend within the limits below.</span>}
        </div>
        <button type="button" className="button" disabled={wb.busy || wb.preview || blockers.length > 0} onClick={run}>
          <Play size={15} aria-hidden="true" /> Run research
        </button>
      </div>
    </div>
  </Panel>;
}

function PolicySummary({ summary, loading, error, onRetry }: { summary: ExecutionPolicySummary | null; loading: boolean; error: string; onRetry: () => void }) {
  const policy = summary?.policy;
  const heading = loading && !summary ? 'Reading the saved policy…'
    : !summary ? 'Saved policy unavailable'
    : !policy ? 'No saved execution policy for this project'
    : `Autopilot policy revision ${policy.project_policy_revision}${summary.agent_available ? '' : ' · agents unavailable'}`;
  return <div className="policy-summary" aria-live="polite">
    <div className="stack stack--tight">
      <strong>{heading}</strong>
      {error && <p className="field-hint">Could not read the policy: {error}{summary ? ' The last policy read remains shown and may be out of date.' : ''} <button type="button" className="link-button" onClick={onRetry}>Retry</button></p>}
      {policy && <p className="field-hint">
        {policy.limits.model_requests} model requests · {policy.limits.tool_calls} tool calls · {policy.limits.scientific_attempts} scientific attempts · {Math.round(policy.limits.active_seconds / 60)} active minutes ·{' '}
        {policy.spend_ceiling_usd === null ? 'no monetary ceiling (cost is reported as known or unknown)' : `spend ceiling US$${policy.spend_ceiling_usd.toFixed(2)}`}
      </p>}
    </div>
    {policy && <Disclosure summary="Policy details">
      <dl className="definition-list">
        <div><dt>Data offered to the model</dt><dd>{EXPOSURE[policy.exposure] ?? policy.exposure}</dd></div>
        <div><dt>Authorized inputs in this project</dt><dd>{policy.material_ids.length} attachment{policy.material_ids.length === 1 ? '' : 's'} · {policy.artifact_ids.length} artifact{policy.artifact_ids.length === 1 ? '' : 's'}</dd></div>
        <div><dt>Specialists</dt><dd>up to {policy.limits.specialist_assignments} ({policy.limits.specialist_concurrency} at once)</dd></div>
        <div><dt>Failure records</dt><dd>{policy.automatic_failure_recording ? 'recorded automatically when a predeclared criterion or objective error applies' : 'not recorded automatically'}</dd></div>
        <div><dt>Reports</dt><dd>{policy.verify_reports ? 'verified before being called complete' : 'verification not required by policy'}</dd></div>
        <div><dt>Reuse of compatible results</dt><dd>{policy.allow_reuse ? 'allowed' : 'not allowed'}</dd></div>
        <div><dt>Your goal text offered to the model</dt><dd>{policy.share_operator_messages ? 'yes, under separate operator-message consent' : 'only when the data setting allows raw project content'}</dd></div>
        <div><dt>Tools</dt><dd>{policy.allowed_tools.map(tool => tool.replaceAll('_', ' ')).join(', ') || 'none'}</dd></div>
        <div><dt>Policy reference</dt><dd className="meta-id">{policy.reference.policy_id} · revision {policy.reference.revision} · {policy.reference.sha256.slice(0, 12)}</dd></div>
      </dl>
      <p className="field-hint">Policies are installed by an operator. This workspace cannot change them.</p>
    </Disclosure>}
  </div>;
}

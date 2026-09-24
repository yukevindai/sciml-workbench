'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import type { Workbench } from '../lib/context';
import type { ReportSummary } from '../lib/generated/http';
import type { ReportArtifact } from '../lib/types';
import { api } from '../lib/api';
import { parseReportSummary } from '../lib/decode';
import { artifactHref, KIND_LABEL, provenanceHref } from '../lib/lineage';
import { formatDate, shortId } from '../lib/format';
import { Alert, Panel } from './ui';

const REPLAY = 'The workbench never replays science by itself. To replay, run python -m workbench.replay report.zip <new-directory> in a matching pinned environment. That result is not recorded here.';

function Scope({ summary }: { summary: ReportSummary }) {
  const scope = summary.scope;
  if (!scope) return <p>Scope was not recorded in this archive.</p>;
  return scope.kind === 'project'
    ? <p>Project-wide manual export: every non-report artifact, its dependencies, attachments and settled jobs at capture time.</p>
    : <p>Run-scoped export for research run <span className="mono">{scope.run_id}</span>, capture revision {scope.revision ?? 'not recorded'}, event cutoff {scope.execution_cutoff ?? 'not recorded'}. Export status at the cutoff was &ldquo;{scope.export_status_at_cutoff ?? 'not recorded'}&rdquo;, because an archive cannot contain its own completion.</p>;
}

function Contents({ wb, summary }: { wb: Workbench; summary: ReportSummary }) {
  const current = new Map(wb.artifacts.map(a => [a.id, a]));
  const failedJobs = summary.jobs.filter(job => job.state === 'failed');
  return <div className="stack">
    <div className="stack stack--tight">
      <h4>Scope</h4>
      <Scope summary={summary} />
      <p className="field-hint">Captured {summary.captured_at ? formatDate(summary.captured_at) : 'at an unrecorded time'} · manifest {summary.manifest_version} · {summary.file_count} files · {(summary.size_bytes / 1024).toFixed(1)} KiB</p>
    </div>

    <div className="table-scroll" tabIndex={0} role="region" aria-label="Frozen inputs">
      <table className="table lineage-table"><caption>Artifacts frozen into this archive. Values are in the archive; this list shows identities only.</caption>
        <thead><tr><th scope="col">Kind</th><th scope="col">Artifact</th><th scope="col">Created</th><th scope="col">In the current project</th></tr></thead>
        <tbody>{summary.inputs.map(input => {
          const live = current.get(input.id);
          const href = live ? artifactHref(wb.projectId, live) : null;
          return <tr key={input.id}>
            <td>{KIND_LABEL[input.kind] ?? input.kind}{input.schema_version !== '1.0' ? ` ${input.schema_version}` : ''}</td>
            <th scope="row">{input.label}<br /><span className="mono dim">{input.id}</span></th>
            <td>{formatDate(input.created_at)}</td>
            <td>{live ? href ? <Link className="text-link" href={href}>Open</Link> : <Link className="text-link" href={provenanceHref(wb.projectId, input.id)}>Lineage</Link> : <span className="lineage-missing">Not in the current listing</span>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>

    <div className="stack stack--tight">
      <h4>Jobs and attachments</h4>
      <p>{summary.jobs.length} settled job{summary.jobs.length === 1 ? '' : 's'} captured: {summary.jobs.length - failedJobs.length} succeeded, {failedJobs.length} failed. {summary.materials.length} attachment{summary.materials.length === 1 ? '' : 's'}.</p>
      {failedJobs.length > 0 && <ul>{failedJobs.map(job => <li key={job.id}>{job.kind} job <span className="mono">{shortId(job.id)}</span> failed{job.error_code ? ` (${job.error_code})` : ''}. It is kept in the archive, not hidden.</li>)}</ul>}
      {summary.materials.length > 0 && <ul>{summary.materials.map(m => <li key={m.id}>{m.filename} · {m.media_type} · <span className="mono">{shortId(m.sha256, 12)}</span></li>)}</ul>}
    </div>

    <div className="stack stack--tight">
      <h4>Frozen environment</h4>
      <dl className="audit-config">
        <div><dt>Python</dt><dd>{summary.python ?? 'Not recorded'}</dd></div>
        <div><dt>Platform</dt><dd>{summary.platform ?? 'Not recorded'}</dd></div>
        <div><dt>Scientific software</dt><dd>{Object.keys(summary.software).length ? Object.entries(summary.software).map(([k, v]) => `${k} ${v}`).join(', ') : 'Not recorded'}</dd></div>
        <div><dt>Upstream source pins</dt><dd className="mono">{Object.keys(summary.upstream_commits).length ? Object.entries(summary.upstream_commits).map(([k, v]) => `${k}@${v.slice(0, 12)}`).join(', ') : 'Not recorded'}</dd></div>
      </dl>
    </div>

    <div className="stack stack--tight">
      <h4>Agent versions</h4>
      {summary.agent_executions.length === 0
        ? <p>No agent execution record is in this archive{summary.scope?.kind === 'project' ? ' (a manual project export does not name agent versions)' : ''}.</p>
        : summary.agent_executions.map(e => <dl className="audit-config" key={e.execution_record_id} aria-label={`Agent execution ${e.execution_record_id}`}>
          <div><dt>Research run</dt><dd className="mono">{e.run_id}</dd></div>
          <div><dt>Objective</dt><dd>{e.objective}</dd></div>
          <div><dt>Provider / model</dt><dd>{e.versions.provider} / {e.versions.model}{e.versions.model_revision ? ` (${e.versions.model_revision})` : ' (revision not reported)'}</dd></div>
          <div><dt>Prompt / tool catalog</dt><dd>{e.versions.prompt} / {e.versions.tool_catalog}</dd></div>
          <div><dt>Runtime</dt><dd>{e.versions.runtime} · {e.versions.checkpointer} · SDK {e.versions.provider_sdk}</dd></div>
          <div><dt>Workbench revision</dt><dd className="mono">{e.versions.workbench_revision}</dd></div>
          <div><dt>Policy</dt><dd>{e.policy.policy_id} revision {e.policy.revision}</dd></div>
          <div><dt>State at cutoff</dt><dd>{e.state_at_cutoff} · event {e.event_cutoff} · captured {formatDate(e.captured_at)}</dd></div>
          <div><dt>Pending at capture</dt><dd>{e.pending_finalization_action_ids.length ? e.pending_finalization_action_ids.join(', ') : 'None'}</dd></div>
        </dl>)}
      {summary.finalization && <div className="stack stack--tight">
        <p>Finalization: review {summary.finalization.review_status ?? 'status not recorded'}; {summary.finalization.runtime_version_count} runtime configuration{summary.finalization.runtime_version_count === 1 ? '' : 's'} recorded.</p>
        {summary.finalization.gaps.length > 0 && <Alert variant="warning" title="Recorded gaps">{summary.finalization.gaps.join(' ')}</Alert>}
      </div>}
    </div>
  </div>;
}

export function ReportCard({ wb, report, focus, autoVerify }: { wb: Workbench; report: ReportArtifact; focus: boolean; autoVerify: boolean }) {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const verify = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError('');
    try {
      const value = await api(`projects/${report.project_id}/reports/${report.id}/summary`, parseReportSummary);
      if (value.report_id !== report.id || value.sha256 !== report.sha256) throw new Error('The server returned a summary for a different archive.');
      if (current === sequence.current) setSummary(value);
    } catch (e) {
      if (current === sequence.current) setError(e instanceof Error ? e.message : 'Could not check this archive.');
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [report.id, report.project_id, report.sha256]);
  useEffect(() => { if (autoVerify || focus) void verify(); return () => { sequence.current += 1; }; }, [autoVerify, focus, verify]);
  useEffect(() => {
    if (!focus) return;
    const panel = document.getElementById(`report-${report.id}`);
    panel?.scrollIntoView({ block: 'start' }); panel?.focus({ preventScroll: true });
  }, [focus, report.id]);

  const verified = summary?.verification.status === 'verified';
  const kind = summary?.scope?.kind;
  return <Panel id={`report-${report.id}`} tabIndex={-1} className="result report-card"
    title={kind === 'run' ? `Research run export · ${formatDate(report.created_at)}` : `Project export · ${formatDate(report.created_at)}`}
    description={<>Report {report.id} · SHA-256 <span className="mono">{shortId(report.sha256, 16)}</span> · {report.artifact_ids.length} artifacts</>}
    aside={<a className="button button--secondary button--sm" href={`/api/projects/${report.project_id}/artifacts/${report.id}/download`}><Download size={14} aria-hidden="true" />Download ZIP</a>}>
    <div className="stack">
      <dl className="audit-config">
        <div><dt>Structural verification</dt><dd>
          {loading ? 'Checking…'
            : error ? <span className="lineage-missing">Could not check: {error}</span>
              : !summary ? 'Not checked in this session'
                : verified ? <><span className="badge badge--success">Verified</span> Checked {formatDate(summary.verification.checked_at)}: paths, manifest digests, contracts, dependency closure and stored bytes.</>
                  : <><span className="badge badge--danger">Failed</span> {summary.verification.reason}</>}
        </dd></div>
        <div><dt>Scientific replay</dt><dd><span className="badge">Not run</span> {REPLAY}</dd></div>
      </dl>
      <div className="cluster">
        <button type="button" className="button button--secondary" disabled={loading} onClick={() => void verify()}>{summary ? 'Check again' : 'Verify and inspect'}</button>
        {summary && !verified && <span className="field-hint">Do not rely on this archive. Its contents are not shown.</span>}
      </div>
      {summary && !verified && <Alert variant="error" role="alert" title="This archive failed verification">{summary.verification.reason}. Download it only to investigate. Its frozen inputs are not listed.</Alert>}
      {verified && summary && <Contents wb={wb} summary={summary} />}
      <p className="field-hint">Structural verification proves internal consistency, not authorship: a fully rewritten, self-consistent archive would also pass.</p>
    </div>
  </Panel>;
}

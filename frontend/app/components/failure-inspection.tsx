'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import type { Workbench } from '../lib/context';
import type { JobDetail } from '../lib/generated/http';
import type { FailureArtifact } from '../lib/types';
import { benchmarkHref } from '../lib/benchmark';
import { describeFailure, failureHref, receiptStatus } from '../lib/failure';
import { formatDate, shortId } from '../lib/format';
import { Alert, Badge, JsonBox } from './ui';

const ORIGIN_LABEL = { human: 'Human-assessed', agent: 'Recorded by agent', legacy: 'Human-assessed (legacy record)' } as const;

export function ReceiptRow({ job, artifacts }: { job: JobDetail; artifacts: FailureArtifact[] }) {
  const status = receiptStatus(job);
  const receipt = job.external_receipt;
  const linked = receipt?.artifact_id ? artifacts.find(value => value.id === receipt.artifact_id) : undefined;
  return <li className="receipt stack stack--tight" id={`receipt-${job.id}`}>
    <div className="cluster">
      <span className={`badge ${status.tone}`.trim()}>{status.label}</span>
      <span>Job <span className="mono">{shortId(job.id)}</span> ·</span><Badge state={job.state} />
      <span className="dim">{formatDate(job.created_at)}</span>
    </div>
    <p className="field-hint">{status.description}</p>
    {receipt && receipt.state === 'confirmed' && job.state === 'failed' && <p className="field-hint">
      The original job is still recorded as failed{job.error_code ? ` (${job.error_code})` : ''}. The later confirmation is recorded separately and does not change the job.
    </p>}
    {receipt && <dl className="audit-config">
      <div><dt>External ID</dt><dd className="mono">{receipt.external_id}</dd></div>
      <div><dt>Submission attempts</dt><dd>{receipt.attempts}{receipt.submitted_at ? ` · last admitted ${formatDate(receipt.submitted_at)}` : ''}</dd></div>
      <div><dt>Failure Memory record</dt><dd>{receipt.external_record_id ? <span className="mono">{receipt.external_record_id}</span> : 'None confirmed'}</dd></div>
      <div><dt>Request digest</dt><dd className="mono" title={receipt.request_sha256}>{shortId(receipt.request_sha256, 16)}</dd></div>
      <div><dt>Workbench record</dt><dd>{receipt.artifact_id
        ? linked ? <Link className="text-link" href={`#failure-${linked.id}`}>{linked.id}</Link> : `${receipt.artifact_id} (not in the current listing)`
        : 'Not published'}</dd></div>
    </dl>}
  </li>;
}

export function FailureRecord({ wb, failure, focus }: { wb: Workbench; failure: FailureArtifact; focus: boolean }) {
  const view = describeFailure(failure);
  const run = wb.runs.find(value => value.id === failure.benchmark_id);
  useEffect(() => {
    if (!focus) return;
    const panel = document.getElementById(`failure-${failure.id}`);
    panel?.scrollIntoView({ block: 'start' }); panel?.focus({ preventScroll: true });
  }, [failure.id, focus]);

  return <article className="panel panel--inset failure-record" id={`failure-${failure.id}`} tabIndex={-1} aria-labelledby={`failure-title-${failure.id}`}>
    <div className="panel-head">
      <div className="panel-head-text">
        <h3 id={`failure-title-${failure.id}`}>{view.reason}</h3>
        <span className="meta-list"><span>{formatDate(failure.created_at)}</span><span className="meta-id">{failure.id}</span></span>
      </div>
      <div className="cluster">
        <span className={`badge ${view.origin === 'agent' ? 'badge--info' : 'badge--warning'}`}>{ORIGIN_LABEL[view.origin]}</span>
        <span className="badge badge--success">Import confirmed</span>
      </div>
    </div>
    <div className="panel-body stack stack--tight">
      <dl className="audit-config">
        <div><dt>Recorded by</dt><dd>{view.actor}</dd></div>
        {view.actorDetails.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        <div><dt>Observation</dt><dd>{view.observation.label}</dd></div>
        {view.observation.details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        <div><dt>Uncertainty</dt><dd>{view.uncertainty ?? 'Not recorded'}</dd></div>
        <div><dt>Benchmark run</dt><dd>{run
          ? <Link className="text-link" href={benchmarkHref(wb.projectId, run.id)}>{run.model} · seed {run.seed} · {run.status} · {run.id}</Link>
          : `${failure.benchmark_id} (not in the current listing)`}</dd></div>
        {view.sourceJobId && <div><dt>Source job</dt><dd className="mono">{view.sourceJobId}</dd></div>}
        <div><dt>Failure Memory</dt><dd>Record <span className="mono">{view.externalRecordId}</span> in project <span className="mono">{view.externalProjectId}</span>{view.externalId ? <> · import ID <span className="mono">{view.externalId}</span></> : ''}</dd></div>
      </dl>
      {view.hypotheses.length > 0 && <div>
        <h4>Unverified causal hypotheses</h4>
        <ul>{view.hypotheses.map((value, index) => <li key={index}>{value}</li>)}</ul>
      </div>}
      {view.origin === 'agent'
        ? <p className="field-hint">Agents record only objective observations (exact errors or missed predeclared criteria). They cannot record a researcher&rsquo;s judgement.</p>
        : view.observation.label === 'Researcher assessment' && <p className="field-hint">A researcher&rsquo;s judgement. It does not change the run&rsquo;s execution status or claim that a physical experiment failed.</p>}
      <Link className="text-link" href={failureHref(wb.projectId, failure.id)}>Link to this record</Link>
      <JsonBox value={failure} summary="Inspect complete record (includes the upstream record, which may contain the run's test metrics)" />
    </div>
  </article>;
}

export function UnknownImportsNotice({ count }: { count: number }) {
  if (!count) return null;
  return <Alert variant="warning" title={`${count} import${count === 1 ? ' has an' : 's have'} unknown outcome${count === 1 ? '' : 's'}`}>
    Failure Memory may or may not hold {count === 1 ? 'that record' : 'those records'}. Automatic recovery repeats the exact original request. A new assessment is a separate record and does not resolve an unknown import.
  </Alert>;
}

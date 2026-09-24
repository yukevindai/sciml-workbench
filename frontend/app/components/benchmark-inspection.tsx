'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, EyeOff } from 'lucide-react';
import type { Workbench } from '../lib/context';
import type { EvaluationStatusView } from '../lib/generated/http';
import { kinds, type BenchmarkArtifact, type BenchmarkPreview, type EvaluationProtocolArtifact } from '../lib/types';
import { api } from '../lib/api';
import { parseEvaluationStatus } from '../lib/decode';
import { benchmarkHref, benchmarkLineage, HOLDOUT_EXPOSURE, revealedTest, SCALAR_METRICS, scalarMetrics } from '../lib/benchmark';
import { record, splitHref, strings } from '../lib/split';
import { formatDate, formatMetric, humanise } from '../lib/format';
import { assessRunHref, failureHref } from '../lib/failure';
import { Alert, Badge, JsonBox, Panel } from './ui';

export function MetricTable({ label, metrics, caption }: { label: string; metrics: ReturnType<typeof scalarMetrics>; caption: string }) {
  if (!metrics) return <p>{label}: not reported. Missing metrics are not zero.</p>;
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={label}>
    <table className="table"><caption>{caption}</caption>
      <thead><tr><th scope="col">Metric</th><th scope="col">Value</th></tr></thead>
      <tbody>{SCALAR_METRICS.map(key => <tr key={key}><th scope="row">{humanise(key)}</th>
        <td className="tabular">{metrics[key] === undefined ? 'Not reported' : formatMetric(metrics[key])}</td></tr>)}</tbody>
    </table>
  </div>;
}

const list = (value: unknown) => strings(value) ? value.join(', ') || 'None declared' : value === undefined ? 'Not supplied' : 'Unsupported — inspect JSON';
const text = (value: unknown) => typeof value === 'string' ? value || 'Not supplied' : value === undefined ? 'Not supplied' : typeof value === 'number' ? String(value) : 'Unsupported — inspect JSON';

/** The exact declarations submitted for this run, including warning rationale. */
function TaskCard({ config }: { config: Record<string, unknown> }) {
  const units = record(config.units) ? Object.entries(config.units) : null;
  const warnings = record(config.accepted_warnings) ? Object.entries(config.accepted_warnings) : null;
  return <div className="stack stack--tight">
    <h3>Frozen task card</h3>
    <dl className="audit-config">
      <div><dt>Target</dt><dd>{text(config.target)}</dd></div>
      <div><dt>Numeric features</dt><dd>{list(config.numeric_features)}</dd></div>
      <div><dt>Categorical features</dt><dd>{list(config.categorical_features)}</dd></div>
      <div><dt>Row identifier</dt><dd>{text(config.row_id)}</dd></div>
      <div><dt>Independent groups</dt><dd>{list(config.group_columns)}</dd></div>
      <div><dt>Units</dt><dd>{units ? units.map(([column, unit]) => `${column}: ${typeof unit === 'string' ? unit : 'unsupported'}`).join('; ') || 'None declared' : 'Not supplied'}</dd></div>
      <div><dt>Independent unit</dt><dd>{text(config.independence_unit)} ({text(config.independence_status)})</dd></div>
      <div><dt>Independence rationale</dt><dd>{text(config.independence_rationale)}</dd></div>
      <div><dt>Supports</dt><dd>{text(config.generalization)}</dd></div>
      <div><dt>Limitations</dt><dd>{list(config.limitations)}</dd></div>
      <div><dt>Domain</dt><dd>{text(config.domain)}</dd></div>
    </dl>
    <h4>Accepted warnings and rationale</h4>
    {warnings === null ? <p>Accepted warnings not supplied.</p> : warnings.length === 0 ? <p>No warnings accepted. Upstream blocks any unaccepted warning and every error.</p>
      : <div className="table-scroll" tabIndex={0} role="region" aria-label="Accepted warnings">
        <table className="table"><caption>Warnings accepted for this run, with the written justification</caption>
          <thead><tr><th scope="col">Warning code</th><th scope="col">Scientific justification</th></tr></thead>
          <tbody>{warnings.map(([code, reason]) => <tr key={code}><th scope="row">{code}</th><td>{typeof reason === 'string' ? reason : 'Unsupported'}</td></tr>)}</tbody>
        </table>
      </div>}
  </div>;
}

export function ProtocolCard({ wb, protocol, revision }: { wb: Workbench; protocol: EvaluationProtocolArtifact; revision: number }) {
  const [status, setStatus] = useState<EvaluationStatusView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api(`projects/${protocol.project_id}/evaluations/${protocol.id}`, parseEvaluationStatus, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { if (value.protocol_id !== protocol.id) throw new Error('The server returned another comparison.'); setStatus(value); } })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Status unavailable'); });
    return () => controller.abort();
  }, [protocol.id, protocol.project_id, revision]);
  const members = kinds(wb.artifacts, 'benchmark_preview').filter(run => run.protocol_ids.includes(protocol.id));
  const criterion = protocol.success_criterion;
  return <article className="panel panel--inset" id={`protocol-${protocol.id}`}>
    <div className="panel-head"><div className="panel-head-text">
      <h3>Sealed comparison {protocol.id}</h3>
      <span className="meta-list"><span>Sealed {protocol.sealed_at ? formatDate(protocol.sealed_at) : 'time unavailable'}</span><span>Split {protocol.split_id}</span></span>
    </div><Badge state={status?.state ?? protocol.state} /></div>
    <div className="stack stack--tight">
      <dl className="audit-config">
        <div><dt>Target</dt><dd>{protocol.target}</dd></div>
        <div><dt>Features</dt><dd>{protocol.features.join(', ')}</dd></div>
        <div><dt>Independent unit</dt><dd>{protocol.independent_unit.name} · groups {protocol.independent_unit.group_columns.join(', ')}</dd></div>
        <div><dt>Candidates</dt><dd>{protocol.candidates.map(c => `${c.id} (${c.model}, seed ${c.seed})`).join('; ')}</dd></div>
        <div><dt>Primary metric</dt><dd>{humanise(protocol.primary_metric)}</dd></div>
        <div><dt>Selection rule</dt><dd>{humanise(protocol.selection_rule)}</dd></div>
        <div><dt>Success criterion</dt><dd>{criterion ? `${humanise(criterion.metric)} on ${criterion.partition} ${criterion.comparison} ${criterion.threshold}` : 'None declared'}</dd></div>
        <div><dt>Exposure at sealing</dt><dd>{protocol.exposure_status}</dd></div>
      </dl>
      {error && <Alert variant="warning">Current comparison status unavailable: {error}. The seal-time snapshot above is not current authorization.</Alert>}
      {status && <Alert variant={status.clean_holdout_eligible ? 'info' : 'warning'} title={`Current holdout exposure: ${status.exposure_status}${status.exploratory ? ' · exploratory comparison' : ''}`}>
        {status.clean_holdout_eligible ? 'Still eligible as an untouched clean holdout.' : 'No longer eligible as an untouched clean holdout; results stay as computed.'} {status.limitation}
      </Alert>}
      <p>Accepted candidate results in this project: {members.length ? members.map((run, i) => <span key={run.id}>{i > 0 && ', '}<Link className="text-link" href={benchmarkHref(run.project_id, run.id)}>{run.model} {run.id}</Link></span>) : 'none yet'}.</p>
    </div>
  </article>;
}

export function RunInspection({ wb, run, focus, revealed, onReveal }: {
  wb: Workbench; run: BenchmarkPreview; focus: boolean; revealed?: BenchmarkArtifact; onReveal: (run: BenchmarkPreview) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const lineage = benchmarkLineage(run, wb.artifacts);
  const jobs = wb.jobs.filter(job => job.kind === 'benchmark' && job.result_id === run.id);
  const outcomes = kinds(wb.artifacts, 'failure').filter(value => value.benchmark_id === run.id);
  const protocols = kinds(wb.artifacts, 'evaluation_protocol');
  const test = revealed ? revealedTest(revealed) : null;
  useEffect(() => {
    if (!focus) return;
    const panel = document.getElementById(`benchmark-${run.id}`);
    panel?.scrollIntoView({ block: 'start' }); panel?.focus({ preventScroll: true });
  }, [run.id, focus]);

  return <Panel id={`benchmark-${run.id}`} tabIndex={-1} className="result" title={`${run.model} baseline`}
    description={`Benchmark ${run.id} · ${formatDate(run.created_at)}`} aside={<Badge state={run.status} />}>
    <div className="stack">
      <Alert title="Execution status is not scientific validity">A succeeded run passed upstream admission and computed metrics. It does not establish that the result generalises beyond the declared scope.</Alert>
      <div className="stack stack--tight">
        <h3>Exact inputs</h3>
        <p>Dataset {run.dataset_id} · Split {run.split_id} · Seed {run.seed}</p>
        {lineage.valid ? <div className="research-actions">
          <span>{lineage.dataset!.filename} · {lineage.dataset!.rows} rows</span>
          <Link className="text-link" href={splitHref(run.project_id, run.split_id)}>Inspect frozen split {run.split_id}</Link>
        </div> : <Alert variant="error" title="Run lineage unavailable or inconsistent">The recorded dataset and split do not resolve together in this project. No other split is substituted.</Alert>}
        <p>{run.protocol_ids.length
          ? <>Accepted candidate of sealed comparison {run.protocol_ids.map((id, i) => <span key={id}>{i > 0 && ', '}{protocols.some(p => p.id === id) ? <a className="text-link" href={`#protocol-${id}`}>{id}</a> : `${id} (protocol unavailable)`}</span>)}.</>
          : 'Not part of a sealed comparison: a manual or exploratory run. Its scores cannot certify a predeclared selection.'}</p>
        <Link className="text-link" href={benchmarkHref(run.project_id, run.id)}>Direct benchmark link</Link>
      </div>

      <TaskCard config={run.config} />

      {run.status === 'failed' ? <Alert variant="error" title="Admission or evaluation failed">
        {run.error ?? 'No error message was recorded.'} No metrics were produced; missing metrics are not zero.
      </Alert> : <div className="stack stack--tight">
        <h3>Validation results</h3>
        <MetricTable label="Validation metrics" metrics={run.validation_metrics} caption="Validation partition, used by upstream to choose hyperparameters" />
        {run.method ? <>
          <p>Selected parameters: {run.method.parameters ? JSON.stringify(run.method.parameters) : 'Not reported'}</p>
          {run.method.validation_search ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Validation search">
            <table className="table"><caption>Upstream grid search on the validation primary metric</caption>
              <thead><tr><th scope="col">Parameters</th><th scope="col">Validation primary</th></tr></thead>
              <tbody>{run.method.validation_search.map((item, i) => <tr key={i}><th scope="row" className="mono">{JSON.stringify(item.parameters)}</th><td className="tabular">{formatMetric(item.validation_primary)}</td></tr>)}</tbody>
            </table></div> : <p>Validation search not reported.</p>}
          {run.method.training_description && <p className="field-hint">{run.method.training_description}</p>}
        </> : <p>Method details not reported.</p>}
        {run.verification_scope && <p className="field-hint">Upstream verification scope: {run.verification_scope}</p>}
      </div>}

      {run.test_results === 'withheld' && <div className="stack stack--tight">
        <h3>Held-out test results</h3>
        {!test ? <>
          <Alert variant="info" title="Test results withheld from this preview">
            <EyeOff size={14} aria-hidden="true" /> {HOLDOUT_EXPOSURE[run.holdout_exposure]} Viewing test results records exposure for this holdout.
          </Alert>
          {!confirming ? <div><button className="button button--secondary" disabled={wb.busy} onClick={() => setConfirming(true)}>Reveal test results…</button></div>
            : <div className="stack stack--tight" role="group" aria-label="Confirm test reveal">
              <Alert variant="warning" title="Revealing records holdout exposure">
                {run.holdout_exposure === 'unexposed'
                  ? 'This records the first exposure of this exact dataset and partition. Later comparisons on it must be declared exploratory and cannot claim an untouched holdout. This cannot be undone.'
                  : 'This adds another recorded read of this holdout. It cannot be undone.'} Do not use test scores to choose or tune models.
              </Alert>
              <div className="cluster">
                <button className="button" disabled={wb.busy} onClick={() => void onReveal(run).then(() => setConfirming(false))}>Record exposure and reveal</button>
                <button className="button button--secondary" disabled={wb.busy} onClick={() => setConfirming(false)}>Cancel</button>
              </div>
            </div>}
        </> : <>
          <Alert variant="warning" title="Test results revealed · exposure recorded">These scores are for reporting a completed evaluation, not for choosing or tuning a model.</Alert>
          <MetricTable label="Test metrics" metrics={test.metrics} caption="Held-out test partition, scored once by upstream" />
          <p>Group MAE 95% interval: {test.interval ? `${formatMetric(test.interval[0])} to ${formatMetric(test.interval[1])}` : 'Not reported'}.{test.intervalScope ? ` ${test.intervalScope}` : ''}</p>
          <a className="text-link" href={`/api/projects/${run.project_id}/artifacts/${run.id}/download?representation=bundle`}>Download upstream run bundle</a>
          <p className="field-hint">The bundle contains the complete dataset, partitions and predictions; downloading it also records raw-data exposure.</p>
          <JsonBox value={revealed} summary="Inspect complete benchmark artifact" />
        </>}
      </div>}

      <div className="stack stack--tight">
        <h3>Outcome history</h3>
        {jobs.length ? <ul>{jobs.map(job => <li key={job.id}>Job {job.id}: {job.state}{job.finished_at ? ` · finished ${formatDate(job.finished_at)}` : ''}</li>)}</ul>
          : <p>No job in the current job list links to this result.</p>}
        {outcomes.length ? <ul>{outcomes.map(outcome => <li key={outcome.id}>
          <Link className="text-link" href={failureHref(run.project_id, outcome.id)}>{'reason' in outcome ? outcome.reason : 'Recorded outcome'}</Link> · {outcome.schema_version === '2.0' ? `${outcome.actor.kind} · ${humanise(outcome.observation.kind)} · receipt ${outcome.receipt.state}` : 'legacy human record'} · {formatDate(outcome.created_at)}
        </li>)}</ul> : <p>No unsuccessful outcome is recorded for this run. Absence of a record is not evidence of success.</p>}
        <Link className="text-link" href={assessRunHref(run.project_id, run.id)}>Record that this run did not meet my objective <ArrowUpRight size={14} aria-hidden="true" /></Link>
      </div>
      <JsonBox value={run} summary="Inspect preview projection (test output withheld)" />
    </div>
  </Panel>;
}

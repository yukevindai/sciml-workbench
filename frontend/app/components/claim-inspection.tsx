'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Workbench } from '../lib/context';
import type { Claim, ClaimSet, EvidenceSpanView } from '../lib/generated/http';
import { kinds } from '../lib/types';
import { api } from '../lib/api';
import { parseEvidenceSpan } from '../lib/decode';
import { CLASSIFICATION, REFERENCE_CHECK, SEMANTIC_REVIEW } from '../lib/evidence';
import { benchmarkHref } from '../lib/benchmark';
import { splitHref } from '../lib/split';
import { formatDate, formatMetric } from '../lib/format';
import { Alert, JsonBox, Panel } from './ui';
import { CitationView } from './evidence-inspection';

type Opened = { key: string; span?: EvidenceSpanView; error?: string };

function ClaimCard({ wb, set, claim, onShow }: { wb: Workbench; set: ClaimSet; claim: Claim; onShow: (span: EvidenceSpanView) => void }) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const documents = kinds(wb.artifacts, 'evidence');
  const benchmarks = kinds(wb.artifacts, 'benchmark_preview');
  const classification = CLASSIFICATION[claim.classification];
  const check = REFERENCE_CHECK[claim.reference_check.status];
  const review = SEMANTIC_REVIEW[claim.semantic_review.status];

  const open = (index: number) => {
    const key = `${claim.id}:${index}`;
    const reference = claim.source_references[index];
    setOpened({ key });
    api(`projects/${set.project_id}/claim-sets/${set.id}/claims/${encodeURIComponent(claim.id)}/source-references/${index}`, parseEvidenceSpan)
      .then(span => {
        if (span.reference.source_artifact_id !== reference.source_artifact_id || span.reference.excerpt_sha256 !== reference.excerpt_sha256
          || span.reference.locator.start !== reference.locator.start || span.reference.locator.end !== reference.locator.end || span.reference.page !== reference.page) {
          throw new Error('The server returned a different span than the claim cites.');
        }
        setOpened(value => value?.key === key ? { key, span } : value);
      })
      .catch(e => setOpened(value => value?.key === key ? { key, error: e instanceof Error ? e.message : 'Could not open citation.' } : value));
  };

  return <li className="claim stack stack--tight" id={`claim-${set.id}-${claim.id}`}>
    <p className="claim-statement">{claim.statement}</p>
    <div className="cluster">
      <span className="badge badge--info" title={classification.description}>{classification.label}</span>
      <span className={`badge ${check.tone}`}>{check.label}</span>
      <span className={`badge ${review.tone}`}>{review.label}</span>
    </div>
    <p className="field-hint">{classification.description}</p>
    {claim.reference_check.status === 'invalid' && <Alert variant="error" title="Reference check failed">{claim.reference_check.issues.join(' ')}</Alert>}
    {claim.reference_check.status === 'valid' && claim.reference_check.checked_at && <p className="field-hint">References checked {formatDate(claim.reference_check.checked_at)}. That confirms locations and values only.</p>}
    {claim.semantic_review.status === 'not_reviewed'
      ? <p className="field-hint">No reviewer has judged whether the cited material supports this statement.</p>
      : <Alert variant={claim.semantic_review.status === 'supported' ? 'success' : 'warning'} title={review.label}>
        {claim.semantic_review.explanation} Reviewer assignment {claim.semantic_review.reviewer_assignment_id}; reviewed snapshot {claim.semantic_review.reviewed_snapshot_sha256}.
      </Alert>}
    <dl className="audit-config">
      <div><dt>Population</dt><dd>{claim.population}</dd></div>
      <div><dt>Uncertainty</dt><dd>{claim.uncertainty}</dd></div>
      <div><dt>Limitations</dt><dd>{claim.limitations.length ? <ul>{claim.limitations.map((value, i) => <li key={i}>{value}</li>)}</ul> : 'None recorded'}</dd></div>
      <div><dt>Split</dt><dd>{claim.split_id ? <Link className="text-link" href={splitHref(set.project_id, claim.split_id)}>{claim.split_id}</Link> : 'Not bound to a split'}</dd></div>
    </dl>

    {claim.metric_references.length > 0 && <div className="table-scroll" tabIndex={0} role="region" aria-label="Metric references">
      <table className="table"><caption>Values stored with the claim. A test-partition value was recorded as holdout exposure when this listing loaded.</caption>
        <thead><tr><th scope="col">Benchmark</th><th scope="col">Field</th><th scope="col">Partition</th><th scope="col">Value</th><th scope="col">Units</th></tr></thead>
        <tbody>{claim.metric_references.map((ref, i) => <tr key={i}>
          <th scope="row">{benchmarks.some(b => b.id === ref.artifact_id) ? <Link className="text-link" href={benchmarkHref(set.project_id, ref.artifact_id)}>{ref.artifact_id}</Link> : `${ref.artifact_id} (unavailable)`}</th>
          <td className="mono">{ref.field_path}</td><td>{ref.partition}</td>
          <td className="tabular">{formatMetric(ref.value)}</td><td>{ref.units ?? 'None recorded'}</td>
        </tr>)}</tbody>
      </table>
    </div>}

    {claim.source_references.length > 0 && <div className="stack stack--tight">
      <h4>Source citations</h4>
      <ul className="stack stack--tight">{claim.source_references.map((ref, index) => {
        const source = documents.find(document => document.id === ref.source_artifact_id);
        const key = `${claim.id}:${index}`;
        return <li key={index} className="stack stack--tight">
          <div className="research-actions">
            <span>{source ? source.title : `Source ${ref.source_artifact_id} (not in this project listing)`} · {ref.page === null ? 'whole-document text' : `page ${ref.page}`} · code points {ref.locator.start}–{ref.locator.end}</span>
            <button type="button" className="button button--secondary button--sm" disabled={opened?.key === key && !opened.span && !opened.error}
              onClick={() => open(index)}>Open citation</button>
          </div>
          {opened?.key === key && (opened.span
            ? <CitationView span={opened.span} title={source?.title ?? ref.source_artifact_id} onShow={source ? () => onShow(opened.span!) : undefined} />
            : opened.error ? <Alert variant="error" role="alert">Citation could not be verified: {opened.error} No other text is shown.</Alert> : <p>Verifying citation…</p>)}
        </li>;
      })}</ul>
    </div>}
  </li>;
}

export function ClaimSetPanel({ wb, set, focus, onShow }: { wb: Workbench; set: ClaimSet; focus: boolean; onShow: (span: EvidenceSpanView) => void }) {
  useEffect(() => {
    if (!focus) return;
    const panel = document.getElementById(`claim-set-${set.id}`);
    panel?.scrollIntoView({ block: 'start' }); panel?.focus({ preventScroll: true });
  }, [set.id, focus]);
  return <Panel id={`claim-set-${set.id}`} tabIndex={-1} className="result" title={`Claims · run ${set.run_id}, revision ${set.revision}`}
    description={`Claim set ${set.id} · recorded ${formatDate(set.created_at)}`}>
    <div className="stack">
      <ul className="stack">{set.claims.map(claim => <ClaimCard key={claim.id} wb={wb} set={set} claim={claim} onShow={onShow} />)}</ul>
      <JsonBox value={set} summary="Inspect complete claim set" />
    </div>
  </Panel>;
}

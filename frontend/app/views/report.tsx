'use client';

import Link from 'next/link';
import { Check, Download, FileCheck } from 'lucide-react';
import type { Workbench } from '../lib/context';
import { submitOperation } from '../lib/submissions';
import { reportHref } from '../lib/lineage';
import { formatDate, shortId } from '../lib/format';
import { kinds } from '../lib/types';
import { Alert, Badge, EmptyState, Panel } from '../components/ui';
import { ReportCard } from '../components/report-inspection';

const CONTENTS = [
  'The original CSV and PDF bytes, with the source metadata declared for them',
  'Every audit, split, benchmark, evidence, claim and failure record, with its dependencies',
  'Settled jobs, including failed ones, without request payloads or raw worker errors',
  'Evaluation protocol state and the holdout exposure history at capture time',
  'Pinned upstream commits, Python/platform/package versions and JSON Schemas',
  'A readable report.md and a SHA-256 manifest over every file',
];
const AUTO_VERIFY = 3;

export function ReportView({ wb, requestedReportId }: { wb: Workbench; requestedReportId?: string }) {
  const reports = kinds(wb.artifacts, 'report').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const exports = wb.jobs.filter(job => job.kind === 'report');
  const active = wb.jobs.filter(job => job.kind !== 'report' && (job.state === 'queued' || job.state === 'running'));
  const exporting = exports.some(job => job.state === 'queued' || job.state === 'running');

  return <>
    <div className="split split--wide-first">
      <Panel title="Export this project" description="A manual export freezes the whole project at submission. Research runs export their own selected scope automatically when finished.">
        <ul className="checklist">{CONTENTS.map(item => <li key={item}><Check size={15} aria-hidden="true" />{item}</li>)}</ul>
        <Alert title="What verification does and does not mean">
          The workbench checks each archive&rsquo;s structure when it is created and again when you inspect it here. It does not rerun the science. Scientific replay is a separate command and is always shown as not run.
        </Alert>
        <div className="panel-foot">
          <span className="field-hint">{active.length
            ? `Wait for ${active.length} running job${active.length === 1 ? '' : 's'} to settle; a project export requires all work to be finished.`
            : exporting ? 'An export is in progress.' : `${wb.artifacts.filter(a => a.kind !== 'report').length} artifacts would be captured.`}</span>
          <button type="button" className="button" disabled={wb.busy || !wb.projectId || active.length > 0 || exporting || !wb.artifacts.length}
            onClick={() => void wb.act(async () => {
              // One retained key until the server answers, so a retry after a lost response is the same export.
              await submitOperation(wb.projectId, 'report');
              wb.setNotice('Export accepted. The archive appears below once assembled and structurally verified.');
            })}>
            <FileCheck size={15} aria-hidden="true" />Export project
          </button>
        </div>
      </Panel>

      <Panel title="Export jobs" description={exports.length ? 'Recent exports, newest first. A failed export produced no archive.' : 'No exports requested.'}>
        {exports.length === 0 ? <EmptyState icon={Download} title="No archives yet">Export once your runs have settled. Each export is a separate snapshot.</EmptyState>
          : <ul className="stack stack--tight">{exports.slice(0, 10).map(job => <li key={job.id} className="cluster">
            <Badge state={job.state} />
            <span className="mono">{shortId(job.id)}</span>
            <span className="dim">{formatDate(job.created_at)}</span>
            {job.result_id ? <Link className="text-link" href={reportHref(job.project_id, job.result_id)}>Inspect archive</Link>
              : job.state === 'failed' ? <span className="lineage-missing">No archive{job.error ? `: ${job.error}` : ''}</span> : null}
          </li>)}</ul>}
      </Panel>
    </div>

    {requestedReportId && !reports.some(r => r.id === requestedReportId) && <Alert variant="error" title="Requested report unavailable">
      This project has no report with ID {requestedReportId}. No other archive is substituted.
    </Alert>}
    {reports.length === 0
      ? <Panel title="Archives"><p>No archives in this project.</p></Panel>
      : reports.map((report, index) => <ReportCard key={report.id} wb={wb} report={report}
        focus={report.id === requestedReportId} autoVerify={index < AUTO_VERIFY} />)}
  </>;
}

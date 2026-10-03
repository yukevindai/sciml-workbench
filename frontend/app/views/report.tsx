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
    {exporting && <Alert variant="info" role="status">An export is in progress.</Alert>}
    {requestedReportId && !reports.some(r => r.id === requestedReportId) && <Alert variant="error" title="Requested report unavailable">
      This project has no report with ID {requestedReportId}. No other archive is substituted.
    </Alert>}
    {reports.length === 0
      ? <Panel title="Archives"><p>No archives in this project.</p></Panel>
      : reports.map((report, index) => <ReportCard key={report.id} wb={wb} report={report}
        focus={report.id === requestedReportId} autoVerify={index < AUTO_VERIFY} />)}
  </>;
}

'use client';

import { Check, Download, FileCheck } from 'lucide-react';
import type { Workbench } from '../lib/context';
import { formatDate, shortId } from '../lib/format';
import { kinds } from '../lib/types';
import { Alert, EmptyState, Panel } from '../components/ui';

const CONTENTS = [
  'The original CSV bytes, and the source metadata you declared for them',
  'Every audit and its findings, plus the configuration that produced them',
  'Frozen split assignments for all rows, not just the ones shown on screen',
  'Benchmark bundles with task cards, predictions and metrics',
  'Failure memory snapshots and the evidence documents you ingested',
  'Pinned dependency versions, JSON Schemas and a SHA-256 manifest',
];

export function ReportView({ wb }: { wb: Workbench }) {
  const reports = kinds(wb.artifacts, 'report');
  const blocked = wb.jobsActive;

  return (
    <>
      <div className="split split--wide-first">
        <Panel
          title="A reproducible record of this project"
          description="One archive that another researcher can verify, and that `workbench.replay` can re-execute end to end."
        >
          <ul className="checklist">
            {CONTENTS.map(item => (
              <li key={item}><Check size={15} aria-hidden="true" />{item}</li>
            ))}
          </ul>

          <Alert variant="info" title="Replay checks the archive against itself">
            Replay validates every file against the manifest, regenerates the audit and split, and confirms the row assignments match exactly. Scores may differ in the last decimal places across platforms; hashes and partitions must not.
          </Alert>

          <div className="panel-foot">
            <span className="field-hint">
              {blocked
                ? 'Wait for running jobs to finish so the archive captures their results.'
                : `${wb.artifacts.length} artifact${wb.artifacts.length === 1 ? '' : 's'} will be included.`}
            </span>
            <button
              className="button"
              disabled={wb.busy || !wb.projectId || blocked || !wb.artifacts.length}
              onClick={() => wb.act(() => wb.submit('report'))}
            >
              <FileCheck size={15} aria-hidden="true" />Generate report
            </button>
          </div>
        </Panel>

        <Panel title="Exports" description={reports.length ? undefined : 'Nothing exported yet.'}>
          {reports.length === 0 ? (
            <EmptyState icon={Download} title="No archives yet">
              Generate one once your runs have settled. Each export is a snapshot, so you can keep several.
            </EmptyState>
          ) : (
            <div className="stack stack--tight">
              {reports.map(report => (
                <div className="download-row" key={report.id}>
                  <div className="download-text">
                    <strong>Reproducible research bundle</strong>
                    <span className="meta-list">
                      <span>{formatDate(report.created_at)}</span>
                      <span className="meta-id">{shortId(report.id)}</span>
                    </span>
                  </div>
                  <a
                    className="button"
                    href={`/api/projects/${wb.projectId}/artifacts/${report.id}/download`}
                  >
                    <Download size={15} aria-hidden="true" />Download ZIP
                  </a>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

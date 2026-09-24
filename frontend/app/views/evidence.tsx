'use client';

import { Download, FileText } from 'lucide-react';
import { PdfAttachments } from '../components/pdf-attachments';
import type { Workbench } from '../lib/context';
import { formatDate, pluralise } from '../lib/format';
import { kinds } from '../lib/types';
import { EmptyState, JsonBox, Panel } from '../components/ui';

export function EvidenceView({ wb }: { wb: Workbench }) {
  const documents = kinds(wb.artifacts, 'evidence');
  return <>
    <PdfAttachments key={wb.projectId} wb={wb} />
    {documents.length === 0 ? (
      <Panel title="Ingested documents">
        <EmptyState icon={FileText} title="No extracted documents yet">
          Attach a PDF, then choose Extract text when you want to inspect its text layer. Original attachments remain available above.
        </EmptyState>
      </Panel>
    ) : documents.map(document => (
      <Panel key={document.id} title={document.title}
        description={typeof document.result.page_count === 'number' && Number.isInteger(document.result.page_count) && document.result.page_count > 0
          ? `${pluralise(document.result.page_count, 'page')} · metadata supplied by the researcher` : 'Metadata supplied by the researcher'}
        aside={<a className="button button--secondary button--sm" href={`/api/projects/${wb.projectId}/artifacts/${document.id}/download`}>
          <Download size={14} aria-hidden="true" />Source bundle
        </a>}>
        <span className="meta-list"><span>Ingested {formatDate(document.created_at)}</span></span>
        <JsonBox value={document} />
      </Panel>
    ))}
  </>;
}

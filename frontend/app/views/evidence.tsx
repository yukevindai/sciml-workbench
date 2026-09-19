'use client';

import { useState } from 'react';
import { BookOpen, Download, FileText } from 'lucide-react';
import { api } from '../lib/api';
import type { Workbench } from '../lib/context';
import { formatDate, pluralise } from '../lib/format';
import { kinds } from '../lib/types';
import { Alert, EmptyState, Field, JsonBox, Panel } from '../components/ui';

export function EvidenceView({ wb }: { wb: Workbench }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const documents = kinds(wb.artifacts, 'evidence');

  return (
    <>
      <Panel
        title="Add a source document"
        description="The Scientific Evidence Engine preserves the original PDF bytes, its text layer, per-page hashes and the metadata you supply."
      >
        <div className="split">
          <Field label="Document title" hint="How you will recognise it in the report.">
            {props => (
              <input
                className="input"
                value={title}
                placeholder="Zhang et al. 2023, conductivity of ternary electrolytes"
                onChange={event => setTitle(event.target.value)}
                {...props}
              />
            )}
          </Field>

          <Field label="PDF file" hint="Up to 10 MiB.">
            {props => (
              <input
                className="input-file"
                type="file"
                accept=".pdf,application/pdf"
                onChange={event => setFile(event.target.files?.[0] ?? null)}
                {...props}
              />
            )}
          </Field>
        </div>

        <Alert variant="info" title="What ingestion is, and is not">
          Text is taken from the PDF&rsquo;s own text layer. There is no OCR, no figure digitisation and no automatic claim checking, so a scanned document may yield no text at all.
        </Alert>

        <div className="panel-foot">
          <span className="field-hint">
            {documents.length ? pluralise(documents.length, 'document') + ' in this project' : 'No documents yet'}
          </span>
          <button
            className="button"
            disabled={wb.busy || !wb.projectId || !title.trim() || !file}
            onClick={() => wb.act(async () => {
              await api(`projects/${wb.projectId}/evidence`, {
                method: 'POST',
                headers: {
                  'X-Title': title,
                  'Content-Type': 'application/pdf',
                  'Idempotency-Key': crypto.randomUUID(),
                },
                body: file,
              });
              setTitle('');
              setFile(null);
              wb.setNotice('Evidence ingestion queued.');
            })}
          >
            <BookOpen size={15} aria-hidden="true" />Ingest document
          </button>
        </div>
      </Panel>

      {documents.length === 0 ? (
        <Panel title="Ingested documents">
          <EmptyState icon={FileText} title="No source documents yet">
            Papers and internal notes added here stay linked to the data they justify, and travel with the exported report.
          </EmptyState>
        </Panel>
      ) : (
        documents.map(document => (
          <Panel
            key={document.id}
            title={document.title}
            description={
              document.result?.page_count
                ? `${pluralise(document.result.page_count, 'page')} · metadata supplied by the researcher`
                : 'Metadata supplied by the researcher'
            }
            aside={
              <a
                className="button button--secondary button--sm"
                href={`/api/projects/${wb.projectId}/artifacts/${document.id}/download`}
              >
                <Download size={14} aria-hidden="true" />Source bundle
              </a>
            }
          >
            <span className="meta-list"><span>Ingested {formatDate(document.created_at)}</span></span>
            <JsonBox value={document} />
          </Panel>
        ))
      )}
    </>
  );
}

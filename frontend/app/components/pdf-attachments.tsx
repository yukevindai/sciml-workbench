'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { parseJob, parseMaterial, parseMaterials } from '../lib/decode';
import type { Workbench } from '../lib/context';
import type { MaterialResponse } from '../lib/generated/http';
import { Alert, Field, Panel } from './ui';

/** The original attachment is independent of extraction and remains downloadable after failures. */
export function PdfAttachments({ wb }: { wb: Workbench }) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [attached, setAttached] = useState(false);
  const [materials, setMaterials] = useState<MaterialResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ingested, setIngested] = useState<Record<string, string>>({});
  const uploadKey = useRef<string | null>(null);
  const ingestKeys = useRef(new Map<string, string>());
  const sequence = useRef(0);

  const reload = useCallback(async () => {
    if (!wb.projectId) return;
    const request = ++sequence.current;
    setLoading(true); setError('');
    try {
      const values = await api(`projects/${wb.projectId}/research-materials`, parseMaterials);
      if (request !== sequence.current) return;
      if (values.some(value => value.project_id !== wb.projectId)) throw new Error('The server returned attachments for a different project.');
      setMaterials(values.filter(value => value.media_type === 'application/pdf'));
    } catch (e) {
      if (request === sequence.current) setError(e instanceof Error ? e.message : 'Could not load attachments.');
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [wb.projectId]);

  useEffect(() => { void reload(); return () => { sequence.current += 1; }; }, [reload]);

  return <>
    <Panel title="Attach a source PDF" description="Preserve the original first. Text extraction is a separate, optional step; the filename is used as its title.">
      <fieldset className="intake-fields" disabled={wb.busy || !wb.projectId}>
        <Field label="PDF file" hint="Up to 10 MiB. Nothing is uploaded until you choose Attach PDF." error={fileError || undefined}>
          {props => <input type="file" className="input-file" accept=".pdf,application/pdf" {...props}
            onChange={event => {
              setFile(event.target.files?.[0] ?? null); setFileError(''); setAttached(false); uploadKey.current = null;
            }} />}
        </Field>
        <div className="panel-foot">
          <span className="field-hint">{attached ? 'Original attached. You can extract text below.' : 'A PDF attachment does not establish successful extraction or verified evidence.'}</span>
          <button type="button" className="button" disabled={!file || attached} onClick={() => {
            if (!file) return;
            if (!file.size || file.size > 10 * 1024 * 1024) { setFileError('Choose a nonempty PDF no larger than 10 MiB.'); return; }
            void wb.act(async () => {
              if (!(await file.slice(0, 5).text()).startsWith('%PDF-')) { setFileError('This file does not have a PDF header. Select a PDF; the original selection has been retained.'); return; }
              uploadKey.current ??= crypto.randomUUID();
              const material = await api(`projects/${wb.projectId}/research-materials`, parseMaterial, {
                method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-Filename': file.name, 'Idempotency-Key': uploadKey.current }, body: file,
              });
              if (material.project_id !== wb.projectId || material.media_type !== 'application/pdf') throw new Error('The server returned an attachment outside this PDF context.');
              setMaterials(current => [material, ...current.filter(value => value.id !== material.id)]);
              setAttached(true);
              wb.setNotice('PDF attached. Original bytes are preserved; text extraction has not been run.');
              await reload();
            });
          }}>{attached ? 'PDF attached' : 'Attach PDF'}</button>
        </div>
      </fieldset>
    </Panel>
    <Panel title="Attached PDFs" description="Originals remain available even when extraction is not run or fails. Scanned PDFs may have no text layer; OCR and automatic claim verification are unavailable.">
      {loading && <p>Loading attachments…</p>}
      {error && <div className="stack stack--tight">
        <Alert variant="error" role="alert">{error}</Alert>
        <div><button type="button" className="button button--secondary" onClick={() => void reload()}>Retry attachments</button></div>
      </div>}
      {!loading && !error && !materials.length && <p>No PDF attachments yet.</p>}
      <ul className="stack">
        {materials.map(material => <li key={material.id} className="stack stack--tight">
          <h3>{material.filename}</h3>
          <p className="field-hint">Original preserved · {material.id}</p>
          <div className="research-actions">
            <a className="button button--secondary" href={`/api/projects/${wb.projectId}/research-materials/${material.id}/download`}>Download original PDF</a>
            <button type="button" className="button" disabled={wb.busy || Boolean(ingested[material.id])} onClick={() => void wb.act(async () => {
              let key = ingestKeys.current.get(material.id);
              if (!key) { key = crypto.randomUUID(); ingestKeys.current.set(material.id, key); }
              const job = await api(`projects/${wb.projectId}/research-materials/${material.id}/ingest`, parseJob, {
                method: 'POST', headers: { 'Idempotency-Key': key },
              });
              if (job.project_id !== wb.projectId) throw new Error('The server returned a job for a different project.');
              setIngested(current => ({ ...current, [material.id]: job.id }));
              wb.setNotice('Text extraction accepted. Inspect job activity for its outcome; the original PDF remains available.');
            })}>{ingested[material.id] ? 'Extraction accepted' : 'Extract text'}</button>
          </div>
          {ingested[material.id] && <p className="field-hint">Job: {ingested[material.id]}. Acceptance does not mean extraction succeeded.</p>}
        </li>)}
      </ul>
    </Panel>
  </>;
}

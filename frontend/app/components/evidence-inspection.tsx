'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import type { Workbench } from '../lib/context';
import type { EvidenceAnchor, EvidencePageText, EvidenceSpanView } from '../lib/generated/http';
import type { EvidenceArtifact } from '../lib/types';
import { api } from '../lib/api';
import { parseEvidencePage, parseEvidenceSpan } from '../lib/decode';
import { evidenceRecord, locateSpan } from '../lib/evidence';
import { formatDate, humanise, pluralise, shortId } from '../lib/format';
import { Alert, JsonBox, Panel } from './ui';

/** A citation the researcher asked to see inside its source document. */
export type CitationFocus = { span: EvidenceSpanView; request: number };

const location = (span: EvidenceSpanView) => span.reference.page === null
  ? 'Whole-document text (all pages joined in order, no page anchor recorded)'
  : `Page ${span.reference.page}`;

/** Server-verified excerpt with bounded, unmodified surrounding text. */
export function CitationView({ span, title, onShow }: { span: EvidenceSpanView; title: string; onShow?: () => void }) {
  const { start, end } = span.reference.locator;
  return <div className="citation stack stack--tight">
    <p className="field-hint">
      {title} · {location(span)} · code points {start}–{end} of {span.representation_length}
      {span.span_id && <> · named anchor <span className="mono">{span.span_id}</span></>}
    </p>
    <pre className="code-block evidence-text" aria-label={`Citation from ${title}`}>
      {start > span.before.length && <span className="dim">…</span>}{span.before}<mark>{span.text}</mark>{span.after}
      {span.representation_length - end > span.after.length && <span className="dim">…</span>}
    </pre>
    <p className="field-hint">Exact PDF text layer, rechecked against the stored original and bundle when opened. The anchor shows where the text is. It does not show that the source supports a claim.</p>
    {onShow && span.reference.page !== null && <div><button type="button" className="button button--secondary button--sm" onClick={onShow}>Show on page {span.reference.page}</button></div>}
  </div>;
}

export function EvidenceDocument({ wb, document, anchors, focus, citation }: {
  wb: Workbench; document: EvidenceArtifact; anchors: EvidenceAnchor[]; focus: boolean; citation?: CitationFocus;
}) {
  const record = evidenceRecord(document);
  const textPages = record.pages.filter(page => page.hasText).length;
  const [selected, setSelected] = useState<number | null>(null);
  const [pages, setPages] = useState<Record<number, EvidencePageText>>({});
  const [loading, setLoading] = useState<number | null>(null);
  const [pageError, setPageError] = useState<{ page: number; message: string } | null>(null);
  const [openAnchor, setOpenAnchor] = useState<{ id: string; span?: EvidenceSpanView; error?: string } | null>(null);
  const sequence = useRef(0);
  const base = `projects/${document.project_id}`;

  const load = useCallback(async (page: number) => {
    const request = ++sequence.current;
    setSelected(page); setPageError(null); setLoading(page);
    try {
      const value = await api(`${base}/evidence/${document.id}/pages/${page}`, parseEvidencePage);
      if (value.source_artifact_id !== document.id || value.page !== page || value.source_sha256 !== document.sha256) throw new Error('The server returned text for a different page or source.');
      if (request !== sequence.current) return;
      setPages(current => ({ ...current, [page]: value }));
    } catch (e) {
      if (request === sequence.current) setPageError({ page, message: e instanceof Error ? e.message : 'Could not load page text.' });
    } finally {
      if (request === sequence.current) setLoading(null);
    }
  }, [base, document.id, document.sha256]);

  useEffect(() => () => { sequence.current += 1; }, []);
  useEffect(() => {
    if (!focus && !citation) return;
    const panel = window.document.getElementById(`evidence-${document.id}`);
    panel?.scrollIntoView({ block: 'start' }); panel?.focus({ preventScroll: true });
  }, [document.id, focus, citation]);
  useEffect(() => {
    if (citation?.span.reference.page != null) void load(citation.span.reference.page);
  }, [citation, load]);

  const current = selected === null ? undefined : pages[selected];
  const highlight = citation && current && citation.span.reference.page === current.page ? locateSpan(current.text, citation.span) : null;
  const inventoryPage = selected === null ? undefined : record.pages.find(page => page.page === selected);
  const documentAnchors = anchors.filter(anchor => anchor.source_artifact_id === document.id);

  return <Panel id={`evidence-${document.id}`} tabIndex={-1} className="result" title={document.title}
    description={`Evidence ${document.id} · ingested ${formatDate(document.created_at)}`}
    aside={<div className="research-actions">
      <a className="button button--secondary button--sm" href={`/api/${base}/artifacts/${document.id}/download?representation=original`}><Download size={14} aria-hidden="true" />Original PDF</a>
      <a className="button button--secondary button--sm" href={`/api/${base}/artifacts/${document.id}/download?representation=bundle`}><Download size={14} aria-hidden="true" />Source bundle</a>
    </div>}>
    <div className="stack">
      {record.issues.length > 0 && <Alert variant="error" title="Ingestion record is inconsistent">{record.issues.join(' ')} Nothing has been filled in. Inspect the complete artifact below.</Alert>}

      <section className="provenance-block provenance-block--user" aria-labelledby={`user-${document.id}`}>
        <h3 id={`user-${document.id}`}>Supplied metadata <span className="badge badge--warning">Unverified</span></h3>
        <p className="field-hint">Supplied at ingestion (the manual flow uses the attachment filename as the title), not read from the PDF. DOI, authors and license are not inferred.</p>
        <dl className="audit-config">
          {record.metadata.length ? record.metadata.map(([key, value]) => <div key={key}><dt>{humanise(key)}</dt><dd>{value}</dd></div>)
            : <div><dt>Metadata</dt><dd>None recorded</dd></div>}
          <div><dt>Status</dt><dd>{record.metadataStatus === 'user_supplied_unverified' ? 'Supplied by the researcher, not verified' : record.metadataStatus ?? 'Not recorded'}</dd></div>
        </dl>
      </section>

      <section className="provenance-block provenance-block--source" aria-labelledby={`source-${document.id}`}>
        <h3 id={`source-${document.id}`}>Derived from the PDF</h3>
        <dl className="audit-config">
          <div><dt>Original SHA-256</dt><dd className="mono">{document.sha256}</dd></div>
          <div><dt>Pages</dt><dd>{record.pageCount ?? 'Not recorded'}</dd></div>
          <div><dt>Text layer</dt><dd>{record.pages.length ? `${textPages} of ${pluralise(record.pages.length, 'page')} have extractable text` : 'Not recorded'}</dd></div>
          <div><dt>Extraction</dt><dd>{record.extraction === 'pdfium_text_layer' ? 'PDFium text layer (no OCR)' : record.extraction ?? 'Not recorded'}</dd></div>
          <div><dt>Software</dt><dd>{record.software.length ? record.software.map(([name, version]) => `${name} ${version}`).join(', ') : 'Not recorded'}</dd></div>
        </dl>
        {record.pages.length > 0 && textPages === 0 && <Alert variant="warning" title="No extractable text">No page has a text layer, which is typical of a scanned or image-only PDF. OCR is not available, so no text can be shown or cited. The original PDF is still available.</Alert>}
        {textPages > 0 && textPages < record.pages.length && <Alert title="Some pages have no text layer">Only the pages marked &ldquo;Available&rdquo; can be shown or cited. Pages without text are not OCR&rsquo;d or guessed.</Alert>}

        {record.pages.length > 0 && <div className="table-scroll" tabIndex={0} role="region" aria-label={`Pages of ${document.title}`}>
          <table className="table"><caption>Page numbers come from the ingestion record. Text is loaded one page at a time.</caption>
            <thead><tr><th scope="col">Page</th><th scope="col">Text layer</th><th scope="col">Size (pt)</th><th scope="col">Text SHA-256</th><th scope="col"><span className="visually-hidden">Action</span></th></tr></thead>
            <tbody>{record.pages.map(page => <tr key={page.page} aria-current={selected === page.page ? 'true' : undefined}>
              <th scope="row">{page.page}</th>
              <td>{page.hasText ? 'Available' : 'None'}</td>
              <td className="tabular">{page.size ? `${Math.round(page.size[0])} × ${Math.round(page.size[1])}` : 'Not recorded'}</td>
              <td className="mono" title={page.textSha256}>{shortId(page.textSha256, 12)}</td>
              <td><button type="button" className="button button--secondary button--sm" disabled={loading !== null}
                aria-label={`Show page ${page.page} text`} onClick={() => void load(page.page)}>{page.hasText ? 'Show text' : 'Inspect'}</button></td>
            </tr>)}</tbody>
          </table>
        </div>}

        {selected !== null && <div className="stack stack--tight" aria-live="polite">
          <h4>Page {selected} text</h4>
          {loading === selected && <p>Loading page {selected}…</p>}
          {pageError?.page === selected && <div className="stack stack--tight">
            <Alert variant="error" role="alert">Page {selected} text unavailable: {pageError.message}</Alert>
            <div><button type="button" className="button button--secondary" onClick={() => void load(selected)}>Retry page {selected}</button></div>
          </div>}
          {current && !current.has_text && <Alert variant="warning">Page {selected} has no text layer. Nothing is shown because nothing was extracted. OCR is not available.</Alert>}
          {current && inventoryPage && current.text_sha256 !== inventoryPage.textSha256 && <Alert variant="error">The loaded text digest differs from the ingestion record. Do not rely on this page.</Alert>}
          {current?.has_text && <>
            {citation && citation.span.reference.page === current.page && !highlight && <Alert variant="error">The page text no longer matches the verified citation, so nothing is highlighted.</Alert>}
            <pre className="code-block evidence-text" tabIndex={0} aria-label={`Exact text of page ${current.page}`}>
              {highlight ? <>{highlight[0]}<mark>{highlight[1]}</mark>{highlight[2]}</> : current.text}
            </pre>
            <p className="field-hint">Shown exactly as extracted. Line breaks and spacing are unchanged. Reading order and completeness are not verified.</p>
          </>}
        </div>}
      </section>

      <section className="stack stack--tight" aria-labelledby={`anchors-${document.id}`}>
        <h3 id={`anchors-${document.id}`}>Named anchors</h3>
        {!documentAnchors.length ? <p>No named anchors reference this document.</p> : <ul className="stack stack--tight">
          {documentAnchors.map(anchor => <li key={anchor.id} className="stack stack--tight">
            <div className="research-actions">
              <span><span className="mono">{anchor.id}</span> · {anchor.reference.page === null ? 'whole-document text' : `page ${anchor.reference.page}`} · code points {anchor.reference.locator.start}–{anchor.reference.locator.end}</span>
              <button type="button" className="button button--secondary button--sm" onClick={() => {
                setOpenAnchor({ id: anchor.id });
                api(`${base}/evidence-spans/${anchor.id}`, parseEvidenceSpan)
                  .then(span => {
                    if (span.span_id !== anchor.id || span.reference.source_artifact_id !== document.id) throw new Error('The server returned a different anchor.');
                    setOpenAnchor(value => value?.id === anchor.id ? { id: anchor.id, span } : value);
                  })
                  .catch(e => setOpenAnchor(value => value?.id === anchor.id ? { id: anchor.id, error: e instanceof Error ? e.message : 'Could not open anchor.' } : value));
              }}>Open anchor</button>
            </div>
            {openAnchor?.id === anchor.id && (openAnchor.span ? <CitationView span={openAnchor.span} title={document.title} />
              : openAnchor.error ? <Alert variant="error" role="alert">Anchor could not be verified: {openAnchor.error}</Alert> : <p>Verifying anchor…</p>)}
          </li>)}
        </ul>}
      </section>

      <p className="field-hint">Ingestion ran successfully. That does not mean the extracted text is accurate or that the document supports any claim.</p>
      <JsonBox value={document} />
    </div>
  </Panel>;
}

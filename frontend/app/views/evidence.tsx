'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { PdfAttachments } from '../components/pdf-attachments';
import { EvidenceDocument, type CitationFocus } from '../components/evidence-inspection';
import { ClaimSetPanel } from '../components/claim-inspection';
import type { Workbench } from '../lib/context';
import type { EvidenceAnchor, EvidenceSpanView } from '../lib/generated/http';
import { api } from '../lib/api';
import { parseEvidenceAnchors } from '../lib/decode';
import { kinds } from '../lib/types';
import { Alert, EmptyState, Panel } from '../components/ui';

export function EvidenceView({ wb, requestedEvidenceId, requestedClaimSetId }: { wb: Workbench; requestedEvidenceId?: string; requestedClaimSetId?: string }) {
  const documents = kinds(wb.artifacts, 'evidence').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const claimSets = kinds(wb.artifacts, 'claim_set').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [anchors, setAnchors] = useState<EvidenceAnchor[]>([]);
  const [anchorError, setAnchorError] = useState('');
  const [citation, setCitation] = useState<CitationFocus | undefined>();
  const request = useRef(0);

  const loadAnchors = useCallback(async () => {
    if (!wb.projectId) return;
    const sequence = ++request.current;
    setAnchorError('');
    try {
      const values = await api(`projects/${wb.projectId}/evidence-spans`, parseEvidenceAnchors);
      if (sequence === request.current) setAnchors(values);
    } catch (e) {
      if (sequence === request.current) setAnchorError(e instanceof Error ? e.message : 'Could not load named anchors.');
    }
  }, [wb.projectId]);
  useEffect(() => { void loadAnchors(); return () => { request.current += 1; }; }, [loadAnchors]);

  const show = (span: EvidenceSpanView) => setCitation(current => ({ span, request: (current?.request ?? 0) + 1 }));
  const missingEvidence = requestedEvidenceId && !documents.some(document => document.id === requestedEvidenceId);
  const missingClaims = requestedClaimSetId && !claimSets.some(set => set.id === requestedClaimSetId);

  return <>
    {missingEvidence && <Alert variant="error" title="Requested evidence unavailable">This project has no ingested document with ID {requestedEvidenceId}. No other document is substituted for that link.</Alert>}
    {missingClaims && <Alert variant="error" title="Requested claims unavailable">This project has no claim set with ID {requestedClaimSetId}. No other claims are substituted for that link.</Alert>}
    <PdfAttachments key={wb.projectId} wb={wb} />
    <Panel title="How to read this evidence" description="Each item below is labeled by where it came from.">
      <ul className="stack stack--tight">
        <li><strong>Supplied metadata.</strong> The title and any metadata given at ingestion. The manual flow uses the filename as the title. None of it is checked against the PDF.</li>
        <li><strong>Derived from the PDF.</strong> Page inventory, text-layer availability and exact page text, as returned by the pinned ingestion tool. Pages without a text layer stay empty; there is no OCR.</li>
        <li><strong>Claims.</strong> Statements with a category and checked references. A verified reference shows a location or stored value. It does not show that the claim is true.</li>
      </ul>
      {anchorError && <div className="stack stack--tight">
        <Alert variant="warning">Named anchors unavailable: {anchorError}. Documents and claims remain inspectable.</Alert>
        <div><button type="button" className="button button--secondary" onClick={() => void loadAnchors()}>Retry anchors</button></div>
      </div>}
    </Panel>
    {documents.length === 0 ? (
      <Panel title="Ingested documents">
        <EmptyState icon={FileText} title="No extracted documents yet">
          Attach a PDF, then choose Extract text to inspect its text layer. The original attachment stays available above.
        </EmptyState>
      </Panel>
    ) : documents.map(document => <EvidenceDocument key={document.id} wb={wb} document={document} anchors={anchors}
      focus={document.id === requestedEvidenceId}
      citation={citation?.span.reference.source_artifact_id === document.id ? citation : undefined} />)}
    {claimSets.length === 0
      ? <Panel title="Claims"><p>No claim sets recorded in this project. Claims are recorded by research runs.</p></Panel>
      : claimSets.map(set => <ClaimSetPanel key={set.id} wb={wb} set={set} focus={set.id === requestedClaimSetId} onShow={show} />)}
  </>;
}

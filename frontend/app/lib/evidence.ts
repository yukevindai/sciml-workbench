import type { Claim, EvidenceSpanView } from './generated/http';
import type { EvidenceArtifact } from './types';

export function evidenceHref(project: string, evidence: string) {
  return `/evidence?project=${encodeURIComponent(project)}&evidence=${encodeURIComponent(evidence)}#evidence-${encodeURIComponent(evidence)}`;
}

export function claimSetHref(project: string, claimSet: string) {
  return `/evidence?project=${encodeURIComponent(project)}&claim_set=${encodeURIComponent(claimSet)}#claim-set-${encodeURIComponent(claimSet)}`;
}

export type EvidencePage = { page: number; hasText: boolean; textSha256: string; size: [number, number] | null };

/** The ingestion record is untyped upstream output. Nothing here is inferred:
 *  malformed fields are reported instead of being filled in. */
export type EvidenceRecord = {
  pages: EvidencePage[];
  pageCount: number | null;
  /** Supplied by the researcher at ingestion; never checked against the PDF. */
  metadata: [string, string][];
  metadataStatus: string | null;
  extraction: string | null;
  software: [string, string][];
  issues: string[];
};

const DIGEST = /^[a-f0-9]{64}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export function evidenceRecord(document: EvidenceArtifact): EvidenceRecord {
  const result = document.result;
  const issues: string[] = [];
  const pageCount = typeof result.page_count === 'number' && Number.isInteger(result.page_count) && result.page_count > 0 ? result.page_count : null;
  if (pageCount === null) issues.push('Page count is missing or invalid.');
  const rawPages = Array.isArray(result.pages) ? result.pages : null;
  if (!rawPages) issues.push('Page inventory is missing.');
  const pages: EvidencePage[] = [];
  const methods = new Set<string>();
  (rawPages ?? []).forEach((item, index) => {
    if (!isRecord(item) || item.page !== index + 1 || typeof item.has_text !== 'boolean' || typeof item.text_sha256 !== 'string' || !DIGEST.test(item.text_sha256)) {
      issues.push(`Page entry ${index + 1} is malformed.`);
      return;
    }
    if (typeof item.extraction === 'string') methods.add(item.extraction);
    const size = Array.isArray(item.size_points) && item.size_points.length === 2 && item.size_points.every(v => typeof v === 'number' && Number.isFinite(v))
      ? item.size_points as [number, number] : null;
    pages.push({ page: item.page, hasText: item.has_text, textSha256: item.text_sha256, size });
  });
  if (rawPages && pageCount !== null && rawPages.length !== pageCount) issues.push('Page count disagrees with the page inventory.');
  if (typeof result.sha256 === 'string' && result.sha256 !== document.sha256) issues.push('Recorded source digest disagrees with the stored original.');
  const metadata = isRecord(result.metadata)
    ? Object.entries(result.metadata).map(([key, value]): [string, string] => [key, typeof value === 'string' ? value : JSON.stringify(value)]) : [];
  const software = isRecord(result.software)
    ? Object.entries(result.software).filter((entry): entry is [string, string] => typeof entry[1] === 'string') : [];
  return {
    pages, pageCount, metadata, software, issues,
    metadataStatus: typeof result.metadata_status === 'string' ? result.metadata_status : null,
    extraction: methods.size === 1 ? [...methods][0] : methods.size ? 'mixed' : null,
  };
}

/** Offsets are Unicode code points, not UTF-16 units; `String.slice` would split astral characters. */
export function codePointSlice(text: string, start: number, end?: number) {
  return Array.from(text).slice(start, end).join('');
}

/** Split a page into before/highlight/after only when the page still contains the verified excerpt at that locator. */
export function locateSpan(text: string, span: EvidenceSpanView): [string, string, string] | null {
  const points = Array.from(text);
  const { start, end } = span.reference.locator;
  if (points.length !== span.representation_length || end > points.length) return null;
  const excerpt = points.slice(start, end).join('');
  if (excerpt !== span.text) return null;
  return [points.slice(0, start).join(''), excerpt, points.slice(end).join('')];
}

export const CLASSIFICATION: Record<Claim['classification'], { label: string; description: string }> = {
  computed_result: { label: 'Computed result', description: 'Cites stored benchmark metric values. The reference check confirms the value matches the stored result.' },
  source_supported: { label: 'Source-supported', description: 'Cites exact spans in ingested sources. A valid anchor proves location, not that the source supports the statement.' },
  interpretation: { label: 'Interpretation', description: 'A reading of results or sources. It is not a computed value or a quotation.' },
  hypothesis: { label: 'Hypothesis', description: 'A proposition to test. It is not an established finding.' },
};

export const REFERENCE_CHECK: Record<Claim['reference_check']['status'], { label: string; tone: string }> = {
  valid: { label: 'References verified', tone: 'badge--success' },
  invalid: { label: 'References invalid', tone: 'badge--danger' },
  not_checked: { label: 'References not checked', tone: 'badge--warning' },
};

export const SEMANTIC_REVIEW: Record<Claim['semantic_review']['status'], { label: string; tone: string }> = {
  not_reviewed: { label: 'Support not reviewed', tone: 'badge--warning' },
  supported: { label: 'Reviewed: supported', tone: 'badge--success' },
  partially_supported: { label: 'Reviewed: partially supported', tone: 'badge--warning' },
  unsupported: { label: 'Reviewed: unsupported', tone: 'badge--danger' },
  conflicting: { label: 'Reviewed: conflicting', tone: 'badge--danger' },
};

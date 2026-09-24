import { expect, test, type Page, type Route } from '@playwright/test';
import { jobPage } from './job-page';
import fixtures from './fixtures/evidence-reports.json';
import { parseArtifactPreviews, parseEvidenceAnchors, parseEvidencePage, parseEvidenceSpan, parseJobs } from '../app/lib/decode';
import { codePointSlice, evidenceHref, evidenceRecord, locateSpan } from '../app/lib/evidence';
import { kinds, type Artifact } from '../app/lib/types';
import type { ClaimSet, EvidencePageText } from '../app/lib/generated/http';

const previews = parseArtifactPreviews(fixtures.previews);
const jobs = parseJobs(fixtures.jobs);
const anchors = parseEvidenceAnchors(fixtures.anchors);
const pages = Object.fromEntries(Object.entries(fixtures.pages).map(([key, value]) => [key, parseEvidencePage(value)]));
const citations = Object.fromEntries(Object.entries(fixtures.citations).map(([key, value]) => [key, parseEvidenceSpan(value)]));
const anchorSpan = parseEvidenceSpan(fixtures.anchor_span);
const project = fixtures.project;
const ids = fixtures.ids;
const claimSet = kinds(previews, 'claim_set')[0];
const base = `/api/projects/${project.id}`;

type Seen = { pages: string[]; citations: string[] };
type Override = (route: Route, pathname: string) => Promise<boolean>;
async function workspace(page: Page, artifacts: Artifact[] = previews, override?: Override): Promise<Seen> {
  parseArtifactPreviews(artifacts);
  const seen: Seen = { pages: [], citations: [] };
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (override && await override(route, pathname)) return;
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation: ${pathname}`);
    const pageMatch = pathname.match(/\/evidence\/([^/]+)\/pages\/(\d+)$/);
    if (pageMatch) {
      seen.pages.push(`${pageMatch[1]}/${pageMatch[2]}`);
      const value = pages[`${pageMatch[1]}/${pageMatch[2]}`];
      await route.fulfill(value ? { json: value } : { status: 422, json: { error: 'Evidence page anchor does not exist', error_code: 'REFERENCE_INVALID' } });
      return;
    }
    const citation = pathname.match(/\/source-references\/(\d+)$/);
    if (citation) {
      seen.citations.push(pathname);
      const value = pathname.includes(`/claim-sets/${claimSet.id}/claims/source-claim/`) ? citations[citation[1]] : undefined;
      await route.fulfill(value ? { json: value } : { status: 404, json: { error: 'Claim source reference not found' } });
      return;
    }
    if (pathname === `${base}/evidence-spans/${ids.anchor}`) { await route.fulfill({ json: anchorSpan }); return; }
    await route.fulfill({ json: pathname === '/api/projects' ? [project]
      : pathname.endsWith('/artifact-previews') ? artifacts : pathname.endsWith('/job-index') ? jobPage(jobs)
        : pathname.endsWith('/research-materials') ? fixtures.materials : pathname.endsWith('/evidence-spans') ? anchors : [] });
  });
  return seen;
}
const link = evidenceHref(project.id, ids.text);

test('direct evidence link separates supplied metadata from PDF-derived text and loads exact pages on request', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seen = await workspace(page);
  await page.goto(link);
  const panel = page.locator(`#evidence-${ids.text}`);
  await expect(panel).toBeFocused();
  const supplied = panel.getByRole('region', { name: /Supplied metadata/ });
  await expect(supplied).toContainText('text-source.pdf');
  await expect(supplied).toContainText('Supplied by the researcher, not verified');
  const derived = panel.getByRole('region', { name: 'Derived from the PDF' });
  await expect(derived).toContainText(kinds(previews, 'evidence').find(value => value.id === ids.text)!.sha256);
  await expect(derived).toContainText('2 of 2 pages have extractable text');
  await expect(derived).toContainText('PDFium text layer (no OCR)');
  await expect(supplied).not.toContainText('PDFium');
  await expect(panel.getByRole('link', { name: 'Original PDF' })).toHaveAttribute('href', `${base}/artifacts/${ids.text}/download?representation=original`);
  await expect(panel.getByRole('link', { name: 'Source bundle' })).toHaveAttribute('href', `${base}/artifacts/${ids.text}/download?representation=bundle`);
  expect(seen.pages).toEqual([]);

  await panel.getByRole('button', { name: 'Show page 1 text' }).click();
  const text = panel.getByLabel('Exact text of page 1');
  await expect(text).toBeVisible();
  // Exact text including the CRLF line break the text layer produced.
  expect(await text.evaluate(element => element.textContent)).toBe(pages[`${ids.text}/1`].text);
  expect(seen.pages).toEqual([`${ids.text}/1`]);

  const mixed = page.locator(`#evidence-${ids.mixed}`);
  await expect(mixed).toContainText('1 of 2 pages have extractable text');
  await expect(mixed).toContainText('Some pages have no text layer');
  await mixed.getByRole('button', { name: 'Show page 2 text' }).click();
  await expect(mixed).toContainText('Page 2 has no text layer. Nothing is shown because nothing was extracted.');
  await expect(mixed.getByLabel('Exact text of page 2')).toHaveCount(0);
  const scanned = page.locator(`#evidence-${ids.scanned}`);
  await expect(scanned).toContainText('No page has a text layer');
  await expect(scanned).toContainText('0 of 1 page have extractable text');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await panel.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.screenshot({ path: 'test-results/a06-evidence-desktop.png' });
});

test('claims show category, reference check and unreviewed support; a citation opens the exact span and its page', async ({ page }) => {
  const seen = await workspace(page);
  await page.goto(`/evidence?project=${project.id}&claim_set=${claimSet.id}#claim-set-${claimSet.id}`);
  const claims = page.locator(`#claim-set-${claimSet.id}`);
  await expect(claims).toBeFocused();
  const source = claims.locator(`#claim-${claimSet.id}-source-claim`);
  await expect(source).toContainText('Source-supported');
  await expect(source).toContainText('References verified');
  await expect(source).toContainText('Support not reviewed');
  await expect(source).toContainText('Single laboratory');
  await expect(claims.locator(`#claim-${claimSet.id}-interpretation`)).toContainText('Interpretation');
  await expect(claims.locator(`#claim-${claimSet.id}-hypothesis`)).toContainText('Hypothesis');
  await expect(claims.locator(`#claim-${claimSet.id}-interpretation`)).toContainText('None recorded');
  expect(seen.citations).toEqual([]);

  await source.getByRole('button', { name: 'Open citation' }).first().click();
  const view = source.getByLabel('Citation from text-source.pdf');
  await expect(view.locator('mark')).toHaveText('measurement');
  await expect(source).toContainText('Page 1 · code points 5–16');
  expect(seen.citations).toEqual([`${base}/claim-sets/${claimSet.id}/claims/source-claim/source-references/0`]);

  await source.getByRole('button', { name: 'Show on page 1' }).click();
  const sourceDocument = page.locator(`#evidence-${ids.text}`);
  await expect(sourceDocument).toBeFocused();
  await expect(sourceDocument.getByLabel('Exact text of page 1').locator('mark')).toHaveText('measurement');

  await source.getByRole('button', { name: 'Open citation' }).nth(1).click();
  await expect(source.getByLabel('Citation from text-source.pdf').locator('mark')).toHaveText('Café');
  await expect(source).toContainText('Whole-document text (all pages joined in order, no page anchor recorded)');
  await expect(source.getByRole('button', { name: /Show on page/ })).toHaveCount(0);

  await page.setViewportSize({ width: 375, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await source.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/a06-claims-mobile-dark.png' });
});

test('named anchors reverify on open and failed citation or page reads show no text', async ({ page }) => {
  let failPage = true;
  await workspace(page, previews, async (route, pathname) => {
    if (pathname.endsWith('/source-references/0')) { await route.fulfill({ status: 422, json: { error: 'Evidence span does not match its retained source and exact text', error_code: 'REFERENCE_INVALID' } }); return true; }
    if (pathname === `${base}/evidence/${ids.text}/pages/2` && failPage) { failPage = false; await route.fulfill({ status: 500, json: { error: 'Stored bytes failed integrity verification' } }); return true; }
    return false;
  });
  await page.goto(link);
  const panel = page.locator(`#evidence-${ids.text}`);
  await panel.getByRole('button', { name: 'Open anchor' }).click();
  await expect(panel.getByLabel('Citation from text-source.pdf').locator('mark')).toHaveText(anchorSpan.text);
  await expect(panel).toContainText(`named anchor ${ids.anchor}`);

  await panel.getByRole('button', { name: 'Show page 2 text' }).click();
  await expect(panel.getByRole('alert')).toContainText('Page 2 text unavailable: Stored bytes failed integrity verification');
  await expect(panel.getByLabel('Exact text of page 2')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Retry page 2' }).click();
  await expect(panel.getByLabel('Exact text of page 2')).toHaveText(pages[`${ids.text}/2`].text);

  const source = page.locator(`#claim-${claimSet.id}-source-claim`);
  await source.getByRole('button', { name: 'Open citation' }).first().click();
  await expect(source.getByRole('alert')).toContainText('Citation could not be verified: Evidence span does not match');
  await expect(source.locator('mark')).toHaveCount(0);
});

test('a page whose text no longer matches the verified span is not highlighted', async ({ page }) => {
  const original = pages[`${ids.text}/1`];
  const changed: EvidencePageText = { ...original, text: 'X' + original.text };
  await workspace(page, previews, async (route, pathname) => {
    if (pathname === `${base}/evidence/${ids.text}/pages/1`) { await route.fulfill({ json: changed }); return true; }
    return false;
  });
  await page.goto(link);
  const source = page.locator(`#claim-${claimSet.id}-source-claim`);
  await source.getByRole('button', { name: 'Open citation' }).first().click();
  await source.getByRole('button', { name: 'Show on page 1' }).click();
  const panel = page.locator(`#evidence-${ids.text}`);
  await expect(panel).toContainText('The page text no longer matches the verified citation');
  await expect(panel.getByLabel('Exact text of page 1').locator('mark')).toHaveCount(0);
});

test('reviewed, invalid and metric claim states render as recorded and unknown links substitute nothing', async ({ page }) => {
  const benchmarkId = 'bench-1';
  const modified: ClaimSet = { ...claimSet, claims: [
    { ...claimSet.claims[1], id: 'reviewed', semantic_review: { status: 'partially_supported', reviewed_snapshot_sha256: 'c'.repeat(64), reviewer_assignment_id: 'reviewer-1', explanation: 'Only one of two conditions is covered.' } },
    { ...claimSet.claims[2], id: 'broken', reference_check: { status: 'invalid', checked_at: claimSet.created_at, issues: ['Metric value does not match the stored result'] } },
    { ...claimSet.claims[1], id: 'computed', classification: 'computed_result', metric_references: [{ artifact_id: benchmarkId, field_path: '/result/metrics/validation/mae', partition: 'validation', value: 0, units: null }] },
  ] };
  const artifacts = previews.map(value => value.id === claimSet.id ? modified : value);
  await workspace(page, artifacts);
  await page.goto(`/evidence?project=${project.id}&evidence=missing-doc&claim_set=missing-claims`);
  await expect(page.getByText('This project has no ingested document with ID missing-doc')).toBeVisible();
  await expect(page.getByText('This project has no claim set with ID missing-claims')).toBeVisible();
  const reviewed = page.locator(`#claim-${claimSet.id}-reviewed`);
  await expect(reviewed).toContainText('Reviewed: partially supported');
  await expect(reviewed).toContainText('Only one of two conditions is covered. Reviewer assignment reviewer-1');
  const broken = page.locator(`#claim-${claimSet.id}-broken`);
  await expect(broken).toContainText('References invalid');
  await expect(broken).toContainText('Metric value does not match the stored result');
  const computed = page.locator(`#claim-${claimSet.id}-computed`);
  await expect(computed).toContainText('Computed result');
  await expect(computed.getByRole('region', { name: 'Metric references' })).toContainText(`${benchmarkId} (unavailable)`);
  await expect(computed.getByRole('region', { name: 'Metric references' }).getByRole('row').nth(1)).toContainText('0');
  await expect(computed).toContainText('None recorded');
});

test('evidence jobs link to the extracted document; failed extraction stays a job error', async ({ page }) => {
  await workspace(page);
  await page.goto('/evidence');
  await page.getByText('Job activity').click();
  const job = jobs.find(value => value.result_id === ids.text)!;
  await expect(page.getByRole('link', { name: 'Inspect extracted evidence' }).first()).toBeVisible();
  const hrefs = await page.getByRole('link', { name: 'Inspect extracted evidence' }).evaluateAll(links => links.map(link => link.getAttribute('href')));
  expect(hrefs).toContain(evidenceHref(project.id, job.result_id!));
  expect(hrefs).toHaveLength(3);
  await expect(page.locator('.job-error')).toHaveCount(1);
});

test('evidence helpers count code points, refuse mismatched spans and report malformed records', () => {
  expect(codePointSlice('a\u{1F9EA}béc', 1, 3)).toBe('\u{1F9EA}b');
  const span = { ...citations['0'], text: '\u{1F9EA}b', before: 'a', after: 'éc', representation_length: 5,
    reference: { ...citations['0'].reference, page: 1, locator: { ...citations['0'].reference.locator, start: 1, end: 3 } } };
  expect(locateSpan('a\u{1F9EA}béc', span)).toEqual(['a', '\u{1F9EA}b', 'éc']);
  expect(locateSpan('ab\u{1F9EA}éc', span)).toBeNull();
  expect(locateSpan('a\u{1F9EA}bé', span)).toBeNull();
  const document = kinds(previews, 'evidence').find(value => value.id === ids.mixed)!;
  expect(evidenceRecord(document).issues).toEqual([]);
  expect(evidenceRecord(document).pages.map(value => value.hasText)).toEqual([true, false]);
  const broken = evidenceRecord({ ...document, result: { ...document.result, page_count: 3, pages: [{ page: 2 }] } });
  expect(broken.issues).toEqual(['Page entry 1 is malformed.', 'Page count disagrees with the page inventory.']);
  expect(broken.pages).toEqual([]);
  expect(evidenceRecord({ ...document, result: {} }).metadata).toEqual([]);
});

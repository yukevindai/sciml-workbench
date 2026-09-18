/** Minimal RFC 4180 reader used purely to preview a file the researcher has
 *  just chosen, before it is uploaded. The bytes sent to the API are always the
 *  untouched file; nothing parsed here is submitted anywhere. */
export type CsvPreview = { columns: string[]; rows: string[][]; truncated: boolean };

export function parseCsvPreview(text: string, maxRows = 5): CsvPreview {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else { field += char; }
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ',') { row.push(field); field = ''; continue; }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); field = ''; row = [];
      if (rows.length > maxRows) break;
      continue;
    }
    field += char;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const [header = [], ...body] = rows;
  return {
    columns: header.map(h => h.replace(/^﻿/, '').trim()),
    rows: body.slice(0, maxRows),
    truncated: body.length >= maxRows,
  };
}

/** Best-effort column classification, used only to label the preview and to
 *  order suggestions. It never decides what is submitted. */
export function looksNumeric(values: string[]): boolean {
  const present = values.filter(v => v.trim() !== '');
  if (!present.length) return false;
  return present.every(v => Number.isFinite(Number(v)));
}

export async function readPreview(file: File, bytes = 64 * 1024): Promise<CsvPreview> {
  const text = await file.slice(0, bytes).text();
  return parseCsvPreview(text);
}

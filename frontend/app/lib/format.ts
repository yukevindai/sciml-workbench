/** Presentation helpers. None of these alter a stored value. */

export function shortId(id: string, length = 8): string {
  return id.slice(0, length);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Four significant digits, matching how the metrics were previously shown,
 *  but without turning an integer count into scientific notation. */
export function formatMetric(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e6 || magnitude < 1e-4) return value.toExponential(3);
  return Number(value.toPrecision(4)).toString();
}

/** Turns `group_mae` into `group mae` for display without touching the key. */
export function humanise(key: string): string {
  return key.replaceAll('_', ' ');
}

export function percent(part: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Server configuration only; never trust a client-supplied Host or Origin as a production fallback. */
export function publicOrigin(developmentOrigin = 'http://localhost:3000'): string | undefined {
  const configured = process.env.WB_PUBLIC_ORIGIN;
  const value = configured ?? (process.env.NODE_ENV !== 'production' ? developmentOrigin : undefined);
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) return undefined;
    return url.origin;
  } catch { return undefined; }
}

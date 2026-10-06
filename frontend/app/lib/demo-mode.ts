/** Only the dedicated public demo route can select the local transport. */
export function isDemoPath(path: string) { return path === '/demo' || path.startsWith('/demo/'); }
export function isDemo() { return typeof window !== 'undefined' && isDemoPath(window.location.pathname); }

// Demo selections/drafts must never overwrite an operator's workspace state.
export const DEMO_STORAGE_PREFIX = 'sciml-demo:';
function scopedStorage(session: boolean) {
  const storage = () => session ? window.sessionStorage : window.localStorage;
  const key = (name: string) => (isDemo() ? DEMO_STORAGE_PREFIX : '') + name;
  return {
    getItem: (name: string) => storage().getItem(key(name)),
    setItem: (name: string, value: string) => storage().setItem(key(name), value),
    removeItem: (name: string) => storage().removeItem(key(name)),
  };
}
export const workspaceStorage = scopedStorage(false);
export const workspaceSession = scopedStorage(true);

/** Shared, server-safe theme boot code. Keep this outside a client boundary. */
export const THEME_STORAGE_KEY = 'sciml-theme';

/** Runs before first paint so the correct theme is already applied and the
 *  page never flashes. Keeps one switching mechanism: the boot script always
 *  writes an explicit data-theme, and every token is defined against it. */
export const themeBootScript = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    document.documentElement.dataset.theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
`;

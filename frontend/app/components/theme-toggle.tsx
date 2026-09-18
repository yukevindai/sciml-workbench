'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export const THEME_STORAGE_KEY = 'sciml-theme';

/** Runs before first paint so the correct theme is already applied and the
 *  page never flashes. Keeps one switching mechanism: the boot script always
 *  writes an explicit data-theme, and every token is defined against it. */
export const themeBootScript = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = stored === 'light' || stored === 'dark' ? stored : system;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`;

type Theme = 'light' | 'dark';

/** A theme flip changes colour on nearly every element at once. Transitions are
 *  suppressed for one frame so the switch snaps instead of smearing. */
function applyTheme(theme: Theme) {
  const style = document.createElement('style');
  style.append(document.createTextNode('*,*::before,*::after{transition:none !important}'));
  document.head.append(style);
  document.documentElement.dataset.theme = theme;
  void document.body.offsetHeight; // force reflow
  requestAnimationFrame(() => style.remove());
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as Theme) || 'light');
  }, []);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="icon-button"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
        try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* storage unavailable */ }
      }}
    >
      {/* Both icons stay mounted and cross-fade, so the swap has an exit as
          well as an enter. Hidden from assistive tech: the label carries it. */}
      <span className="theme-icons" aria-hidden="true">
        <Sun size={17} data-visible={theme !== 'dark'} />
        <Moon size={17} data-visible={theme === 'dark'} />
      </span>
    </button>
  );
}

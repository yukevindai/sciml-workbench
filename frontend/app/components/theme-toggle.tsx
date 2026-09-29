'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

import { THEME_STORAGE_KEY } from '../lib/theme';

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
    setTheme((document.documentElement.dataset.theme as Theme) || 'dark');
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

'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';

import { MOTION_STORAGE_KEY as KEY } from '../lib/motion';
const MotionContext = createContext({ enabled: false, reduced: false, toggle: () => {} });

export function MotionPreferences({ children }: { children: React.ReactNode }) {
  const [paused, setPaused] = useState(true);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setReduced(media.matches);
      try { setPaused(localStorage.getItem(KEY) === 'paused'); } catch { setPaused(false); }
    };
    sync();
    media.addEventListener('change', sync);
    window.addEventListener('storage', sync);
    return () => { media.removeEventListener('change', sync); window.removeEventListener('storage', sync); };
  }, []);
  const enabled = !paused && !reduced;
  useEffect(() => { document.documentElement.dataset.motion = enabled ? 'on' : 'off'; }, [enabled]);
  const toggle = () => {
    const next = !paused;
    setPaused(next);
    try { localStorage.setItem(KEY, next ? 'paused' : 'on'); } catch { /* Session preference still works. */ }
  };
  return <MotionContext.Provider value={{ enabled, reduced, toggle }}>{children}</MotionContext.Provider>;
}

export const useMotionPreference = () => useContext(MotionContext);

export function MotionToggle() {
  const { enabled, reduced, toggle } = useMotionPreference();
  const label = reduced ? 'Reduced motion enabled' : enabled ? 'Pause animations' : 'Play animations';
  return <button className="motion-toggle" type="button" onClick={toggle} disabled={reduced} aria-label={label} title={label} aria-pressed={!enabled}>
    {enabled ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}<span>{reduced ? 'Reduced motion' : enabled ? 'Motion on' : 'Motion paused'}</span>
  </button>;
}

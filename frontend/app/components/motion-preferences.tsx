'use client';
import { createContext, useContext, useEffect, useState } from 'react';
const MotionContext = createContext({ enabled: false, reduced: true });
export function MotionPreferences({ children }: { children: React.ReactNode }) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync(); media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useEffect(() => { document.documentElement.dataset.motion = reduced ? 'off' : 'on'; }, [reduced]);
  return <MotionContext.Provider value={{ enabled: !reduced, reduced }}>{children}</MotionContext.Provider>;
}
export const useMotionPreference = () => useContext(MotionContext);

'use client';

import { useEffect, useRef } from 'react';
import { useMotionPreference } from './motion-preferences';

/** Content is visible in SSR and without JS. Only animate when it enters view. */
export function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { enabled } = useMotionPreference();
  useEffect(() => {
    if (!enabled || !ref.current) return;
    let animation: Animation | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      animation = entry.target.animate([{ opacity: .35, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 750, easing: 'cubic-bezier(.16,1,.3,1)' });
      observer.disconnect();
    }, { threshold: .12 });
    observer.observe(ref.current);
    return () => { observer.disconnect(); animation?.cancel(); };
  }, [enabled]);
  return <div ref={ref} className={className}>{children}</div>;
}

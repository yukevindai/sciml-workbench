'use client';

import { useEffect, useState } from 'react';

const WORDS = ['trust', 'validate', 'publish', 'use', 'verify'];

export function RotatingWord() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(timer);
      if (!motion.matches && !paused) timer = setInterval(() => setIndex(value => (value + 1) % WORDS.length), 2600);
    };
    sync();
    motion.addEventListener('change', sync);
    return () => { clearInterval(timer); motion.removeEventListener('change', sync); };
  }, [paused]);
  return <button type="button" className="rotating-word" onClick={() => setPaused(value => !value)}
    aria-label={`trust. ${paused ? 'Resume' : 'Pause'} changing headline word`} aria-pressed={paused}>
    <span key={index} className="rotating-word-text" aria-hidden="true">{WORDS[index]}.</span>
  </button>;
}

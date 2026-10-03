/** Respect the system accessibility preference before first paint. */
export const motionBootScript = `document.documentElement.dataset.motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'on';`;

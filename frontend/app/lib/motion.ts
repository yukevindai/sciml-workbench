/** Apply saved accessibility preferences before any CSS entrance can paint. */
export const MOTION_STORAGE_KEY = 'sciml-motion';
export const motionBootScript = `
(function () {
  var paused = false;
  try { paused = localStorage.getItem('${MOTION_STORAGE_KEY}') === 'paused'; } catch (e) {}
  document.documentElement.dataset.motion = paused || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'on';
})();
`;

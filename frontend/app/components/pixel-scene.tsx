'use client';

import { useEffect, useRef } from 'react';
import { useMotionPreference } from './motion-preferences';

export type PixelVariant = 'orbit' | 'wave' | 'network' | 'document';

/** Original procedural artwork. No images, remote scripts, or WebGL context.
 * Animation is capped at 30fps and suspended offscreen/in background tabs.
 * Pointer and animation values stay outside React's render cycle. */
export function PixelScene({ variant = 'orbit', className = '' }: { variant?: PixelVariant; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const phase = useRef(0);
  const { enabled } = useMotionPreference();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let width = 1, height = 1, frame = 0, visible = false, time = phase.current, last = 0;
    let px = 0, py = 0, targetX = 0, targetY = 0;
    let ink = getComputedStyle(canvas).color;
    const host = canvas.closest<HTMLElement>('[data-pixel-interactive]') ?? canvas.parentElement!;
    const dot = (x: number, y: number, alpha: number, size = 1.8) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillRect(Math.round(x), Math.round(y), size, size);
    };
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = ink;
      const scale = Math.min(width / 430, height / 270);
      const cx = width / 2 + px * 12, cy = height / 2 + py * 10;
      // Low-contrast grid grounds every illustration in the same visual language.
      const gap = width > 700 ? 13 : 11;
      for (let y = 7; y < height; y += gap) for (let x = 7; x < width; x += gap) dot(x, y, .065, 1.2);
      if (variant === 'orbit') {
        const angle = time * .11 + px * .12;
        const size = Math.min(width * .48, height * .65);
        for (let ring = 0; ring < 3; ring++) {
          const tilt = ring * Math.PI / 3 + .35;
          for (let band = -5; band <= 5; band++) for (let i = 0; i < 160; i++) {
            const a = i / 160 * Math.PI * 2;
            const r = size * (1 + band * .012);
            const x = Math.cos(a) * r, y = Math.sin(a) * r * .38;
            const rx = x * Math.cos(tilt + angle) - y * Math.sin(tilt + angle);
            const ry = x * Math.sin(tilt + angle) + y * Math.cos(tilt + angle);
            const light = .13 + .55 * Math.pow((Math.sin(a + time * .5 + ring) + 1) / 2, 3);
            dot(cx + rx, cy + ry, light * (1 - Math.abs(band) / 8), width > 700 ? 2.5 : 1.8);
          }
        }
      } else if (variant === 'wave') {
        for (let row = 0; row < 19; row++) for (let col = 0; col < 65; col++) {
          const x = (col - 32) * 5.3;
          const y = (row - 9) * 6 + Math.sin(col * .14 + time * .8 + row * .13) * 23;
          dot(cx + x * scale, cy + y * scale, .2 + .6 * (1 + Math.sin(col * .13 - time + row * .15)) / 2, 1.7 * scale);
        }
      } else if (variant === 'network') {
        const nodes = [[0, 0], [-120, -66], [120, -66], [-120, 66], [120, 66]];
        nodes.slice(1).forEach(([x, y], n) => {
          for (let i = 0; i < 36; i++) {
            const k = i / 36;
            const signal = (time * .22 + n * .23) % 1;
            dot(cx + x * k * scale, cy + y * k * scale, Math.abs(k - signal) < .12 ? .9 : .2, 2 * scale);
          }
        });
        nodes.forEach(([x, y], n) => {
          for (let yy = -15; yy <= 15; yy += 4) for (let xx = -15; xx <= 15; xx += 4) {
            const edge = Math.max(Math.abs(xx), Math.abs(yy)) > 10;
            dot(cx + (x + xx) * scale, cy + (y + yy) * scale, edge ? .8 : .15 + .2 * Math.sin(time + n), 2 * scale);
          }
        });
      } else {
        for (let row = 0; row < 37; row++) for (let col = 0; col < 29; col++) {
          const border = row === 0 || row === 36 || col === 0 || col === 28;
          const line = row > 7 && row < 30 && row % 5 < 2 && col > 5 && col < 23 - (row % 3) * 3;
          if (!border && !line) continue;
          const scan = (time * 7) % 42;
          dot(cx + (col - 14) * 5 * scale, cy + (row - 18) * 5 * scale, Math.abs(row - scan) < 3 ? .95 : border ? .45 : .35, 2 * scale);
        }
      }
      ctx.globalAlpha = 1;
    };
    const tick = (now: number) => {
      if (now - last >= 1000 / 30) {
        const delta = last ? Math.min((now - last) / 1000, .08) : 0;
        time += delta; last = now;
        px += (targetX - px) * .07; py += (targetY - py) * .07;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame); last = 0;
      draw();
      if (enabled && visible && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width; height = entry.contentRect.height;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); sync();
    });
    resize.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    intersection.observe(canvas);
    const theme = new MutationObserver(() => { ink = getComputedStyle(canvas).color; draw(); });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const move = (event: PointerEvent) => {
      if (!enabled || event.pointerType === 'touch') return;
      const rect = host.getBoundingClientRect();
      targetX = (event.clientX - rect.left) / rect.width * 2 - 1;
      targetY = (event.clientY - rect.top) / rect.height * 2 - 1;
    };
    const leave = () => { targetX = 0; targetY = 0; };
    host.addEventListener('pointermove', move, { passive: true });
    host.addEventListener('pointerleave', leave);
    document.addEventListener('visibilitychange', sync);
    return () => {
      phase.current = time;
      cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect(); theme.disconnect();
      host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [enabled, variant]);
  return <canvas ref={ref} className={`pixel-scene ${className}`} data-pixel-scene={variant} aria-hidden="true" />;
}

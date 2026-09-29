'use client';

import { useEffect, useRef } from 'react';
import { useMotionPreference } from './motion-preferences';

import { drawPixelArt, type PixelVariant } from '../lib/pixel-art';
export type { PixelVariant } from '../lib/pixel-art';

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
      drawPixelArt(variant, dot, width, height, time, px, py);
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

/** Original scientific pixel studies. Each subject has its own geometry and motion. */
export type PixelVariant = 'orbit' | 'audit' | 'split' | 'evidence' | 'memory' | 'network' | 'ripple' | 'bloom' | 'wave' | 'prism' | 'document' | 'timeline' | 'helix' | 'lens' | 'lattice' | 'archive';
export const PIXEL_VARIANTS: PixelVariant[] = ['orbit', 'audit', 'split', 'evidence', 'memory', 'network', 'ripple', 'bloom', 'wave', 'prism', 'document', 'timeline', 'helix', 'lens', 'lattice', 'archive'];
type Dot = (x: number, y: number, alpha: number, size?: number) => void;

export function drawPixelArt(variant: PixelVariant, dot: Dot, width: number, height: number, time: number, px: number, py: number) {
  const scale = Math.min(width / 430, height / 270);
  const cx = width / 2 + px * 12, cy = height / 2 + py * 10;
  const p = (x: number, y: number, a = .5, size = 2) => dot(cx + x * scale, cy + y * scale, a, Math.max(1, size * scale));
  const line = (ax: number, ay: number, bx: number, by: number, a = .35) => {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 4);
    for (let i = 0; i <= n; i++) p(ax + (bx - ax) * i / n, ay + (by - ay) * i / n, a);
  };
  const page = (x: number, y: number, w: number, h: number, a: number) => {
    line(x, y, x + w, y, a); line(x + w, y, x + w, y + h, a);
    line(x + w, y + h, x, y + h, a); line(x, y + h, x, y, a);
  };
  const gap = width > 700 ? 13 : 11;
  for (let y = 7; y < height; y += gap) for (let x = 7; x < width; x += gap) dot(x, y, .065, 1.2);
  switch (variant) {
    case 'orbit': {
      const size = Math.min(width * .48, height * .65);
      for (let ring = 0; ring < 3; ring++) {
        const tilt = ring * Math.PI / 3 + .35 + time * .11 + px * .12;
        for (let band = -5; band <= 5; band++) for (let i = 0; i < 160; i++) {
          const a = i / 160 * Math.PI * 2, r = size * (1 + band * .012);
          const x = Math.cos(a) * r, y = Math.sin(a) * r * .38;
          const light = .13 + .55 * Math.pow((Math.sin(a + time * .5 + ring) + 1) / 2, 3);
          dot(cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt), light * (1 - Math.abs(band) / 8), width > 700 ? 2.5 : 1.8);
        }
      }
      break;
    }
    case 'audit': // A scanning plane reveals gaps in a data matrix.
      for (let row = 0; row < 19; row++) for (let col = 0; col < 32; col++) {
        const missing = (row * 17 + col * 11) % 47 === 0;
        const scan = (Math.sin(time * .7) + 1) * 15.5;
        const a = .2 + .65 * Math.exp(-((col - scan) ** 2) / 9);
        if (missing) page((col - 16) * 9 - 2, (row - 9) * 9 - 2, 6, 6, .5);
        else p((col - 16) * 9, (row - 9) * 9, a, 3);
      }
      break;
    case 'split': // Two point clouds move independently across a stable holdout boundary.
      line(0, -100, 0, 100, .2);
      for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 290; i++) {
        const a = i * 2.39996 + time * .09 * side, r = Math.sqrt(i / 290) * 73;
        p(side * 97 + Math.cos(a) * r * .85, Math.sin(a) * r, .25 + .5 * (1 + Math.sin(i * .14 + time)) / 2, side < 0 ? 2.5 : 1.6);
      }
      break;
    case 'evidence': // Source passages connect to a central claim.
      for (const [x, y] of [[-165, -78], [-145, 35], [94, -26]]) {
        page(x, y, 64, 66, .55);
        for (let row = 0; row < 4; row++) line(x + 12, y + 15 + row * 10, x + 47 - row * 3, y + 15 + row * 10, .35);
        const fromX = x < 0 ? x + 64 : x, fromY = y + 33;
        line(fromX, fromY, 0, 0, .18);
        const k = (time * .22 + (y + 80) / 150) % 1;
        p(fromX * (1 - k), fromY * (1 - k), .95, 4);
      }
      for (let i = 0; i < 80; i++) { const a = i / 80 * Math.PI * 2; p(Math.cos(a) * 22, Math.sin(a) * 22, .8); }
      break;
    case 'memory': // Earlier experiments form a layered, gently breathing archive.
      for (let layer = 0; layer < 5; layer++) {
        const y = (layer - 2) * 28 + Math.sin(time * .65 + layer * .5) * 5;
        for (let row = -8; row <= 8; row++) for (let col = -12; col <= 12; col++) {
          if (Math.abs(row) !== 8 && Math.abs(col) !== 12 && (row + col) % 4 !== 0) continue;
          p(col * 7 + row * 4, y + row * 3 - col * 1.5, .18 + (4 - layer) * .13);
        }
      }
      break;
    case 'network': {
      const nodes = [[0, 0], [-120, -66], [120, -66], [-120, 66], [120, 66]];
      nodes.slice(1).forEach(([x, y], n) => {
        for (let i = 0; i < 36; i++) {
          const k = i / 36, signal = (time * .22 + n * .23) % 1;
          p(x * k, y * k, Math.abs(k - signal) < .12 ? .9 : .2);
        }
      });
      nodes.forEach(([x, y], n) => {
        for (let yy = -15; yy <= 15; yy += 4) for (let xx = -15; xx <= 15; xx += 4)
          p(x + xx, y + yy, Math.max(Math.abs(xx), Math.abs(yy)) > 10 ? .8 : .15 + .2 * Math.sin(time + n));
      });
      break;
    }
    case 'ripple': // A question propagates through a field of expanding rings.
      for (let ring = 0; ring < 9; ring++) {
        const r = ((ring * 23 + time * 10) % 207) + 8;
        for (let i = 0; i < 170; i++) {
          const a = i / 170 * Math.PI * 2;
          p(Math.cos(a) * r, Math.sin(a) * r * .52, .65 * (1 - r / 230), 2);
        }
      }
      break;
    case 'bloom': // Phyllotaxis: a small question grows into an organized study.
      for (let i = 1; i < 540; i++) {
        const a = i * 2.39996 + time * .07, r = Math.sqrt(i) * 4.3;
        p(Math.cos(a) * r, Math.sin(a) * r, .22 + .6 * (1 + Math.sin(r * .07 - time)) / 2, 2.5);
      }
      break;
    case 'wave':
      for (let row = 0; row < 19; row++) for (let col = 0; col < 65; col++)
        p((col - 32) * 5.3, (row - 9) * 6 + Math.sin(col * .14 + time * .8 + row * .13) * 23, .2 + .6 * (1 + Math.sin(col * .13 - time + row * .15)) / 2, 1.7);
      break;
    case 'prism': // Evidence resolves into separate, traceable paths.
      line(-48, 63, 0, -66, .8); line(0, -66, 60, 63, .8); line(60, 63, -48, 63, .8);
      for (let ray = -3; ray <= 3; ray++) for (let i = 0; i < 60; i++) {
        const k = i / 60;
        p(-165 + k * 140, ray * 3, .2 + .5 * (1 + Math.sin(k * 10 - time * 2)) / 2);
        p(27 + k * 138, ray * (8 + k * 17), .25 + .5 * (1 + Math.sin(k * 10 - time * 2 + ray)) / 2);
      }
      break;
    case 'document':
      for (let row = 0; row < 37; row++) for (let col = 0; col < 29; col++) {
        const border = row === 0 || row === 36 || col === 0 || col === 28;
        const text = row > 7 && row < 30 && row % 5 < 2 && col > 5 && col < 23 - (row % 3) * 3;
        if (border || text) p((col - 14) * 5, (row - 18) * 5, Math.abs(row - (time * 7) % 42) < 3 ? .95 : border ? .45 : .35);
      }
      break;
    case 'timeline':
      for (let step = 0; step < 5; step++) {
        const x = (step - 2) * 62, y = 60 - step * 29;
        if (step < 4) { line(x, y, x + 62, y, .25); line(x + 62, y, x + 62, y - 29, .25); }
        const glow = .35 + .5 * (1 + Math.sin(time * 1.2 - step)) / 2;
        page(x - 10, y - 10, 20, 20, glow);
        for (let j = 0; j < 4; j++) line(x - 14, y + 24 + j * 7, x + 14 - j * 3, y + 24 + j * 7, .2);
      }
      break;
    case 'helix':
      for (let row = -27; row <= 27; row++) {
        const a = row * .17 + time * .45, x = Math.cos(a) * 65, y = row * 3.7;
        p(x, y, .3 + .5 * (Math.sin(a) + 1) / 2, 3); p(-x, y, .3 + .5 * (1 - Math.sin(a)) / 2, 3);
        if (row % 3 === 0) line(-x, y, x, y, .18);
      }
      break;
    case 'lens':
      for (let row = -22; row <= 22; row++) for (let col = -22; col <= 22; col++) {
        const r = Math.hypot(row, col); if (r > 22) continue;
        const z = Math.sqrt(484 - r * r), a = time * .15;
        p(col * 4.3 * Math.cos(a) + z * Math.sin(a) * 2, row * 4.3, .18 + .6 * Math.pow((Math.cos(r * .45 - time) + 1) / 2, 3));
      }
      break;
    case 'lattice':
      for (let z = -2; z <= 2; z++) for (let row = -4; row <= 4; row++) for (let col = -4; col <= 4; col++) {
        const x = (col - row) * 17, y = (col + row) * 8 - z * 24;
        const a = .15 + .65 * (1 + Math.sin(time - (row + col + z) * .6)) / 2;
        p(x, y, a, 3);
        if (col < 4) line(x, y, x + 17, y + 8, a * .3);
        if (row < 4) line(x, y, x - 17, y + 8, a * .3);
      }
      break;
    case 'archive':
      for (let sheet = 0; sheet < 6; sheet++) {
        const a = sheet * Math.PI / 3 + time * .08, x = Math.cos(a) * 100, y = Math.sin(a) * 65;
        page(x - 20, y - 25, 40, 50, .55);
        for (let row = 0; row < 3; row++) line(x - 11, y - 11 + row * 10, x + 10, y - 11 + row * 10, .3);
        line(x * .7, y * .6, 0, 0, .15);
      }
      page(-10, -10, 20, 20, .8);
      break;
  }
}

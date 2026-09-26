import type { Icon } from '../../shared/shop';

export const INK = '#2b2233';
export type Ctx = CanvasRenderingContext2D;

export function shade(hex: string, k: number): string {
  const rgb = hex.startsWith('rgb') ? (hex.match(/\d+/g) ?? []).map(Number) : [];
  const n = parseInt(hex.slice(1), 16);
  const [r0 = (n >> 16) & 255, g0 = (n >> 8) & 255, b0 = n & 255] = rgb;
  const mix = (c: number): number => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
  const r = mix(r0);
  const g = mix(g0);
  const b = mix(b0);
  return `rgb(${r},${g},${b})`;
}

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Filled rectangle with a 2 px ink outline. */
export function frame(ctx: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  rect(ctx, x - 2, y - 2, w + 4, h + 4, INK);
  rect(ctx, x, y, w, h, c);
}

export function disc(ctx: Ctx, x: number, y: number, r: number, c: string, outline = true): void {
  if (outline) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** 3/4 view box: `y` is the top of the floor footprint, `h` the visible front height. */
export function box(ctx: Ctx, x: number, y: number, w: number, d: number, h: number, top: string, front = shade(top, -0.18)): void {
  rect(ctx, x - 2, y - h - 2, w + 4, d + 4, INK);
  rect(ctx, x, y - h, w, d - 2, top);
  rect(ctx, x, y + d - h, w, h, front);
  rect(ctx, x, y + d - h, w, 2, shade(front, 0.25));
  rect(ctx, x + 2, y - h + 2, w - 4, 2, shade(top, 0.35));
}

export function shadow(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(43,34,51,0.18)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Furniture and clothes drawn in a box (x, y, w, h); same art for shelf icons and life-size pieces. */
export function drawIcon(ctx: Ctx, icon: Icon, color: string, x: number, y: number, w: number, h: number): void {
  const r = (fx: number, fy: number, fw: number, fh: number, c: string): void => rect(ctx, x + fx * w, y + fy * h, fw * w, fh * h, c);
  const o = (fx: number, fy: number, fw: number, fh: number, c: string): void => frame(ctx, x + fx * w, y + fy * h, fw * w, fh * h, c);
  const c = (fx: number, fy: number, fr: number, col: string, line = true): void => disc(ctx, x + fx * w, y + fy * h, fr * Math.min(w, h), col, line);
  const dk = shade(color, -0.25);
  const lt = shade(color, 0.3);
  switch (icon) {
    case 'stool':
      o(0.3, 0.55, 0.08, 0.4, dk);
      o(0.62, 0.55, 0.08, 0.4, dk);
      o(0.18, 0.4, 0.64, 0.18, color);
      r(0.22, 0.42, 0.4, 0.05, lt);
      break;
    case 'table':
      o(0.1, 0.55, 0.08, 0.4, dk);
      o(0.82, 0.55, 0.08, 0.4, dk);
      o(0.02, 0.35, 0.96, 0.22, color);
      r(0.05, 0.37, 0.9, 0.05, lt);
      r(0.02, 0.5, 0.96, 0.07, dk);
      break;
    case 'rug':
      o(0.02, 0.2, 0.96, 0.7, color);
      for (let i = 0; i < 4; i++) r(0.02, 0.28 + i * 0.16, 0.96, 0.05, i % 2 ? '#f5e6c8' : dk);
      r(0.02, 0.2, 0.96, 0.03, lt);
      break;
    case 'lamp':
      o(0.46, 0.4, 0.08, 0.48, '#c9b28f');
      o(0.3, 0.86, 0.4, 0.1, '#8a6a4a');
      o(0.22, 0.08, 0.56, 0.34, color);
      r(0.25, 0.1, 0.5, 0.06, '#fffbe8');
      r(0.22, 0.34, 0.56, 0.08, dk);
      break;
    case 'sofa':
      o(0.06, 0.12, 0.88, 0.42, color);
      r(0.1, 0.16, 0.8, 0.06, lt);
      o(0.06, 0.5, 0.88, 0.3, lt);
      r(0.5, 0.5, 0.02, 0.3, dk);
      o(0, 0.35, 0.14, 0.48, dk);
      o(0.86, 0.35, 0.14, 0.48, dk);
      r(0.1, 0.83, 0.06, 0.12, INK);
      r(0.84, 0.83, 0.06, 0.12, INK);
      break;
    case 'armchair':
      o(0.18, 0.1, 0.64, 0.46, color);
      r(0.22, 0.14, 0.56, 0.06, lt);
      o(0.18, 0.52, 0.64, 0.24, lt);
      o(0.08, 0.36, 0.14, 0.4, dk);
      o(0.78, 0.36, 0.14, 0.4, dk);
      o(0.05, 0.84, 0.9, 0.07, '#8a5a3c');
      break;
    case 'bookcase': {
      o(0.08, 0.02, 0.84, 0.94, color);
      const books = ['#e0564a', '#3fa7a0', '#f2c14e', '#7b4fa0', '#4f7fc9', '#5fb04a'];
      for (let row = 0; row < 3; row++) {
        r(0.12, 0.08 + row * 0.3, 0.76, 0.24, dk);
        for (let b = 0; b < 6; b++) r(0.14 + b * 0.12, 0.12 + row * 0.3 + (b % 3) * 0.02, 0.09, 0.2 - (b % 3) * 0.02, books[(b + row * 2) % books.length] ?? '#fff');
      }
      break;
    }
    case 'plant':
      c(0.5, 0.3, 0.22, '#3f9a55');
      c(0.3, 0.42, 0.18, '#4fb065');
      c(0.7, 0.42, 0.18, '#4fb065');
      c(0.5, 0.22, 0.1, '#7fd58a', false);
      o(0.3, 0.6, 0.4, 0.34, color);
      r(0.3, 0.6, 0.4, 0.07, lt);
      break;
    case 'piano':
      o(0.05, 0.08, 0.9, 0.62, color);
      r(0.08, 0.12, 0.84, 0.06, lt);
      o(0.05, 0.5, 0.9, 0.16, '#fbf8f0');
      for (let k = 0; k < 9; k++) if (k % 3 !== 2) r(0.1 + k * 0.1, 0.5, 0.05, 0.09, INK);
      o(0.08, 0.7, 0.07, 0.26, color);
      o(0.85, 0.7, 0.07, 0.26, color);
      break;
    case 'chandelier':
      r(0.48, 0, 0.04, 0.3, '#b08a3a');
      o(0.15, 0.3, 0.7, 0.12, '#f2c14e');
      for (let i = 0; i < 5; i++) {
        c(0.2 + i * 0.15, 0.58, 0.07, color);
        r(0.19 + i * 0.15, 0.3, 0.02, 0.22, '#f2c14e');
      }
      c(0.5, 0.2, 0.06, '#fff6c8');
      break;
    case 'throne':
      o(0.2, 0.02, 0.6, 0.6, color);
      c(0.5, 0.06, 0.1, '#e0564a');
      r(0.28, 0.1, 0.44, 0.44, '#c8453c');
      o(0.12, 0.55, 0.76, 0.2, color);
      r(0.16, 0.57, 0.68, 0.06, '#c8453c');
      o(0.16, 0.76, 0.1, 0.2, dk);
      o(0.74, 0.76, 0.1, 0.2, dk);
      break;
    case 'buoy':
      c(0.5, 0.5, 0.42, color);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = '#fbf8f0';
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y + h / 2);
        ctx.arc(x + w / 2, y + h / 2, 0.42 * Math.min(w, h), (i * Math.PI) / 2, (i * Math.PI) / 2 + 0.6);
        ctx.fill();
      }
      c(0.5, 0.5, 0.2, '#e6d3ae');
      break;
    case 'aquarium':
      o(0.04, 0.08, 0.92, 0.62, color);
      r(0.04, 0.08, 0.92, 0.1, lt);
      r(0.04, 0.6, 0.92, 0.1, '#e6d3ae');
      c(0.34, 0.38, 0.08, '#f28a2e');
      c(0.66, 0.46, 0.06, '#f28a2e');
      r(0.3, 0.37, 0.08, 0.02, '#fff');
      r(0.14, 0.4, 0.03, 0.22, '#3f9a55');
      r(0.82, 0.3, 0.03, 0.32, '#3f9a55');
      o(0.1, 0.74, 0.8, 0.22, '#8a5a3c');
      break;
    case 'ship':
      o(0.1, 0.62, 0.8, 0.16, '#8a5a3c');
      r(0.48, 0.08, 0.04, 0.56, INK);
      o(0.2, 0.14, 0.26, 0.42, color);
      o(0.54, 0.22, 0.24, 0.34, color);
      o(0.3, 0.82, 0.4, 0.12, '#c9b28f');
      r(0.5, 0.06, 0.12, 0.06, '#e0564a');
      break;
    case 'shirt':
      o(0.28, 0.2, 0.44, 0.7, color);
      o(0.06, 0.2, 0.26, 0.3, color);
      o(0.68, 0.2, 0.26, 0.3, color);
      r(0.4, 0.2, 0.2, 0.08, dk);
      if (color === '#eef0f4') for (let i = 0; i < 4; i++) r(0.28, 0.34 + i * 0.14, 0.44, 0.05, '#2f5f8f');
      r(0.3, 0.24, 0.06, 0.6, lt);
      break;
    case 'hat':
      o(0.1, 0.62, 0.8, 0.14, dk);
      o(0.22, 0.26, 0.56, 0.4, color);
      r(0.26, 0.3, 0.3, 0.06, lt);
      c(0.5, 0.2, 0.08, lt);
      break;
    case 'scarf':
      o(0.1, 0.2, 0.8, 0.22, color);
      o(0.56, 0.38, 0.2, 0.52, color);
      for (let i = 0; i < 3; i++) r(0.58, 0.5 + i * 0.12, 0.16, 0.04, dk);
      r(0.14, 0.24, 0.5, 0.05, lt);
      break;
  }
}

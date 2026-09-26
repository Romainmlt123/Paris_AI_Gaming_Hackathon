import { FISH } from '../../shared/fishing';
import type { FishId } from '../../shared/types';

const INK = '#2b2233';
type Ctx = CanvasRenderingContext2D;

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number): number => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, c: string): void {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  ctx.fill();
}

function poly(ctx: Ctx, pts: [number, number][], c: string): void {
  ctx.fillStyle = c;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

function boot(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const f = FISH.botte;
  const u = (k: number): number => x + k * w;
  const v = (k: number): number => y + k * h;
  poly(ctx, [[u(0.3) - 2, v(0.12) - 2], [u(0.62) + 2, v(0.12) - 2], [u(0.62) + 2, v(0.62)], [u(0.92) + 2, v(0.7)], [u(0.92) + 2, v(0.9) + 2], [u(0.28) - 2, v(0.9) + 2]], INK);
  poly(ctx, [[u(0.3), v(0.12)], [u(0.62), v(0.12)], [u(0.62), v(0.64)], [u(0.9), v(0.72)], [u(0.9), v(0.9)], [u(0.3), v(0.9)]], f.color);
  ctx.fillStyle = shade(f.color, 0.25);
  ctx.fillRect(u(0.34), v(0.16), w * 0.06, h * 0.6);
  ctx.fillStyle = f.belly;
  ctx.fillRect(u(0.28), v(0.82), w * 0.64, h * 0.08);
  ctx.fillStyle = '#6fae5a';
  ctx.fillRect(u(0.5), v(0.08), w * 0.05, h * 0.16);
  ctx.fillRect(u(0.46), v(0.04), w * 0.12, h * 0.05);
}

function octopus(ctx: Ctx, id: FishId, x: number, y: number, w: number, h: number): void {
  const f = FISH[id];
  const cx = x + w / 2;
  for (let i = 0; i < 5; i++) {
    const tx = x + w * (0.18 + i * 0.16);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(3, w * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, y + h * 0.5);
    ctx.quadraticCurveTo(tx + (i % 2 ? 4 : -4), y + h * 0.75, tx + (i - 2) * 2, y + h * 0.92);
    ctx.stroke();
    ctx.strokeStyle = shade(f.color, -0.1);
    ctx.lineWidth = Math.max(1.5, w * 0.07);
    ctx.stroke();
  }
  ellipse(ctx, cx, y + h * 0.36, w * 0.3 + 2, h * 0.28 + 2, INK);
  ellipse(ctx, cx, y + h * 0.36, w * 0.3, h * 0.28, f.color);
  ellipse(ctx, cx - w * 0.08, y + h * 0.26, w * 0.1, h * 0.08, f.belly);
  ellipse(ctx, cx - w * 0.1, y + h * 0.42, w * 0.05, h * 0.06, '#fff');
  ellipse(ctx, cx + w * 0.1, y + h * 0.42, w * 0.05, h * 0.06, '#fff');
  ellipse(ctx, cx - w * 0.09, y + h * 0.43, w * 0.025, h * 0.035, INK);
  ellipse(ctx, cx + w * 0.11, y + h * 0.43, w * 0.025, h * 0.035, INK);
  if (id === 'poulpe_dore') {
    ctx.fillStyle = '#fffbe6';
    for (const [sx, sy] of [[0.12, 0.12], [0.86, 0.2], [0.8, 0.62]] as const) {
      ctx.fillRect(x + sx * w - 1, y + sy * h - 4, 2, 8);
      ctx.fillRect(x + sx * w - 4, y + sy * h - 1, 8, 2);
    }
  }
}

/** Side-view pixel-ish fish in the box (x, y, w, h), used for bag icons and the catch card. */
export function drawFish(ctx: Ctx, id: FishId, x: number, y: number, w: number, h: number): void {
  if (id === 'botte') return boot(ctx, x, y, w, h);
  if (id === 'poulpe' || id === 'poulpe_dore') return octopus(ctx, id, x, y, w, h);
  const f = FISH[id];
  const len = w * f.size;
  const cx = x + w / 2 + len * 0.06;
  const cy = y + h / 2;
  const bh = id === 'dorade' ? h * 0.26 : id === 'espadon' ? h * 0.16 : h * 0.18;
  const tailX = cx + len / 2;
  poly(ctx, [[tailX - 3, cy], [tailX + len * 0.22 + 2, cy - bh - 2], [tailX + len * 0.18, cy], [tailX + len * 0.22 + 2, cy + bh + 2]], INK);
  poly(ctx, [[tailX - 1, cy], [tailX + len * 0.2, cy - bh], [tailX + len * 0.16, cy], [tailX + len * 0.2, cy + bh]], shade(f.color, -0.15));
  poly(ctx, [[cx - len * 0.1, cy - bh + 1], [cx + len * 0.12, cy - bh - h * 0.12], [cx + len * 0.25, cy - bh * 0.6]], INK);
  poly(ctx, [[cx - len * 0.06, cy - bh + 1], [cx + len * 0.12, cy - bh - h * 0.09], [cx + len * 0.22, cy - bh * 0.6]], shade(f.color, -0.2));
  if (id === 'espadon') poly(ctx, [[cx - len / 2 + 2, cy - 2], [x + w * 0.02 - 2, cy - 1], [cx - len / 2 + 2, cy + 2]], INK);
  ellipse(ctx, cx, cy, len / 2 + 2, bh + 2, INK);
  ellipse(ctx, cx, cy, len / 2, bh, f.color);
  ellipse(ctx, cx, cy + bh * 0.4, len * 0.42, bh * 0.5, f.belly);
  ellipse(ctx, cx - len * 0.05, cy - bh * 0.45, len * 0.3, bh * 0.18, shade(f.color, 0.35));
  if (id === 'maquereau') {
    ctx.fillStyle = shade(f.color, -0.35);
    for (let i = 0; i < 4; i++) ctx.fillRect(cx - len * 0.15 + i * len * 0.1, cy - bh * 0.8, Math.max(1, len * 0.03), bh * 0.7);
  }
  if (id === 'dorade') ellipse(ctx, cx - len * 0.22, cy - bh * 0.25, len * 0.06, bh * 0.12, '#e8b43a');
  ellipse(ctx, cx - len * 0.34, cy - bh * 0.2, Math.max(1.6, len * 0.05), Math.max(1.6, len * 0.05), '#fff');
  ellipse(ctx, cx - len * 0.35, cy - bh * 0.2, Math.max(0.9, len * 0.025), Math.max(0.9, len * 0.025), INK);
  ctx.fillStyle = shade(f.color, -0.3);
  ctx.fillRect(cx - len * 0.24, cy - bh * 0.5, Math.max(1, len * 0.02), bh);
}

const cache = new Map<FishId, string>();

export function fishIconUrl(id: FishId, size = 40): string {
  const key = `${id}` as FishId;
  const hit = size === 40 ? cache.get(key) : undefined;
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  drawFish(ctx, id, size * 0.06, size * 0.06, size * 0.88, size * 0.88);
  const url = c.toDataURL();
  if (size === 40) cache.set(key, url);
  return url;
}

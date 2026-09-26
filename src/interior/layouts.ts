import { ISLAND_LEVELS, islandLevel, SHOP_ITEMS, stockOf, type ShopId } from '../../shared/shop';
import type { GameState, NpcId, ShopItemId } from '../../shared/types';
import type { BuildingId } from '../game/map';
import { box, drawIcon, frame, INK, rect, shade, shadow, type Ctx } from './paint';

export const T = 32;
export const COLS = 12;
export const ROWS = 11;
/** Rows 0-1 are the back wall; the door mat sits on the last row. */
export const WALL_ROWS = 2;
export const DOOR_X: readonly number[] = [5, 6];

export type Action =
  | { kind: 'shelf'; shop: ShopId; levels: number[]; title: string }
  | { kind: 'locked'; level: number }
  | { kind: 'talk'; npc: NpcId }
  | { kind: 'wardrobe' }
  | { kind: 'bed' }
  | { kind: 'board' }
  | { kind: 'deco' }
  | { kind: 'say'; text: string };

export interface Piece {
  x: number;
  z: number;
  w: number;
  d: number;
  solid: boolean;
  /** floor: drawn under actors; ceiling: drawn over everything. */
  layer?: 'floor' | 'ceiling';
  label?: string;
  action?: Action;
  draw(ctx: Ctx, x: number, y: number, w: number, h: number): void;
}

export interface Layout {
  title: string;
  subtitle: string;
  room(ctx: Ctx): void;
  pieces: Piece[];
  owner?: { npc: NpcId; x: number; z: number };
}

// ---------- Room shells ----------

type FloorStyle = 'diamond' | 'checker' | 'planks' | 'parquet' | 'stone';
export type Paper = 'stripes' | 'flowers' | 'dots' | 'planks' | 'stone';

/** Deterministic 0..1 hash for per-tile variation. */
function hash(x: number, z: number, k = 0): number {
  const v = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

function grain(ctx: Ctx, x: number, y: number, w: number, h: number, c: string, seed: number): void {
  for (let i = 0; i < 3; i++) {
    const gy = y + 3 + Math.floor(hash(seed, i) * (h - 6));
    const gx = x + Math.floor(hash(seed, i, 1) * w * 0.5);
    rect(ctx, gx, gy, Math.min(w - (gx - x), 6 + hash(seed, i, 2) * 14), 1, c);
  }
}

function tileSheen(ctx: Ctx, px: number, py: number, size: number): void {
  rect(ctx, px + 3, py + 3, size * 0.35, 2, 'rgba(255,255,255,0.45)');
  rect(ctx, px + 3, py + 3, 2, size * 0.25, 'rgba(255,255,255,0.45)');
}

function floor(ctx: Ctx, style: FloorStyle, a: string, b: string): void {
  const y0 = WALL_ROWS * T;
  rect(ctx, 0, y0, COLS * T, (ROWS - WALL_ROWS) * T, a);
  for (let z = WALL_ROWS; z < ROWS; z++) {
    for (let x = 0; x < COLS; x++) {
      const px = x * T;
      const py = z * T;
      const n = hash(x, z);
      if (style === 'diamond') {
        rect(ctx, px, py, T, T, shade(a, (n - 0.5) * 0.06));
        ctx.fillStyle = shade(b, (hash(x, z, 3) - 0.5) * 0.08);
        ctx.beginPath();
        ctx.moveTo(px + T / 2, py + 3);
        ctx.lineTo(px + T - 3, py + T / 2);
        ctx.lineTo(px + T / 2, py + T - 3);
        ctx.lineTo(px + 3, py + T / 2);
        ctx.fill();
        rect(ctx, px + T / 2 - 1, py + T / 2 - 1, 2, 2, shade(b, -0.2));
        rect(ctx, px, py, T, 1, shade(a, -0.12));
        rect(ctx, px, py, 1, T, shade(a, -0.12));
        rect(ctx, px + 1, py + 1, T - 2, 1, shade(a, 0.4));
      } else if (style === 'checker') {
        rect(ctx, px, py, T, T, shade((x + z) % 2 ? b : a, (n - 0.5) * 0.05));
        rect(ctx, px, py, T, 1, shade(b, -0.18));
        rect(ctx, px, py, 1, T, shade(b, -0.18));
        tileSheen(ctx, px, py, T);
        if (n > 0.85) rect(ctx, px + 10, py + 18, 6, 1, shade(b, -0.12));
      } else if (style === 'planks') {
        for (let r = 0; r < 2; r++) {
          const by = py + r * (T / 2);
          const off = ((z * 2 + r) % 3) * 11;
          const tone = shade(a, (hash(x, z * 2 + r) - 0.5) * 0.18);
          rect(ctx, px, by, T, T / 2, tone);
          rect(ctx, px, by, T, 1, shade(a, 0.18));
          rect(ctx, px, by + T / 2 - 1, T, 1, b);
          grain(ctx, px, by, T, T / 2, shade(tone, -0.12), x * 31 + z * 7 + r);
          const jx = (px + off) % T === 0 ? px + 6 : px + (off % T);
          if ((x + z + r) % 2 === 0) {
            rect(ctx, jx, by, 1, T / 2, b);
            rect(ctx, jx - 3, by + 3, 1, 1, shade(b, -0.3));
            rect(ctx, jx + 3, by + 3, 1, 1, shade(b, -0.3));
          }
          if (hash(x, z, r + 5) > 0.88) {
            ctx.fillStyle = shade(tone, -0.25);
            ctx.beginPath();
            ctx.ellipse(px + 16, by + 8, 3, 2, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (style === 'parquet') {
        const vertical = (x + z) % 2 === 0;
        for (let i = 0; i < 4; i++) {
          const tone = shade(i % 2 ? a : b, (hash(x, z, i) - 0.5) * 0.12);
          if (vertical) {
            rect(ctx, px + i * 8, py, 8, T, tone);
            rect(ctx, px + i * 8, py, 1, T, shade(b, -0.25));
            rect(ctx, px + i * 8 + 3, py + 4 + hash(x, z, i + 9) * 10, 1, 10, shade(tone, -0.1));
          } else {
            rect(ctx, px, py + i * 8, T, 8, tone);
            rect(ctx, px, py + i * 8, T, 1, shade(b, -0.25));
            rect(ctx, px + 4 + hash(x, z, i + 9) * 10, py + i * 8 + 3, 10, 1, shade(tone, -0.1));
          }
        }
        rect(ctx, px, py, T, 1, 'rgba(255,255,255,0.12)');
      } else {
        rect(ctx, px, py, T, T, shade(a, -0.28));
        const split = n > 0.5;
        const stones: [number, number, number, number][] = split
          ? [[1, 1, T - 2, T / 2 - 2], [1, T / 2, T / 2 - 1, T / 2 - 1], [T / 2 + 1, T / 2, T / 2 - 2, T / 2 - 1]]
          : [[1, 1, T - 2, T - 2]];
        stones.forEach(([sx, sy, sw, sh], i) => {
          const tone = shade(hash(x, z, i) > 0.5 ? a : b, (hash(x, z, i + 4) - 0.5) * 0.12);
          rect(ctx, px + sx, py + sy, sw, sh, tone);
          rect(ctx, px + sx, py + sy, sw, 1, shade(tone, 0.25));
          rect(ctx, px + sx, py + sy + sh - 1, sw, 1, shade(tone, -0.15));
        });
        if (hash(x, z, 7) > 0.8) {
          rect(ctx, px + 8, py + 12, 5, 1, shade(a, -0.35));
          rect(ctx, px + 13, py + 13, 4, 1, shade(a, -0.35));
        }
      }
    }
  }
  const shadowGrad = ctx.createLinearGradient(0, y0, 0, y0 + 22);
  shadowGrad.addColorStop(0, 'rgba(43,34,51,0.32)');
  shadowGrad.addColorStop(1, 'rgba(43,34,51,0)');
  ctx.fillStyle = shadowGrad;
  ctx.fillRect(0, y0, COLS * T, 22);
  for (const side of [0, 1]) {
    const g = ctx.createLinearGradient(side ? COLS * T : 0, 0, side ? COLS * T - 16 : 16, 0);
    g.addColorStop(0, 'rgba(43,34,51,0.22)');
    g.addColorStop(1, 'rgba(43,34,51,0)');
    ctx.fillStyle = g;
    ctx.fillRect(side ? COLS * T - 16 : 0, y0, 16, (ROWS - WALL_ROWS) * T);
  }
}

/** Warm light patches cast on the floor by the back windows. */
function sunlight(ctx: Ctx, windows: number[]): void {
  const y0 = WALL_ROWS * T;
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  for (const wx of windows) {
    const x = wx * T + 6;
    ctx.fillStyle = 'rgba(255,236,170,0.9)';
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x + T * 1.5, y0);
    ctx.lineTo(x + T * 1.5 + 34, y0 + 70);
    ctx.lineTo(x + 34, y0 + 70);
    ctx.fill();
  }
  ctx.restore();
  for (const wx of windows) {
    rect(ctx, wx * T + 6 + T * 0.75 + 10, y0 + 6, 2, 50, 'rgba(255,248,220,0.08)');
  }
}

function wallpaper(ctx: Ctx, paper: Paper, color: string, accent: string, top: number, h: number): void {
  const W = COLS * T;
  if (paper === 'planks') {
    for (let x = 0; x < W; x += 16) {
      const tone = shade(color, (hash(x, 1) - 0.5) * 0.16);
      rect(ctx, x, top, 16, h, tone);
      rect(ctx, x, top, 1, h, shade(color, -0.3));
      rect(ctx, x + 1, top, 1, h, shade(tone, 0.12));
      grain(ctx, x + 2, top, 13, h, shade(tone, -0.12), x);
      rect(ctx, x + 7, top + 3, 2, 2, shade(color, -0.4));
      rect(ctx, x + 7, top + h - 6, 2, 2, shade(color, -0.4));
    }
    return;
  }
  if (paper === 'stone') {
    for (let r = 0; r * 12 < h; r++) {
      for (let x = -(r % 2) * 12; x < W; x += 24) {
        const tone = shade(color, (hash(x, r) - 0.5) * 0.1);
        rect(ctx, x + 1, top + r * 12 + 1, 22, 10, tone);
        rect(ctx, x + 1, top + r * 12 + 1, 22, 1, shade(tone, 0.3));
      }
    }
    return;
  }
  rect(ctx, 0, top, W, h, color);
  if (paper === 'stripes') {
    for (let x = 0; x < W; x += 16) {
      rect(ctx, x, top, 6, h, shade(accent, 0.72));
      rect(ctx, x + 7, top, 1, h, shade(accent, 0.55));
    }
  } else if (paper === 'flowers') {
    for (let y = top + 4, row = 0; y < top + h - 4; y += 12, row++) {
      for (let x = (row % 2) * 10 + 4; x < W; x += 20) {
        rect(ctx, x, y, 3, 3, shade(accent, 0.45));
        rect(ctx, x - 2, y + 1, 1, 1, shade(accent, 0.6));
        rect(ctx, x + 4, y + 1, 1, 1, shade(accent, 0.6));
        rect(ctx, x + 1, y + 4, 1, 2, '#9cc58a');
      }
    }
  } else {
    for (let y = top + 3, row = 0; y < top + h - 2; y += 8, row++) for (let x = (row % 2) * 6 + 2; x < W; x += 12) rect(ctx, x, y, 2, 2, shade(accent, 0.6));
  }
}

function wall(ctx: Ctx, color: string, stripe: string, windows: number[], paper: Paper = 'stripes'): void {
  const W = COLS * T;
  const h = WALL_ROWS * T;
  const wainTop = h - 24;
  rect(ctx, 0, 0, W, h, color);
  wallpaper(ctx, paper, color, stripe, 6, wainTop - 6);
  rect(ctx, 0, 0, W, 6, shade(color, -0.35));
  rect(ctx, 0, 5, W, 2, shade(color, 0.3));
  if (paper !== 'planks' && paper !== 'stone') {
    rect(ctx, 0, wainTop, W, h - wainTop, shade(stripe, 0.55));
    for (let x = 4; x < W - 20; x += 32) {
      rect(ctx, x, wainTop + 5, 26, 10, shade(stripe, 0.4));
      rect(ctx, x, wainTop + 5, 26, 1, shade(stripe, 0.2));
      rect(ctx, x, wainTop + 14, 26, 1, shade(stripe, 0.75));
    }
  }
  rect(ctx, 0, wainTop - 3, W, 4, stripe);
  rect(ctx, 0, wainTop - 3, W, 1, shade(stripe, 0.35));
  rect(ctx, 0, h - 6, W, 6, shade(color, -0.3));
  rect(ctx, 0, h - 6, W, 1, shade(color, 0.2));
  for (const wx of windows) {
    const x = wx * T + 6;
    const w = T * 1.5;
    frame(ctx, x, 10, w, 28, '#9fd8ef');
    const sky = ctx.createLinearGradient(0, 10, 0, 38);
    sky.addColorStop(0, '#c9ecf8');
    sky.addColorStop(1, '#8fcbe6');
    ctx.fillStyle = sky;
    ctx.fillRect(x, 10, w, 28);
    rect(ctx, x + 4, 30, 14, 3, '#fbfbf8');
    rect(ctx, x + 20, 32, 10, 2, '#fbfbf8');
    rect(ctx, x + w - 12, 16, 8, 2, 'rgba(255,255,255,0.6)');
    rect(ctx, x + w / 2 - 1, 10, 2, 28, '#fbf8f0');
    rect(ctx, x, 23, w, 2, '#fbf8f0');
    rect(ctx, x + 3, 12, 3, 8, 'rgba(255,255,255,0.5)');
    rect(ctx, x - 7, 8, 7, 34, shade(stripe, 0.1));
    rect(ctx, x + w, 8, 7, 34, shade(stripe, 0.1));
    for (let i = 0; i < 3; i++) {
      rect(ctx, x - 6 + i * 2, 8, 1, 34, shade(stripe, -0.15));
      rect(ctx, x + w + 1 + i * 2, 8, 1, 34, shade(stripe, -0.15));
    }
    rect(ctx, x - 9, 6, w + 18, 3, shade(stripe, -0.3));
    rect(ctx, x - 4, 40, w + 8, 4, '#fbf8f0');
    rect(ctx, x - 4, 43, w + 8, 1, shade('#fbf8f0', -0.25));
  }
}

function doorMat(ctx: Ctx, color: string): void {
  const x = DOOR_X[0] ?? 5;
  frame(ctx, x * T + 4, (ROWS - 1) * T + 6, T * 2 - 8, T - 10, color);
  for (let i = 0; i < 5; i++) rect(ctx, x * T + 10 + i * 10, (ROWS - 1) * T + 10, 4, T - 18, shade(color, -0.2));
}

// ---------- Pieces ----------

const deco = (x: number, z: number, w: number, d: number, draw: Piece['draw'], extra: Partial<Piece> = {}): Piece => ({ x, z, w, d, solid: true, draw, ...extra });

const plant = (x: number, z: number, pot: string): Piece =>
  deco(x, z, 1, 1, (ctx, px, py, pw, ph) => {
    shadow(ctx, px + 4, py + ph - 8, pw - 8, 8);
    drawIcon(ctx, 'plant', pot, px - 2, py - 18, pw + 4, ph + 16);
  });

const counter = (x: number, z: number, w: number, top: string, front: string, goods: (ctx: Ctx, px: number, py: number) => void): Piece =>
  deco(x, z, w, 1, (ctx, px, py, pw, ph) => {
    box(ctx, px + 1, py + 6, pw - 2, ph - 8, 18, top, front);
    goods(ctx, px, py - 12);
  });

function shelf(x: number, z: number, w: number, shop: ShopId, levels: number[], title: string, state: GameState, wood = '#fbf8f0'): Piece {
  const stock = stockOf(state, shop).filter((e) => levels.includes(e.item.level));
  return deco(x, z, w, 1, (ctx, px, py, pw, ph) => {
    box(ctx, px + 1, py + 4, pw - 2, ph - 4, 40, wood, shade(wood, -0.12));
    rect(ctx, px + 4, py - 12, pw - 8, 3, shade(wood, -0.3));
    const size = 18;
    const per = Math.max(1, Math.floor((pw - 8) / size));
    stock.slice(0, per * 2).forEach((e, i) => {
      const col = i % per;
      const row = Math.floor(i / per);
      ctx.globalAlpha = e.owned ? 0.35 : 1;
      drawIcon(ctx, e.item.icon, e.item.color, px + 5 + col * size, py - 34 + row * 20, size - 2, size - 2);
      ctx.globalAlpha = 1;
    });
  }, { label: title, action: { kind: 'shelf', shop, levels, title } });
}

/** Taped-off corner promising what the next island level brings. */
function locked(x: number, z: number, w: number, d: number, level: number): Piece {
  return deco(x, z, w, d, (ctx, px, py, pw, ph) => {
    ctx.fillStyle = 'rgba(43,34,51,0.12)';
    ctx.fillRect(px + 2, py + 2, pw - 4, ph - 4);
    ctx.save();
    ctx.beginPath();
    ctx.rect(px + 2, py + 2, pw - 4, ph - 4);
    ctx.clip();
    for (let i = -ph; i < pw; i += 12) {
      ctx.fillStyle = '#f2c230';
      ctx.beginPath();
      ctx.moveTo(px + i, py + ph);
      ctx.lineTo(px + i + 6, py + ph);
      ctx.lineTo(px + i + 6 + ph, py);
      ctx.lineTo(px + i + ph, py);
      ctx.fill();
    }
    ctx.restore();
    box(ctx, px + pw / 2 - 14, py + ph / 2 - 2, 28, 12, 14, '#8a5a3c');
    ctx.fillStyle = '#fbf8f0';
    ctx.font = 'bold 10px "Pixelify Sans", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Lv.${level}`, px + pw / 2, py + ph / 2 + 7);
  }, { layer: 'floor', label: `Coming soon · level ${level}`, action: { kind: 'locked', level } });
}

const rug = (x: number, z: number, w: number, d: number, color: string, trim: string): Piece =>
  deco(x, z, w, d, (ctx, px, py, pw, ph) => {
    frame(ctx, px + 4, py + 4, pw - 8, ph - 8, color);
    rect(ctx, px + 9, py + 9, pw - 18, 2, trim);
    rect(ctx, px + 9, py + ph - 11, pw - 18, 2, trim);
  }, { layer: 'floor', solid: false });

function breads(ctx: Ctx, px: number, py: number): void {
  const bread = (x: number, c: string, w: number): void => {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(px + x, py + 16, w / 2 + 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(px + x, py + 16, w / 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    rect(ctx, px + x - 2, py + 14, 4, 1, shade(c, 0.4));
  };
  bread(14, '#d9913f', 18);
  bread(36, '#e6b35c', 12);
  bread(56, '#c77a33', 22);
  bread(80, '#f0c878', 12);
  bread(100, '#d9913f', 16);
}

function register(ctx: Ctx, px: number, py: number): void {
  box(ctx, px + 44, py + 12, 26, 10, 12, '#e3b13f');
  rect(ctx, px + 48, py - 2, 18, 6, '#7ad07a');
}

function crates(ctx: Ctx, px: number, py: number): void {
  box(ctx, px + 6, py + 12, 20, 8, 10, '#6cc3e0');
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = '#a9b8c8';
    ctx.beginPath();
    ctx.ellipse(px + 44 + i * 16, py + 14, 7, 3, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function barrel(x: number, z: number): Piece {
  return deco(x, z, 1, 1, (ctx, px, py, pw, ph) => {
    shadow(ctx, px + 4, py + ph - 8, pw - 8, 8);
    frame(ctx, px + 6, py - 6, pw - 12, ph, '#9a6a44');
    rect(ctx, px + 6, py, pw - 12, 3, '#5b4636');
    rect(ctx, px + 6, py + ph - 12, pw - 12, 3, '#5b4636');
    frame(ctx, px + 8, py - 10, pw - 16, 6, '#b8845a');
  });
}

function board(x: number, z: number, w: number, state: GameState): Piece {
  return deco(x, z, w, 1, (ctx, px, py, pw, ph) => {
    frame(ctx, px + 4, py - 30, pw - 8, 44, '#8a5a3c');
    rect(ctx, px + 8, py - 26, pw - 16, 36, '#f4ecd6');
    const lvl = islandLevel(state.islandValue).level;
    ISLAND_LEVELS.forEach((l, i) => {
      const cx = px + 22 + i * ((pw - 44) / (ISLAND_LEVELS.length - 1));
      rect(ctx, cx - 5, py - 16, 10, 10, l.level <= lvl ? '#5fb04a' : '#c9c1ad');
      if (i < ISLAND_LEVELS.length - 1) rect(ctx, cx + 5, py - 12, (pw - 44) / (ISLAND_LEVELS.length - 1) - 10, 2, INK);
    });
    rect(ctx, px + 12, py + 2, pw - 24, 3, '#c8453c');
    rect(ctx, px + 12, py - 44 + ph, 3, 16, INK);
    rect(ctx, px + pw - 15, py - 44 + ph, 3, 16, INK);
  }, { label: 'Floor plan', action: { kind: 'board' } });
}

function glow(ctx: Ctx, x: number, y: number, r: number): void {
  const g = ctx.createRadialGradient(x, y, 4, x, y, r);
  g.addColorStop(0, 'rgba(255,236,170,0.35)');
  g.addColorStop(1, 'rgba(255,236,170,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// ---------- Player's home: every piece of furniture has its spot ----------

interface Spot {
  id: ShopItemId;
  x: number;
  z: number;
  w: number;
  d: number;
  layer?: 'floor' | 'ceiling';
}

const HOME_SPOTS: readonly Spot[] = [
  { id: 'tapis', x: 3, z: 4, w: 4, d: 3, layer: 'floor' },
  { id: 'canape', x: 3, z: 2, w: 3, d: 1 },
  { id: 'lampe', x: 6, z: 2, w: 1, d: 1 },
  { id: 'bibliotheque', x: 7, z: 2, w: 2, d: 1 },
  { id: 'table', x: 4, z: 5, w: 2, d: 1 },
  { id: 'tabouret', x: 6, z: 6, w: 1, d: 1 },
  { id: 'fauteuil', x: 7, z: 5, w: 1, d: 1 },
  { id: 'piano', x: 9, z: 6, w: 2, d: 1 },
  { id: 'trone', x: 0, z: 6, w: 1, d: 1 },
  { id: 'plante', x: 0, z: 9, w: 1, d: 1 },
  { id: 'voilier', x: 8, z: 9, w: 1, d: 1 },
  { id: 'aquarium', x: 10, z: 9, w: 2, d: 1 },
  { id: 'bouee', x: 4, z: 0, w: 1, d: 1, layer: 'ceiling' },
  { id: 'lustre', x: 5, z: 3, w: 2, d: 1, layer: 'ceiling' },
];

function furniture(s: Spot, owned: boolean): Piece {
  const it = SHOP_ITEMS[s.id];
  if (!owned) {
    if (s.layer === 'ceiling') return deco(s.x, s.z, 0, 0, () => undefined, { solid: false, layer: 'floor' });
    return deco(s.x, s.z, s.w, s.d, (ctx, px, py, pw, ph) => {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(43,34,51,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 4, py + 4, pw - 8, ph - 8);
      ctx.setLineDash([]);
    }, { solid: false, layer: 'floor', label: `Free spot: ${it.name}`, action: { kind: 'say', text: `A ${it.name} would fit here. ${shopHint(it.shop)}` } });
  }
  const tall = it.icon === 'bookcase' || it.icon === 'lamp' || it.icon === 'plant' || it.icon === 'throne' ? 30 : 16;
  return deco(s.x, s.z, s.w, s.d, (ctx, px, py, pw, ph) => {
    if (s.layer !== 'ceiling' && s.layer !== 'floor') shadow(ctx, px + 2, py + ph - 10, pw - 4, 10);
    if (it.icon === 'chandelier') glow(ctx, px + pw / 2, py + ph + 20, 70);
    const h = s.layer ? ph : ph + tall;
    drawIcon(ctx, it.icon, it.color, px, py + ph - h, pw, h);
  }, { solid: !s.layer, layer: s.layer, label: it.name });
}

function shopHint(shop: ShopId): string {
  return shop === 'echoppe' ? 'Gaston sells them at his stall.' : shop === 'cabane' ? 'Marius has some in his shack.' : 'Josette knits them at the bakery.';
}

// ---------- Layouts ----------

export function layoutFor(id: BuildingId, state: GameState): Layout {
  const lvl = islandLevel(state.islandValue).level;
  const cream = '#fbf3e4';
  switch (id) {
    case 'echoppe':
      return {
        title: 'Gaston’s Stall',
        subtitle: 'Furniture, trinkets & bargains',
        room: (ctx) => {
          wall(ctx, '#fbfbf8', '#6cc3e0', [5], 'stripes');
          floor(ctx, 'diamond', '#cfeef6', '#b3e1ee');
          sunlight(ctx, [5]);
          doorMat(ctx, '#4f7fc9');
        },
        owner: { npc: 'gaston', x: 6, z: 3 },
        pieces: [
          shelf(1, 2, 3, 'echoppe', [1], 'Small furniture', state),
          lvl >= 2 ? shelf(8, 2, 3, 'echoppe', [2], 'Comfort aisle', state) : locked(8, 2, 3, 1, 2),
          counter(4, 4, 4, '#fbfbf8', '#9fd8ef', register),
          lvl >= 3 ? shelf(1, 7, 2, 'echoppe', [3], 'Luxury display', state, '#f2e3b3') : locked(1, 7, 2, 2, 3),
          deco(9, 7, 2, 1, (ctx, px, py, pw) => {
            box(ctx, px + 2, py + 6, pw - 4, 22, 14, '#c79a5b');
            drawIcon(ctx, 'lamp', '#f5d9a8', px + 4, py - 22, 22, 26);
            drawIcon(ctx, 'buoy', '#e0564a', px + 32, py - 14, 22, 22);
          }, { label: 'Outdoor decor', action: { kind: 'deco' } }),
          plant(0, 9, '#e98aa6'),
          plant(11, 9, '#e98aa6'),
          plant(11, 4, '#f2c14e'),
          ...(lvl >= 2
            ? [deco(3, 8, 1, 1, (c, x, y, w, h) => drawIcon(c, 'stool', '#f2c14e', x, y - 4, w, h)), deco(8, 8, 1, 1, (c, x, y, w, h) => drawIcon(c, 'stool', '#4f7fc9', x, y - 4, w, h))]
            : []),
          ...(lvl >= 3 ? [rug(4, 6, 4, 2, '#f2c14e', '#c8453c'), deco(4, 6, 4, 1, (c, x, y, w) => {
              glow(c, x + w / 2, y + 30, 80);
              drawIcon(c, 'chandelier', '#bfe8f2', x + w / 2 - 24, y - 30, 48, 40);
            }, { layer: 'ceiling', solid: false })] : []),
        ],
      };
    case 'boulangerie':
      return {
        title: 'Bakery & Knits',
        subtitle: 'Warm croissants and soft wool',
        room: (ctx) => {
          wall(ctx, cream, '#e98aa6', [1, 9], 'flowers');
          floor(ctx, 'checker', '#fdf3f5', '#f6d3dc');
          sunlight(ctx, [1, 9]);
          doorMat(ctx, '#e98aa6');
        },
        owner: { npc: 'josette', x: 6, z: 3 },
        pieces: [
          counter(4, 4, 4, '#fffaf0', '#e98aa6', breads),
          deco(0, 2, 3, 1, (ctx, px, py, pw, ph) => {
            box(ctx, px + 2, py + 4, pw - 4, ph - 4, 30, '#bfe8f2', '#e6d3ae');
            breads(ctx, px - 6, py - 30);
          }, { label: 'Bread display', action: { kind: 'say', text: 'Smells like warm croissants. Josette swears she adds "a secret ingredient: gossip".' } }),
          shelf(8, 2, 3, 'boulangerie', [1], 'Josette’s knits', state, '#f4d9b8'),
          lvl >= 2 ? shelf(9, 6, 2, 'boulangerie', [2], 'Winter collection', state, '#f4d9b8') : locked(9, 6, 2, 1, 2),
          lvl >= 3 ? shelf(1, 6, 2, 'boulangerie', [3], 'Haute couture', state, '#e6d0f2') : locked(1, 6, 2, 1, 3),
          deco(0, 8, 1, 2, (ctx, px, py, pw, ph) => {
            frame(ctx, px + 2, py - 20, pw - 4, ph + 16, '#c8453c');
            rect(ctx, px + 6, py - 16, pw - 12, ph + 8, '#bfe8f2');
            rect(ctx, px + 8, py - 12, 4, ph, '#fbf8f0');
          }, { label: 'Fitting room', action: { kind: 'wardrobe' } }),
          deco(7, 8, 1, 1, (c, x, y, w, h) => drawIcon(c, 'table', '#fbf8f0', x - 2, y - 8, w + 4, h + 4)),
          plant(11, 9, '#fbf8f0'),
        ],
      };
    case 'cabane':
      return {
        title: 'Marius’s Shack',
        subtitle: 'Everything the sea brought back',
        room: (ctx) => {
          wall(ctx, '#b8845a', '#2f5f8f', [2], 'planks');
          for (let i = 0; i < 6; i++) rect(ctx, 200 + i * 22, 8, 1, 40, '#e6d3ae');
          for (let i = 0; i < 3; i++) rect(ctx, 200, 14 + i * 14, 112, 1, '#e6d3ae');
          floor(ctx, 'planks', '#c79a5b', '#9a6a44');
          sunlight(ctx, [2]);
          doorMat(ctx, '#2f5f8f');
        },
        owner: { npc: 'marius', x: 5, z: 3 },
        pieces: [
          counter(4, 4, 3, '#9a6a44', '#6e4a30', crates),
          shelf(8, 2, 3, 'cabane', [1], 'Fisherman’s stall', state, '#9a6a44'),
          lvl >= 2 ? shelf(1, 2, 2, 'cabane', [2], 'Fresh from the deep', state, '#9a6a44') : locked(1, 2, 2, 1, 2),
          lvl >= 3 ? shelf(9, 6, 2, 'cabane', [3], 'Captain’s corner', state, '#2f5f8f') : locked(9, 6, 2, 2, 3),
          barrel(0, 8),
          barrel(11, 8),
          barrel(0, 5),
          deco(3, 8, 1, 1, (c, x, y, w, h) => drawIcon(c, 'buoy', '#e0564a', x, y - 6, w, h), { label: 'Old buoy', action: { kind: 'say', text: '"… She saved my life in 1987. She’s not for sale."' } }),
        ],
      };
    case 'mairie':
      return {
        title: 'Town Hall',
        subtitle: `Island level ${lvl} · ${islandLevel(state.islandValue).name}`,
        room: (ctx) => {
          wall(ctx, '#efe6d2', '#c8453c', [1, 9], 'stone');
          floor(ctx, 'stone', '#d8d2c4', '#cbc3b2');
          sunlight(ctx, [1, 9]);
          rect(ctx, 5 * T, 5 * T, 2 * T, 6 * T, '#c8453c');
          rect(ctx, 5 * T + 4, 5 * T, 2, 6 * T, '#f2c14e');
          rect(ctx, 7 * T - 6, 5 * T, 2, 6 * T, '#f2c14e');
          doorMat(ctx, '#c8453c');
        },
        pieces: [
          board(4, 2, 4, state),
          deco(4, 4, 4, 1, (ctx, px, py, pw, ph) => box(ctx, px + 2, py + 6, pw - 4, ph - 8, 18, '#8a5a3c'), { label: 'Mayor’s desk (away)', action: { kind: 'say', text: 'The mayor’s desk is empty. Word is he left after one of Josette’s rumors.' } }),
          plant(0, 2, '#c8453c'),
          plant(11, 2, '#c8453c'),
          deco(1, 7, 2, 1, (c, x, y, w, h) => drawIcon(c, 'sofa', '#8a5a3c', x, y - 10, w, h + 10)),
          deco(9, 7, 2, 1, (c, x, y, w, h) => drawIcon(c, 'sofa', '#8a5a3c', x, y - 10, w, h + 10)),
        ],
      };
    case 'maison':
      return {
        title: 'Your home',
        subtitle: 'Every piece of furniture you buy finds its place here',
        room: (ctx) => {
          wall(ctx, '#f6e7c8', '#5fa37a', [9], 'dots');
          floor(ctx, 'parquet', '#c99a66', '#b38454');
          sunlight(ctx, [9]);
          doorMat(ctx, '#5fa37a');
        },
        pieces: [
          deco(0, 2, 2, 3, (ctx, px, py, pw, ph) => {
            frame(ctx, px + 4, py - 6, pw - 8, ph + 2, '#8a5a3c');
            rect(ctx, px + 8, py - 2, pw - 16, 18, '#fbf8f0');
            rect(ctx, px + 8, py + 18, pw - 16, ph - 28, '#4f7fc9');
            rect(ctx, px + 8, py + 18, pw - 16, 4, '#8fb3e8');
          }, { label: 'Bed (sleep)', action: { kind: 'bed' } }),
          deco(10, 2, 2, 1, (ctx, px, py, pw, ph) => {
            box(ctx, px + 2, py + 4, pw - 4, ph - 4, 40, '#a8744a');
            rect(ctx, px + pw / 2 - 1, py - 34, 2, 36, INK);
            rect(ctx, px + pw / 2 - 6, py - 14, 3, 6, '#f2c14e');
            rect(ctx, px + pw / 2 + 3, py - 14, 3, 6, '#f2c14e');
          }, { label: 'Wardrobe', action: { kind: 'wardrobe' } }),
          ...HOME_SPOTS.map((s) => furniture(s, state.owned.includes(s.id))),
        ],
      };
  }
}

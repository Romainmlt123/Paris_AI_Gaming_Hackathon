import * as THREE from 'three';
import palette from '../../shared/palette.json';
import { mulberry32, type Rng } from '../../shared/rng';

export type PaletteKey = keyof typeof palette;
export const P = palette;

export function color(key: PaletteKey): THREE.Color {
  return new THREE.Color(palette[key]);
}

type Draw = (ctx: CanvasRenderingContext2D, rng: Rng, size: number) => void;

/** Small crisp canvas texture (NearestFilter), repeated in world units. */
export function pixelTexture(size: number, draw: Draw, seed = 1): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  draw(ctx, mulberry32(seed), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function fill(ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w = 1, h = 1): void {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

function speckle(ctx: CanvasRenderingContext2D, rng: Rng, size: number, colors: string[], density: number, yMin = 0): void {
  for (let y = yMin; y < size; y++) for (let x = 0; x < size; x++) {
    if (rng() < density) fill(ctx, colors[Math.floor(rng() * colors.length)] ?? colors[0] ?? '#fff', x, y);
  }
}

function shade(c: string, k: number): string {
  const col = new THREE.Color(c);
  return (k < 0 ? col.multiplyScalar(1 + k) : col.lerp(new THREE.Color('#fff4dc'), k)).getStyle();
}

/** Seamless fill: wraps around the tile edges. */
function wrap(ctx: CanvasRenderingContext2D, s: number, c: string, x: number, y: number, w = 1, h = 1): void {
  ctx.fillStyle = c;
  for (const ox of [0, -s]) for (const oy of [0, -s]) {
    const xx = (((x % s) + s) % s) + ox;
    const yy = (((y % s) + s) % s) + oy;
    if (xx + w > 0 && yy + h > 0 && xx < s && yy < s) ctx.fillRect(xx, yy, w, h);
  }
}

function pick<T>(rng: Rng, list: T[]): T {
  const v = list[Math.floor(rng() * list.length)];
  if (v === undefined) throw new Error('empty list');
  return v;
}

const TILE = 64;

function grassPaint(ctx: CanvasRenderingContext2D, rng: Rng, s: number): void {
  fill(ctx, P.grass, 0, 0, s, s);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rng() * s);
    const y = Math.floor(rng() * s);
    const r = 3 + Math.floor(rng() * 6);
    const c = rng() < 0.5 ? shade(P.grass, -0.08) : shade(P.grass, 0.06);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r && rng() < 0.85) wrap(ctx, s, c, x + dx, y + dy);
  }
  for (let i = 0; i < 520; i++) {
    const x = Math.floor(rng() * s);
    const y = Math.floor(rng() * s);
    const h = 2 + Math.floor(rng() * 3);
    wrap(ctx, s, shade(P.grassDark, -0.1), x, y + h, 1, 1);
    wrap(ctx, s, rng() < 0.5 ? P.grassDark : shade(P.grass, -0.12), x, y + 1, 1, h - 1);
    wrap(ctx, s, rng() < 0.6 ? P.grassLight : shade(P.grassLight, 0.15), x, y, 1, 1);
  }
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(rng() * s);
    const y = Math.floor(rng() * s);
    wrap(ctx, s, pick(rng, [P.flowerWhite, P.flowerYellow, '#dfe9ff']), x, y);
  }
}

export const grassTop = (): THREE.CanvasTexture => pixelTexture(TILE, grassPaint, 11);

/** Paving stones with mortar, highlights and wear, like a village square. */
export const pathTop = (): THREE.CanvasTexture =>
  pixelTexture(TILE, (ctx, rng, s) => {
    const mortar = shade(P.pathDark, -0.25);
    fill(ctx, mortar, 0, 0, s, s);
    const rows = 5;
    const rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const y = Math.round(r * rh);
      const h = Math.round((r + 1) * rh) - y;
      let x = r % 2 === 0 ? 0 : -Math.floor(rh * 0.7);
      while (x < s) {
        const w = Math.floor(rh * (1 + rng() * 0.8));
        const base = pick(rng, [P.path, shade(P.path, -0.06), shade(P.path, 0.05), shade(P.pathDark, 0.15)]);
        wrap(ctx, s, base, x + 1, y + 1, w - 2, h - 2);
        wrap(ctx, s, shade(base, 0.22), x + 1, y + 1, w - 3, 1);
        wrap(ctx, s, shade(base, 0.12), x + 1, y + 2, 1, h - 4);
        wrap(ctx, s, shade(base, -0.18), x + 2, y + h - 2, w - 3, 1);
        wrap(ctx, s, shade(base, -0.1), x + w - 2, y + 2, 1, h - 4);
        for (let k = 0; k < 6; k++) wrap(ctx, s, shade(base, rng() < 0.5 ? -0.08 : 0.08), x + 2 + Math.floor(rng() * (w - 4)), y + 2 + Math.floor(rng() * (h - 4)));
        x += w;
      }
    }
    for (let i = 0; i < 12; i++) wrap(ctx, s, P.grassDark, Math.floor(rng() * s), Math.floor(rng() * s), 1, 2);
  }, 12);

export const sandTex = (): THREE.CanvasTexture =>
  pixelTexture(TILE, (ctx, rng, s) => {
    const tones = [P.sand, shade(P.sand, -0.04), shade(P.sand, 0.06), shade(P.sandDark, 0.25)];
    for (let y = 0; y < s; y += 2) for (let x = 0; x < s; x += 2) fill(ctx, pick(rng, tones), x, y, 2, 2);
    for (let row = 0; row < s; row += 8) {
      const phase = rng() * Math.PI * 2;
      for (let x = 0; x < s; x++) {
        const y = row + Math.round(Math.sin((x / s) * Math.PI * 4 + phase) * 1.5);
        wrap(ctx, s, shade(P.sand, 0.16), x, y - 1, 1, 1);
        wrap(ctx, s, shade(P.sandDark, -0.04), x, y, 1, 1);
      }
    }
    speckle(ctx, rng, s, [P.sandDark, '#fff6e2', shade(P.sand, -0.14), '#c9b184'], 0.035);
    for (let i = 0; i < 4; i++) {
      const x = Math.floor(rng() * s);
      const y = Math.floor(rng() * s);
      const c = pick(rng, ['#b9a98f', '#9d8f7c', '#d8cbb2']);
      wrap(ctx, s, shade(c, -0.25), x, y + 2, 3, 1);
      wrap(ctx, s, c, x, y, 3, 2);
      wrap(ctx, s, shade(c, 0.3), x, y, 1, 1);
    }
    for (let i = 0; i < 2; i++) {
      const x = Math.floor(rng() * s);
      const y = Math.floor(rng() * s);
      const c = pick(rng, ['#f7c9b8', '#fff1e0', '#f3d9a4']);
      wrap(ctx, s, '#8c6a55', x, y + 3, 5, 1);
      wrap(ctx, s, c, x + 1, y, 3, 1);
      wrap(ctx, s, c, x, y + 1, 5, 2);
      wrap(ctx, s, shade(c, -0.2), x + 1, y + 1, 1, 2);
      wrap(ctx, s, shade(c, -0.2), x + 3, y + 1, 1, 2);
    }
  }, 13);

function earth(ctx: CanvasRenderingContext2D, rng: Rng, s: number, base: string): void {
  fill(ctx, base, 0, 0, s, s);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rng() * s);
    const y = Math.floor(rng() * s);
    const w = 3 + Math.floor(rng() * 6);
    wrap(ctx, s, shade(base, 0.12), x, y, w, 1);
    wrap(ctx, s, shade(base, -0.2), x, y + 1, w, 1);
  }
  speckle(ctx, rng, s, [shade(base, -0.15), shade(base, 0.1)], 0.08);
}

function grassLip(ctx: CanvasRenderingContext2D, rng: Rng, s: number, depth: number): void {
  fill(ctx, P.grass, 0, 0, s, depth);
  fill(ctx, P.grassLight, 0, 0, s, 1);
  for (let x = 0; x < s; x++) {
    const h = depth + Math.floor(rng() * 4);
    fill(ctx, rng() < 0.5 ? P.grassDark : P.grass, x, depth, 1, h - depth);
    fill(ctx, shade(P.grassDark, -0.3), x, h, 1, 1);
  }
}

/** Side of a grass column: overhanging grass lip, earth below. */
export const dirtSide = (): THREE.CanvasTexture =>
  pixelTexture(TILE, (ctx, rng, s) => {
    earth(ctx, rng, s, P.dirt);
    grassLip(ctx, rng, s, 10);
  }, 14);

export const cliffSide = (): THREE.CanvasTexture =>
  pixelTexture(TILE, (ctx, rng, s) => {
    fill(ctx, P.cliffDark, 0, 0, s, s);
    for (let y = 0; y < s; y += 10) {
      let x = (y / 10) % 2 === 0 ? 0 : -7;
      while (x < s) {
        const w = 10 + Math.floor(rng() * 10);
        const base = pick(rng, [P.cliff, shade(P.cliff, -0.08), shade(P.cliff, 0.06)]);
        wrap(ctx, s, base, x + 1, y + 1, w - 2, 8);
        wrap(ctx, s, shade(base, 0.2), x + 1, y + 1, w - 3, 1);
        wrap(ctx, s, shade(base, -0.2), x + 1, y + 8, w - 2, 1);
        x += w;
      }
    }
    grassLip(ctx, rng, s, 6);
  }, 15);

export const planks = (): THREE.CanvasTexture =>
  pixelTexture(TILE, (ctx, rng, s) => {
    const ph = 8;
    for (let y = 0; y < s; y += ph) {
      const base = pick(rng, [P.plank, shade(P.plank, -0.07), shade(P.plank, 0.05)]);
      fill(ctx, base, 0, y, s, ph);
      fill(ctx, shade(base, 0.18), 0, y, s, 1);
      fill(ctx, shade(P.plankDark, -0.35), 0, y + ph - 1, s, 1);
      for (let g = 0; g < 5; g++) {
        const gy = y + 2 + Math.floor(rng() * (ph - 3));
        const gx = Math.floor(rng() * s);
        wrap(ctx, s, shade(base, -0.14), gx, gy, 6 + Math.floor(rng() * 14), 1);
      }
      const seam = Math.floor(rng() * s);
      wrap(ctx, s, shade(P.plankDark, -0.3), seam, y, 1, ph - 1);
      wrap(ctx, s, '#6b5a50', seam + 2, y + 3, 1, 1);
      wrap(ctx, s, '#6b5a50', seam - 3, y + 3, 1, 1);
    }
  }, 16);

export const plaster = (tint: string): THREE.CanvasTexture =>
  pixelTexture(TILE, (ctx, rng, s) => {
    fill(ctx, tint, 0, 0, s, s);
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(rng() * s);
      const y = Math.floor(rng() * s);
      wrap(ctx, s, shade(tint, rng() < 0.5 ? -0.05 : 0.05), x, y, 2 + Math.floor(rng() * 5), 1 + Math.floor(rng() * 2));
    }
    fill(ctx, shade(tint, -0.15), 0, s - 6, s, 6);
    fill(ctx, shade(tint, -0.25), 0, s - 6, s, 1);
  }, 17);

export const stoneWall = (): THREE.CanvasTexture =>
  pixelTexture(TILE, (ctx, rng, s) => {
    fill(ctx, shade(P.stoneDark, -0.2), 0, 0, s, s);
    const bh = 8;
    for (let y = 0; y < s; y += bh) {
      let x = (y / bh) % 2 === 0 ? 0 : -8;
      while (x < s) {
        const w = 16;
        const base = pick(rng, [P.stone, shade(P.stone, -0.06), shade(P.stone, 0.05), shade(P.stoneDark, 0.1)]);
        wrap(ctx, s, base, x + 1, y + 1, w - 2, bh - 2);
        wrap(ctx, s, shade(base, 0.2), x + 1, y + 1, w - 2, 1);
        wrap(ctx, s, shade(base, -0.15), x + 1, y + bh - 2, w - 2, 1);
        x += w;
      }
    }
    speckle(ctx, rng, s, ['#ddd4c540'], 0.05);
  }, 18);

export const roofTiles = (base: string): THREE.CanvasTexture =>
  pixelTexture(TILE, (ctx, rng, s) => {
    const rh = 8;
    const tw = 8;
    fill(ctx, shade(base, -0.4), 0, 0, s, s);
    for (let y = 0; y < s; y += rh) {
      const off = (y / rh) % 2 === 0 ? 0 : tw / 2;
      for (let x = -tw; x < s + tw; x += tw) {
        const c = shade(base, (rng() - 0.5) * 0.12);
        wrap(ctx, s, c, x + off, y, tw - 1, rh - 1);
        wrap(ctx, s, shade(c, 0.22), x + off, y, tw - 1, 1);
        wrap(ctx, s, shade(c, 0.1), x + off, y + 1, 1, rh - 3);
        wrap(ctx, s, shade(c, -0.22), x + off, y + rh - 2, tw - 1, 1);
        wrap(ctx, s, shade(c, -0.3), x + off + 1, y + rh - 1, tw - 3, 1);
      }
    }
  }, 19);

export const awning = (): THREE.CanvasTexture =>
  pixelTexture(16, (ctx, _rng, s) => {
    for (let x = 0; x < s; x += 4) {
      fill(ctx, P.awningA, x, 0, 2, s);
      fill(ctx, P.awningB, x + 2, 0, 2, s);
    }
    fill(ctx, '#00000022', 0, s - 2, s, 2);
  }, 20);

/** Small pixel icon painted on a sign board. */
export function signTexture(icon: 'bread' | 'fish' | 'coin' | 'flag'): THREE.CanvasTexture {
  const tex = pixelTexture(16, (ctx, _rng, s) => {
    fill(ctx, P.plank, 0, 0, s, s);
    fill(ctx, P.plankDark, 0, 0, s, 1);
    fill(ctx, P.plankDark, 0, s - 1, s, 1);
    fill(ctx, P.plankDark, 0, 0, 1, s);
    fill(ctx, P.plankDark, s - 1, 0, 1, s);
    if (icon === 'bread') {
      fill(ctx, '#e0a458', 3, 6, 10, 5);
      fill(ctx, '#c47f3a', 4, 7, 1, 3);
      fill(ctx, '#c47f3a', 7, 7, 1, 3);
      fill(ctx, '#c47f3a', 10, 7, 1, 3);
      fill(ctx, '#f3c889', 4, 6, 8, 1);
    } else if (icon === 'fish') {
      fill(ctx, '#6fb3d9', 3, 7, 8, 3);
      fill(ctx, '#6fb3d9', 11, 6, 2, 5);
      fill(ctx, P.ink, 4, 7);
    } else if (icon === 'coin') {
      fill(ctx, '#f2c14e', 5, 4, 6, 8);
      fill(ctx, '#f2c14e', 4, 5, 8, 6);
      fill(ctx, '#c9932b', 7, 6, 2, 4);
    } else {
      fill(ctx, '#3f72ad', 4, 4, 8, 6);
      fill(ctx, '#ffffff', 6, 6, 4, 2);
    }
  });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

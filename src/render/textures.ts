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

export const grassTop = (): THREE.CanvasTexture =>
  pixelTexture(16, (ctx, rng, s) => {
    fill(ctx, P.grass, 0, 0, s, s);
    speckle(ctx, rng, s, [P.grassDark, P.grassLight], 0.14);
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(rng() * s);
      const y = Math.floor(rng() * (s - 1));
      fill(ctx, P.grassLight, x, y);
      fill(ctx, P.grassDark, x, y + 1);
    }
  }, 11);

export const pathTop = (): THREE.CanvasTexture =>
  pixelTexture(16, (ctx, rng, s) => {
    fill(ctx, P.path, 0, 0, s, s);
    speckle(ctx, rng, s, [P.pathDark, P.sand], 0.18);
  }, 12);

export const sandTex = (): THREE.CanvasTexture =>
  pixelTexture(16, (ctx, rng, s) => {
    fill(ctx, P.sand, 0, 0, s, s);
    speckle(ctx, rng, s, [P.sandDark, '#f7ead0'], 0.12);
  }, 13);

/** Side of a grass column: grass lip on top, earth below. */
export const dirtSide = (): THREE.CanvasTexture =>
  pixelTexture(16, (ctx, rng, s) => {
    fill(ctx, P.dirt, 0, 0, s, s);
    speckle(ctx, rng, s, [P.dirtDark, '#a27455'], 0.2);
    fill(ctx, P.grass, 0, 0, s, 3);
    for (let x = 0; x < s; x++) if (rng() < 0.5) fill(ctx, P.grassDark, x, 3);
  }, 14);

export const cliffSide = (): THREE.CanvasTexture =>
  pixelTexture(16, (ctx, rng, s) => {
    fill(ctx, P.cliff, 0, 0, s, s);
    for (let y = 0; y < s; y += 4) {
      const off = (y / 4) % 2 === 0 ? 0 : 4;
      fill(ctx, P.cliffDark, 0, y + 3, s, 1);
      for (let x = off; x < s; x += 8) fill(ctx, P.cliffDark, x, y, 1, 3);
    }
    speckle(ctx, rng, s, ['#b5a897'], 0.08);
    fill(ctx, P.grass, 0, 0, s, 2);
    for (let x = 0; x < s; x++) if (rng() < 0.5) fill(ctx, P.grassDark, x, 2);
  }, 15);

export const planks = (): THREE.CanvasTexture =>
  pixelTexture(16, (ctx, rng, s) => {
    fill(ctx, P.plank, 0, 0, s, s);
    for (let y = 0; y < s; y += 4) {
      fill(ctx, P.plankDark, 0, y + 3, s, 1);
      fill(ctx, P.plankDark, Math.floor(rng() * s), y, 1, 3);
    }
    speckle(ctx, rng, s, ['#c99a6a'], 0.06);
  }, 16);

export const plaster = (tint: string): THREE.CanvasTexture =>
  pixelTexture(16, (ctx, rng, s) => {
    fill(ctx, tint, 0, 0, s, s);
    speckle(ctx, rng, s, ['#00000010', '#ffffff30'], 0.2);
    fill(ctx, '#00000018', 0, s - 2, s, 2);
  }, 17);

export const stoneWall = (): THREE.CanvasTexture =>
  pixelTexture(16, (ctx, rng, s) => {
    fill(ctx, P.stone, 0, 0, s, s);
    for (let y = 0; y < s; y += 4) {
      const off = (y / 4) % 2 === 0 ? 0 : 3;
      fill(ctx, P.stoneDark, 0, y + 3, s, 1);
      for (let x = off; x < s; x += 6) fill(ctx, P.stoneDark, x, y, 1, 3);
    }
    speckle(ctx, rng, s, ['#ddd4c5'], 0.08);
  }, 18);

export const roofTiles = (base: string): THREE.CanvasTexture =>
  pixelTexture(16, (ctx, rng, s) => {
    fill(ctx, base, 0, 0, s, s);
    const dark = new THREE.Color(base).multiplyScalar(0.72).getStyle();
    const light = new THREE.Color(base).lerp(new THREE.Color('#ffffff'), 0.18).getStyle();
    for (let y = 0; y < s; y += 4) {
      fill(ctx, dark, 0, y + 3, s, 1);
      const off = (y / 4) % 2 === 0 ? 0 : 2;
      for (let x = off; x < s; x += 4) fill(ctx, dark, x, y, 1, 3);
      fill(ctx, light, 0, y, s, 1);
    }
    speckle(ctx, rng, s, [dark], 0.03);
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

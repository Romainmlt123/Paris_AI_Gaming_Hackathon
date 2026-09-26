import * as THREE from 'three';
import { PAL } from './palette';

/** RNG déterministe (mulberry32) : les textures sont identiques à chaque chargement. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Painter = (ctx: CanvasRenderingContext2D, size: number, rnd: () => number) => void;

function pixelTexture(size: number, seed: number, paint: Painter, repeat = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  paint(ctx, size, seeded(seed));
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function speckle(ctx: CanvasRenderingContext2D, size: number, rnd: () => number, colors: string[], count: number): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)] ?? colors[0]!;
    ctx.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), 1, 1);
  }
}

const cache = new Map<string, THREE.CanvasTexture>();
function cached(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

export const grassTexture = (): THREE.CanvasTexture =>
  cached('grass', () =>
    pixelTexture(32, 1, (ctx, s, rnd) => {
      ctx.fillStyle = PAL.grass;
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, rnd, [PAL.grassLight, PAL.grassDark], 140);
      // petites touffes en « v »
      for (let i = 0; i < 10; i++) {
        const x = Math.floor(rnd() * s);
        const y = Math.floor(rnd() * s);
        ctx.fillStyle = PAL.grassDeep;
        ctx.fillRect(x, y, 1, 1);
        ctx.fillRect((x + 2) % s, y, 1, 1);
        ctx.fillStyle = PAL.grassLight;
        ctx.fillRect((x + 1) % s, (y + s - 1) % s, 1, 1);
      }
    }),
  );

export const sandTexture = (): THREE.CanvasTexture =>
  cached('sand', () =>
    pixelTexture(32, 2, (ctx, s, rnd) => {
      ctx.fillStyle = PAL.sand;
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, rnd, [PAL.sandDark, PAL.sandLight], 120);
    }),
  );

export const cliffTexture = (): THREE.CanvasTexture =>
  cached('cliff', () =>
    pixelTexture(32, 3, (ctx, s, rnd) => {
      ctx.fillStyle = PAL.cliff;
      ctx.fillRect(0, 0, s, s);
      // strates horizontales
      for (let y = 0; y < s; y += 6) {
        ctx.fillStyle = PAL.cliffDark;
        ctx.fillRect(0, y, s, 1);
        ctx.fillStyle = PAL.cliffLight;
        ctx.fillRect(0, y + 1, s, 1);
      }
      speckle(ctx, s, rnd, [PAL.cliffDark, PAL.cliffLight], 60);
      // liseré d'herbe en haut
      ctx.fillStyle = PAL.grassDark;
      ctx.fillRect(0, 0, s, 2);
    }),
  );

export const plankTexture = (base: string = PAL.wood, dark: string = PAL.woodDark, light: string = PAL.woodLight): THREE.CanvasTexture =>
  cached(`plank${base}`, () =>
    pixelTexture(16, 4, (ctx, s, rnd) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 4) {
        ctx.fillStyle = dark;
        ctx.fillRect(0, y, s, 1);
        ctx.fillStyle = light;
        ctx.fillRect(0, y + 1, s, 1);
        const cut = Math.floor(rnd() * s);
        ctx.fillStyle = dark;
        ctx.fillRect(cut, y, 1, 4);
      }
      speckle(ctx, s, rnd, [dark], 8);
    }),
  );

export const plasterTexture = (): THREE.CanvasTexture =>
  cached('plaster', () =>
    pixelTexture(16, 5, (ctx, s, rnd) => {
      ctx.fillStyle = PAL.plaster;
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, rnd, [PAL.plasterDark], 18);
      ctx.fillStyle = PAL.plasterDark;
      ctx.fillRect(0, s - 1, s, 1);
    }),
  );

export const roofTexture = (base: string, dark: string): THREE.CanvasTexture =>
  cached(`roof${base}`, () =>
    pixelTexture(16, 6, (ctx, s) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, s, s);
      // tuiles en écailles
      ctx.fillStyle = dark;
      for (let y = 0; y < s; y += 4) {
        ctx.fillRect(0, y + 3, s, 1);
        for (let x = (y / 4) % 2 === 0 ? 0 : 2; x < s; x += 4) ctx.fillRect(x, y, 1, 3);
      }
    }),
  );

export const stoneTexture = (): THREE.CanvasTexture =>
  cached('stone', () =>
    pixelTexture(16, 7, (ctx, s, rnd) => {
      ctx.fillStyle = PAL.stone;
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = PAL.stoneDark;
      for (let y = 0; y < s; y += 5) {
        ctx.fillRect(0, y, s, 1);
        const off = (y / 5) % 2 === 0 ? 0 : 4;
        for (let x = off; x < s; x += 8) ctx.fillRect(x, y, 1, 5);
      }
      speckle(ctx, s, rnd, ['#bdb8ae'], 14);
    }),
  );

/** Auvent rayé (échoppe de Gaston). */
export const stripeTexture = (a: string, b: string): THREE.CanvasTexture =>
  cached(`stripe${a}${b}`, () =>
    pixelTexture(16, 8, (ctx, s) => {
      for (let x = 0; x < s; x += 4) {
        ctx.fillStyle = (x / 4) % 2 === 0 ? a : b;
        ctx.fillRect(x, 0, 4, s);
      }
    }),
  );

/** Enseigne pixel art avec un pictogramme simple. */
export function signTexture(key: string, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  return cached(`sign${key}`, () =>
    pixelTexture(
      16,
      9,
      (ctx) => {
        ctx.fillStyle = PAL.woodDark;
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = PAL.woodLight;
        ctx.fillRect(1, 1, 14, 14);
        draw(ctx);
      },
      false,
    ),
  );
}

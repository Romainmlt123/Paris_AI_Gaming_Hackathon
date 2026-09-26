import * as THREE from 'three';
import { P } from './textures';

export type Facing = 'down' | 'up';
export type HairStyle = 'short' | 'bun' | 'cap' | 'beanie';

export interface SpriteSpec {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  hat?: string;
  shirt: string;
  pants: string;
  shoes: string;
  apron?: string;
  scarf?: string;
  mustache?: boolean;
  beard?: boolean;
  /** Castaway: no clothes, bare bottom from behind (the actor adds the censor mosaic). */
  naked?: boolean;
}

export const FRAME_W = 32;
export const FRAME_H = 48;
export const FRAMES = 3;

type Px = (x: number, y: number, c: string, w?: number, h?: number) => void;

function tone(c: string, k: number): string {
  const col = new THREE.Color(c);
  return (k < 0 ? col.lerp(new THREE.Color('#2a1e3a'), -k) : col.lerp(new THREE.Color('#fff4dc'), k)).getStyle();
}

function drawFace(px: Px, s: SpriteSpec, y0: number): void {
  const eye = (x: number): void => {
    px(x, y0 + 8, P.ink, 2, 3);
    px(x, y0 + 8, '#ffffff');
  };
  eye(11);
  eye(19);
  px(10, y0 + 6, tone(s.hair, -0.25), 4, 1);
  px(18, y0 + 6, tone(s.hair, -0.25), 4, 1);
  px(9, y0 + 12, '#f29b9b', 2, 1);
  px(21, y0 + 12, '#f29b9b', 2, 1);
  px(15, y0 + 11, tone(s.skin, -0.18), 2, 1);
  px(14, y0 + 13, '#9c4b43', 4, 1);
  if (s.mustache) {
    px(11, y0 + 12, s.hair, 10, 2);
    px(10, y0 + 13, s.hair, 1, 1);
    px(21, y0 + 13, s.hair, 1, 1);
    px(12, y0 + 12, tone(s.hair, 0.3), 3, 1);
  }
  if (s.beard) {
    px(8, y0 + 10, s.hair, 2, 6);
    px(22, y0 + 10, s.hair, 2, 6);
    px(9, y0 + 14, s.hair, 14, 3);
    px(11, y0 + 17, s.hair, 10, 1);
    px(12, y0 + 12, s.hair, 8, 1);
    px(14, y0 + 14, '#9c4b43', 4, 1);
    px(10, y0 + 15, tone(s.hair, 0.3), 4, 1);
  }
}

function drawHair(px: Px, s: SpriteSpec, facing: Facing, y0: number): void {
  const hl = tone(s.hair, 0.3);
  const dk = tone(s.hair, -0.3);
  if (facing === 'up') {
    px(8, y0, s.hair, 16, 15);
    px(7, y0 + 2, s.hair, 18, 10);
    px(10, y0 + 1, hl, 8, 1);
    px(8, y0 + 13, dk, 16, 2);
  } else if (s.hairStyle === 'short' || s.hairStyle === 'bun') {
    px(8, y0 - 1, s.hair, 16, 5);
    px(7, y0 + 1, s.hair, 2, 9);
    px(23, y0 + 1, s.hair, 2, 9);
    px(9, y0 + 4, s.hair, 7, 2);
    px(17, y0 + 4, s.hair, 5, 1);
    px(11, y0, hl, 7, 1);
    px(9, y0 + 5, dk, 3, 1);
  }
  if (s.hairStyle === 'bun') {
    px(12, y0 - 5, s.hair, 8, 5);
    px(13, y0 - 6, s.hair, 6, 1);
    px(14, y0 - 5, hl, 3, 1);
    px(12, y0 - 1, dk, 8, 1);
  }
  if (s.hairStyle === 'cap' || s.hairStyle === 'beanie') {
    const hat = s.hat ?? s.hair;
    if (facing === 'down') {
      px(7, y0 + 4, s.hair, 2, 5);
      px(23, y0 + 4, s.hair, 2, 5);
    }
    px(8, y0 - 2, hat, 16, 6);
    px(7, y0, hat, 18, 4);
    px(10, y0 - 1, tone(hat, 0.3), 9, 1);
    px(7, y0 + 3, tone(hat, -0.3), 18, 1);
    if (s.hairStyle === 'cap' && facing === 'down') px(6, y0 + 4, tone(hat, -0.15), 20, 2);
    if (s.hairStyle === 'beanie') {
      px(14, y0 - 5, '#ffffff', 4, 3);
      px(14, y0 - 3, '#d9d4cc', 4, 1);
      for (let x = 8; x < 24; x += 2) px(x, y0 + 1, tone(hat, -0.15), 1, 2);
    }
  }
}

function drawHead(px: Px, s: SpriteSpec, facing: Facing, bob: number): void {
  const y0 = 5 + bob;
  px(9, y0, s.skin, 14, 16);
  px(8, y0 + 2, s.skin, 16, 12);
  px(6, y0 + 7, s.skin, 2, 4);
  px(24, y0 + 7, s.skin, 2, 4);
  px(22, y0 + 3, tone(s.skin, -0.12), 2, 11);
  px(10, y0 + 15, tone(s.skin, -0.15), 12, 1);
  px(10, y0 + 1, tone(s.skin, 0.2), 5, 1);
  if (facing === 'down') drawFace(px, s, y0);
  drawHair(px, s, facing, y0);
  if (s.naked) {
    px(10, y0 - 3, '#4f9a4a', 2, 3);
    px(12, y0 - 2, '#6fbf5a', 3, 2);
    px(15, y0 - 1, '#4f9a4a', 2, 1);
    px(20, y0 - 2, '#3f7f3c', 2, 3);
  }
}

function drawNakedBody(px: Px, s: SpriteSpec, frame: number, facing: Facing): void {
  const r = (x: number, y: number, w: number, h: number, c: string): void => px(x, y, c, w, h);
  const b = frame === 0 ? 0 : 1;
  const swing = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  const lift = (i: number): number => (frame === i ? 1 : 0);
  const skinD = tone(s.skin, -0.15);
  const skinDD = tone(s.skin, -0.3);
  const skinL = tone(s.skin, 0.2);
  const pale = tone(s.skin, 0.62);
  r(10, 21 + b, 12, 12, s.skin);
  r(9, 22 + b, 14, 9, s.skin);
  r(19, 22 + b, 4, 10, skinD);
  r(10, 22 + b, 2, 8, skinL);
  r(13, 21 + b, 6, 1, skinD);
  r(6, 23 + b + swing, 3, 12, s.skin);
  r(6, 23 + b + swing, 1, 11, skinL);
  r(23, 23 + b - swing, 3, 12, skinD);
  r(11, 32 + b, 10, 5, s.skin);
  r(11, 37 + b, 4, 6 - lift(1), s.skin);
  r(17, 37 + b, 4, 6 - lift(2), s.skin);
  r(14, 37 + b, 1, 6 - lift(1), skinD);
  r(20, 37 + b, 1, 6 - lift(2), skinD);
  r(10, 43 + b - lift(1), 5, 3, s.skin);
  r(17, 43 + b - lift(2), 5, 3, s.skin);
  r(10, 45 + b - lift(1), 5, 1, skinD);
  r(17, 45 + b - lift(2), 5, 1, skinD);
  if (facing === 'down') {
    r(12, 25 + b, 2, 1, '#d98a80');
    r(18, 25 + b, 2, 1, '#d98a80');
    r(11, 27 + b, 3, 1, skinD);
    r(18, 27 + b, 3, 1, skinD);
    r(16, 30 + b, 1, 1, skinDD);
    r(11, 43 + b - lift(1), 1, 1, skinDD);
    r(13, 43 + b - lift(1), 1, 1, skinDD);
    r(18, 43 + b - lift(2), 1, 1, skinDD);
    r(20, 43 + b - lift(2), 1, 1, skinDD);
  } else {
    r(16, 23 + b, 1, 8, skinD);
    r(11, 24 + b, 3, 1, skinD);
    r(19, 24 + b, 3, 1, skinD);
    r(10, 32 + b, 12, 6, pale);
    r(10, 32 + b, 12, 1, skinD);
    r(10, 33 + b, 1, 4, skinD);
    r(21, 33 + b, 1, 4, skinD);
    r(15, 33 + b, 2, 5, '#b86f5e');
    r(12, 33 + b, 1, 1, '#ffffff');
    r(18, 33 + b, 1, 1, '#ffffff');
    r(12, 35 + b, 2, 2, '#f7a8a8');
    r(18, 35 + b, 2, 2, '#f7a8a8');
    r(11, 37 + b, 4, 1, '#c98a72');
    r(17, 37 + b, 4, 1, '#c98a72');
  }
}

function drawBody(px: Px, s: SpriteSpec, frame: number, facing: Facing): void {
  const r = (x: number, y: number, w: number, h: number, c: string): void => px(x, y, c, w, h);
  const b = frame === 0 ? 0 : 1;
  const swing = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  const shirtD = tone(s.shirt, -0.25);
  const shirtL = tone(s.shirt, 0.25);
  r(10, 21 + b, 12, 12, s.shirt);
  r(9, 22 + b, 14, 9, s.shirt);
  r(19, 22 + b, 4, 10, shirtD);
  r(10, 22 + b, 2, 8, shirtL);
  r(13, 21 + b, 6, 1, shirtD);
  // arms
  r(6, 23 + b + swing, 3, 9, s.shirt);
  r(6, 23 + b + swing, 1, 9, shirtL);
  r(23, 23 + b - swing, 3, 9, shirtD);
  r(6, 32 + b + swing, 3, 3, s.skin);
  r(23, 32 + b - swing, 3, 3, tone(s.skin, -0.15));
  if (s.scarf) {
    r(10, 20 + b, 12, 3, s.scarf);
    r(11, 20 + b, 5, 1, tone(s.scarf, 0.3));
    if (facing === 'down') r(18, 23 + b, 3, 5, tone(s.scarf, -0.15));
  }
  if (s.apron && facing === 'down') {
    r(12, 25 + b, 8, 11, s.apron);
    r(13, 22 + b, 1, 3, s.apron);
    r(18, 22 + b, 1, 3, s.apron);
    r(18, 25 + b, 2, 11, tone(s.apron, -0.12));
    r(14, 29 + b, 4, 2, tone(s.apron, -0.08));
  }
  const pantsD = tone(s.pants, -0.3);
  r(10, 32 + b, 12, 1, pantsD);
  r(11, 33 + b, 10, 4, s.pants);
  const lift = (i: number): number => (frame === i ? 1 : 0);
  r(11, 37 + b, 4, 6 - lift(1), s.pants);
  r(17, 37 + b, 4, 6 - lift(2), s.pants);
  r(14, 37 + b, 1, 6 - lift(1), pantsD);
  r(20, 37 + b, 1, 6 - lift(2), pantsD);
  r(10, 43 + b - lift(1), 5, 3, s.shoes);
  r(17, 43 + b - lift(2), 5, 3, s.shoes);
  r(11, 43 + b - lift(1), 2, 1, tone(s.shoes, 0.3));
  r(18, 43 + b - lift(2), 2, 1, tone(s.shoes, 0.3));
}

function outline(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const img = ctx.getImageData(ox, oy, FRAME_W, FRAME_H);
  const d = img.data;
  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < FRAME_W && y < FRAME_H && (d[(y * FRAME_W + x) * 4 + 3] ?? 0) > 200;
  const edge: [number, number][] = [];
  for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) {
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push([x, y]);
  }
  ctx.fillStyle = P.ink;
  for (const [x, y] of edge) ctx.fillRect(ox + x, oy + y, 1, 1);
}

/** Sprite sheet: FRAMES columns (idle, step A, step B) × 2 rows (down, up). */
export function drawSheet(spec: SpriteSpec): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W * FRAMES;
  canvas.height = FRAME_H * 2;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  (['down', 'up'] as const).forEach((facing, row) => {
    for (let frame = 0; frame < FRAMES; frame++) {
      const ox = frame * FRAME_W;
      const oy = row * FRAME_H;
      const px: Px = (x, y, c, w = 1, h = 1) => {
        const x0 = Math.max(0, x);
        const y0 = Math.max(0, y);
        const x1 = Math.min(FRAME_W, x + w);
        const y1 = Math.min(FRAME_H, y + h);
        if (x1 <= x0 || y1 <= y0) return;
        ctx.fillStyle = c;
        ctx.fillRect(ox + x0, oy + y0, x1 - x0, y1 - y0);
      };
      if (spec.naked) drawNakedBody(px, spec, frame, facing);
      else drawBody(px, spec, frame, facing);
      drawHead(px, spec, facing, frame === 0 ? 0 : 1);
      outline(ctx, ox, oy);
    }
  });
  return canvas;
}

export function sheetTexture(sheet: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(sheet);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1 / FRAMES, 1 / 2);
  return tex;
}

export function setFrame(tex: THREE.Texture, frame: number, facing: Facing): void {
  tex.offset.set(frame / FRAMES, facing === 'down' ? 0.5 : 0);
}

/** Upscaled head crop for the UI. */
export function portraitDataUrl(sheet: HTMLCanvasElement, scale = 3): string {
  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, 4, 0, size, size, 0, 0, size * scale, size * scale);
  return canvas.toDataURL();
}

export const SPRITES: Record<'player' | 'castaway' | 'gaston' | 'josette' | 'marius', SpriteSpec> = {
  player: { skin: '#f3c9a5', hair: '#5a3b2a', hairStyle: 'short', shirt: '#3fa7a0', pants: '#34466b', shoes: '#4a3328', scarf: '#e0564a' },
  castaway: { skin: '#f3c9a5', hair: '#5a3b2a', hairStyle: 'short', shirt: '#f3c9a5', pants: '#f3c9a5', shoes: '#f3c9a5', naked: true },
  gaston: { skin: '#e9b48f', hair: '#3b2a24', hairStyle: 'cap', hat: '#7b4fa0', shirt: '#e3b13f', pants: '#5b4636', shoes: '#2f2320', mustache: true },
  josette: { skin: '#f6d0b5', hair: '#c46b3d', hairStyle: 'bun', shirt: '#e98aa6', pants: '#7a4b6b', shoes: '#5a3a3a', apron: '#fffaf0' },
  marius: { skin: '#dba27c', hair: '#b7b3ad', hairStyle: 'beanie', hat: '#2f5f8f', shirt: '#e5d9b6', pants: '#3e5a6e', shoes: '#3a2e26', beard: true },
};

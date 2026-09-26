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
}

export const FRAME_W = 16;
export const FRAME_H = 24;
export const FRAMES = 3;

type Px = (x: number, y: number, c: string, w?: number, h?: number) => void;

function drawHead(px: Px, s: SpriteSpec, facing: Facing, bob: number): void {
  const y0 = 3 + bob;
  px(4, y0, s.skin, 8, 8);
  px(3, y0 + 3, s.skin, 1, 3);
  px(12, y0 + 3, s.skin, 1, 3);
  if (facing === 'down') {
    px(6, y0 + 4, P.ink, 1, 2);
    px(9, y0 + 4, P.ink, 1, 2);
    px(5, y0 + 6, '#f2a0a0');
    px(10, y0 + 6, '#f2a0a0');
    px(7, y0 + 7, '#b5645a', 2, 1);
    if (s.mustache) px(5, y0 + 6, s.hair, 6, 1);
    if (s.beard) {
      px(4, y0 + 6, s.hair, 1, 2);
      px(11, y0 + 6, s.hair, 1, 2);
      px(4, y0 + 8, s.hair, 8, 1);
      px(5, y0 + 9, s.hair, 6, 1);
      px(7, y0 + 7, '#b5645a', 2, 1);
    }
  } else {
    px(4, y0, s.hair, 8, 7);
  }
  if (s.hairStyle === 'short' || s.hairStyle === 'bun') {
    px(4, y0 - 1, s.hair, 8, 3);
    px(3, y0, s.hair, 1, 4);
    px(12, y0, s.hair, 1, 4);
    if (s.hairStyle === 'bun') px(6, y0 - 3, s.hair, 4, 2);
  } else {
    const hat = s.hat ?? s.hair;
    px(4, y0 - 2, hat, 8, 3);
    px(3, y0 - 1, hat, 10, 2);
    if (s.hairStyle === 'cap' && facing === 'down') px(3, y0 + 1, hat, 11, 1);
    if (s.hairStyle === 'beanie') px(7, y0 - 3, '#ffffff', 2, 1);
  }
}

function drawBody(px: Px, s: SpriteSpec, frame: number, facing: Facing): void {
  const bob = frame === 0 ? 0 : 1;
  const swing = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  px(4, 12 + bob, s.shirt, 8, 7);
  px(3, 13 + bob + swing, s.shirt, 1, 4);
  px(12, 13 + bob - swing, s.shirt, 1, 4);
  px(3, 17 + bob + swing, s.skin);
  px(12, 17 + bob - swing, s.skin);
  if (s.scarf) px(4, 12 + bob, s.scarf, 8, 1);
  if (s.apron && facing === 'down') {
    px(5, 14 + bob, s.apron, 6, 6);
    px(6, 13 + bob, s.apron, 4, 1);
  }
  const leftLift = frame === 1 ? 1 : 0;
  const rightLift = frame === 2 ? 1 : 0;
  px(5, 19 + bob, s.pants, 2, 3 - leftLift);
  px(9, 19 + bob, s.pants, 2, 3 - rightLift);
  px(5, 22 + bob - leftLift, s.shoes, 2, 1);
  px(9, 22 + bob - rightLift, s.shoes, 2, 1);
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
        ctx.fillStyle = c;
        ctx.fillRect(ox + x, oy + y, w, h);
      };
      drawBody(px, spec, frame, facing);
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
export function portraitDataUrl(sheet: HTMLCanvasElement, scale = 4): string {
  const size = 14;
  const canvas = document.createElement('canvas');
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, 1, 0, size, size, 0, 0, size * scale, size * scale);
  return canvas.toDataURL();
}

export const SPRITES: Record<'player' | 'gaston' | 'josette' | 'marius', SpriteSpec> = {
  player: { skin: '#f3c9a5', hair: '#5a3b2a', hairStyle: 'short', shirt: '#3fa7a0', pants: '#34466b', shoes: '#4a3328', scarf: '#e0564a' },
  gaston: { skin: '#e9b48f', hair: '#3b2a24', hairStyle: 'cap', hat: '#7b4fa0', shirt: '#e3b13f', pants: '#5b4636', shoes: '#2f2320', mustache: true },
  josette: { skin: '#f6d0b5', hair: '#c46b3d', hairStyle: 'bun', shirt: '#e98aa6', pants: '#7a4b6b', shoes: '#5a3a3a', apron: '#fffaf0' },
  marius: { skin: '#dba27c', hair: '#b7b3ad', hairStyle: 'beanie', hat: '#2f5f8f', shirt: '#e5d9b6', pants: '#3e5a6e', shoes: '#3a2e26', beard: true },
};

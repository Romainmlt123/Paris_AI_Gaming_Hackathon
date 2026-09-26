import * as THREE from 'three';
import type { NpcId } from '../../shared/types';
import type { Mood } from '../../shared/violence';

type Draw = (ctx: CanvasRenderingContext2D) => void;
const INK = '#2b2233';

function pixelTexture(w: number, h: number, draw: Draw): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function pixelSprite(w: number, h: number, scale: number, draw: Draw): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pixelTexture(w, h, draw), depthTest: false, transparent: true }));
  s.scale.set((w / 16) * scale, (h / 16) * scale, 1);
  s.renderOrder = 11;
  s.visible = false;
  return s;
}

function rect(ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w = 1, h = 1): void {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string): void {
  for (let y = -r - 1; y <= r + 1; y++) {
    for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.hypot(x, y);
      if (d <= r) rect(ctx, fill, cx + x, cy + y);
      else if (d <= r + 1) rect(ctx, INK, cx + x, cy + y);
    }
  }
}

const MOOD_DRAW: Record<Exclude<Mood, null>, Draw> = {
  heart: (ctx) => {
    const rows = ['.xx.xx.', 'xhhxrrx', 'xhrrrrx', 'xrrrrrx', '.xrrrx.', '..xrx..', '...x...'];
    rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && rect(ctx, ch === 'x' ? INK : ch === 'h' ? '#ffb3c1' : '#e8435a', x + 1, y + 1)));
  },
  storm: (ctx) => {
    blob(ctx, 5, 5, 3, '#6b6f86');
    blob(ctx, 10, 4, 3, '#7c8098');
    blob(ctx, 8, 7, 3, '#5d6178');
    rect(ctx, '#ffd25e', 8, 10, 2, 2);
    rect(ctx, '#ffd25e', 7, 12, 2, 1);
    rect(ctx, '#ffd25e', 8, 13, 1, 2);
  },
  skull: (ctx) => {
    blob(ctx, 7, 6, 5, '#f4efe4');
    rect(ctx, INK, 4, 5, 2, 3);
    rect(ctx, INK, 8, 5, 2, 3);
    rect(ctx, INK, 6, 9, 2, 1);
    rect(ctx, '#f4efe4', 4, 11, 7, 2);
    rect(ctx, INK, 5, 12, 1, 1);
    rect(ctx, INK, 7, 12, 1, 1);
    rect(ctx, INK, 9, 12, 1, 1);
  },
};

export function moodSprite(mood: Exclude<Mood, null>): THREE.Sprite {
  return pixelSprite(16, 16, 0.42, MOOD_DRAW[mood]);
}

const WEAPON_DRAW: Record<NpcId, Draw> = {
  josette: (ctx) => {
    rect(ctx, INK, 0, 3, 28, 6);
    rect(ctx, '#8a5a36', 1, 4, 4, 4);
    rect(ctx, '#8a5a36', 23, 4, 4, 4);
    rect(ctx, INK, 5, 1, 18, 10);
    rect(ctx, '#e6b77e', 6, 2, 16, 8);
    rect(ctx, '#f6d7a6', 6, 3, 16, 2);
  },
  marius: (ctx) => {
    rect(ctx, INK, 0, 5, 12, 2);
    rect(ctx, '#c9d6e3', 0, 5, 11, 1);
    blob(ctx, 17, 6, 4, '#5f8fb8');
    rect(ctx, '#9cc3e0', 14, 7, 7, 2);
    rect(ctx, INK, 15, 4, 1, 1);
    rect(ctx, INK, 22, 3, 4, 7);
    rect(ctx, '#4a7aa3', 23, 4, 2, 5);
  },
  gaston: (ctx) => {
    rect(ctx, INK, 1, 3, 20, 13);
    rect(ctx, '#c79a3a', 2, 4, 18, 11);
    rect(ctx, INK, 4, 0, 12, 5);
    rect(ctx, '#3b3548', 5, 1, 10, 3);
    rect(ctx, '#7dff9a', 6, 2, 6, 1);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) rect(ctx, '#f4efe4', 4 + i * 5, 7 + j * 4, 3, 2);
  },
};

export function weaponSprite(npc: NpcId): THREE.Sprite {
  return pixelSprite(28, 16, 0.9, WEAPON_DRAW[npc]);
}

/** Open palm for slaps, drawn in the slapper's skin tone. */
export function handSprite(skin: string): THREE.Sprite {
  return pixelSprite(16, 16, 0.55, (ctx) => {
    rect(ctx, INK, 3, 5, 10, 10);
    rect(ctx, skin, 4, 6, 8, 8);
    for (let i = 0; i < 4; i++) {
      rect(ctx, INK, 3 + i * 2 + (i > 1 ? 1 : 0), 0, 3, 7);
      rect(ctx, skin, 4 + i * 2 + (i > 1 ? 1 : 0), 1, 1, 6);
    }
    rect(ctx, INK, 11, 7, 5, 4);
    rect(ctx, skin, 12, 8, 3, 2);
    rect(ctx, 'rgba(255,255,255,0.45)', 5, 7, 5, 1);
    rect(ctx, 'rgba(0,0,0,0.12)', 4, 12, 8, 2);
  });
}

export function ghostSprite(): THREE.Sprite {
  return pixelSprite(14, 16, 1, (ctx) => {
    blob(ctx, 7, 6, 5, '#f4f7ff');
    rect(ctx, INK, 1, 6, 1, 8);
    rect(ctx, INK, 12, 6, 1, 8);
    rect(ctx, '#f4f7ff', 2, 6, 10, 8);
    for (let i = 0; i < 4; i++) rect(ctx, INK, 1 + i * 3, 14, 2, 1);
    rect(ctx, INK, 4, 5, 2, 2);
    rect(ctx, INK, 8, 5, 2, 2);
    rect(ctx, INK, 6, 9, 2, 2);
  });
}

/** Cartoon brawl: a dust cloud redrawn every tick with random fists, feet and stars poking out. */
export interface BrawlCloud {
  sprite: THREE.Sprite;
  tick(): void;
}

export function brawlCloud(skinA: string, skinB: string): BrawlCloud {
  const W = 48;
  const H = 40;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(2.9, 2.4, 1);
  sprite.renderOrder = 11;
  sprite.visible = false;
  const limb = (x: number, y: number, a: number, skin: string, foot: boolean): void => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    rect(ctx, INK, 0, -2, 12, 5);
    rect(ctx, foot ? '#3d4a7a' : skin, 1, -1, 7, 3);
    rect(ctx, foot ? '#5a3a2a' : skin, 8, -2, 4, 5);
    ctx.restore();
  };
  const star = (x: number, y: number): void => {
    rect(ctx, '#ffd25e', x - 1, y - 3, 2, 7);
    rect(ctx, '#ffd25e', x - 3, y - 1, 7, 2);
    rect(ctx, '#fff6c8', x, y, 1, 1);
  };
  return {
    sprite,
    tick() {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2;
        limb(W / 2 + Math.cos(a) * 12, H / 2 + Math.sin(a) * 9, a, i % 2 ? skinA : skinB, i >= 2);
      }
      const puffs = [[24, 20, 10], [14, 22, 7], [34, 22, 7], [20, 13, 7], [30, 14, 6], [24, 28, 7]];
      for (const [x = 0, y = 0, r = 0] of puffs) blob(ctx, x + Math.round(Math.random() * 2 - 1), y + Math.round(Math.random() * 2 - 1), r, Math.random() < 0.5 ? '#f3efe6' : '#dcd6ca');
      for (let i = 0; i < 3; i++) rect(ctx, '#b8b0a2', 12 + Math.floor(Math.random() * 24), 12 + Math.floor(Math.random() * 16), 3, 2);
      for (let i = 0; i < 2; i++) star(6 + Math.floor(Math.random() * 36), 4 + Math.floor(Math.random() * 32));
      tex.needsUpdate = true;
    },
  };
}

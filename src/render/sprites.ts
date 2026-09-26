/** Pixel art généré en code : personnages 16×22, animaux, marqueurs. Contour sombre ajouté automatiquement. */
export type SpriteId = 'player' | 'player_stung' | 'gaston' | 'josette' | 'marius' | 'dodo' | 'mouton' | 'bang' | 'butterfly';

type Px = (x: number, y: number, w: number, h: number, c: string) => void;

interface Spec {
  w: number;
  h: number;
  frames: number;
  draw: (px: Px, frame: number) => void;
}

const SKIN = '#f3c9a4';
const SKIN_D = '#d99f7c';

function humanoid(px: Px, f: number, o: { hair: string; shirt: string; pants: string; shoes?: string; wide?: boolean; dress?: string }): number {
  const bob = f === 1 ? 1 : 0;
  const walk = f >= 2;
  const shoes = o.shoes ?? '#4a3426';
  // jambes
  if (o.dress) {
    px(4, 15 + bob, 8, 5, o.dress);
    px(3, 18 + bob, 10, 2, o.dress);
    px(5, 20, 2, 2, shoes);
    px(9, 20, 2, 2, shoes);
  } else {
    const l = walk && f === 2 ? -1 : 0;
    const r = walk && f === 3 ? -1 : 0;
    px(5, 17 + bob, 2, 3 + l, o.pants);
    px(9, 17 + bob, 2, 3 + r, o.pants);
    px(4, 20 + l, 3, 2, shoes);
    px(9, 20 + r, 3, 2, shoes);
  }
  // corps
  const bx = o.wide ? 3 : 4;
  const bw = o.wide ? 10 : 8;
  px(bx, 11 + bob, bw, 6, o.shirt);
  // bras
  const sw = walk ? (f === 2 ? 1 : -1) : 0;
  px(bx - 1, 12 + bob + sw, 1, 4, o.shirt);
  px(bx + bw, 12 + bob - sw, 1, 4, o.shirt);
  px(bx - 1, 16 + bob + sw, 1, 1, SKIN);
  px(bx + bw, 16 + bob - sw, 1, 1, SKIN);
  // tête
  px(4, 3 + bob, 8, 8, SKIN);
  px(4, 10 + bob, 8, 1, SKIN_D);
  px(6, 7 + bob, 1, 2, '#2b1d16');
  px(9, 7 + bob, 1, 2, '#2b1d16');
  px(5, 9 + bob, 1, 1, '#f09a8a');
  px(10, 9 + bob, 1, 1, '#f09a8a');
  // cheveux
  px(4, 2 + bob, 8, 2, o.hair);
  px(3, 3 + bob, 1, 5, o.hair);
  px(12, 3 + bob, 1, 5, o.hair);
  px(4, 4 + bob, 3, 1, o.hair);
  return bob;
}

const SPECS: Record<SpriteId, Spec> = {
  player: {
    w: 16, h: 22, frames: 4,
    draw: (px, f) => {
      const b = humanoid(px, f, { hair: '#6b3f24', shirt: '#3aa3a0', pants: '#2f3f6b' });
      px(7, 11 + b, 2, 1, '#f7e6c4');
    },
  },
  player_stung: {
    w: 16, h: 22, frames: 4,
    draw: (px, f) => {
      const b = humanoid(px, f, { hair: '#6b3f24', shirt: '#3aa3a0', pants: '#2f3f6b' });
      px(3, 5 + b, 10, 6, '#f4a28c');
      px(6, 7 + b, 1, 1, '#2b1d16');
      px(9, 7 + b, 1, 1, '#2b1d16');
      px(4, 6 + b, 2, 2, '#e0564b');
      px(10, 8 + b, 2, 2, '#e0564b');
      px(7, 9 + b, 2, 1, '#e0564b');
      px(11, 5 + b, 1, 1, '#e0564b');
    },
  },
  gaston: {
    w: 16, h: 22, frames: 4,
    draw: (px, f) => {
      const b = humanoid(px, f, { hair: '#3b2a20', shirt: '#2f7a4f', pants: '#3a2c3e', wide: true });
      px(5, -1 + b + 1, 6, 3, '#222022');
      px(3, 2 + b, 10, 1, '#222022');
      px(5, 2 + b, 6, 1, '#b8323a');
      px(4, 9 + b, 8, 1, '#5a3a22');
      px(3, 9 + b, 1, 1, '#5a3a22');
      px(12, 9 + b, 1, 1, '#5a3a22');
      px(7, 12 + b, 2, 5, '#e9dcc0');
      px(7, 13 + b, 1, 1, '#e6b93b');
      px(7, 15 + b, 1, 1, '#e6b93b');
    },
  },
  josette: {
    w: 16, h: 22, frames: 4,
    draw: (px, f) => {
      const b = humanoid(px, f, { hair: '#b0522d', shirt: '#e98fa8', pants: '#e98fa8', dress: '#e98fa8', shoes: '#7a3b3b' });
      px(4, -1 + b + 1, 8, 3, '#fbf7ef');
      px(3, 0 + b, 10, 2, '#fbf7ef');
      px(4, 3 + b, 8, 1, '#e5ddd0');
      px(2, 6 + b, 2, 2, '#b0522d');
      px(12, 6 + b, 2, 2, '#b0522d');
      px(5, 12 + b, 6, 7, '#fbf7ef');
      px(6, 14 + b, 4, 1, '#f3c6d3');
    },
  },
  marius: {
    w: 16, h: 22, frames: 4,
    draw: (px, f) => {
      const b = humanoid(px, f, { hair: '#c9c6bf', shirt: '#335c8f', pants: '#5b4a3a' });
      px(4, 0 + b, 8, 3, '#f0c233');
      px(2, 3 + b, 12, 1, '#f0c233');
      px(4, 9 + b, 8, 3, '#dcd8cf');
      px(5, 12 + b, 6, 1, '#dcd8cf');
      px(6, 9 + b, 4, 1, '#b98a74');
      px(4, 13 + b, 8, 1, '#274770');
    },
  },
  dodo: {
    w: 14, h: 12, frames: 2,
    draw: (px, f) => {
      const b = f;
      px(3, 4 + b, 8, 6, '#8e95a8');
      px(2, 6 + b, 2, 3, '#7a8194');
      px(9, 1 + b, 4, 4, '#a3aabc');
      px(13, 3 + b, 1, 2, '#e8b64c');
      px(12, 2 + b, 1, 1, '#1f1f24');
      px(4, 10, 1, 2, '#e8b64c');
      px(8, 10, 1, 2, '#e8b64c');
      px(1, 5 + b, 2, 1, '#6bd0c8');
    },
  },
  mouton: {
    w: 14, h: 12, frames: 2,
    draw: (px, f) => {
      const b = f;
      px(2, 3 + b, 10, 6, '#fbfaf3');
      px(1, 4 + b, 12, 4, '#fbfaf3');
      px(3, 2 + b, 7, 1, '#f1efe3');
      px(10, 3 + b, 3, 4, '#3a3036');
      px(11, 4 + b, 1, 1, '#ffffff');
      px(3, 9, 1, 3, '#3a3036');
      px(9, 9, 1, 3, '#3a3036');
      px(4, 5 + b, 3, 1, '#f3d985');
    },
  },
  bang: {
    w: 7, h: 12, frames: 1,
    draw: (px) => {
      px(1, 0, 5, 12, '#ffffff');
      px(2, 1, 3, 7, '#e8413c');
      px(2, 9, 3, 2, '#e8413c');
    },
  },
  butterfly: {
    w: 7, h: 5, frames: 2,
    draw: (px, f) => {
      px(3, 1, 1, 4, '#2b2440');
      if (f === 0) {
        px(0, 0, 3, 3, '#5bb8f0');
        px(4, 0, 3, 3, '#5bb8f0');
        px(1, 3, 2, 2, '#9ad8ff');
        px(4, 3, 2, 2, '#9ad8ff');
      } else {
        px(1, 1, 2, 2, '#5bb8f0');
        px(4, 1, 2, 2, '#5bb8f0');
      }
    },
  },
};

const cache = new Map<SpriteId, HTMLCanvasElement>();

/** Planche horizontale de toutes les frames, avec contour. */
export function sheet(id: SpriteId): { canvas: HTMLCanvasElement; w: number; h: number; frames: number } {
  const spec = SPECS[id];
  let canvas = cache.get(id);
  if (!canvas) {
    const pad = 1;
    const fw = spec.w + pad * 2;
    const fh = spec.h + pad * 2;
    canvas = document.createElement('canvas');
    canvas.width = fw * spec.frames;
    canvas.height = fh;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d indisponible');
    for (let f = 0; f < spec.frames; f++) {
      const ox = f * fw + pad;
      const px: Px = (x, y, w, h, c) => {
        ctx.fillStyle = c;
        ctx.fillRect(ox + x, pad + y, w, h);
      };
      spec.draw(px, f);
    }
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    const W = canvas.width;
    const out = new Uint8ClampedArray(d);
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4;
        if ((d[k + 3] ?? 0) > 0) continue;
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const xx = x + (dx ?? 0);
          const yy = y + (dy ?? 0);
          if (xx < 0 || yy < 0 || xx >= W || yy >= canvas!.height) return false;
          if (Math.floor(xx / fw) !== Math.floor(x / fw)) return false;
          return (d[(yy * W + xx) * 4 + 3] ?? 0) > 0;
        });
        if (n) {
          out[k] = 43;
          out[k + 1] = 29;
          out[k + 2] = 36;
          out[k + 3] = 255;
        }
      }
    ctx.putImageData(new ImageData(out, W, canvas.height), 0, 0);
    cache.set(id, canvas);
  }
  return { canvas, w: spec.w + 2, h: spec.h + 2, frames: spec.frames };
}

/** Portrait (première frame) pour l'UI. */
export function portraitUrl(id: SpriteId): string {
  const s = sheet(id);
  const c = document.createElement('canvas');
  c.width = s.w;
  c.height = s.h;
  c.getContext('2d')?.drawImage(s.canvas, 0, 0, s.w, s.h, 0, 0, s.w, s.h);
  return c.toDataURL();
}

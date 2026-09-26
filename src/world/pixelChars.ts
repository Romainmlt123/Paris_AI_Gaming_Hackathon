// Personnages pixel art façon « DS remastérisé » : 24×32 px, 3 vues (face, dos, profil) × 3 frames,
// ombrage 3 tons, contour automatique. 100 % générés en code, designs originaux.

export const CW = 24;
export const CH = 32;
export type View = 'down' | 'up' | 'side';
export const VIEWS: readonly View[] = ['down', 'up', 'side'];
export const FRAMES_PER_VIEW = 3;

export interface Look {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'bun' | 'none';
  hat?: { type: 'bowler' | 'beanie' | 'bucket'; color: string; band?: string };
  top: string;
  topStyle: 'shirt' | 'vest' | 'coat' | 'dress' | 'hoodie';
  inner?: string; // chemise sous le gilet
  apron?: string;
  pants: string;
  shoes: string;
  beard?: string;
  mustache?: string;
  belly?: boolean;
  outline: string;
}

export const LOOKS = {
  // Joueur : bob moutarde, sweat corail, short marine, baskets blanches.
  player: {
    skin: '#f4c9a3', hair: '#6b4128', hairStyle: 'short', hat: { type: 'bucket', color: '#e8b33a', band: '#c98e1e' },
    top: '#ee6f57', topStyle: 'hoodie', pants: '#34507e', shoes: '#f2f2ee', outline: '#2a1b16',
  },
  // Gaston : chapeau melon prune, moustache, gilet rouge sur chemise crème, petit bedon.
  gaston: {
    skin: '#e9b48a', hair: '#3a2a22', hairStyle: 'short', hat: { type: 'bowler', color: '#5d3a8a', band: '#e8b33a' },
    top: '#b8433a', topStyle: 'vest', inner: '#f3ead2', pants: '#4a3a30', shoes: '#2e2420', mustache: '#3a2a22', belly: true, outline: '#22140f',
  },
  // Josette : chignon roux, robe rose, tablier farineux.
  josette: {
    skin: '#f7d2b4', hair: '#d0692f', hairStyle: 'bun', top: '#ef8aa6', topStyle: 'dress', apron: '#fffaf0',
    pants: '#f7d2b4', shoes: '#8a4a3a', outline: '#2a1718',
  },
  // Marius : bonnet bleu, barbe blanche, ciré jaune de pêcheur.
  marius: {
    skin: '#d8a077', hair: '#e4e1d8', hairStyle: 'short', hat: { type: 'beanie', color: '#2f6f9a' },
    top: '#f0c43a', topStyle: 'coat', pants: '#35495e', shoes: '#3a2f2a', beard: '#eceae2', outline: '#1d2226',
  },
} satisfies Record<string, Look>;

export type CharKey = keyof typeof LOOKS;

// ---------- Couleurs ----------
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** amt > 0 éclaircit (vers un blanc chaud), amt < 0 assombrit (vers un violet sombre, plus joli qu'un noir pur). */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const [tr, tg, tb] = amt > 0 ? [255, 250, 235] : [40, 20, 50];
  const k = Math.abs(amt);
  const mix = (a: number, t: number): number => Math.round(a + (t - a) * k);
  return `rgb(${mix(r, tr)},${mix(g, tg)},${mix(b, tb)})`;
}

// ---------- Dessin ----------
type Px = (x: number, y: number, w: number, h: number, c: string) => void;

/** Rectangle ombré : lumière à gauche (soleil), ombre à droite et en bas. */
function block(p: Px, x: number, y: number, w: number, h: number, c: string): void {
  p(x, y, w, h, c);
  p(x + w - 1, y, 1, h, shade(c, -0.22));
  if (w > 3) p(x + w - 2, y + 1, 1, h - 1, shade(c, -0.1));
  p(x, y + h - 1, w, 1, shade(c, -0.22));
  p(x, y, 1, h - 1, shade(c, 0.18));
}

const HY = 3; // haut de la tête
const TY = 17; // haut du torse

function headShape(p: Px, c: string, oy: number, side: boolean): void {
  const x0 = side ? 6 : 5;
  const w = side ? 13 : 14;
  p(x0 + 3, HY + oy, w - 6, 1, c);
  p(x0 + 1, HY + 1 + oy, w - 2, 1, c);
  p(x0, HY + 2 + oy, w, 10, c);
  p(x0 + 1, HY + 12 + oy, w - 2, 1, c);
  p(x0 + 3, HY + 13 + oy, w - 6, 1, c);
}

function legs(p: Px, L: Look, view: View, f: number): void {
  const pants = L.pants;
  const dark = shade(pants, -0.2);
  if (view === 'side') {
    if (f === 0) {
      block(p, 10, 25, 4, 4, pants);
      p(10, 29, 5, 2, L.shoes);
      p(14, 30, 1, 1, shade(L.shoes, -0.25));
    } else {
      const back = f === 1 ? dark : pants;
      const front = f === 1 ? pants : dark;
      p(8, 25, 3, 3, back);
      p(7, 28, 3, 2, shade(L.shoes, -0.2));
      p(12, 25, 3, 4, front);
      p(12, 29, 4, 2, L.shoes);
    }
    return;
  }
  const lUp = f === 1 ? 1 : 0;
  const rUp = f === 2 ? 1 : 0;
  block(p, 7, 25, 4, 4 - lUp, pants);
  block(p, 13, 25, 4, 4 - rUp, view === 'up' ? pants : dark);
  p(7, 29 - lUp, 4, 2, L.shoes);
  p(13, 29 - rUp, 4, 2, L.shoes);
  p(7, 30 - lUp, 4, 1, shade(L.shoes, -0.25));
  p(13, 30 - rUp, 4, 1, shade(L.shoes, -0.25));
}

function torso(p: Px, L: Look, view: View, f: number, oy: number): void {
  const side = view === 'side';
  const x = side ? 8 : 6;
  const w = side ? 9 : 12;
  const bottom = L.topStyle === 'dress' ? 10 : 8;
  // En profil, le bras arrière passe derrière le corps : on le dessine avant.
  if (side && f === 2) arms(p, L, view, f, oy);
  block(p, x, TY + oy, w, bottom, L.top);
  if (L.belly) {
    if (side) p(x + w, TY + 3 + oy, 1, 4, shade(L.top, -0.15));
    else p(x - 1, TY + 3 + oy, w + 2, 4, L.top), p(x + w, TY + 3 + oy, 1, 4, shade(L.top, -0.25));
  }
  if (L.topStyle === 'dress') {
    // Jupe évasée.
    p(x - 1, TY + 7 + oy, w + 2, 3, L.top);
    p(x - 1, TY + 9 + oy, w + 2, 1, shade(L.top, -0.25));
  }
  if (view === 'down') {
    if (L.topStyle === 'vest' && L.inner) {
      p(x + 4, TY + oy, 4, 6, L.inner);
      p(x + 5, TY + 1 + oy, 2, 5, shade(L.inner, -0.08));
      p(x + 5, TY + oy, 2, 1, '#8a2f2a'); // nœud papillon
      p(x + 3, TY + 3 + oy, 1, 1, '#e8b33a');
    }
    if (L.topStyle === 'coat') {
      p(x + 5, TY + 1 + oy, 1, 7, shade(L.top, -0.3));
      p(x + 7, TY + 2 + oy, 1, 1, shade(L.top, -0.4));
      p(x + 7, TY + 5 + oy, 1, 1, shade(L.top, -0.4));
      p(x + 3, TY + oy, 6, 1, shade(L.top, 0.25)); // col relevé
    }
    if (L.topStyle === 'hoodie') {
      p(x + 3, TY + oy, 6, 2, shade(L.top, -0.18)); // capuche repliée
      p(x + 4, TY + 2 + oy, 1, 2, '#f6e7d0'); // cordons
      p(x + 7, TY + 2 + oy, 1, 2, '#f6e7d0');
      p(x + 3, TY + 5 + oy, 6, 2, shade(L.top, -0.1)); // poche kangourou
    }
    if (L.apron) {
      p(x + 3, TY + 2 + oy, 6, 7, L.apron);
      p(x + 3, TY + oy, 1, 2, L.apron);
      p(x + 8, TY + oy, 1, 2, L.apron);
      p(x + 8, TY + 2 + oy, 1, 7, shade(L.apron, -0.12));
      p(x + 4, TY + 4 + oy, 1, 1, '#e8dcc6'); // farine
      p(x + 6, TY + 6 + oy, 1, 1, '#e8dcc6');
    }
  } else if (view === 'up') {
    if (L.apron) {
      p(x + 3, TY + oy, 1, 4, L.apron);
      p(x + 8, TY + oy, 1, 4, L.apron);
      p(x + 3, TY + 4 + oy, 6, 1, L.apron); // nœud du tablier
    }
    if (L.topStyle === 'hoodie') p(x + 3, TY + oy, 6, 3, shade(L.top, -0.15));
  } else {
    if (L.apron) p(x + w - 2, TY + 2 + oy, 2, 7, L.apron);
    if (L.topStyle === 'vest' && L.inner) p(x + w - 2, TY + oy, 2, 5, L.inner);
    if (L.topStyle === 'hoodie') p(x, TY + oy, 3, 2, shade(L.top, -0.18));
  }
  if (!(side && f === 2)) arms(p, L, view, f, oy);
}

function arms(p: Px, L: Look, view: View, f: number, oy: number): void {
  const sleeve = L.topStyle === 'vest' && L.inner ? L.inner : L.top;
  const sDark = shade(sleeve, -0.2);
  if (view === 'side') {
    const ax = f === 0 ? 11 : f === 1 ? 13 : 9;
    block(p, ax, TY + 1 + oy, 3, 5, f === 2 ? sDark : sleeve);
    p(ax, TY + 6 + oy, 3, 2, L.skin);
    return;
  }
  const swing = f === 0 ? 0 : f === 1 ? -1 : 1;
  p(4, TY + 1 + oy + swing, 2, 5, sleeve);
  p(4, TY + 1 + oy + swing, 1, 5, shade(sleeve, 0.15));
  p(18, TY + 1 + oy - swing, 2, 5, sDark);
  p(4, TY + 6 + oy + swing, 2, 2, L.skin);
  p(18, TY + 6 + oy - swing, 2, 2, shade(L.skin, -0.12));
}

function face(p: Px, L: Look, view: View, oy: number, swollen: boolean): void {
  const eye = '#2a1b22';
  const y = HY + oy;
  if (view === 'down') {
    // Yeux 2×3 avec reflet.
    p(8, y + 6, 2, 3, eye);
    p(14, y + 6, 2, 3, eye);
    p(8, y + 6, 1, 1, '#ffffff');
    p(14, y + 6, 1, 1, '#ffffff');
    p(7, y + 9, 2, 1, swollen ? '#e25b5b' : '#f19a8f');
    p(15, y + 9, 2, 1, swollen ? '#e25b5b' : '#f19a8f');
    p(11, y + 10, 2, 1, shade(L.skin, -0.35));
    if (L.mustache) p(9, y + 9, 6, 1, L.mustache), p(8, y + 10, 1, 1, L.mustache), p(15, y + 10, 1, 1, L.mustache);
    if (L.beard) {
      p(6, y + 9, 12, 4, L.beard);
      p(7, y + 13, 10, 2, L.beard);
      p(9, y + 15, 6, 1, shade(L.beard, -0.1));
      p(11, y + 10, 2, 1, shade(L.skin, -0.35));
      p(16, y + 9, 2, 5, shade(L.beard, -0.15));
    }
  } else if (view === 'side') {
    p(15, y + 6, 2, 3, eye);
    p(15, y + 6, 1, 1, '#ffffff');
    p(19, y + 8, 1, 1, L.skin); // nez
    p(16, y + 9, 2, 1, swollen ? '#e25b5b' : '#f19a8f');
    p(17, y + 10, 2, 1, shade(L.skin, -0.35));
    p(11, y + 7, 2, 3, shade(L.skin, -0.12)); // oreille
    if (L.mustache) p(17, y + 9, 3, 1, L.mustache);
    if (L.beard) p(13, y + 9, 6, 5, L.beard), p(14, y + 14, 4, 1, L.beard), p(11, y + 9, 2, 3, shade(L.beard, -0.15));
  }
}

function hair(p: Px, L: Look, view: View, oy: number): void {
  if (L.hairStyle === 'none') return;
  const h = L.hair;
  const hl = shade(h, 0.25);
  const hd = shade(h, -0.2);
  const y = HY + oy;
  if (view === 'down') {
    p(8, y, 8, 1, h);
    p(6, y + 1, 12, 1, h);
    p(5, y + 2, 14, 3, h);
    // Frange en mèches.
    p(5, y + 5, 3, 1, h);
    p(9, y + 5, 3, 1, h);
    p(13, y + 5, 2, 1, h);
    p(16, y + 5, 3, 1, hd);
    p(5, y + 5, 1, 5, h);
    p(18, y + 5, 1, 5, hd);
    p(7, y + 1, 3, 1, hl);
    p(6, y + 2, 2, 1, hl);
    if (L.hairStyle === 'bun') {
      p(9, y - 2, 6, 3, h);
      p(10, y - 3, 4, 1, h);
      p(10, y - 2, 2, 1, hl);
      p(4, y + 5, 2, 7, h); // mèches longues
      p(18, y + 5, 2, 7, hd);
    }
  } else if (view === 'up') {
    headShape(p, h, oy, false);
    p(8, y + 11, 8, 3, shade(L.skin, -0.1)); // nuque
    p(7, y + 1, 4, 2, hl);
    p(17, y + 2, 2, 9, hd);
    if (L.hairStyle === 'bun') {
      p(9, y - 2, 6, 4, h);
      p(10, y - 3, 4, 1, h);
      p(10, y - 2, 2, 1, hl);
      p(9, y + 11, 6, 3, h);
    }
  } else {
    p(9, y, 8, 1, h);
    p(7, y + 1, 11, 1, h);
    p(6, y + 2, 12, 3, h);
    p(6, y + 5, 6, 5, h);
    p(16, y + 5, 2, 1, h);
    p(8, y + 1, 3, 1, hl);
    p(6, y + 10, 4, 2, hd);
    if (L.hairStyle === 'bun') {
      p(5, y - 1, 5, 4, h);
      p(6, y - 2, 3, 1, h);
      p(6, y - 1, 2, 1, hl);
      p(6, y + 10, 4, 4, h);
    }
  }
}

function hat(p: Px, L: Look, view: View, oy: number): void {
  const H = L.hat;
  if (!H) return;
  const c = H.color;
  const hl = shade(c, 0.25);
  const hd = shade(c, -0.25);
  const y = HY + oy;
  const side = view === 'side';
  switch (H.type) {
    case 'bowler': {
      const cx = side ? 7 : 7;
      p(cx, y - 2, 10, 5, c);
      p(cx + 1, y - 3, 8, 1, c);
      p(cx + 1, y - 2, 2, 2, hl);
      p(cx + 9, y - 2, 1, 5, hd);
      p(cx, y + 1, 10, 1, H.band ?? hd);
      p(side ? 5 : 4, y + 3, side ? 15 : 16, 1, c);
      p(side ? 5 : 4, y + 3, side ? 15 : 16, 1, hd);
      p(side ? 6 : 5, y + 2, side ? 13 : 14, 1, c);
      break;
    }
    case 'beanie': {
      p(side ? 6 : 5, y - 1, side ? 12 : 14, 5, c);
      p(side ? 7 : 6, y - 2, side ? 10 : 12, 1, c);
      p(side ? 6 : 5, y + 3, side ? 12 : 14, 2, hl); // revers
      for (let i = 0; i < 6; i++) p((side ? 7 : 6) + i * 2, y - 1, 1, 4, hd); // côtes du tricot
      p(side ? 9 : 11, y - 4, 3, 2, '#f4f0e6'); // pompon
      break;
    }
    case 'bucket': {
      p(side ? 7 : 6, y - 1, side ? 11 : 12, 4, c);
      p(side ? 8 : 7, y - 2, side ? 9 : 10, 1, c);
      p(side ? 8 : 7, y - 1, 3, 1, hl);
      p(side ? 7 : 6, y + 2, side ? 11 : 12, 1, H.band ?? hd);
      p(side ? 5 : 4, y + 3, side ? 15 : 16, 2, c);
      p(side ? 5 : 4, y + 4, side ? 15 : 16, 1, hd);
      break;
    }
  }
}

function drawFrame(ctx: CanvasRenderingContext2D, L: Look, view: View, f: number, swollen: boolean): void {
  const p: Px = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  const oy = f === 0 ? 0 : 1; // léger tassement pendant le pas
  legs(p, L, view, f);
  torso(p, L, view, f, oy);
  // Tête (plus large si piqué par des abeilles).
  const skin = L.skin;
  headShape(p, skin, oy, view === 'side');
  if (swollen) {
    p(view === 'side' ? 5 : 4, HY + 4 + oy, view === 'side' ? 15 : 16, 7, skin);
    p(view === 'side' ? 16 : 17, HY + 7 + oy, 2, 3, '#f0a0a0');
  }
  p(view === 'side' ? 18 : 18, HY + 3 + oy, 1, 9, shade(skin, -0.18)); // ombre de joue
  p(8, HY + 13 + oy, 8, 1, shade(skin, -0.22));
  if (view !== 'up') face(p, L, view, oy, swollen);
  hair(p, L, view, oy);
  hat(p, L, view, oy);
}

/** Contour automatique 1 px autour de la silhouette (4-voisinage). */
function outline(ctx: CanvasRenderingContext2D, color: string): void {
  const img = ctx.getImageData(0, 0, CW, CH);
  const d = img.data;
  const [r, g, b] = hexToRgb(color);
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < CW && y < CH && (d[(y * CW + x) * 4 + 3] ?? 0) > 0;
  const add: number[] = [];
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) add.push(y * CW + x);
    }
  }
  for (const i of add) {
    d[i * 4] = r;
    d[i * 4 + 1] = g;
    d[i * 4 + 2] = b;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Planche 9 frames : [face ×3, dos ×3, profil droit ×3]. */
export function drawSheet(key: CharKey, swollen: boolean): HTMLCanvasElement {
  const sheet = document.createElement('canvas');
  sheet.width = CW * VIEWS.length * FRAMES_PER_VIEW;
  sheet.height = CH;
  const sctx = sheet.getContext('2d');
  if (!sctx) throw new Error('Canvas 2D indisponible');
  const L: Look = LOOKS[key];
  VIEWS.forEach((view, vi) => {
    for (let f = 0; f < FRAMES_PER_VIEW; f++) {
      const c = document.createElement('canvas');
      c.width = CW;
      c.height = CH;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D indisponible');
      drawFrame(ctx, L, view, f, swollen);
      outline(ctx, L.outline);
      sctx.drawImage(c, (vi * FRAMES_PER_VIEW + f) * CW, 0);
    }
  });
  return sheet;
}

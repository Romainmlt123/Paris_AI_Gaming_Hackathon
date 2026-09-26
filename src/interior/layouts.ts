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

function floor(ctx: Ctx, style: FloorStyle, a: string, b: string): void {
  const y0 = WALL_ROWS * T;
  rect(ctx, 0, y0, COLS * T, (ROWS - WALL_ROWS) * T, a);
  for (let z = WALL_ROWS; z < ROWS; z++) {
    for (let x = 0; x < COLS; x++) {
      const px = x * T;
      const py = z * T;
      if (style === 'diamond') {
        ctx.fillStyle = b;
        ctx.beginPath();
        ctx.moveTo(px + T / 2, py + 3);
        ctx.lineTo(px + T - 3, py + T / 2);
        ctx.lineTo(px + T / 2, py + T - 3);
        ctx.lineTo(px + 3, py + T / 2);
        ctx.fill();
        rect(ctx, px, py, T, 1, shade(a, 0.4));
        rect(ctx, px, py, 1, T, shade(a, 0.4));
      } else if (style === 'checker') {
        if ((x + z) % 2) rect(ctx, px, py, T, T, b);
        rect(ctx, px, py, T, 1, shade(a, -0.08));
      } else if (style === 'planks') {
        rect(ctx, px, py + T - 2, T, 2, b);
        if ((x + z * 3) % 4 === 0) rect(ctx, px + T - 2, py, 2, T, b);
        if ((x * 7 + z) % 5 === 0) rect(ctx, px + 8, py + 12, 3, 2, b);
      } else if (style === 'parquet') {
        const vertical = (x + z) % 2 === 0;
        for (let i = 0; i < 4; i++) {
          if (vertical) rect(ctx, px + i * 8, py, 1, T, b);
          else rect(ctx, px, py + i * 8, T, 1, b);
        }
      } else {
        rect(ctx, px + 1, py + 1, T - 2, T - 2, (x * 5 + z * 3) % 3 ? a : b);
        rect(ctx, px, py, T, 1, shade(a, -0.2));
        rect(ctx, px, py, 1, T, shade(a, -0.2));
      }
    }
  }
  const shadowGrad = ctx.createLinearGradient(0, y0, 0, y0 + 18);
  shadowGrad.addColorStop(0, 'rgba(43,34,51,0.28)');
  shadowGrad.addColorStop(1, 'rgba(43,34,51,0)');
  ctx.fillStyle = shadowGrad;
  ctx.fillRect(0, y0, COLS * T, 18);
}

function wall(ctx: Ctx, color: string, stripe: string, windows: number[]): void {
  const h = WALL_ROWS * T;
  rect(ctx, 0, 0, COLS * T, h, color);
  rect(ctx, 0, 0, COLS * T, 6, shade(color, -0.3));
  rect(ctx, 0, h - 22, COLS * T, 8, stripe);
  rect(ctx, 0, h - 6, COLS * T, 6, shade(color, -0.25));
  for (let x = 0; x < COLS * T; x += 16) rect(ctx, x, 8, 1, h - 30, shade(color, -0.05));
  for (const wx of windows) {
    frame(ctx, wx * T + 6, 12, T * 1.5, 26, '#9fd8ef');
    rect(ctx, wx * T + 6, 12, T * 1.5, 8, '#c9ecf8');
    rect(ctx, wx * T + 6 + T * 0.75 - 1, 12, 2, 26, '#fbf8f0');
    rect(ctx, wx * T + 2, 38, T * 1.5 + 8, 4, '#fbf8f0');
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
    ctx.fillText(`Niv.${level}`, px + pw / 2, py + ph / 2 + 7);
  }, { layer: 'floor', label: `Bientôt · niveau ${level}`, action: { kind: 'locked', level } });
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
  }, { label: 'Plan d’aménagement', action: { kind: 'board' } });
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
    }, { solid: false, layer: 'floor', label: `Place libre : ${it.name}`, action: { kind: 'say', text: `Ici irait bien : ${it.name}. ${shopHint(it.shop)}` } });
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
  return shop === 'echoppe' ? 'Gaston en vend à l’échoppe.' : shop === 'cabane' ? 'Marius en a dans sa cabane.' : 'Josette en tricote à la boulangerie.';
}

// ---------- Layouts ----------

export function layoutFor(id: BuildingId, state: GameState): Layout {
  const lvl = islandLevel(state.islandValue).level;
  const cream = '#fbf3e4';
  switch (id) {
    case 'echoppe':
      return {
        title: 'L’échoppe de Gaston',
        subtitle: 'Meubles, bibelots & bonnes affaires',
        room: (ctx) => {
          wall(ctx, '#fbfbf8', '#6cc3e0', [5]);
          floor(ctx, 'diamond', '#cfeef6', '#b3e1ee');
          doorMat(ctx, '#4f7fc9');
        },
        owner: { npc: 'gaston', x: 6, z: 3 },
        pieces: [
          shelf(1, 2, 3, 'echoppe', [1], 'Petit mobilier', state),
          lvl >= 2 ? shelf(8, 2, 3, 'echoppe', [2], 'Rayon confort', state) : locked(8, 2, 3, 1, 2),
          counter(4, 4, 4, '#fbfbf8', '#9fd8ef', register),
          lvl >= 3 ? shelf(1, 7, 2, 'echoppe', [3], 'Vitrine luxe', state, '#f2e3b3') : locked(1, 7, 2, 2, 3),
          deco(9, 7, 2, 1, (ctx, px, py, pw) => {
            box(ctx, px + 2, py + 6, pw - 4, 22, 14, '#c79a5b');
            drawIcon(ctx, 'lamp', '#f5d9a8', px + 4, py - 22, 22, 26);
            drawIcon(ctx, 'buoy', '#e0564a', px + 32, py - 14, 22, 22);
          }, { label: 'Déco d’extérieur', action: { kind: 'deco' } }),
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
        title: 'Boulangerie & Tricots',
        subtitle: 'Croissants chauds et laine douce',
        room: (ctx) => {
          wall(ctx, cream, '#e98aa6', [1, 9]);
          floor(ctx, 'checker', '#fdf3f5', '#f6d3dc');
          doorMat(ctx, '#e98aa6');
        },
        owner: { npc: 'josette', x: 6, z: 3 },
        pieces: [
          counter(4, 4, 4, '#fffaf0', '#e98aa6', breads),
          deco(0, 2, 3, 1, (ctx, px, py, pw, ph) => {
            box(ctx, px + 2, py + 4, pw - 4, ph - 4, 30, '#bfe8f2', '#e6d3ae');
            breads(ctx, px - 6, py - 30);
          }, { label: 'Vitrine à pains', action: { kind: 'say', text: 'Ça sent le croissant chaud. Josette jure qu’elle y met « un ingrédient secret : les ragots ».' } }),
          shelf(8, 2, 3, 'boulangerie', [1], 'Tricots de Josette', state, '#f4d9b8'),
          lvl >= 2 ? shelf(9, 6, 2, 'boulangerie', [2], 'Collection hiver', state, '#f4d9b8') : locked(9, 6, 2, 1, 2),
          lvl >= 3 ? shelf(1, 6, 2, 'boulangerie', [3], 'Haute couture', state, '#e6d0f2') : locked(1, 6, 2, 1, 3),
          deco(0, 8, 1, 2, (ctx, px, py, pw, ph) => {
            frame(ctx, px + 2, py - 20, pw - 4, ph + 16, '#c8453c');
            rect(ctx, px + 6, py - 16, pw - 12, ph + 8, '#bfe8f2');
            rect(ctx, px + 8, py - 12, 4, ph, '#fbf8f0');
          }, { label: 'Cabine d’essayage', action: { kind: 'wardrobe' } }),
          deco(7, 8, 1, 1, (c, x, y, w, h) => drawIcon(c, 'table', '#fbf8f0', x - 2, y - 8, w + 4, h + 4)),
          plant(11, 9, '#fbf8f0'),
        ],
      };
    case 'cabane':
      return {
        title: 'La cabane de Marius',
        subtitle: 'Tout ce que la mer a rapporté',
        room: (ctx) => {
          wall(ctx, '#b8845a', '#2f5f8f', [2]);
          for (let i = 0; i < 6; i++) rect(ctx, 200 + i * 22, 8, 1, 40, '#e6d3ae');
          for (let i = 0; i < 3; i++) rect(ctx, 200, 14 + i * 14, 112, 1, '#e6d3ae');
          floor(ctx, 'planks', '#c79a5b', '#9a6a44');
          doorMat(ctx, '#2f5f8f');
        },
        owner: { npc: 'marius', x: 5, z: 3 },
        pieces: [
          counter(4, 4, 3, '#9a6a44', '#6e4a30', crates),
          shelf(8, 2, 3, 'cabane', [1], 'Étal du pêcheur', state, '#9a6a44'),
          lvl >= 2 ? shelf(1, 2, 2, 'cabane', [2], 'Arrivage du large', state, '#9a6a44') : locked(1, 2, 2, 1, 2),
          lvl >= 3 ? shelf(9, 6, 2, 'cabane', [3], 'Coin du capitaine', state, '#2f5f8f') : locked(9, 6, 2, 2, 3),
          barrel(0, 8),
          barrel(11, 8),
          barrel(0, 5),
          deco(3, 8, 1, 1, (c, x, y, w, h) => drawIcon(c, 'buoy', '#e0564a', x, y - 6, w, h), { label: 'Vieille bouée', action: { kind: 'say', text: '« … Elle m’a sauvé la vie en 1987. Elle n’est pas à vendre. »' } }),
        ],
      };
    case 'mairie':
      return {
        title: 'Mairie',
        subtitle: `Île niveau ${lvl} · ${islandLevel(state.islandValue).name}`,
        room: (ctx) => {
          wall(ctx, '#efe6d2', '#c8453c', [1, 9]);
          floor(ctx, 'stone', '#d8d2c4', '#cbc3b2');
          rect(ctx, 5 * T, 5 * T, 2 * T, 6 * T, '#c8453c');
          rect(ctx, 5 * T + 4, 5 * T, 2, 6 * T, '#f2c14e');
          rect(ctx, 7 * T - 6, 5 * T, 2, 6 * T, '#f2c14e');
          doorMat(ctx, '#c8453c');
        },
        pieces: [
          board(4, 2, 4, state),
          deco(4, 4, 4, 1, (ctx, px, py, pw, ph) => box(ctx, px + 2, py + 6, pw - 4, ph - 8, 18, '#8a5a3c'), { label: 'Bureau du maire (absent)', action: { kind: 'say', text: 'Le bureau du maire est vide. On raconte qu’il est parti après une rumeur de Josette.' } }),
          plant(0, 2, '#c8453c'),
          plant(11, 2, '#c8453c'),
          deco(1, 7, 2, 1, (c, x, y, w, h) => drawIcon(c, 'sofa', '#8a5a3c', x, y - 10, w, h + 10)),
          deco(9, 7, 2, 1, (c, x, y, w, h) => drawIcon(c, 'sofa', '#8a5a3c', x, y - 10, w, h + 10)),
        ],
      };
    case 'maison':
      return {
        title: 'Chez toi',
        subtitle: 'Chaque meuble acheté trouve sa place ici',
        room: (ctx) => {
          wall(ctx, '#f6e7c8', '#5fa37a', [9]);
          floor(ctx, 'parquet', '#c99a66', '#b38454');
          doorMat(ctx, '#5fa37a');
        },
        pieces: [
          deco(0, 2, 2, 3, (ctx, px, py, pw, ph) => {
            frame(ctx, px + 4, py - 6, pw - 8, ph + 2, '#8a5a3c');
            rect(ctx, px + 8, py - 2, pw - 16, 18, '#fbf8f0');
            rect(ctx, px + 8, py + 18, pw - 16, ph - 28, '#4f7fc9');
            rect(ctx, px + 8, py + 18, pw - 16, 4, '#8fb3e8');
          }, { label: 'Lit (dormir)', action: { kind: 'bed' } }),
          deco(10, 2, 2, 1, (ctx, px, py, pw, ph) => {
            box(ctx, px + 2, py + 4, pw - 4, ph - 4, 40, '#a8744a');
            rect(ctx, px + pw / 2 - 1, py - 34, 2, 36, INK);
            rect(ctx, px + pw / 2 - 6, py - 14, 3, 6, '#f2c14e');
            rect(ctx, px + pw / 2 + 3, py - 14, 3, 6, '#f2c14e');
          }, { label: 'Armoire', action: { kind: 'wardrobe' } }),
          ...HOME_SPOTS.map((s) => furniture(s, state.owned.includes(s.id))),
        ],
      };
  }
}

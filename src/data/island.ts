import type { SlotId } from '../state/types.ts';

/** Île en grille de tuiles. x = colonne (ouest→est), z = ligne (nord→sud, vers la caméra). */
export const W = 22;
export const H = 30;

export type Ground = 'water' | 'sand' | 'grass' | 'plateau' | 'stairs' | 'dock';
export const GROUND_HEIGHT: Record<Ground, number> = {
  water: 0,
  sand: 0.22,
  grass: 0.42,
  plateau: 1.22,
  stairs: 0.82,
  dock: 0.5,
};

function noise(i: number, j: number): number {
  return Math.sin(i * 1.7 + j * 0.9) * 0.035 + Math.sin(i * 0.53 - j * 1.31) * 0.045;
}

function baseGround(i: number, j: number): Ground {
  const nx = (i + 0.5 - W / 2) / (W / 2);
  const nz = (j + 0.5 - H / 2) / (H / 2);
  const d = Math.sqrt(nx * nx * 1.02 + nz * nz) + noise(i, j);
  if (j <= 1 || j >= H - 3) return 'water';
  if (d > 0.9) return 'water';
  if (d > 0.74 || nz > 0.62) return 'sand';
  if (nz < -0.28 && d < 0.66 && Math.abs(nx + 0.1) < 0.62) return 'plateau';
  return 'grass';
}

function build(): Ground[] {
  const g: Ground[] = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) g.push(baseGround(i, j));
  const set = (i: number, j: number, v: Ground): void => {
    g[j * W + i] = v;
  };
  // Escalier vers le plateau de la mairie
  set(10, 11, 'stairs');
  set(11, 11, 'stairs');
  // Ponton vers l'est
  for (let i = 18; i < W; i++) set(i, 19, 'dock');
  return g;
}

export const GROUND: Ground[] = build();

export function groundAt(i: number, j: number): Ground {
  if (i < 0 || j < 0 || i >= W || j >= H) return 'water';
  return GROUND[j * W + i] ?? 'water';
}

export function tileToWorld(i: number, j: number): { x: number; z: number } {
  return { x: i + 0.5 - W / 2, z: j + 0.5 - H / 2 };
}
export function worldToTile(x: number, z: number): { i: number; j: number } {
  return { i: Math.floor(x + W / 2), j: Math.floor(z + H / 2) };
}

export interface Placed {
  id: string;
  i: number;
  j: number;
  w: number; // empreinte en tuiles
  d: number;
}

export const BUILDINGS: (Placed & { kind: 'boulangerie' | 'echoppe' | 'mairie' | 'enclos' })[] = [
  { id: 'boulangerie', kind: 'boulangerie', i: 3, j: 13, w: 4, d: 3 },
  { id: 'echoppe', kind: 'echoppe', i: 14, j: 13, w: 4, d: 3 },
  { id: 'mairie', kind: 'mairie', i: 8, j: 7, w: 5, d: 3 },
  { id: 'enclos', kind: 'enclos', i: 4, j: 20, w: 4, d: 3 },
];

export const TREES: { id: string; i: number; j: number; fruit: 'pomme' | 'figue' }[] = [
  { id: 't1', i: 16, j: 8, fruit: 'pomme' },
  { id: 't2', i: 18, j: 10, fruit: 'figue' },
  { id: 't3', i: 15, j: 10, fruit: 'pomme' },
  { id: 't4', i: 3, j: 9, fruit: 'figue' },
  { id: 't5', i: 5, j: 7, fruit: 'pomme' },
  { id: 't6', i: 16, j: 22, fruit: 'pomme' },
  { id: 't7', i: 2, j: 17, fruit: 'figue' },
];

export const ROCKS: { i: number; j: number; s: number }[] = [
  { i: 19, j: 15, s: 0.9 },
  { i: 2, j: 22, s: 0.7 },
  { i: 13, j: 26, s: 0.6 },
  { i: 12, j: 4, s: 0.8 },
  { i: 7, j: 26, s: 0.5 },
];

export interface SlotDef {
  id: SlotId;
  name: string;
  i: number;
  j: number;
}
export const SLOTS: SlotDef[] = [
  { id: 'placette', name: 'La placette', i: 10, j: 16 },
  { id: 'falaise', name: 'Le bord de falaise', i: 14, j: 8 },
  { id: 'mairie', name: 'Le jardin de la mairie', i: 7, j: 10 },
  { id: 'verger', name: 'Le verger', i: 17, j: 12 },
  { id: 'plage', name: 'La plage', i: 10, j: 24 },
  { id: 'ponton', name: 'Le bout du ponton', i: 21, j: 19 },
  { id: 'echoppe', name: "L'échoppe de Gaston", i: 18, j: 14 },
  { id: 'boulangerie', name: 'La boulangerie', i: 7, j: 16 },
];

/** Postes habituels des habitants (tuiles). */
export const NPC_HOME: Record<'gaston' | 'josette' | 'marius', { i: number; j: number }> = {
  gaston: { i: 15, j: 16 },
  josette: { i: 5, j: 16 },
  marius: { i: 19, j: 19 },
};

export const PLAYER_START = { i: 11, j: 19 };

function blockedSet(): Set<number> {
  const s = new Set<number>();
  for (const b of BUILDINGS) for (let j = b.j; j < b.j + b.d; j++) for (let i = b.i; i < b.i + b.w; i++) s.add(j * W + i);
  for (const t of TREES) s.add(t.j * W + t.i);
  for (const r of ROCKS) s.add(r.j * W + r.i);
  return s;
}
const BLOCKED = blockedSet();

export function isBlocked(i: number, j: number): boolean {
  return BLOCKED.has(j * W + i);
}

export function walkable(i: number, j: number): boolean {
  const g = groundAt(i, j);
  return g !== 'water' && !isBlocked(i, j);
}

/** Déplacement autorisé entre deux tuiles voisines (le plateau ne se rejoint que par l'escalier). */
export function canStep(ai: number, aj: number, bi: number, bj: number): boolean {
  if (!walkable(bi, bj)) return false;
  const a = groundAt(ai, aj);
  const b = groundAt(bi, bj);
  const high = (g: Ground): boolean => g === 'plateau';
  if (high(a) === high(b)) return true;
  return a === 'stairs' || b === 'stairs';
}

export const BEACH_TILES: { i: number; j: number }[] = (() => {
  const out: { i: number; j: number }[] = [];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (groundAt(i, j) !== 'sand' || isBlocked(i, j)) continue;
      const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => groundAt(i + (di ?? 0), j + (dj ?? 0)) === 'water');
      if (!nearWater) out.push({ i, j });
    }
  return out;
})();

export function asciiMap(): string {
  const ch: Record<Ground, string> = { water: '~', sand: '.', grass: 'g', plateau: 'P', stairs: '=', dock: '#' };
  const rows: string[] = [];
  for (let j = 0; j < H; j++) {
    let r = '';
    for (let i = 0; i < W; i++) {
      const slot = SLOTS.find((s) => s.i === i && s.j === j);
      r += slot ? 'S' : isBlocked(i, j) ? 'X' : ch[groundAt(i, j)];
    }
    rows.push(r);
  }
  return rows.join('\n');
}

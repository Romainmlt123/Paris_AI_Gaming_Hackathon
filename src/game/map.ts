import { mulberry32 } from '../../shared/rng';

export type TileKind = 'water' | 'sand' | 'grass' | 'path' | 'plateau' | 'stairs' | 'pontoon';

export interface Tile {
  x: number;
  z: number;
}

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export type BuildingId = 'mairie' | 'boulangerie' | 'echoppe' | 'cabane' | 'maison';

export interface Building extends Rect {
  id: BuildingId;
}

export interface TileMap {
  w: number;
  h: number;
  kinds: TileKind[];
  blocked: boolean[];
  buildings: Building[];
  trees: Tile[];
  bushes: Tile[];
  rocks: Tile[];
  flowers: Tile[];
}

export const MAP_W = 24;
export const MAP_H = 30;

export const BUILDINGS: readonly Building[] = [
  { id: 'mairie', x: 10, z: 6, w: 4, d: 2 },
  { id: 'boulangerie', x: 4, z: 15, w: 3, d: 2 },
  { id: 'echoppe', x: 16, z: 15, w: 3, d: 2 },
  { id: 'cabane', x: 13, z: 22, w: 2, d: 2 },
  { id: 'maison', x: 6, z: 21, w: 2, d: 2 },
];

export const STAIRS: readonly Tile[] = [
  { x: 11, z: 12 },
  { x: 12, z: 12 },
];

export const PONTOON_X = 17;

const PATHS: readonly [Tile, Tile][] = [
  [{ x: 11, z: 13 }, { x: 11, z: 18 }],
  [{ x: 12, z: 13 }, { x: 12, z: 18 }],
  [{ x: 5, z: 17 }, { x: 17, z: 17 }],
  [{ x: 17, z: 17 }, { x: 17, z: 26 }],
  [{ x: 11, z: 8 }, { x: 11, z: 11 }],
  [{ x: 12, z: 8 }, { x: 12, z: 11 }],
  [{ x: 7, z: 18 }, { x: 7, z: 20 }],
];

const HEIGHTS: Record<TileKind, number> = {
  water: -0.5,
  sand: 0.15,
  grass: 0.3,
  path: 0.3,
  pontoon: 0.32,
  stairs: 0.7,
  plateau: 1.1,
};

export function surfaceHeight(kind: TileKind): number {
  return HEIGHTS[kind];
}

function levelOf(kind: TileKind): number {
  if (kind === 'plateau') return 2;
  if (kind === 'stairs') return 1;
  return 0;
}

export function idx(map: TileMap, x: number, z: number): number {
  return z * map.w + x;
}

export function inBounds(map: TileMap, x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < map.w && z < map.h;
}

export function kindAt(map: TileMap, x: number, z: number): TileKind {
  return inBounds(map, x, z) ? (map.kinds[idx(map, x, z)] ?? 'water') : 'water';
}

export function isWalkable(map: TileMap, x: number, z: number): boolean {
  return inBounds(map, x, z) && kindAt(map, x, z) !== 'water' && !map.blocked[idx(map, x, z)];
}

function noise(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number, z: number): number {
  return (Math.sin(x * 0.9 + 1.3) + Math.sin(z * 0.7 + 0.4) + Math.sin((x + z) * 0.5)) / 3;
}

function baseKind(x: number, z: number): TileKind {
  const dx = (x - 11.5) / 10.6;
  const dz = (z - 14) / 12.6;
  const r = Math.sqrt(dx * dx + dz * dz) + smoothNoise(x, z) * 0.06 + (noise(x, z) - 0.5) * 0.03;
  if (r >= 1) return 'water';
  const px = (x - 11.5) / 6.2;
  const pz = (z - 8) / 4.3;
  if (px * px + pz * pz < 1 && r < 0.8) return 'plateau';
  return r < 0.8 ? 'grass' : 'sand';
}

function drawLine(kinds: TileKind[], w: number, a: Tile, b: Tile): void {
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(a.x + ((b.x - a.x) * i) / Math.max(steps, 1));
    const z = Math.round(a.z + ((b.z - a.z) * i) / Math.max(steps, 1));
    const k = kinds[z * w + x];
    if (k === 'grass' || k === 'plateau' || k === 'sand') kinds[z * w + x] = 'path';
  }
}

function inRect(t: Tile, r: Rect, margin = 0): boolean {
  return t.x >= r.x - margin && t.x < r.x + r.w + margin && t.z >= r.z - margin && t.z < r.z + r.d + margin;
}

/** Tiles kept clear of trees so the plaza and doors stay readable. */
const CLEARINGS: readonly Rect[] = [
  { x: 8, z: 15, w: 8, d: 7 },
  { x: 9, z: 7, w: 6, d: 7 },
];

export function generateMap(): TileMap {
  const w = MAP_W;
  const h = MAP_H;
  const kinds: TileKind[] = [];
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) kinds.push(baseKind(x, z));
  for (const s of STAIRS) kinds[s.z * w + s.x] = 'stairs';
  for (const [a, b] of PATHS) drawLine(kinds, w, a, b);
  let lastLand = 0;
  for (let z = 0; z < h; z++) if (kinds[z * w + PONTOON_X] !== 'water') lastLand = z;
  for (let z = lastLand + 1; z < Math.min(h, lastLand + 5); z++) kinds[z * w + PONTOON_X] = 'pontoon';

  const map: TileMap = { w, h, kinds, blocked: kinds.map(() => false), buildings: [...BUILDINGS], trees: [], bushes: [], rocks: [], flowers: [] };
  for (const b of BUILDINGS) {
    for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) map.blocked[idx(map, x, z)] = true;
  }
  scatterProps(map);
  scatterBushes(map);
  return map;
}

function besideShore(map: TileMap, x: number, z: number): boolean {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx = 0, dz = 0]) => {
    const k = kindAt(map, x + dx, z + dz);
    return k === 'sand' || k === 'water';
  });
}

/** Bushes block their tile like trees, with the same keep-clear rules around buildings, clearings and paths. */
function scatterBushes(map: TileMap): void {
  const rng = mulberry32(8);
  for (let z = 0; z < map.h; z++) {
    for (let x = 0; x < map.w; x++) {
      const k = kindAt(map, x, z);
      const t = { x, z };
      if ((k !== 'grass' && k !== 'plateau') || map.blocked[idx(map, x, z)]) continue;
      if (map.buildings.some((b) => inRect(t, b, 1)) || CLEARINGS.some((c) => inRect(t, c)) || nearPath(map, x, z)) continue;
      if (rng() > (besideShore(map, x, z) ? 0.3 : 0.025)) continue;
      map.bushes.push(t);
      map.blocked[idx(map, x, z)] = true;
    }
  }
}

function scatterProps(map: TileMap): void {
  const rng = mulberry32(7);
  for (let z = 0; z < map.h; z++) {
    for (let x = 0; x < map.w; x++) {
      const k = kindAt(map, x, z);
      const t = { x, z };
      if (map.blocked[idx(map, x, z)]) continue;
      const nearBuilding = map.buildings.some((b) => inRect(t, b, 1));
      const inClearing = CLEARINGS.some((c) => inRect(t, c));
      const roll = rng();
      if ((k === 'grass' || k === 'plateau') && !nearBuilding && !inClearing && roll < 0.2 && !nearPath(map, x, z)) {
        map.trees.push(t);
        map.blocked[idx(map, x, z)] = true;
      } else if (k === 'sand' && roll < 0.06) {
        map.rocks.push(t);
        map.blocked[idx(map, x, z)] = true;
      } else if ((k === 'grass' || k === 'plateau') && roll > 0.82) {
        map.flowers.push(t);
      }
    }
  }
}

function nearPath(map: TileMap, x: number, z: number): boolean {
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (kindAt(map, x + dx, z + dz) === 'path') return true;
  return false;
}

export function canStep(map: TileMap, from: Tile, to: Tile): boolean {
  if (!isWalkable(map, to.x, to.z)) return false;
  return Math.abs(levelOf(kindAt(map, from.x, from.z)) - levelOf(kindAt(map, to.x, to.z))) <= 1;
}

/** A* over the tile grid, 8 directions, no corner cutting. Returns tiles after `from`, or null. */
export function findPath(map: TileMap, from: Tile, to: Tile): Tile[] | null {
  if (!isWalkable(map, to.x, to.z)) return null;
  const start = idx(map, from.x, from.z);
  const goal = idx(map, to.x, to.z);
  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const open = new Set<number>([start]);
  const heuristic = (i: number): number => {
    const dx = Math.abs((i % map.w) - to.x);
    const dz = Math.abs(Math.floor(i / map.w) - to.z);
    return Math.max(dx, dz) + 0.41 * Math.min(dx, dz);
  };
  while (open.size > 0) {
    let current = -1;
    let best = Infinity;
    for (const i of open) {
      const f = (g.get(i) ?? Infinity) + heuristic(i);
      if (f < best) {
        best = f;
        current = i;
      }
    }
    if (current === goal) return rebuild(map, came, current, start);
    open.delete(current);
    const cx = current % map.w;
    const cz = Math.floor(current / map.w);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const next = { x: cx + dx, z: cz + dz };
        if (!canStep(map, { x: cx, z: cz }, next)) continue;
        if (dx !== 0 && dz !== 0 && (!canStep(map, { x: cx, z: cz }, { x: cx + dx, z: cz }) || !canStep(map, { x: cx, z: cz }, { x: cx, z: cz + dz }))) continue;
        const ni = idx(map, next.x, next.z);
        const cost = (g.get(current) ?? Infinity) + (dx !== 0 && dz !== 0 ? 1.41 : 1);
        if (cost < (g.get(ni) ?? Infinity)) {
          g.set(ni, cost);
          came.set(ni, current);
          open.add(ni);
        }
      }
    }
  }
  return null;
}

function rebuild(map: TileMap, came: Map<number, number>, end: number, start: number): Tile[] {
  const path: Tile[] = [];
  let cur = end;
  while (cur !== start) {
    path.push({ x: cur % map.w, z: Math.floor(cur / map.w) });
    const prev = came.get(cur);
    if (prev === undefined) break;
    cur = prev;
  }
  return path.reverse();
}

/** Closest walkable tile to (x, z) within a small radius, preferring the given origin side. */
export function nearestWalkable(map: TileMap, x: number, z: number, radius = 3): Tile | null {
  let best: Tile | null = null;
  let bestD = Infinity;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = x + dx;
      const tz = z + dz;
      if (!isWalkable(map, tx, tz)) continue;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = { x: tx, z: tz };
      }
    }
  }
  return best;
}

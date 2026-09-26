import { canStep, H, W } from '../data/island.ts';

export interface Tile {
  i: number;
  j: number;
}

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** A* 8 directions sans couper les coins. Si la cible est bloquée, on vise la tuile accessible la plus proche. */
export function findPath(from: Tile, to: Tile, step: (ai: number, aj: number, bi: number, bj: number) => boolean = canStep): Tile[] {
  const idx = (i: number, j: number): number => j * W + i;
  const g = new Map<number, number>([[idx(from.i, from.j), 0]]);
  const parent = new Map<number, number>();
  const open: { k: number; f: number }[] = [{ k: idx(from.i, from.j), f: 0 }];
  const closed = new Set<number>();
  const h = (i: number, j: number): number => Math.hypot(i - to.i, j - to.j);
  let best = idx(from.i, from.j);
  let bestH = h(from.i, from.j);
  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift();
    if (!cur) break;
    if (closed.has(cur.k)) continue;
    closed.add(cur.k);
    const ci = cur.k % W;
    const cj = Math.floor(cur.k / W);
    const ch = h(ci, cj);
    if (ch < bestH) {
      bestH = ch;
      best = cur.k;
    }
    if (ci === to.i && cj === to.j) break;
    for (const [di, dj, cost] of DIRS) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      if (!step(ci, cj, ni, nj)) continue;
      if (di !== 0 && dj !== 0 && (!step(ci, cj, ci + di, cj) || !step(ci, cj, ci, cj + dj))) continue;
      const nk = idx(ni, nj);
      const ng = (g.get(cur.k) ?? 0) + cost;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        parent.set(nk, cur.k);
        open.push({ k: nk, f: ng + h(ni, nj) });
      }
    }
  }
  const path: Tile[] = [];
  let k: number | undefined = best;
  while (k !== undefined && k !== idx(from.i, from.j)) {
    path.push({ i: k % W, j: Math.floor(k / W) });
    k = parent.get(k);
  }
  return path.reverse();
}

export type Rng = () => number;

/** Générateur pseudo-aléatoire déterministe (mulberry32), valeurs dans [0, 1). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Choisit un élément d'une liste non vide. */
export function pick<T>(list: readonly [T, ...T[]], rng: Rng): T {
  const i = Math.min(list.length - 1, Math.floor(rng() * list.length));
  return list[i] ?? list[0];
}

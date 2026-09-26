import type { PlayerLook } from './types';

export const NAME_MAX = 14;

/** Trims, collapses whitespace and strips control/markup characters from typed text. */
function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f<>{}"`\\]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

export function cleanName(raw: unknown): string {
  return cleanText(raw, NAME_MAX);
}

/** How the island refers to the player in facts and prompts. */
export function playerLabel(name: string): string {
  return cleanName(name) || 'Le joueur';
}

export const ISLAND_MAX = 20;
export const NAME_IDEAS = ['Jean-Kévin', 'Brigitte', 'Momo', 'Paquita', 'Didier'];
export const ISLAND_IDEAS = ['Île-aux-Commères', 'Potinville', 'Ragot-sur-Mer'];

export const LOOK_OPTIONS = {
  skin: ['#f6d7bd', '#f3c9a5', '#d39b72', '#8d5a3b'],
  hairStyle: ['short', 'bun', 'cap', 'beanie'],
  hair: ['#5a3b2a', '#1f1a1c', '#e2b45a', '#c4552d', '#9aa7b8'],
  shirt: ['#3fa7a0', '#e0564a', '#e7b43f', '#7b4fa0', '#4f7fcf', '#5fb04a'],
} as const satisfies { [K in keyof PlayerLook]: readonly PlayerLook[K][] };

export const DEFAULT_LOOK: PlayerLook = { skin: '#f3c9a5', hair: '#5a3b2a', hairStyle: 'short', shirt: '#3fa7a0' };

function oneOf<T>(options: readonly T[], value: unknown, fallback: T): T {
  return options.find((o) => o === value) ?? fallback;
}

/** Keeps only values offered by the character creator; null if `raw` is not a look at all. */
export function cleanLook(raw: unknown): PlayerLook | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<Record<keyof PlayerLook, unknown>>;
  return {
    skin: oneOf(LOOK_OPTIONS.skin, r.skin, DEFAULT_LOOK.skin),
    hair: oneOf(LOOK_OPTIONS.hair, r.hair, DEFAULT_LOOK.hair),
    hairStyle: oneOf(LOOK_OPTIONS.hairStyle, r.hairStyle, DEFAULT_LOOK.hairStyle),
    shirt: oneOf(LOOK_OPTIONS.shirt, r.shirt, DEFAULT_LOOK.shirt),
  };
}

export function randomLook(rand: () => number = Math.random): PlayerLook {
  const at = <T>(options: readonly T[]): T => options[Math.floor(rand() * options.length) % options.length] as T;
  return { skin: at(LOOK_OPTIONS.skin), hair: at(LOOK_OPTIONS.hair), hairStyle: at(LOOK_OPTIONS.hairStyle), shirt: at(LOOK_OPTIONS.shirt) };
}

export function cleanIsland(raw: unknown): string {
  return cleanText(raw, ISLAND_MAX);
}

/** Arrival rumor planted by the intro cutscene. */
export function arrivalFactText(playerName: string, islandName: string): string {
  const island = cleanIsland(islandName);
  return `${playerLabel(playerName)} a débarqué tout nu sur un radeau${island ? ` à ${island}` : ''}`;
}

import type { GameState, Intent, Pickup } from '../state/types';
import type { Rng } from './rng';
import { addItem, removeItem } from './economy';
import { recordFact } from './rumors';

// Activités quotidiennes : fonctions pures, le hasard est injecté (rng) pour pouvoir forcer la démo.

export type ShakeOutcome = { kind: 'fruit'; itemId: string; count: number } | { kind: 'rare'; itemId: string } | { kind: 'bees' } | { kind: 'already' };
export type FishOutcome = { itemId: string };

const FISH_TABLE: readonly [string, number][] = [
  ['bar-commun', 0.42],
  ['sardine', 0.33],
  ['poisson-pourri', 0.15],
  ['poulpe-dore', 0.1],
];

function activity(state: GameState): NonNullable<GameState['activity']> {
  const a = state.activity;
  if (!a) return { day: state.day, shakenTrees: [], penFedDay: 0 };
  return a.day === state.day ? a : { ...a, day: state.day, shakenTrees: [] };
}

export function rollShake(state: GameState, tree: number, fruit: string, rng: Rng): ShakeOutcome {
  if (activity(state).shakenTrees.includes(tree)) return { kind: 'already' };
  const r = rng();
  const alreadyStung = state.player.stungUntilDay !== null && state.player.stungUntilDay >= state.day;
  if (r < 0.2 && !alreadyStung) return { kind: 'bees' };
  if (r > 0.92) return { kind: 'rare', itemId: 'pomme-doree' };
  return { kind: 'fruit', itemId: fruit, count: r > 0.6 ? 2 : 1 };
}

export const JOSETTE_MOCK: Intent = {
  kind: 'mock',
  text: "Hihihi ! Mais qu'est-ce qui t'est arrivé ?! T'as la tête comme une brioche trop levée !",
  about: null,
};

/** Applique le résultat d'une secousse : fruits au sol, ou piqûre (visage gonflé + Josette se moque). */
export function applyShake(state: GameState, tree: number, outcome: ShakeOutcome, at: { x: number; z: number }): GameState {
  if (outcome.kind === 'already') return state;
  const a = activity(state);
  let next: GameState = { ...state, activity: { ...a, shakenTrees: [...a.shakenTrees, tree] } };
  if (outcome.kind === 'bees') {
    next = { ...next, player: { ...next.player, stungUntilDay: next.day } };
    next = recordFact(next, {
      day: next.day, actor: 'player', target: null, kind: 'other',
      text: "Le joueur s'est fait piquer par des abeilles en secouant un arbre : il a le visage tout gonflé.",
      witnesses: ['josette'],
    });
    return { ...next, npcs: { ...next.npcs, josette: { ...next.npcs.josette, intent: JOSETTE_MOCK } } };
  }
  const drops: Pickup[] = [];
  const n = outcome.kind === 'fruit' ? outcome.count : 1;
  for (let i = 0; i < n; i++) {
    const ang = 1.9 + i * 1.3;
    drops.push({ id: `t${next.day}-${tree}-${i}`, itemId: outcome.itemId, x: at.x + Math.cos(ang) * 0.9, z: at.z + Math.sin(ang) * 0.7 + 0.4 });
  }
  return { ...next, pickups: [...next.pickups, ...drops] };
}

export function rollFish(rng: Rng): FishOutcome {
  let r = rng();
  for (const [itemId, p] of FISH_TABLE) {
    if (r < p) return { itemId };
    r -= p;
  }
  return { itemId: 'bar-commun' };
}

export type Result = { ok: true; state: GameState } | { ok: false; message: string };

export function applyCatch(state: GameState, itemId: string): Result {
  const r = addItem(state, itemId, 1);
  if (!r.ok) return { ok: false, message: 'Ta sacoche est pleine, tu relâches ta prise.' };
  const legendary = itemId === 'poulpe-dore';
  const next = recordFact(r.state, {
    day: r.state.day, actor: 'player', target: null, kind: 'other',
    text: legendary ? 'Le joueur a pêché un POULPE DORÉ, une prise légendaire !' : `Le joueur a pêché : ${itemId}.`,
    witnesses: legendary ? ['marius', 'josette', 'gaston'] : ['marius'],
  });
  return { ok: true, state: next };
}

export const PEN_FOOD = ['pomme', 'figue', 'pomme-doree'] as const;

/** Nourrir le mouton-nuage : un fruit contre une laine dorée, une fois par jour. */
export function feedPen(state: GameState): Result {
  const a = activity(state);
  if (a.penFedDay === state.day) return { ok: false, message: 'Flocon est repu. Il digère en rêvassant.' };
  const food = PEN_FOOD.find((f) => state.player.inventory.some((s) => s.itemId === f));
  if (!food) return { ok: false, message: 'Flocon a faim… il lui faudrait un fruit.' };
  const eaten = removeItem(state, food, 1);
  if (!eaten.ok) return { ok: false, message: 'Impossible de sortir le fruit de ta sacoche.' };
  const wool = addItem(eaten.state, 'laine-doree', 1);
  if (!wool.ok) return { ok: false, message: 'Ta sacoche est pleine : pas de place pour la laine.' };
  return { ok: true, state: { ...wool.state, activity: { ...a, penFedDay: state.day } } };
}

/** Avant une nuit : un mouton pas nourri, ça fait jaser. */
export function neglectFact(state: GameState): GameState {
  const a = activity(state);
  if (state.day < 2 || a.penFedDay === state.day) return state;
  return recordFact(state, {
    day: state.day, actor: 'player', target: null, kind: 'other',
    text: "Le joueur a oublié de nourrir Flocon, son mouton-nuage, qui bêlait de faim toute la journée.",
    witnesses: ['josette'],
  });
}

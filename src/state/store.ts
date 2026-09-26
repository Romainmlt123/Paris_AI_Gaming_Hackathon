import { createInitialState } from './initial';
import type { GameState } from './types';

export const STORAGE_KEY = 'ragots.v1';

type Listener = (state: GameState, prev: GameState) => void;
type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (err) {
    console.warn('[store] localStorage inaccessible, pas de persistance :', err);
    return null;
  }
}

/** Contrôle minimal de forme : suffisant pour rejeter une sauvegarde d'une autre version ou abîmée. */
function looksLikeState(v: unknown): v is GameState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<GameState>;
  return s.version === 1 && typeof s.day === 'number' && typeof s.player === 'object' && s.player !== null
    && Array.isArray(s.player.inventory) && typeof s.npcs === 'object' && s.npcs !== null
    && Array.isArray(s.facts) && Array.isArray(s.rumors) && typeof s.decor === 'object';
}

export function loadState(storage: KeyValueStorage | null, now: number): GameState {
  if (!storage) return createInitialState(now);
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[store] lecture de la sauvegarde impossible, état initial :', err);
    return createInitialState(now);
  }
  if (raw === null) return createInitialState(now);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (looksLikeState(parsed)) return parsed;
    console.warn('[store] sauvegarde incompatible, état initial.');
  } catch (err) {
    console.warn('[store] sauvegarde corrompue (JSON invalide), état initial :', err);
  }
  return createInitialState(now);
}

function saveState(storage: KeyValueStorage | null, state: GameState): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[store] sauvegarde impossible (quota ou navigation privée) :', err);
  }
}

export interface Store {
  get(): GameState;
  /** Remplace l'état (ou le calcule depuis l'actuel), horodate lastSavedAt, persiste et notifie. */
  set(next: GameState | ((s: GameState) => GameState)): void;
  subscribe(fn: Listener): () => void;
  reset(): void;
}

export function createStore(storage: KeyValueStorage | null = defaultStorage(), clock: () => number = Date.now): Store {
  let state = loadState(storage, clock());
  const listeners = new Set<Listener>();

  const commit = (next: GameState) => {
    const prev = state;
    state = { ...next, lastSavedAt: clock() };
    saveState(storage, state);
    for (const fn of listeners) fn(state, prev);
  };

  return {
    get: () => state,
    set: (next) => commit(typeof next === 'function' ? next(state) : next),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    reset: () => {
      try {
        storage?.removeItem(STORAGE_KEY);
      } catch (err) {
        console.warn('[store] effacement de la sauvegarde impossible :', err);
      }
      commit(createInitialState(clock()));
    },
  };
}

/** Store unique du jeu. */
export const store: Store = createStore();

export function resetState(): void {
  store.reset();
}

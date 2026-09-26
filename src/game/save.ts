import { createInitialState } from '../../shared/state';
import { cleanName } from '../../shared/player';
import type { GameState } from '../../shared/types';

const KEY = 'ragots.save.v1';

export function loadState(): GameState {
  const raw = localStorage.getItem(KEY);
  if (!raw) return createInitialState();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && parsed.version === 1 && 'decor' in parsed) {
      const state = parsed as GameState;
      return { ...state, playerName: cleanName(state.playerName) };
    }
    console.warn('[save] incompatible save, starting fresh');
  } catch (err) {
    console.warn(`[save] corrupted save, starting fresh — ${err instanceof Error ? err.message : String(err)}`);
  }
  return createInitialState();
}

export function saveState(state: GameState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function resetSave(): void {
  localStorage.removeItem(KEY);
}

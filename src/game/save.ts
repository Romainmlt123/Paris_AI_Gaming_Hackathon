import { createInitialState } from '../../shared/state';
import { cleanIsland, cleanLook, cleanName } from '../../shared/player';
import type { GameState } from '../../shared/types';

const KEY = 'ragots.save.v1';
export const TIPS_KEY = 'ragots.tips';

export function loadState(): GameState {
  const raw = localStorage.getItem(KEY);
  if (!raw) return createInitialState();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && parsed.version === 1 && 'decor' in parsed) {
      const save = parsed as Partial<GameState>;
      const fresh = createInitialState();
      const outfit = typeof save.outfit === 'object' && save.outfit !== null ? save.outfit : fresh.outfit;
      return { ...fresh, ...save, outfit, initiatives: save.initiatives ?? {}, playerName: cleanName(save.playerName), islandName: cleanIsland(save.islandName), look: cleanLook(save.look) };
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
  localStorage.removeItem(TIPS_KEY);
}

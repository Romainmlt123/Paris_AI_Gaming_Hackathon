import { describe, expect, it, vi } from 'vitest';
import { createStore, STORAGE_KEY } from './store';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe('store', () => {
  it('JSON corrompu → warn + état initial', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const st = createStore(memoryStorage({ [STORAGE_KEY]: '{oups' }), () => 5);
    expect(st.get().day).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('persiste, notifie, recharge, reset', () => {
    const storage = memoryStorage();
    const st = createStore(storage, () => 99);
    const seen: number[] = [];
    const off = st.subscribe((s) => seen.push(s.player.bells));
    st.set((s) => ({ ...s, player: { ...s.player, bells: 777 } }));
    off();
    st.set((s) => ({ ...s, player: { ...s.player, bells: 1 } }));
    expect(seen).toEqual([777]);
    const reloaded = createStore(storage, () => 100);
    expect(reloaded.get().player.bells).toBe(1);
    expect(reloaded.get().lastSavedAt).toBe(99);
    reloaded.reset();
    expect(reloaded.get().player.bells).toBe(500);
  });
});

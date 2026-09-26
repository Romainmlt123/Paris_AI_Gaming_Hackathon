import { describe, expect, it } from 'vitest';
import { findPath, generateMap, isWalkable, kindAt, PONTOON_X } from './map';

describe('island map', () => {
  const map = generateMap();
  it('has a pontoon and walkable homes', () => {
    expect(map.kinds.filter((k) => k === 'pontoon').length).toBeGreaterThanOrEqual(3);
    for (const t of [{ x: 5, z: 18 }, { x: 17, z: 18 }, { x: 11, z: 19 }]) expect(isWalkable(map, t.x, t.z)).toBe(true);
  });
  it('reaches the plateau only through the stairs', () => {
    const path = findPath(map, { x: 11, z: 19 }, { x: 12, z: 9 });
    expect(path).not.toBeNull();
    expect(path!.some((t) => kindAt(map, t.x, t.z) === 'stairs')).toBe(true);
  });
  it('reaches the end of the pontoon', () => {
    let end = 0;
    for (let z = 0; z < map.h; z++) if (kindAt(map, PONTOON_X, z) === 'pontoon') end = z;
    expect(findPath(map, { x: 11, z: 19 }, { x: PONTOON_X, z: end })).not.toBeNull();
  });
});

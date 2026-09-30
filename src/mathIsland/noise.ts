import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { rng } from './textures';

export interface Noise {
  n2(x: number, y: number): number;
  n3(x: number, y: number, z: number): number;
  fbm2(x: number, y: number, octaves?: number): number;
  fbm3(x: number, y: number, z: number, octaves?: number): number;
}

/** Seeded simplex noise with fractal helpers; outputs roughly in [-1, 1]. */
export function makeNoise(seed: number): Noise {
  const simplex = new SimplexNoise({ random: rng(seed) });
  const n2 = (x: number, y: number): number => simplex.noise(x, y);
  const n3 = (x: number, y: number, z: number): number => simplex.noise3d(x, y, z);
  return {
    n2,
    n3,
    fbm2(x, y, octaves = 4) {
      let sum = 0;
      let amp = 0.5;
      let f = 1;
      for (let i = 0; i < octaves; i++) {
        sum += amp * n2(x * f, y * f);
        f *= 2.03;
        amp *= 0.5;
      }
      return sum * 1.9;
    },
    fbm3(x, y, z, octaves = 4) {
      let sum = 0;
      let amp = 0.5;
      let f = 1;
      for (let i = 0; i < octaves; i++) {
        sum += amp * n3(x * f, y * f, z * f);
        f *= 2.03;
        amp *= 0.5;
      }
      return sum * 1.9;
    },
  };
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Seamlessly tiling fBm value noise in [0, 1], `size`² samples.
 * Lattice coordinates wrap at `period` per octave so the result tiles.
 */
export function tileNoise(size: number, period: number, octaves: number, seed: number): Float32Array {
  const rand = rng(seed);
  const out = new Float32Array(size * size);
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const p = period << o;
    const lattice = new Float32Array(p * p);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * p;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % p) * p;
      const r1 = ((y0 + 1) % p) * p;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * p;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % p;
        const c1 = (x0 + 1) % p;
        const top = lattice[r0 + c0] + (lattice[r0 + c1] - lattice[r0 + c0]) * sx;
        const bot = lattice[r1 + c0] + (lattice[r1 + c1] - lattice[r1 + c0]) * sx;
        out[y * size + x] += amp * (top + (bot - top) * sy);
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

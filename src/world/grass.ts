import * as THREE from 'three';
import { GRASS_Y, HILL_Y, groundHeight, onHill, shoreDistance, worldUniforms } from './island';
import { SLOT_POSITIONS, colliders, onPier, pathStones } from './props';
import { seeded } from './textures';
import type { Quality } from './scene';

// Herbe dense et douce : touffes de brins instanciées, découpées en tuiles (culling),
// vent en vagues qui traversent l'île, brins qui se couchent au passage des personnages.

const BLADES_PER_CLUMP = 6;
const TILE = 5; // taille d'une tuile en unités monde
export const MAX_PUSHERS = 4;

export const grassUniforms = {
  uPush: { value: Array.from({ length: MAX_PUSHERS }, () => new THREE.Vector2(999, 999)) },
};

/** Une touffe = plusieurs brins effilés (2 segments, 3 triangles), orientés au hasard. */
function clumpGeometry(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed);
  const pos: number[] = [];
  const tval: number[] = [];
  const idx: number[] = [];
  for (let b = 0; b < BLADES_PER_CLUMP; b++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 0.16;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const yaw = rnd() * Math.PI;
    const w = 0.05 + rnd() * 0.03;
    const h = 0.65 + rnd() * 0.45;
    const lean = 0.08 + rnd() * 0.18; // courbure naturelle
    const dx = Math.cos(yaw);
    const dz = Math.sin(yaw);
    const lx = -dz * lean;
    const lz = dx * lean;
    const base = pos.length / 3;
    const push = (x: number, y: number, z: number, t: number): void => {
      pos.push(x, y, z);
      tval.push(t);
    };
    push(cx - dx * w, 0, cz - dz * w, 0);
    push(cx + dx * w, 0, cz + dz * w, 0);
    push(cx - dx * w * 0.6 + lx * 0.35, h * 0.55, cz - dz * w * 0.6 + lz * 0.35, 0.55);
    push(cx + dx * w * 0.6 + lx * 0.35, h * 0.55, cz + dz * w * 0.6 + lz * 0.35, 0.55);
    push(cx + lx, h, cz + lz, 1);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(tval, 1));
  // Normales vers le haut : éclairage doux et uniforme, pas de facettes.
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  return geo;
}

function grassMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.uniforms.uPush = grassUniforms.uPush;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aT;
        uniform float uTime;
        uniform vec2 uPush[${MAX_PUSHERS}];
        varying float vT;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vT = aT;
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          vec2 scl = vec2(instanceMatrix[0][0], instanceMatrix[2][2]);
          float sy = instanceMatrix[1][1];
          float t2 = aT * aT;
          // Vagues de vent qui traversent l'île + frémissement rapide.
          float wave = sin(dot(ip.xz, vec2(0.42, 0.27)) - uTime * 1.9) * 0.5 + 0.5;
          float gust = sin(dot(ip.xz, vec2(0.11, -0.07)) - uTime * 0.6) * 0.5 + 0.5;
          float flutter = sin(uTime * 7.0 + ip.x * 3.7 + ip.z * 2.3 + position.x * 20.0) * 0.05;
          float bend = (0.12 + wave * 0.35 * (0.5 + gust) + flutter) * t2;
          vec2 dir = normalize(vec2(0.85, 0.35));
          vec2 off = dir * bend;
          // Les brins s'écartent et se couchent autour des personnages.
          for (int i = 0; i < ${MAX_PUSHERS}; i++) {
            vec2 d = ip.xz + transformed.xz * scl - uPush[i];
            float dist = length(d);
            float f = 1.0 - smoothstep(0.15, 0.75, dist);
            off += (d / max(dist, 0.001)) * f * 0.45 * aT;
            transformed.y *= 1.0 - f * 0.55 * aT;
          }
          // Décalage exprimé en unités monde (les instances ne sont pas tournées).
          transformed.xz += off / scl;
          transformed.y -= length(off) * 0.35 * aT / max(sy, 0.001);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vT;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Dégradé racine sombre → pointe claire et dorée (lumière de fin de journée).
        vec3 root = vec3(0.07, 0.17, 0.06);
        vec3 mid = vec3(0.20, 0.42, 0.13);
        vec3 tip = vec3(0.46, 0.70, 0.26);
        vec3 g = vT < 0.55 ? mix(root, mid, vT / 0.55) : mix(mid, tip, (vT - 0.55) / 0.45);
        diffuseColor.rgb *= g;`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // Translucidité : les pointes captent la lumière rasante.
        reflectedLight.indirectDiffuse += diffuseColor.rgb * vT * vT * 0.25;`,
      );
  };
  return mat;
}

function blocked(x: number, z: number): boolean {
  if (colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r * 0.75)) return true;
  if (pathStones.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 0.42)) return true;
  if (Object.values(SLOT_POSITIONS).some((p) => Math.hypot(p.x - x, p.z - z) < 0.85)) return true;
  return onPier(x, z);
}

export function buildGrass(scene: THREE.Scene, quality: Quality): void {
  const density = quality === 'high' ? 26 : quality === 'medium' ? 16 : 8; // touffes par unité²
  const rnd = seeded(77);
  const variants = [clumpGeometry(1), clumpGeometry(2)];
  const mat = grassMaterial();
  const tiles = new Map<string, { m: THREE.Matrix4[]; c: THREE.Color[] }[]>();
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  const q = new THREE.Quaternion();
  let total = 0;
  for (let gx = -12; gx < 12; gx += 1 / Math.sqrt(density)) {
    for (let gz = -12; gz < 12; gz += 1 / Math.sqrt(density)) {
      const x = gx + (rnd() - 0.5) * 0.3;
      const z = gz + (rnd() - 0.5) * 0.3;
      const hill = onHill(x, z);
      const y = hill ? HILL_Y : groundHeight(x, z);
      if (!hill && (y < GRASS_Y - 0.02 || shoreDistance(x, z) > -1.2)) continue;
      if (blocked(x, z)) continue;
      // Clairières naturelles : densité modulée par un bruit grossier.
      const patch = Math.sin(x * 0.7 + 1.3) * Math.sin(z * 0.9 - 0.4);
      if (patch > 0.55 && rnd() < 0.7) continue;
      const s = 0.32 + rnd() * 0.22 + Math.max(0, patch) * 0.1;
      const flip = rnd() < 0.5 ? -1 : 1;
      m.compose(new THREE.Vector3(x, y - 0.02, z), q, new THREE.Vector3(s * flip, s * (0.85 + rnd() * 0.4), s));
      col.setHSL(0.26 + (rnd() - 0.5) * 0.06, 0.55, 0.42 + rnd() * 0.16).multiplyScalar(2.0);
      const key = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
      let tile = tiles.get(key);
      if (!tile) {
        tile = variants.map(() => ({ m: [], c: [] }));
        tiles.set(key, tile);
      }
      const v = tile[Math.floor(rnd() * variants.length)]!;
      v.m.push(m.clone());
      v.c.push(col.clone());
      total++;
    }
  }
  for (const tile of tiles.values()) {
    tile.forEach((v, i) => {
      if (v.m.length === 0) return;
      const im = new THREE.InstancedMesh(variants[i]!, mat, v.m.length);
      v.m.forEach((mm, k) => {
        im.setMatrixAt(k, mm);
        im.setColorAt(k, v.c[k]!);
      });
      im.computeBoundingSphere();
      im.receiveShadow = true;
      scene.add(im);
    });
  }
  console.info(`[grass] ${total} touffes (${total * BLADES_PER_CLUMP} brins), ${tiles.size} tuiles`);
}

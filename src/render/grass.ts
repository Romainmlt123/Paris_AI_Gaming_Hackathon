import * as THREE from 'three';
import type { TileMap } from '../game/map';
import { kindAt, surfaceHeight } from '../game/map';
import { mulberry32, type Rng } from '../../shared/rng';
import { P } from './textures';
import type { Quality } from './stage';

const BLADES = 7;
const PASSES = 14;
export const GRASS_PASSES: Record<Quality, number> = { low: 3, mid: 7, high: PASSES };

/** One tuft: a few tapered blades with a root→tip colour gradient. Normals point up for soft, even lighting. */
function tuftGeometry(rng: Rng): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const root = new THREE.Color(P.grass).lerp(new THREE.Color(P.grassDark), 0.9);
  for (let i = 0; i < BLADES; i++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * 0.12;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const h = 0.1 + rng() * 0.14;
    const w = 0.026 + rng() * 0.014;
    const lean = (rng() - 0.5) * 0.12;
    const ang = rng() * Math.PI;
    const dx = Math.cos(ang) * w;
    const dz = Math.sin(ang) * w;
    const tx = bx + lean;
    const tz = bz + lean * 0.5;
    // Both windings, single-sided: keeps the upward normal on each face (DoubleSide would flip it and darken back faces).
    pos.push(bx - dx, 0, bz - dz, bx + dx, 0, bz + dz, tx, h, tz, bx + dx, 0, bz + dz, bx - dx, 0, bz - dz, tx, h, tz);
    const tip = new THREE.Color(rng() < 0.5 ? P.grassLight : P.grass).lerp(new THREE.Color('#eef5a8'), 0.25 + rng() * 0.35);
    for (let k = 0; k < 2; k++) col.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const normals = new Float32Array(pos.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geo;
}

export interface GrassField {
  mesh: THREE.InstancedMesh;
  setQuality(q: Quality): void;
  update(time: number): void;
}

function grassMaterial(uTime: { value: number }): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = uTime;
    shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float tipW = clamp(position.y / 0.3, 0.0, 1.0);
      vec3 ip = instanceMatrix[3].xyz;
      float gust = sin(uTime * 1.7 + ip.x * 0.6 + ip.z * 0.4) * 0.6 + sin(uTime * 3.3 + ip.x * 1.7 - ip.z) * 0.25;
      transformed.x += gust * 0.07 * tipW * tipW;
      transformed.z += gust * 0.03 * tipW * tipW;`,
    );
  };
  return mat;
}

/** Instanced animated grass blades over grass tiles; density follows the quality level. */
export function createGrass(map: TileMap): GrassField {
  const rng = mulberry32(21);
  const tiles: { x: number; z: number; y: number }[] = [];
  for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) {
    const k = kindAt(map, x, z);
    if ((k === 'grass' || k === 'plateau') && !map.blocked[z * map.w + x]) tiles.push({ x, z, y: surfaceHeight(k) });
  }
  const uTime = { value: 0 };
  const mesh = new THREE.InstancedMesh(tuftGeometry(rng), grassMaterial(uTime), tiles.length * PASSES);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let i = 0;
  for (let pass = 0; pass < PASSES; pass++) {
    for (const t of tiles) {
      p.set(t.x + (rng() - 0.5), t.y, t.z + (rng() - 0.5));
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      s.setScalar(0.8 + rng() * 0.6);
      mesh.setMatrixAt(i++, m.compose(p, q, s));
    }
  }
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return {
    mesh,
    setQuality(quality) {
      mesh.count = tiles.length * GRASS_PASSES[quality];
    },
    update(time) {
      uTime.value = time;
    },
  };
}

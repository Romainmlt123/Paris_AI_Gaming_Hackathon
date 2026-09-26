import * as THREE from 'three';
import type { TileMap } from '../game/map';
import { kindAt, surfaceHeight } from '../game/map';
import { mulberry32 } from '../../shared/rng';
import { P } from './textures';

export interface Swaying {
  object: THREE.Object3D;
  phase: number;
}

function leafMaterial(c: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: c, flatShading: true });
}

export function createTrees(map: TileMap): { group: THREE.Group; sway: Swaying[] } {
  const group = new THREE.Group();
  const sway: Swaying[] = [];
  const rng = mulberry32(3);
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.15, 0.9, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: P.trunk });
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const leaves = [leafMaterial(P.leaf), leafMaterial(P.leafLight), leafMaterial(P.leafDark)];
  const fruitMat = new THREE.MeshLambertMaterial({ color: '#e0443a' });
  const fruitGeo = new THREE.SphereGeometry(0.07, 6, 4);
  for (const t of map.trees) {
    const tree = new THREE.Group();
    const y = surfaceHeight(kindAt(map, t.x, t.z));
    tree.position.set(t.x + (rng() - 0.5) * 0.3, y, t.z + (rng() - 0.5) * 0.3);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.45;
    trunk.castShadow = true;
    tree.add(trunk);
    const crown = new THREE.Group();
    crown.position.y = 0.9;
    const scale = 0.8 + rng() * 0.35;
    const parts: [number, number, number, number, number][] = [
      [0, 0.45, 0, 0.62, 0],
      [-0.28, 0.25, 0.12, 0.42, 1],
      [0.3, 0.3, -0.05, 0.45, 2],
      [0.05, 0.85, 0.02, 0.4, 1],
    ];
    for (const [x, py, z, r, mi] of parts) {
      const m = new THREE.Mesh(blob, leaves[mi] ?? leaves[0]);
      m.position.set(x * scale, py * scale, z * scale);
      m.scale.setScalar(r * scale);
      m.castShadow = true;
      m.receiveShadow = true;
      crown.add(m);
    }
    if (rng() < 0.4) {
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(fruitGeo, fruitMat);
        const a = rng() * Math.PI * 2;
        f.position.set(Math.cos(a) * 0.55 * scale, (0.3 + rng() * 0.4) * scale, Math.sin(a) * 0.55 * scale);
        crown.add(f);
      }
    }
    tree.add(crown);
    sway.push({ object: crown, phase: rng() * Math.PI * 2 });
    group.add(tree);
  }
  return { group, sway };
}

export function createRocks(map: TileMap): THREE.Group {
  const group = new THREE.Group();
  const rng = mulberry32(5);
  const geo = new THREE.DodecahedronGeometry(0.35, 0);
  const mat = new THREE.MeshLambertMaterial({ color: P.cliff, flatShading: true });
  for (const t of map.rocks) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(t.x, surfaceHeight(kindAt(map, t.x, t.z)) + 0.1, t.z);
    m.scale.set(1 + rng() * 0.4, 0.6 + rng() * 0.3, 1 + rng() * 0.3);
    m.rotation.y = rng() * Math.PI;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

/** Flowers and grass tufts in two instanced meshes. */
export function createFlowers(map: TileMap): THREE.Group {
  const group = new THREE.Group();
  const rng = mulberry32(9);
  const colors = [P.flowerPink, P.flowerWhite, P.flowerYellow];
  const petal = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const stems = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.18, 0.03), new THREE.MeshLambertMaterial({ color: P.grassDark }), map.flowers.length * 3);
  const heads = new THREE.InstancedMesh(petal, new THREE.MeshLambertMaterial({ color: '#ffffff' }), map.flowers.length * 3);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  let i = 0;
  for (const t of map.flowers) {
    const y = surfaceHeight(kindAt(map, t.x, t.z));
    const base = colors[Math.floor(rng() * colors.length)] ?? P.flowerPink;
    for (let k = 0; k < 3; k++) {
      const x = t.x + (rng() - 0.5) * 0.7;
      const z = t.z + (rng() - 0.5) * 0.7;
      m.makeTranslation(x, y + 0.09, z);
      stems.setMatrixAt(i, m);
      m.makeTranslation(x, y + 0.2, z);
      heads.setMatrixAt(i, m);
      heads.setColorAt(i, c.set(base));
      i++;
    }
  }
  heads.castShadow = true;
  group.add(stems, heads);

  const tuftGeo = new THREE.ConeGeometry(0.06, 0.22, 3);
  const grassTiles: { x: number; z: number; y: number }[] = [];
  for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) {
    const k = kindAt(map, x, z);
    if (k === 'grass' || k === 'plateau') grassTiles.push({ x, z, y: surfaceHeight(k) });
  }
  const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshLambertMaterial({ color: P.grassLight }), grassTiles.length * 2);
  let j = 0;
  for (const t of grassTiles) {
    for (let k = 0; k < 2; k++) {
      m.makeTranslation(t.x + (rng() - 0.5) * 0.9, t.y + 0.1, t.z + (rng() - 0.5) * 0.9);
      tufts.setMatrixAt(j++, m);
    }
  }
  group.add(tufts);
  return group;
}

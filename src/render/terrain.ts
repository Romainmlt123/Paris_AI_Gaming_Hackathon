import * as THREE from 'three';
import type { TileKind, TileMap } from '../game/map';
import { kindAt, surfaceHeight } from '../game/map';
import { cliffSide, dirtSide, grassTop, pathTop, planks, sandTex, stoneWall } from './textures';

const BASE = -0.9;
const SLAB = 0.3;

interface Materials {
  top: Record<Exclude<TileKind, 'water'>, THREE.Material>;
  lip: Record<Exclude<TileKind, 'water'>, THREE.Material>;
  column: Record<Exclude<TileKind, 'water'>, THREE.Material>;
}

function lambert(map: THREE.Texture): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map });
}

function buildMaterials(): Materials {
  const grass = lambert(grassTop());
  const path = lambert(pathTop());
  const sand = lambert(sandTex());
  const wood = lambert(planks());
  const stone = lambert(stoneWall());
  const lip = lambert(dirtSide());
  const cliff = lambert(cliffSide());
  const dirtPlain = new THREE.MeshLambertMaterial({ color: '#8f6444' });
  const sandSide = new THREE.MeshLambertMaterial({ color: '#dcc38c' });
  return {
    top: { grass, path, sand, plateau: grass, stairs: stone, pontoon: wood },
    lip: { grass: lip, path: lip, sand, plateau: lip, stairs: stone, pontoon: wood },
    column: { grass: dirtPlain, path: dirtPlain, sand: sandSide, plateau: cliff, stairs: stone, pontoon: wood },
  };
}

/** Box whose materials are [side × 4, top, bottom] via groups (+x,-x,+y,-y,+z,-z). */
function box(h: number, topMat: THREE.Material, sideMat: THREE.Material): { geo: THREE.BoxGeometry; mats: THREE.Material[] } {
  const geo = new THREE.BoxGeometry(1, h, 1);
  return { geo, mats: [sideMat, sideMat, topMat, sideMat, sideMat, sideMat] };
}

export interface Terrain {
  group: THREE.Group;
  /** Meshes to raycast for tap-to-move, with instance → tile lookup. */
  pickables: THREE.InstancedMesh[];
  tileOf(mesh: THREE.Object3D, instanceId: number): { x: number; z: number } | null;
}

function instanced(geo: THREE.BufferGeometry, mats: THREE.Material | THREE.Material[], tiles: { x: number; z: number; y: number }[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mats, tiles.length);
  const m = new THREE.Matrix4();
  tiles.forEach((t, i) => {
    m.makeTranslation(t.x, t.y, t.z);
    mesh.setMatrixAt(i, m);
  });
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

export function createTerrain(map: TileMap): Terrain {
  const mats = buildMaterials();
  const group = new THREE.Group();
  const byKind = new Map<Exclude<TileKind, 'water'>, { x: number; z: number; y: number }[]>();
  for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) {
    const kind = kindAt(map, x, z);
    if (kind === 'water') continue;
    const list = byKind.get(kind) ?? [];
    list.push({ x, z, y: 0 });
    byKind.set(kind, list);
  }
  const pickables: THREE.InstancedMesh[] = [];
  const lookup = new Map<THREE.Object3D, { x: number; z: number }[]>();
  for (const [kind, tiles] of byKind) {
    const top = surfaceHeight(kind);
    if (kind === 'pontoon') {
      group.add(pontoon(tiles, mats.top.pontoon));
      const deck = box(0.12, mats.top.pontoon, mats.lip.pontoon);
      const mesh = instanced(deck.geo, deck.mats, tiles.map((t) => ({ ...t, y: top - 0.06 })));
      group.add(mesh);
      pickables.push(mesh);
      lookup.set(mesh, tiles);
      continue;
    }
    const slab = box(SLAB, mats.top[kind], mats.lip[kind]);
    const slabMesh = instanced(slab.geo, slab.mats, tiles.map((t) => ({ ...t, y: top - SLAB / 2 })));
    group.add(slabMesh);
    pickables.push(slabMesh);
    lookup.set(slabMesh, tiles);
    const colH = top - SLAB - BASE;
    if (colH > 0.01) {
      const col = new THREE.BoxGeometry(1, colH, 1);
      scaleSideUv(col, colH);
      const colMesh = instanced(col, mats.column[kind], tiles.map((t) => ({ ...t, y: BASE + colH / 2 })));
      colMesh.castShadow = false;
      group.add(colMesh);
    }
  }
  return {
    group,
    pickables,
    tileOf(mesh, instanceId) {
      return lookup.get(mesh)?.[instanceId] ?? null;
    },
  };
}

/** Repeat side textures per world unit instead of stretching them. */
function scaleSideUv(geo: THREE.BoxGeometry, h: number): void {
  const uv = geo.getAttribute('uv');
  if (!(uv instanceof THREE.BufferAttribute)) return;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * h);
  uv.needsUpdate = true;
}

function pontoon(tiles: { x: number; z: number }[], mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const post = new THREE.CylinderGeometry(0.07, 0.07, 1.4, 6);
  for (const t of tiles) {
    for (const dx of [-0.42, 0.42]) {
      const m = new THREE.Mesh(post, mat);
      m.position.set(t.x + dx, -0.4, t.z);
      m.castShadow = true;
      g.add(m);
    }
  }
  return g;
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { TileMap } from '../game/map';
import { kindAt, surfaceHeight } from '../game/map';
import { mulberry32 } from '../../shared/rng';
import { P } from './textures';

export interface Swaying {
  object: THREE.Object3D;
  phase: number;
}

/** Canvas of overlapping painted leaves with alpha; soft (linear) filtering to contrast with the crisp sprites. */
function leafCardTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const rng = mulberry32(17);
  const shades = ['#2f6b3c', '#3f8544', '#4f9c4b', '#6bb556', '#8cca5e'];
  for (let i = 0; i < 220; i++) {
    const r = Math.sqrt(rng()) * 54;
    const a = rng() * Math.PI * 2;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    const t = 1 - r / 60;
    const shade = shades[Math.min(shades.length - 1, Math.floor(t * 2.2 + rng() * 2.6))] ?? '#4f9c4b';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rng() * Math.PI * 2);
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7 + rng() * 4, 3.2 + rng() * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,220,0.18)';
    ctx.fillRect(-5, -1, 8, 1);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A crown made of leaf cards scattered on a sphere, normals pointing outward for soft round lighting. */
function crownGeometry(rng: () => number, cards: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const dir = new THREE.Vector3();
  const obj = new THREE.Object3D();
  for (let i = 0; i < cards; i++) {
    const u = rng() * 2 - 1;
    const a = rng() * Math.PI * 2;
    dir.set(Math.sqrt(1 - u * u) * Math.cos(a), u * 0.8 + 0.1, Math.sqrt(1 - u * u) * Math.sin(a)).normalize();
    const size = 0.7 + rng() * 0.35;
    const g = new THREE.PlaneGeometry(size, size);
    obj.position.copy(dir).multiplyScalar(0.62);
    obj.lookAt(dir.clone().multiplyScalar(2));
    obj.rotateZ(rng() * Math.PI * 2);
    obj.updateMatrix();
    g.applyMatrix4(obj.matrix);
    const n = g.getAttribute('normal');
    for (let k = 0; k < n.count; k++) n.setXYZ(k, dir.x, dir.y, dir.z);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

function foliageKit(): { geos: THREE.BufferGeometry[]; mats: THREE.MeshLambertMaterial[]; depth: THREE.MeshDepthMaterial; core: THREE.Mesh } {
  const rng = mulberry32(3);
  const tex = leafCardTexture();
  const geos = [crownGeometry(rng, 26), crownGeometry(rng, 22), crownGeometry(rng, 30)];
  const mats = ['#ffffff', '#e8f3d4', '#d4e8c4'].map((color) => new THREE.MeshLambertMaterial({ map: tex, color, alphaTest: 0.5, side: THREE.DoubleSide }));
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshLambertMaterial({ color: '#2a5e33' }));
  return { geos, mats, depth, core };
}

function crownMesh(kit: ReturnType<typeof foliageKit>, i: number): THREE.Group {
  const g = new THREE.Group();
  const leaves = new THREE.Mesh(kit.geos[i % kit.geos.length], kit.mats[i % kit.mats.length]);
  leaves.customDepthMaterial = kit.depth;
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  g.add(kit.core.clone(), leaves);
  return g;
}

export function createTrees(map: TileMap): { group: THREE.Group; sway: Swaying[] } {
  const group = new THREE.Group();
  const sway: Swaying[] = [];
  const rng = mulberry32(3);
  const kit = foliageKit();
  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.16, 1.1, 7);
  const trunkMat = new THREE.MeshLambertMaterial({ color: P.trunk });
  const fruitMat = new THREE.MeshLambertMaterial({ color: '#e0443a' });
  const fruitGeo = new THREE.SphereGeometry(0.07, 8, 6);
  map.trees.forEach((t, idx) => {
    const tree = new THREE.Group();
    const y = surfaceHeight(kindAt(map, t.x, t.z));
    tree.position.set(t.x + (rng() - 0.5) * 0.3, y, t.z + (rng() - 0.5) * 0.3);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.55;
    trunk.castShadow = true;
    tree.add(trunk);
    const crown = new THREE.Group();
    crown.position.y = 1.25;
    const scale = 0.85 + rng() * 0.3;
    const main = crownMesh(kit, idx);
    main.scale.setScalar(scale);
    const top = crownMesh(kit, idx + 1);
    top.scale.setScalar(scale * 0.7);
    top.position.set((rng() - 0.5) * 0.3, 0.55 * scale, (rng() - 0.5) * 0.2);
    crown.add(main, top);
    if (rng() < 0.4) {
      for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(fruitGeo, fruitMat);
        const a = rng() * Math.PI * 2;
        f.position.set(Math.cos(a) * 0.62 * scale, (rng() - 0.3) * 0.5 * scale, Math.sin(a) * 0.62 * scale);
        crown.add(f);
      }
    }
    tree.add(crown);
    sway.push({ object: crown, phase: rng() * Math.PI * 2 });
    group.add(tree);
  });
  return { group, sway };
}

/** Low leafy bushes along the island's edges and cliffs. */
export function createBushes(map: TileMap): THREE.Group {
  const group = new THREE.Group();
  const rng = mulberry32(8);
  const kit = foliageKit();
  for (const { x, z } of map.bushes) {
    const k = kindAt(map, x, z);
    const b = crownMesh(kit, x + z);
    b.scale.set(0.55 + rng() * 0.2, 0.42 + rng() * 0.12, 0.55 + rng() * 0.2);
    b.position.set(x + (rng() - 0.5) * 0.3, surfaceHeight(k) + 0.2, z + (rng() - 0.5) * 0.3);
    b.rotation.y = rng() * Math.PI;
    group.add(b);
  }
  return group;
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

/** Flowers as instanced stems and heads. */
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

  return group;
}

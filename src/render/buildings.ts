import * as THREE from 'three';
import type { Building, BuildingId, TileMap } from '../game/map';
import { kindAt, surfaceHeight } from '../game/map';
import { awning, P, planks, plaster, roofTiles, signTexture, stoneWall } from './textures';

interface Style {
  wall: () => THREE.Texture;
  roof: string;
  height: number;
  sign?: 'bread' | 'fish' | 'coin' | 'flag';
  awning?: boolean;
}

const STYLES: Record<BuildingId, Style> = {
  mairie: { wall: stoneWall, roof: P.roofBrown, height: 1.6, sign: 'flag' },
  boulangerie: { wall: () => plaster(P.plasterPink), roof: P.roofRed, height: 1.3, sign: 'bread', awning: true },
  echoppe: { wall: () => plaster(P.plaster), roof: P.roofBlue, height: 1.3, sign: 'coin', awning: true },
  cabane: { wall: planks, roof: P.roofGreen, height: 1.1, sign: 'fish' },
  maison: { wall: () => plaster(P.plaster), roof: P.roofRed, height: 1.1 },
};

function repeat(tex: THREE.Texture, x: number, y: number): THREE.Texture {
  const t = tex.clone();
  t.repeat.set(x, y);
  t.needsUpdate = true;
  return t;
}

/** Gable roof as a triangular prism along X, with overhang. */
function roof(w: number, d: number, color: string): THREE.Mesh {
  const h = d * 0.45;
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - 0.15, 0);
  shape.lineTo(0, h);
  shape.lineTo(d / 2 + 0.15, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w + 0.3, bevelEnabled: false });
  geo.translate(0, 0, -(w + 0.3) / 2);
  geo.rotateY(Math.PI / 2);
  const tex = roofTiles(color);
  tex.rotation = Math.PI / 2;
  tex.repeat.set(0.9, 0.9);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function windowMesh(): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ color: P.window, emissive: P.window, emissiveIntensity: 0.9 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.05), mat);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.38, 0.03), new THREE.MeshLambertMaterial({ color: P.plankDark }));
  frame.position.z = -0.015;
  m.add(frame);
  return m;
}

function door(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.62, 0.06), new THREE.MeshLambertMaterial({ color: P.plankDark }));
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshLambertMaterial({ color: '#f2c14e' }));
  knob.position.set(0.12, -0.02, 0.04);
  m.add(knob);
  return m;
}

function awningMesh(w: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w * 0.8, 0.05, 0.55);
  const tex = awning();
  tex.repeat.set(w * 0.8, 1);
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  m.rotation.x = 0.35;
  m.castShadow = true;
  return m;
}

function signMesh(icon: NonNullable<Style['sign']>): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.05), new THREE.MeshLambertMaterial({ map: signTexture(icon) }));
  m.castShadow = true;
  return m;
}

const CHIMNEY: readonly BuildingId[] = ['boulangerie', 'cabane', 'maison'];

/** Chimney position in building-local space (smoke comes out of its top). */
function chimneySpot(b: Building): THREE.Vector3 {
  const style = STYLES[b.id];
  const w = b.w - 0.2;
  const d = b.d - 0.25;
  return new THREE.Vector3(w / 2 - 0.35, style.height + d * 0.45 * 0.5 + 0.3, -d / 4);
}

function buildingOrigin(b: Building, groundY: number): THREE.Vector3 {
  return new THREE.Vector3(b.x + (b.w - 1) / 2, groundY, b.z + (b.d - 1) / 2);
}

/** World positions of chimney tops, for the smoke puffs. */
export function chimneyTops(map: TileMap): THREE.Vector3[] {
  return map.buildings.filter((b) => CHIMNEY.includes(b.id)).map((b) => chimneySpot(b).add(buildingOrigin(b, surfaceHeight(kindAt(map, b.x, b.z)))));
}

function buildingMesh(b: Building, groundY: number): THREE.Group {
  const style = STYLES[b.id];
  const g = new THREE.Group();
  const w = b.w - 0.2;
  const d = b.d - 0.25;
  const wallTex = repeat(style.wall(), w, style.height);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, style.height, d), new THREE.MeshLambertMaterial({ map: wallTex }));
  walls.position.y = style.height / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  g.add(walls);
  const r = roof(w, d, style.roof);
  r.position.y = style.height;
  g.add(r);
  const front = d / 2 + 0.03;
  const dr = door();
  dr.position.set(0, 0.31, front);
  g.add(dr);
  const winCount = Math.max(1, Math.floor(w / 1.3));
  for (let i = 0; i < winCount; i++) {
    for (const side of [-1, 1]) {
      const wm = windowMesh();
      wm.position.set(side * (0.45 + i * 0.7), style.height * 0.55, front);
      if (Math.abs(wm.position.x) < w / 2 - 0.15) g.add(wm);
    }
  }
  if (style.awning) {
    const a = awningMesh(w);
    a.position.set(0, style.height * 0.78, front + 0.25);
    g.add(a);
  }
  if (style.sign) {
    const s = signMesh(style.sign);
    s.position.set(-w / 2 + 0.3, style.height + 0.05, front + 0.05);
    g.add(s);
  }
  if (b.id === 'mairie') g.add(flagPole(w, style.height));
  if (CHIMNEY.includes(b.id)) {
    const top = chimneySpot(b);
    const h = 0.75;
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.24, h, 0.24), new THREE.MeshLambertMaterial({ map: stoneWall() }));
    c.position.set(top.x, top.y - h / 2, top.z);
    c.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.3), new THREE.MeshLambertMaterial({ color: P.plankDark }));
    cap.position.set(top.x, top.y, top.z);
    g.add(c, cap);
  }
  g.position.copy(buildingOrigin(b, groundY));
  g.userData['building'] = b.id;
  return g;
}

function flagPole(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), new THREE.MeshLambertMaterial({ color: '#e8e2d6' }));
  pole.position.set(w / 2 - 0.2, h + 0.9, 0);
  pole.castShadow = true;
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.28, 0.02), new THREE.MeshLambertMaterial({ color: P.awningB }));
  flag.position.set(w / 2 + 0.03, h + 1.33, 0);
  flag.castShadow = true;
  g.add(pole, flag);
  return g;
}

/** Wooden crates and a fish drying rack next to shops, for life. */
function extras(map: TileMap): THREE.Group {
  const g = new THREE.Group();
  const crateMat = new THREE.MeshLambertMaterial({ map: planks() });
  const crate = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  const spots: [number, number][] = [[19.1, 16.3], [19.2, 15.4], [3.6, 16.4], [15.4, 23.3]];
  for (const [x, z] of spots) {
    const m = new THREE.Mesh(crate, crateMat);
    m.position.set(x, surfaceHeight(kindAt(map, Math.round(x), Math.round(z))) + 0.17, z);
    m.rotation.y = x * 0.7;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

export function createBuildings(map: TileMap): THREE.Group {
  const group = new THREE.Group();
  for (const b of map.buildings) group.add(buildingMesh(b, surfaceHeight(kindAt(map, b.x, b.z))));
  group.add(extras(map));
  return group;
}

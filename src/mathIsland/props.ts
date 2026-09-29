import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Tick } from './island';
import { diceFace, labelTexture, mathsLabelTexture, robotScreenTexture, rulerTexture } from './textures';

const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

/** Cylinder spanning two points. */
function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 10), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

function ruler(length: number, width: number): THREE.Mesh {
  const tex = rulerTexture(length);
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  const edge = std('#d9a45c', { roughness: 0.8 });
  return new THREE.Mesh(new THREE.BoxGeometry(length, width, 0.14), [edge, edge, edge, edge, face, face]);
}

const MAST = new THREE.Vector3(-1.2, 0, -1.7);
const MAST_H = 7.2;
const JIB_Y = 6.3;
const JIB_ANGLE = THREE.MathUtils.degToRad(8);
const M_POS = new THREE.Vector3(4.2, 0.02, -1.5);

function jibPoint(d: number): THREE.Vector3 {
  return new THREE.Vector3(MAST.x + d * Math.cos(JIB_ANGLE), JIB_Y + d * Math.sin(JIB_ANGLE), MAST.z);
}

function crane(ticks: Tick[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'crane-rulers';
  const metal = std('#b9c2cc', { metalness: 0.7, roughness: 0.3 });
  const cable = std('#555b66', { metalness: 0.4 });

  const mast = ruler(MAST_H, 0.5);
  mast.rotation.z = Math.PI / 2;
  mast.position.set(MAST.x, MAST_H / 2, MAST.z);

  const jib = ruler(9.2, 0.42);
  const jibStart = -1.8;
  const jibCenter = jibPoint(jibStart + 4.6);
  jib.position.copy(jibCenter).setZ(MAST.z + 0.14);
  jib.rotation.z = JIB_ANGLE;

  const weight = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.7, 0.5, 2, 0.06), std('#4b5160'));
  weight.position.copy(jibPoint(-1.4)).add(new THREE.Vector3(0, -0.5, 0.14));

  const cab = new THREE.Mesh(
    new RoundedBoxGeometry(1, 0.85, 0.75, 2, 0.08),
    [std('#2f9e9a'), std('#2f9e9a'), std('#2f9e9a'), std('#2f9e9a'), new THREE.MeshStandardMaterial({ map: labelTexture('√x', '#2f9e9a', '#eafffb') }), std('#2f9e9a')],
  );
  cab.position.set(MAST.x + 0.55, 4.7, MAST.z + 0.35);

  const top = new THREE.Vector3(MAST.x, MAST_H, MAST.z + 0.14);
  g.add(mast, jib, weight, cab, rod(top, jibPoint(-1.7).setZ(MAST.z + 0.14), 0.025, cable), rod(top, jibPoint(7.2).setZ(MAST.z + 0.14), 0.025, cable));

  const hinge = new THREE.Vector3(MAST.x, 6.9, MAST.z + 0.55);
  const legL = new THREE.Vector3(MAST.x - 1.3, 0.15, MAST.z + 0.5);
  const legR = new THREE.Vector3(MAST.x + 1.25, 0.35, MAST.z + 0.5);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 12), metal);
  knob.position.copy(hinge).add(new THREE.Vector3(0, 0.3, 0));
  const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 16), metal);
  joint.rotation.x = Math.PI / 2;
  joint.position.copy(hinge);
  const needle = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 8), metal);
  needle.position.copy(legL).add(new THREE.Vector3(0, -0.1, 0));
  needle.rotation.z = Math.PI;
  const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 6), std('#f3c436'));
  const dir = legR.clone().sub(hinge).normalize();
  pencil.position.copy(legR).addScaledVector(dir, 0.1);
  pencil.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const lead = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 6), std('#e8c9a0'));
  lead.position.copy(legR).addScaledVector(dir, 0.55);
  lead.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().negate());
  g.add(rod(hinge, legL, 0.07, metal), rod(hinge, legR.clone().addScaledVector(dir, -0.25), 0.07, metal), knob, joint, needle, pencil, lead);

  // Hook: cable -> red delta -> hook resting on the M.
  const pivot = jibPoint(M_POS.x - 0.92 - MAST.x);
  const hook = new THREE.Group();
  hook.position.copy(pivot).setZ(MAST.z + 0.14);
  const drop = hook.position.y - (M_POS.y + 2.75);
  const delta = new THREE.Shape([new THREE.Vector2(-0.45, -0.38), new THREE.Vector2(0.45, -0.38), new THREE.Vector2(0, 0.42)]);
  delta.holes.push(new THREE.Path([new THREE.Vector2(-0.22, -0.22), new THREE.Vector2(0, 0.18), new THREE.Vector2(0.22, -0.22)]));
  const deltaMesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(delta, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }),
    std('#e0413a'),
  );
  deltaMesh.position.set(0, -drop * 0.45, -0.06);
  const hookMesh = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 20, Math.PI * 1.3), metal);
  hookMesh.position.set(0, -drop + 0.05, 0.1);
  hookMesh.rotation.set(0, Math.PI / 2, Math.PI * 1.1);
  hook.add(
    rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -drop * 0.45 + 0.42, 0), 0.02, cable),
    deltaMesh,
    rod(new THREE.Vector3(0, -drop * 0.45 - 0.38, 0), new THREE.Vector3(0, -drop + 0.2, 0.1), 0.02, cable),
    hookMesh,
  );
  g.add(hook);
  ticks.push((t) => {
    hook.rotation.z = Math.sin(t * 1.3) * 0.012;
    deltaMesh.rotation.y = Math.sin(t * 0.9) * 0.35;
  });
  return g;
}

function letterM(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'letter-M';
  const pts = [
    [0, 0], [0.62, 0], [0.62, 1.55], [1.2, 0.75], [1.78, 1.55], [1.78, 0], [2.4, 0],
    [2.4, 2.6], [1.84, 2.6], [1.2, 1.7], [0.56, 2.6], [0, 2.6],
  ].map(([x, y]) => new THREE.Vector2(x - 1.2, y));
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
    depth: 0.6,
    bevelEnabled: true,
    bevelSize: 0.08,
    bevelThickness: 0.08,
    bevelSegments: 3,
  });
  geo.translate(0, 0.08, -0.3);
  const m = new THREE.Mesh(geo, [std('#f38bb3', { roughness: 0.45 }), std('#e06f9c', { roughness: 0.5 })]);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 1.8),
    new THREE.MeshStandardMaterial({ map: mathsLabelTexture(), transparent: true, roughness: 0.5 }),
  );
  label.position.set(-0.89, 1.35, 0.39);
  g.add(m, label);
  g.position.copy(M_POS);
  return g;
}

function protractor(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'protractor';
  const outer = 1.55;
  const inner = 1.05;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI, false);
  shape.lineTo(-inner, 0);
  shape.absarc(0, 0, inner, Math.PI, 0, true);
  shape.lineTo(outer, 0);
  const mat = std('#e3a85a', { roughness: 0.5, transparent: true, opacity: 0.92 });
  const arc = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1, curveSegments: 32 }), mat);
  const base = new THREE.Mesh(new THREE.BoxGeometry(outer * 2 + 0.1, 0.16, 0.14), mat);
  base.position.set(0, 0.02, 0.05);
  const tickMat = std('#6b4420');
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI;
    const long = i % 3 === 0;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(long ? 0.24 : 0.14, 0.03, 0.02), tickMat);
    const r = outer - (long ? 0.14 : 0.09);
    tick.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.14);
    tick.rotation.z = a;
    g.add(tick);
  }
  const center = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 12), tickMat);
  center.rotation.x = Math.PI / 2;
  center.position.set(0, 0.12, 0.05);
  g.add(arc, base, center);
  g.position.set(-3.1, 0.1, -0.7);
  g.rotation.y = 0.35;
  return g;
}

function pi(): THREE.Mesh {
  const bar = new THREE.Shape();
  bar.moveTo(-1.15, 0.5);
  bar.lineTo(1.15, 0.5);
  bar.lineTo(1.2, 0.86);
  bar.quadraticCurveTo(-0.9, 0.9, -1.1, 0.72);
  bar.quadraticCurveTo(-1.3, 0.55, -1.15, 0.5);
  const left = new THREE.Shape([
    new THREE.Vector2(-0.6, 0.5), new THREE.Vector2(-0.3, 0.5), new THREE.Vector2(-0.4, -0.35),
    new THREE.Vector2(-0.62, -0.9), new THREE.Vector2(-0.95, -0.85), new THREE.Vector2(-0.68, -0.35),
  ]);
  const right = new THREE.Shape();
  right.moveTo(0.3, 0.5);
  right.lineTo(0.6, 0.5);
  right.lineTo(0.6, -0.4);
  right.quadraticCurveTo(0.62, -0.62, 0.9, -0.58);
  right.lineTo(0.95, -0.86);
  right.quadraticCurveTo(0.3, -1.0, 0.3, -0.45);
  right.lineTo(0.3, 0.5);
  const geo = new THREE.ExtrudeGeometry([bar, left, right], { depth: 0.18, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, std('#3d7de0', { roughness: 0.35 }));
  mesh.name = 'pi';
  mesh.scale.setScalar(1.25);
  mesh.position.set(0.4, 0.05, 2.5);
  mesh.rotation.y = 0.12;
  return mesh;
}

type SymbolKind = '+' | '-' | 'x' | '/';

function symbol(kind: SymbolKind, color: string, size = 0.75): THREE.Group {
  const g = new THREE.Group();
  const mat = std(color, { roughness: 0.4 });
  const bar = (): THREE.Mesh => new THREE.Mesh(new RoundedBoxGeometry(size, size * 0.28, size * 0.28, 2, size * 0.08), mat);
  if (kind === '+' || kind === 'x') {
    const a = bar();
    const b = bar();
    b.rotation.z = Math.PI / 2;
    g.add(a, b);
    if (kind === 'x') g.rotation.z = Math.PI / 4;
  } else {
    g.add(bar());
  }
  if (kind === '/') {
    for (const s of [1, -1]) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(size * 0.15, 16, 12), mat);
      dot.position.y = s * size * 0.36;
      g.add(dot);
    }
  }
  return g;
}

function tree(x: number, z: number, sym: SymbolKind | null, color: string, ticks: Tick[], scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.name = `tree${sym ? `-${sym}` : ''}`;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 1.1, 8), std('#8b5a2b', { roughness: 0.9 }));
  trunk.position.y = 0.55;
  g.add(trunk);
  const leaves = [std('#5fb247', { roughness: 0.8 }), std('#4b9c3a', { roughness: 0.8 })];
  const blobs: [number, number, number, number][] = [[0, 1.45, 0, 0.62], [-0.38, 1.2, 0.1, 0.45], [0.36, 1.25, -0.05, 0.48], [0.05, 1.2, 0.35, 0.42]];
  blobs.forEach(([bx, by, bz, r], i) => {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), leaves[i % 2]);
    blob.position.set(bx, by, bz);
    g.add(blob);
  });
  if (sym) {
    const s = symbol(sym, color, 0.85);
    const holder = new THREE.Group();
    holder.position.y = 2.35;
    holder.add(s);
    g.add(holder);
    const phase = x * 1.7 + z;
    ticks.push((t) => {
      holder.rotation.y = Math.sin(t * 0.8 + phase) * 0.6;
      holder.position.y = 2.35 + Math.sin(t * 1.6 + phase) * 0.06;
    });
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  return g;
}

function plusPlant(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'plus-plant';
  const mat = std('#4caf50', { roughness: 0.5 });
  const v = new THREE.Mesh(new RoundedBoxGeometry(0.5, 1.9, 0.5, 3, 0.12), mat);
  v.position.y = 0.95;
  const h = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.5, 0.5, 3, 0.12), mat);
  h.position.y = 1.2;
  g.add(v, h);
  g.position.set(-5.3, 0, 0.8);
  g.rotation.y = 0.5;
  return g;
}

function abacus(x: number, z: number, rotY: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'abacus';
  const wood = std('#8a5a33', { roughness: 0.8 });
  const w = 1.6;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.45, 0.14), wood);
    post.position.set((sx * w) / 2, 0.72, 0);
    g.add(post);
  }
  for (const y of [0.35, 1.35]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.12, 0.16), wood);
    bar.position.set(0, y, 0);
    g.add(bar);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, 0.04), std('#5b3b22'));
  back.position.set(0, 0.85, -0.06);
  g.add(back);
  const colors = ['#e5483f', '#f5c542', '#3d7de0', '#4caf50'];
  const rodMat = std('#d8d0c0', { metalness: 0.5 });
  const beadGeo = new THREE.SphereGeometry(0.085, 12, 8);
  beadGeo.scale(0.8, 1, 1);
  colors.forEach((c, row) => {
    const y = 0.52 + row * 0.22;
    g.add(rod(new THREE.Vector3(-w / 2, y, 0.02), new THREE.Vector3(w / 2, y, 0.02), 0.015, rodMat));
    const mat = std(c, { roughness: 0.4 });
    const left = 2 + ((row * 3) % 4);
    for (let i = 0; i < 7; i++) {
      const bead = new THREE.Mesh(beadGeo, mat);
      const bx = i < left ? -w / 2 + 0.12 + i * 0.15 : w / 2 - 0.12 - (6 - i) * 0.15;
      bead.position.set(bx, y, 0.02);
      g.add(bead);
    }
  });
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

function pyramid(x: number, z: number, h: number, color: string, sides = 4): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(h * 0.6, h, sides), std(color, { flatShading: true, roughness: 0.5 }));
  mesh.position.set(x, h / 2, z);
  mesh.rotation.y = x * 0.7;
  mesh.name = sides === 4 ? 'pyramid' : 'cone';
  return mesh;
}

function dice(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'dice';
  const faces = [1, 6, 2, 5, 3, 4].map((n) => new THREE.MeshStandardMaterial({ map: diceFace(n), roughness: 0.4 }));
  const spots: [number, number, number][] = [[2.5, -0.9, 0.4], [3.5, 1.5, -0.6], [-0.2, -3.3, 1.1], [-2.3, 2.9, 0.2]];
  for (const [x, z, r] of spots) {
    const d = new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.45, 0.45, 3, 0.07), faces);
    d.position.set(x, 0.225, z);
    d.rotation.y = r;
    g.add(d);
  }
  return g;
}

function robot(ticks: Tick[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'calculator-robot';
  const shell = std('#9db5a6', { roughness: 0.5 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.8, 1.1, 0.38, 3, 0.08), shell);
  body.position.y = 0.95;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.4), new THREE.MeshStandardMaterial({ map: robotScreenTexture(), emissive: '#ffffff', emissiveMap: robotScreenTexture(), emissiveIntensity: 0.6 }));
  screen.position.set(0, 1.25, 0.195);
  g.add(body, screen);
  const keyColors = ['#f4f1ea', '#f4f1ea', '#f39c4a'];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const key = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.1, 0.06, 1, 0.02), std(keyColors[c]));
      key.position.set(-0.2 + c * 0.2, 0.9 - r * 0.15, 0.2);
      g.add(key);
    }
  }
  const limb = std('#6d7f74');
  const legs: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8), limb);
    leg.position.set(s * 0.2, 0.22, 0);
    const foot = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.08, 0.26, 1, 0.03), limb);
    foot.position.set(s * 0.2, 0.04, 0.04);
    legs.push(leg);
    g.add(leg, foot);
  }
  const armL = new THREE.Group();
  armL.position.set(-0.42, 1.2, 0);
  const armR = new THREE.Group();
  armR.position.set(0.42, 1.2, 0);
  for (const [arm, s] of [[armL, -1], [armR, 1]] as const) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), limb);
    a.position.y = -0.25;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), shell);
    hand.position.y = -0.52;
    arm.add(a, hand);
    arm.rotation.z = s * 0.35;
  }
  const antenna = rod(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0.1, 1.8, 0), 0.02, limb);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), std('#e5483f', { emissive: '#e5483f', emissiveIntensity: 0.8 }));
  bulb.position.set(0.1, 1.82, 0);
  g.add(armL, armR, antenna, bulb);
  g.position.set(-3.1, 0, 1.2);
  g.rotation.y = 0.35;
  ticks.push((t) => {
    const hop = Math.abs(Math.sin(t * 2.4));
    body.position.y = 0.95 + hop * 0.05;
    screen.position.y = 1.25 + hop * 0.05;
    armR.rotation.z = Math.PI * 0.8 + Math.sin(t * 5) * 0.35;
    bulb.material.emissiveIntensity = 0.5 + Math.sin(t * 4) * 0.4;
  });
  return g;
}

export function buildProps(ticks: Tick[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'props';
  g.add(
    crane(ticks),
    letterM(),
    protractor(),
    pi(),
    plusPlant(),
    tree(-4.2, -2.0, '-', '#f5c542', ticks),
    tree(1.7, -3.7, 'x', '#e5483f', ticks),
    tree(4.6, -2.6, 'x', '#3d7de0', ticks, 0.95),
    tree(5.6, -0.5, '/', '#8e5cd9', ticks, 0.9),
    tree(-0.6, -4.1, null, '', ticks, 0.85),
    tree(3.2, -4.0, null, '', ticks, 0.75),
    tree(-5.0, -0.6, null, '', ticks, 0.7),
    abacus(-4.8, 2.5, 0.6),
    abacus(5.0, 1.3, -0.6),
    pyramid(-0.1, -2.7, 1.5, '#f5c542'),
    pyramid(2.9, -2.1, 1.8, '#4a7bd6'),
    pyramid(2.8, 0.4, 0.8, '#a36bd6'),
    pyramid(-3.7, 3.0, 0.7, '#4fc3d9'),
    pyramid(3.7, -0.4, 0.6, '#f5c542'),
    pyramid(-3.9, -0.2, 0.55, '#f08a3c', 16),
    pyramid(2.1, 1.0, 0.6, '#3d7de0', 16),
    dice(),
    robot(ticks),
  );
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), std('#e0302a', { roughness: 0.3 }));
  ball.name = 'ball';
  ball.position.set(4.1, 0.32, 2.6);
  g.add(ball);
  return g;
}

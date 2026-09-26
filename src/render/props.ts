import * as THREE from 'three';

/** Géométries procédurales low-poly (remplaçables par les GLB Blender de /public/models). */
const mats = new Map<string, THREE.Material>();
export function mat(color: string, opts: { emissive?: string; rough?: number; metal?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.emissive ?? ''}|${opts.rough ?? 0.85}|${opts.metal ?? 0}`;
  let m = mats.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0, flatShading: false });
    if (opts.emissive) {
      m.emissive = new THREE.Color(opts.emissive);
      m.emissiveIntensity = 0.6;
      m.userData.glow = true;
    }
    mats.set(key, m);
  }
  return m;
}

export function glowMaterials(): THREE.MeshStandardMaterial[] {
  return [...mats.values()].filter((m): m is THREE.MeshStandardMaterial => m instanceof THREE.MeshStandardMaterial && m.userData.glow === true);
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

function box(w: number, h: number, d: number, c: string, x: number, y: number, z: number, e?: string): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), mat(c, e ? { emissive: e } : {}), x, y + h / 2, z);
}

/** Toit en prisme triangulaire, faîtage selon x. */
function roof(w: number, h: number, d: number, c: string, y: number, z = 0): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - 0.15, 0);
  shape.lineTo(d / 2 + 0.15, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w + 0.3, bevelEnabled: false });
  geo.translate(0, 0, -(w + 0.3) / 2);
  geo.rotateY(Math.PI / 2);
  return mesh(geo, mat(c), 0, y, z);
}

function stripes(a: string, b: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 4;
  const ctx = c.getContext('2d');
  if (ctx) for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? a : b;
    ctx.fillRect(i * 2, 0, 2, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowPane(x: number, y: number, z: number, w = 0.4, h = 0.4): THREE.Mesh {
  return box(w, h, 0.05, '#ffd98a', x, y, z, '#ffb347');
}

export function building(kind: 'boulangerie' | 'echoppe' | 'mairie' | 'enclos', w: number, d: number): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'boulangerie') {
    g.add(box(w - 0.5, 1.5, d - 0.6, '#f4e3c3', 0, 0, -0.1));
    g.add(roof(w - 0.3, 1.1, d - 0.4, '#c8674a', 1.5, -0.1));
    g.add(box(0.5, 0.9, 0.5, '#9a5a44', 1.1, 2.0, -0.4));
    g.add(box(0.6, 0.95, 0.06, '#7a4a32', 0, 0, (d - 0.6) / 2 - 0.08));
    g.add(windowPane(-1.05, 0.55, (d - 0.6) / 2 - 0.08, 0.6, 0.5));
    g.add(windowPane(1.05, 0.55, (d - 0.6) / 2 - 0.08, 0.6, 0.5));
    g.add(box(1.4, 0.35, 0.08, '#f7d3a0', 0, 1.1, (d - 0.6) / 2 - 0.02));
    const bread = mesh(new THREE.CapsuleGeometry(0.1, 0.3, 4, 8), mat('#d98f3d'), 0, 1.28, (d - 0.6) / 2 + 0.06);
    bread.rotation.z = Math.PI / 2;
    g.add(bread);
  } else if (kind === 'echoppe') {
    g.add(box(w - 0.6, 1.4, d - 0.7, '#b98556', 0, 0, -0.15));
    g.add(roof(w - 0.4, 0.9, d - 0.5, '#5c7a99', 1.4, -0.15));
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, 0.9), new THREE.MeshStandardMaterial({ map: stripes('#3f9a6a', '#f6efe0'), side: THREE.DoubleSide, roughness: 0.9 }));
    aw.position.set(0, 1.25, (d - 0.7) / 2 + 0.25);
    aw.rotation.x = -Math.PI / 3.2;
    aw.castShadow = true;
    g.add(aw);
    g.add(box(w - 0.8, 0.55, 0.5, '#8a5a36', 0, 0, (d - 0.7) / 2 + 0.2));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(['#e0473d', '#f0b43a', '#8fbf4a'][i] ?? '#fff'), -0.6 + i * 0.6, 0.65, (d - 0.7) / 2 + 0.2));
    g.add(box(0.5, 0.5, 0.5, '#a0764c', w / 2 - 0.2, 0, (d - 0.7) / 2 - 0.1));
    g.add(windowPane(-1, 0.6, (d - 0.7) / 2 - 0.13, 0.5, 0.4));
  } else if (kind === 'mairie') {
    g.add(box(w - 0.6, 1.8, d - 0.6, '#efe8dc', 0, 0, 0));
    g.add(roof(w - 0.4, 1.0, d - 0.4, '#4d5d78', 1.8, 0));
    g.add(box(1.0, 1.2, 1.0, '#efe8dc', 0, 2.3, 0));
    const spire = mesh(new THREE.ConeGeometry(0.8, 1.0, 4), mat('#4d5d78'), 0, 4.0, 0);
    spire.rotation.y = Math.PI / 4;
    g.add(spire);
    g.add(mesh(new THREE.CircleGeometry(0.3, 16), mat('#fff8e6', { emissive: '#ffe7a8' }), 0, 2.95, 0.51));
    for (const x of [-1.3, -0.45, 0.45, 1.3]) g.add(box(0.18, 1.6, 0.18, '#fbf7ef', x, 0, (d - 0.6) / 2 + 0.1));
    g.add(box(0.7, 1.1, 0.06, '#6a4a3a', 0, 0, (d - 0.6) / 2 - 0.02));
    g.add(windowPane(-1.6, 0.8, (d - 0.6) / 2 - 0.02));
    g.add(windowPane(1.6, 0.8, (d - 0.6) / 2 - 0.02));
    g.add(box(0.05, 1.4, 0.05, '#555', 0.4, 3.5, 0));
    g.add(box(0.5, 0.3, 0.02, '#3b6fd6', 0.66, 4.55, 0));
  } else {
    const posts: [number, number][] = [];
    for (let x = -w / 2 + 0.2; x <= w / 2 - 0.2 + 0.01; x += (w - 0.4) / 5) {
      posts.push([x, -d / 2 + 0.2]);
      posts.push([x, d / 2 - 0.2]);
    }
    for (let z = -d / 2 + 0.2 + (d - 0.4) / 3; z < d / 2 - 0.3; z += (d - 0.4) / 3) {
      posts.push([-w / 2 + 0.2, z]);
      posts.push([w / 2 - 0.2, z]);
    }
    for (const [x, z] of posts) g.add(box(0.12, 0.6, 0.12, '#a0764c', x, 0, z));
    g.add(box(w - 0.4, 0.07, 0.06, '#b98a5a', 0, 0.42, -d / 2 + 0.2));
    g.add(box(w - 0.4, 0.07, 0.06, '#b98a5a', 0, 0.42, d / 2 - 0.2));
    g.add(box(0.06, 0.07, d - 0.4, '#b98a5a', -w / 2 + 0.2, 0.42, 0));
    g.add(box(0.06, 0.07, d - 0.4, '#b98a5a', w / 2 - 0.2, 0.42, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.35, 10), mat('#e8c865'), -w / 2 + 0.8, 0.17, -d / 2 + 0.7));
    g.add(box(0.8, 0.22, 0.35, '#8a5a36', w / 2 - 0.8, 0, -d / 2 + 0.6));
  }
  return g;
}

export interface TreeMesh {
  group: THREE.Group;
  canopy: THREE.Group;
  fruits: THREE.Mesh[];
  hive: THREE.Mesh;
}
export function tree(fruit: 'pomme' | 'figue', seed: number): TreeMesh {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.9, 7), mat('#7a5236'), 0, 0.45, 0));
  const canopy = new THREE.Group();
  canopy.position.y = 0.9;
  const greens = ['#5f9e4a', '#6fb055', '#86c064'];
  const blobs: [number, number, number, number][] = [[0, 0.45, 0, 0.62], [-0.32, 0.25, 0.1, 0.45], [0.33, 0.3, -0.05, 0.47], [0.05, 0.85, 0.05, 0.4]];
  blobs.forEach(([x, y, z, r], i) => canopy.add(mesh(new THREE.IcosahedronGeometry(r, 1), mat(greens[(i + seed) % 3] ?? '#6fb055', { rough: 0.95 }), x, y, z)));
  const fruits: THREE.Mesh[] = [];
  const fc = fruit === 'pomme' ? '#e0473d' : '#7a4a9a';
  const fp: [number, number, number][] = [[0.35, 0.2, 0.42], [-0.4, 0.45, 0.35], [0.1, 0.75, 0.48]];
  for (const [x, y, z] of fp) {
    const f = mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(fc, { rough: 0.5 }), x, y, z);
    fruits.push(f);
    canopy.add(f);
  }
  const hive = mesh(new THREE.SphereGeometry(0.13, 8, 6), mat('#b78a3a'), -0.2, -0.05, 0.45);
  hive.scale.y = 1.3;
  canopy.add(hive);
  group.add(canopy);
  return { group, canopy, fruits, hive };
}

export function rock(s: number): THREE.Mesh {
  const r = mesh(new THREE.DodecahedronGeometry(0.45 * s, 0), mat('#9a968c', { rough: 1 }), 0, 0.2 * s, 0);
  r.scale.y = 0.65;
  return r;
}

export function decor(itemId: string): THREE.Group {
  const g = new THREE.Group();
  switch (itemId) {
    case 'banc':
      g.add(box(1.1, 0.08, 0.35, '#c49a6c', 0, 0.35, 0));
      g.add(box(1.1, 0.3, 0.06, '#c49a6c', 0, 0.45, -0.15));
      for (const x of [-0.45, 0.45]) g.add(box(0.08, 0.35, 0.3, '#8a6a4a', x, 0, 0));
      break;
    case 'lampadaire':
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.8, 8), mat('#2f3a44', { metal: 0.6, rough: 0.4 }), 0, 0.9, 0));
      g.add(mesh(new THREE.SphereGeometry(0.17, 12, 10), mat('#fff1c2', { emissive: '#ffcf6b' }), 0, 1.9, 0));
      g.add(mesh(new THREE.ConeGeometry(0.22, 0.18, 8), mat('#2f3a44'), 0, 2.1, 0));
      g.userData.light = 1.9;
      break;
    case 'oeillets': {
      g.add(mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.12, 14), mat('#7a5a3e'), 0, 0.06, 0));
      const cs = ['#ff6f91', '#ffd166', '#f25f5c', '#ffffff', '#c77dff'];
      for (let k = 0; k < 14; k++) {
        const a = k * 2.4;
        const r = 0.15 + (k % 3) * 0.13;
        g.add(mesh(new THREE.SphereGeometry(0.08, 6, 5), mat(cs[k % cs.length] ?? '#fff'), Math.cos(a) * r, 0.22, Math.sin(a) * r));
      }
      break;
    }
    case 'fontaine':
      g.add(mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.35, 18), mat('#d9d3c7'), 0, 0.17, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 18), mat('#6fd3e6', { emissive: '#3aa6c9', rough: 0.1 }), 0, 0.33, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.8, 10), mat('#d9d3c7'), 0, 0.7, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.35, 0.2, 0.15, 14), mat('#d9d3c7'), 0, 1.1, 0));
      g.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), mat('#bdf3ff', { emissive: '#7fe0ff' }), 0, 1.25, 0));
      break;
    case 'statue': {
      const gold = mat('#e6b93b', { metal: 0.9, rough: 0.25 });
      g.add(box(0.7, 0.4, 0.7, '#d9d3c7', 0, 0, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.28, 0.33, 0.7, 12), gold, 0, 0.75, 0));
      g.add(mesh(new THREE.SphereGeometry(0.22, 12, 10), gold, 0, 1.3, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 12), gold, 0, 1.6, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 12), gold, 0, 1.46, 0));
      break;
    }
    case 'echoppe_plus':
      g.add(box(1.4, 1.1, 1.3, '#c99a66', 0, 0, 0));
      g.add(roof(1.6, 0.6, 1.4, '#3f9a6a', 1.1, 0));
      g.add(box(0.9, 0.4, 0.05, '#f0c233', 0, 0.75, 0.67, '#f0c233'));
      break;
    case 'stand_patisserie':
      g.add(box(1.2, 0.6, 0.6, '#f6d6e0', 0, 0, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), mat('#8a6a4a'), 0.4, 0.75, -0.1));
      g.add(mesh(new THREE.ConeGeometry(0.8, 0.35, 10), new THREE.MeshStandardMaterial({ map: stripes('#ff8fb1', '#fff5f8'), roughness: 0.9 }), 0.4, 1.55, -0.1));
      for (let k = 0; k < 4; k++) g.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(['#ff8fb1', '#fbe3a0', '#c77dff', '#ffffff'][k] ?? '#fff'), -0.4 + k * 0.27, 0.68, 0.1));
      break;
    case 'phare': {
      const white = mat('#f6f2ea');
      const red = mat('#d6453d');
      for (let k = 0; k < 5; k++) g.add(mesh(new THREE.CylinderGeometry(0.34 - k * 0.04, 0.38 - k * 0.04, 0.6, 14), k % 2 ? red : white, 0, 0.3 + k * 0.6, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.4, 12), mat('#fff6cf', { emissive: '#ffd36b' }), 0, 3.2, 0));
      g.add(mesh(new THREE.ConeGeometry(0.34, 0.4, 12), red, 0, 3.6, 0));
      g.userData.light = 3.2;
      break;
    }
    default:
      g.add(box(0.5, 0.5, 0.5, '#ccc', 0, 0, 0));
  }
  return g;
}

export function pickup(itemId: string): THREE.Group {
  const g = new THREE.Group();
  if (itemId === 'coquillage' || itemId === 'conque') {
    const big = itemId === 'conque';
    const s = mesh(new THREE.ConeGeometry(big ? 0.16 : 0.11, big ? 0.28 : 0.16, 7), mat(big ? '#f3d1e6' : '#fbe6d4', { rough: 0.4 }), 0, 0.06, 0);
    s.rotation.z = Math.PI / 2.2;
    g.add(s);
  } else if (itemId === 'carnet' || itemId === 'lettre') {
    g.add(box(0.3, 0.07, 0.22, itemId === 'carnet' ? '#7a4a2a' : '#f7e7f0', 0, 0, 0));
  } else {
    const c = itemId === 'pomme' ? '#e0473d' : itemId === 'figue_or' ? '#f5c542' : '#7a4a9a';
    g.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), mat(c, itemId === 'figue_or' ? { emissive: '#f5c542', metal: 0.5 } : { rough: 0.5 }), 0, 0.11, 0));
  }
  return g;
}

import * as THREE from 'three';
import { PAL } from './palette';
import { plankTexture, stoneTexture, stripeTexture } from './textures';

const lam = (color: string, extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial =>
  new THREE.MeshLambertMaterial({ color, ...extra });

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function cyl(rt: number, rb: number, h: number, mat: THREE.Material, seg: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}

function bench(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ map: plankTexture('#b39070', '#8a6a4c', '#d2b391') });
  g.add(box(1.3, 0.08, 0.4, wood, 0, 0.4, 0), box(1.3, 0.3, 0.06, wood, 0, 0.62, -0.18));
  for (const x of [-0.55, 0.55]) g.add(box(0.1, 0.4, 0.36, lam(PAL.woodDark), x, 0.2, 0));
  return g;
}

function lamp(): THREE.Group {
  const g = new THREE.Group();
  const iron = lam('#34383d');
  g.add(cyl(0.05, 0.08, 1.8, iron, 6, 0, 0.9, 0), cyl(0.18, 0.2, 0.1, iron, 8, 0, 0.05, 0));
  const glow = box(0.26, 0.3, 0.26, lam('#ffe3a0', { emissive: new THREE.Color('#ffb34d'), emissiveIntensity: 2.2 }), 0, 1.95, 0);
  g.add(glow, cyl(0.02, 0.22, 0.14, iron, 4, 0, 2.17, 0));
  const light = new THREE.PointLight('#ffb65c', 3, 4.5, 1.6);
  light.position.y = 1.9;
  g.add(light);
  return g;
}

function fountain(): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ map: stoneTexture() });
  const water = lam(PAL.waterShallow, { emissive: new THREE.Color('#1c6f78'), emissiveIntensity: 0.4 });
  g.add(cyl(0.9, 1.0, 0.35, stone, 12, 0, 0.18, 0), cyl(0.78, 0.78, 0.05, water, 12, 0, 0.34, 0));
  g.add(cyl(0.12, 0.16, 0.8, stone, 8, 0, 0.7, 0), cyl(0.4, 0.3, 0.15, stone, 10, 0, 1.1, 0), cyl(0.3, 0.3, 0.04, water, 10, 0, 1.17, 0));
  g.add(cyl(0.05, 0.08, 0.3, water, 6, 0, 1.35, 0));
  return g;
}

function flowerbed(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ map: plankTexture() });
  g.add(box(1.4, 0.2, 0.7, wood, 0, 0.1, 0), box(1.3, 0.08, 0.6, lam('#5a3a24'), 0, 0.2, 0));
  const colors = ['#ff5a7a', '#ffffff', '#ff9ab0', '#e0412f'];
  for (let i = 0; i < 10; i++) {
    const x = -0.5 + (i % 5) * 0.25;
    const z = i < 5 ? -0.15 : 0.15;
    g.add(cyl(0.015, 0.015, 0.25, lam(PAL.grassDark), 4, x, 0.33, z));
    g.add(box(0.12, 0.08, 0.12, lam(colors[i % colors.length]!), x, 0.48, z));
  }
  return g;
}

function uglyStatue(): THREE.Group {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 0.7, roughness: 0.35, emissive: new THREE.Color('#4a3000') });
  const plinth = new THREE.MeshLambertMaterial({ map: stoneTexture() });
  g.add(box(0.8, 0.5, 0.8, plinth, 0, 0.25, 0));
  // Un poisson-roi dodu et prétentieux, bouche ouverte : volontairement kitsch.
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), gold);
  body.scale.set(1.2, 1.0, 0.8);
  body.position.set(0, 1.0, 0);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 4), gold);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-0.7, 1.05, 0);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.2, 5, 1, true), gold);
  crown.position.set(0.1, 1.48, 0);
  g.add(body, tail, crown);
  for (const x of [0.3, 0.1]) g.add(box(0.08, 0.08, 0.02, lam('#1e1e1e'), x, 1.1, 0.34));
  return g;
}

function pastryStand(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ map: plankTexture(PAL.plaster, PAL.plasterDark, '#fff6e6') });
  g.add(box(1.4, 0.8, 0.7, wood, 0, 0.4, 0));
  for (const x of [-0.65, 0.65]) g.add(box(0.07, 1.0, 0.07, lam(PAL.woodDark), x, 1.3, 0.3));
  const awning = box(1.6, 0.06, 0.9, new THREE.MeshLambertMaterial({ map: stripeTexture('#f08aa0', '#fff6ea') }), 0, 1.82, 0.1);
  awning.rotation.x = 0.25;
  g.add(awning);
  const pastry = ['#d99a4e', '#f5d9a0', '#a0522d', '#f08aa0'];
  pastry.forEach((c, i) => g.add(cyl(0.12, 0.13, 0.1, lam(c), 8, -0.45 + i * 0.3, 0.86, 0.1)));
  return g;
}

function lighthouse(): THREE.Group {
  const g = new THREE.Group();
  const white = lam('#f4efe6');
  const red = lam('#d4473a');
  g.add(cyl(0.4, 0.55, 0.8, red, 10, 0, 0.4, 0), cyl(0.33, 0.4, 0.8, white, 10, 0, 1.2, 0), cyl(0.28, 0.33, 0.7, red, 10, 0, 1.95, 0));
  g.add(cyl(0.3, 0.3, 0.35, lam('#fff2b0', { emissive: new THREE.Color('#ffcc66'), emissiveIntensity: 2.5 }), 8, 0, 2.47, 0));
  g.add(new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.4, 8), red).translateY(2.85));
  const light = new THREE.PointLight('#ffcc77', 4, 6, 1.5);
  light.position.y = 2.5;
  g.add(light);
  return g;
}

const BUILDERS: Record<string, () => THREE.Group> = {
  'banc-bois-flotte': bench,
  'lampadaire-retro': lamp,
  'fontaine-sculptee': fountain,
  'parterre-oeillets': flowerbed,
  'statue-doree-moche': uglyStatue,
  'stand-patisserie': pastryStand,
  phare: lighthouse,
};

export function buildDecor(itemId: string): THREE.Group {
  const make = BUILDERS[itemId];
  const g = make ? make() : bench();
  if (!make) console.warn(`[decor] pas de modèle pour « ${itemId} », banc par défaut`);
  g.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return g;
}

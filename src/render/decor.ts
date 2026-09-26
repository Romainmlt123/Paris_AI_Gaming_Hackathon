import * as THREE from 'three';
import type { DecoId } from '../../shared/types';
import { glowTexture, halo } from './night';
import { P, planks, stoneWall } from './textures';

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const lambert = (color: string): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color });

function banc(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ map: planks() });
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.08, 0.35), wood, 0, 0.3, 0));
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.3, 0.06), wood, 0, 0.5, -0.16));
  for (const x of [-0.45, 0.45]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.3, 0.3), lambert(P.plankDark), x, 0.15, 0));
  return g;
}

function lampadaire(): THREE.Group {
  const g = new THREE.Group();
  const iron = lambert('#3b3a4a');
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.6, 6), iron, 0, 0.8, 0));
  const glass = new THREE.MeshStandardMaterial({ color: P.window, emissive: P.window, emissiveIntensity: 2 });
  glass.userData['glow'] = 2;
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), glass, 0, 1.72, 0));
  g.add(mesh(new THREE.ConeGeometry(0.2, 0.15, 4), iron, 0, 1.92, 0));
  const light = new THREE.PointLight(P.window, 2.5, 4, 1.5);
  light.position.y = 1.7;
  light.userData['lamp'] = 2.5;
  const bulb = halo(0xffc070, 1.6);
  bulb.position.y = 1.72;
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffa850, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.03;
  pool.name = 'nightGlow';
  pool.userData['glow'] = 0.6;
  pool.visible = false;
  g.add(light, bulb, pool);
  return g;
}

function parterre(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1, 0.18, 0.6), new THREE.MeshLambertMaterial({ map: stoneWall() }), 0, 0.09, 0));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.06, 0.5), lambert(P.dirt), 0, 0.19, 0));
  const colors = [P.flowerPink, P.flowerWhite, '#e0564a'];
  for (let i = 0; i < 8; i++) {
    const x = -0.38 + (i % 4) * 0.25;
    const z = i < 4 ? -0.12 : 0.12;
    g.add(mesh(new THREE.SphereGeometry(0.08, 6, 4), lambert(colors[i % 3] ?? P.flowerPink), x, 0.3, z));
  }
  return g;
}

function fontaine(): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ map: stoneWall() });
  g.add(mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.3, 12), stone, 0, 0.15, 0));
  const water = new THREE.MeshStandardMaterial({ color: P.waterShallow, emissive: '#1c5a66', emissiveIntensity: 0.4 });
  g.add(mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.05, 12), water, 0, 0.29, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.7, 8), stone, 0, 0.6, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.32, 0.2, 0.12, 10), stone, 0, 0.95, 0));
  g.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), water, 0, 1.08, 0));
  return g;
}

function statue(): THREE.Group {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 0.8, roughness: 0.3, emissive: '#5a3a00', emissiveIntensity: 0.3 });
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.35, 0.7), new THREE.MeshLambertMaterial({ map: stoneWall() }), 0, 0.17, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.7, 8), gold, 0, 0.7, 0));
  g.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), gold, 0, 1.2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 8), gold, 0, 1.33, 0));
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.08, 0.08), gold, 0.28, 0.9, 0));
  return g;
}

const BUILDERS: Record<DecoId, () => THREE.Group> = { banc, lampadaire, parterre, fontaine, statue };

export function createDeco(id: DecoId): THREE.Group {
  return BUILDERS[id]();
}

export function slotMarker(): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ color: '#fff6e3', transparent: true, opacity: 0.75, depthWrite: false });
  const m = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 20), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}

import * as THREE from 'three';
import type { TileMap } from '../game/map';

let glow: THREE.CanvasTexture | null = null;

/** Soft radial dot shared by window halos, lamp pools and fireflies. */
export function glowTexture(): THREE.CanvasTexture {
  if (glow) return glow;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

/** Warm additive halo, invisible by day; `setNight` fades it in. */
export function halo(color: number, size: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  s.name = 'nightGlow';
  s.userData['glow'] = 0.85;
  s.visible = false;
  return s;
}

export interface Fireflies {
  points: THREE.Points;
  update(time: number, night: number): void;
}

const COUNT = 40;

export function createFireflies(map: TileMap): Fireflies {
  const spots = map.trees.length ? map.trees : [{ x: map.w / 2, z: map.h / 2 }];
  const base = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const t = spots[(i * 7) % spots.length] ?? { x: 0, z: 0 };
    base[i * 3] = t.x + Math.sin(i * 12.9) * 1.2;
    base[i * 3 + 1] = 0.8 + ((i * 37) % 10) / 10;
    base[i * 3 + 2] = t.z + Math.cos(i * 7.3) * 1.2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
  const mat = new THREE.PointsMaterial({ map: glowTexture(), color: 0xfff08a, size: 0.35, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, mat);
  points.visible = false;
  const pos = geo.getAttribute('position');
  return {
    points,
    update(time, night) {
      points.visible = night > 0.05;
      if (!points.visible) return;
      mat.opacity = night * (0.75 + Math.sin(time * 5) * 0.2);
      for (let i = 0; i < COUNT; i++) {
        const p = i * 1.7;
        pos.setXYZ(i, (base[i * 3] ?? 0) + Math.sin(time * 0.6 + p) * 0.6, (base[i * 3 + 1] ?? 0) + Math.sin(time * 1.3 + p) * 0.25, (base[i * 3 + 2] ?? 0) + Math.cos(time * 0.5 + p) * 0.6);
      }
      pos.needsUpdate = true;
    },
  };
}

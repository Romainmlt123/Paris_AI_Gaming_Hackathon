import * as THREE from 'three';
import type { TileMap } from '../game/map';
import { kindAt } from '../game/map';
import { P } from './textures';

const PAD = 16;

/** Blurred land mask: 1 on land, fading to 0 offshore. Drives shallow tint and foam. */
function shoreTexture(map: TileMap): THREE.CanvasTexture {
  const scale = 4;
  const w = (map.w + PAD * 2) * scale;
  const h = (map.h + PAD * 2) * scale;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.filter = 'blur(10px)';
  ctx.fillStyle = '#fff';
  for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) {
    const k = kindAt(map, x, z);
    if (k !== 'water' && k !== 'pontoon') ctx.fillRect((x + PAD) * scale, (z + PAD) * scale, scale, scale);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  return tex;
}

const vertex = /* glsl */ `
  varying vec2 vShoreUv;
  varying vec2 vWorld;
  uniform vec2 uOrigin;
  uniform vec2 uSize;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    vShoreUv = (world.xz - uOrigin) / uSize;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uShore;
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  varying vec2 vShoreUv;
  varying vec2 vWorld;
  void main() {
    float land = texture2D(uShore, clamp(vShoreUv, 0.0, 1.0)).r;
    float ripple = sin(vWorld.x * 1.7 + uTime * 0.9) * sin(vWorld.y * 1.3 - uTime * 0.7);
    vec3 col = mix(uDeep, uShallow, smoothstep(0.02, 0.55, land + ripple * 0.03));
    float edge = smoothstep(0.42, 0.5, land);
    col = mix(col, uFoam, edge * 0.9);
    float band = smoothstep(0.2, 0.28, land) * (1.0 - smoothstep(0.36, 0.42, land));
    float wave = step(0.55, sin(land * 60.0 - uTime * 1.8) * 0.5 + 0.5);
    col = mix(col, uFoam, band * wave * 0.55);
    gl_FragColor = vec4(col, 0.93);
    #include <colorspace_fragment>
  }
`;

export interface Water {
  mesh: THREE.Mesh;
  update(time: number): void;
}

export function createWater(map: TileMap): Water {
  const uniforms = {
    uShore: { value: shoreTexture(map) },
    uTime: { value: 0 },
    uOrigin: { value: new THREE.Vector2(-PAD - 0.5, -PAD - 0.5) },
    uSize: { value: new THREE.Vector2(map.w + PAD * 2, map.h + PAD * 2) },
    uDeep: { value: new THREE.Color(P.waterDeep) },
    uShallow: { value: new THREE.Color(P.waterShallow) },
    uFoam: { value: new THREE.Color(P.foam) },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(map.w / 2, -0.12, map.h / 2);
  mesh.name = 'water';
  return {
    mesh,
    update(time) {
      uniforms.uTime.value = time;
    },
  };
}

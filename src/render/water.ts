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

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  /** Cellular caustic lines: bright where two nearest cells are equidistant. */
  float caustic(vec2 p, float t) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = 0.5 + 0.4 * sin(t + 6.2831 * vec2(hash(i + g), hash(i + g + 17.0)));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
    return 1.0 - smoothstep(0.0, 0.06, d2 - d1);
  }

  void main() {
    vec2 p = floor(vWorld * 16.0) / 16.0;
    float land = texture2D(uShore, clamp(vShoreUv, 0.0, 1.0)).r;
    float swell = vnoise(p * 0.35 + vec2(uTime * 0.05, -uTime * 0.04)) - 0.5;
    float depth = clamp(land + swell * 0.08, 0.0, 1.0);
    // Stepped depth bands: abyss → deep → mid → lagoon, like painted pixel water.
    float bands = floor(smoothstep(0.02, 0.5, depth) * 4.0 + 0.5) / 4.0;
    vec3 abyss = uDeep * 0.62;
    vec3 col = mix(abyss, uDeep, smoothstep(0.0, 0.25, bands));
    col = mix(col, mix(uDeep, uShallow, 0.55), smoothstep(0.25, 0.5, bands));
    col = mix(col, uShallow * 1.08, smoothstep(0.5, 1.0, bands));
    // Caustics, strongest in the shallows.
    float c = caustic(p * 2.6 + vec2(uTime * 0.12, uTime * 0.07), uTime * 0.8);
    c *= step(0.45, vnoise(p * 0.9 + uTime * 0.1));
    col += vec3(0.85, 1.0, 0.95) * c * (0.02 + 0.16 * smoothstep(0.2, 0.5, land));
    // Wind ripples: short dashed highlights drifting across open water.
    float r = vnoise(vec2(p.x * 1.4 - uTime * 0.6, p.y * 5.0 + uTime * 0.2));
    col = mix(col, uFoam, step(0.86, r) * 0.35 * (1.0 - smoothstep(0.3, 0.5, land)));
    // Sun glints.
    float g = hash(floor(p * 3.0) + floor(uTime * 2.5));
    col += step(0.995, g) * 0.6 * (1.0 - land);
    // Waves rolling towards shore and breaking into broken foam.
    float wave = sin(land * 40.0 - uTime * 2.2 + vnoise(p * 0.8) * 3.0);
    float roll = smoothstep(0.15, 0.3, land) * (1.0 - smoothstep(0.4, 0.46, land));
    col = mix(col, uFoam, step(0.82, wave) * roll * 0.7);
    float foamNoise = vnoise(p * 2.5 + uTime * 0.5);
    float edge = smoothstep(0.4 + foamNoise * 0.06, 0.48, land);
    col = mix(col, uFoam, edge * 0.95);
    // Wet sand darkening just under the waterline.
    col = mix(col, col * 0.85 + vec3(0.05, 0.04, 0.0), smoothstep(0.48, 0.6, land));
    float alpha = mix(0.96, 0.8, smoothstep(0.3, 0.5, land));
    gl_FragColor = vec4(col, alpha);
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

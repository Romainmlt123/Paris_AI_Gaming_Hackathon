import * as THREE from 'three';
import { PAL } from './palette';
import { cliffTexture, grassTexture, sandTexture } from './textures';

// ---------- Forme de l'île (partagée JS/GLSL) ----------
export const GRASS_Y = 0.42;
export const HILL_Y = 1.25;
const HILL_CENTER = new THREE.Vector2(-1.5, -6.2);
const HILL_R = 3.6;

/** Rayon du rivage selon l'angle (z positif = vers la caméra). */
export function shoreRadius(theta: number): number {
  return 11 + 1.1 * Math.sin(2 * theta + 0.7) + 0.6 * Math.sin(3 * theta + 2.0) + 0.35 * Math.sin(5 * theta + 1.0);
}
/** Largeur de plage : plus large côté caméra (sud) pour le ponton. */
export function beachWidth(theta: number): number {
  return 1.5 + 1.4 * Math.max(0, Math.sin(theta));
}
const SHORE_GLSL = /* glsl */ `
  float shoreRadius(float t) { return 11.0 + 1.1 * sin(2.0 * t + 0.7) + 0.6 * sin(3.0 * t + 2.0) + 0.35 * sin(5.0 * t + 1.0); }
`;

function hillRadius(theta: number): number {
  return HILL_R + 0.5 * Math.sin(3 * theta + 0.4) + 0.25 * Math.sin(5 * theta);
}

/** Distance signée au rivage (négative = sur l'île). */
export function shoreDistance(x: number, z: number): number {
  return Math.hypot(x, z) - shoreRadius(Math.atan2(z, x));
}

export function isWalkable(x: number, z: number): boolean {
  if (shoreDistance(x, z) > -0.35) return false;
  const hx = x - HILL_CENTER.x;
  const hz = z - HILL_CENTER.y;
  return Math.hypot(hx, hz) > hillRadius(Math.atan2(hz, hx)) + 0.3;
}

/** Hauteur du sol, lissée pour que les sprites « sautillent » doucement entre herbe et sable. */
export function groundHeight(x: number, z: number): number {
  const theta = Math.atan2(z, x);
  const r = Math.hypot(x, z);
  const grassR = shoreRadius(theta) - beachWidth(theta);
  const t = THREE.MathUtils.smoothstep(r, grassR - 0.15, grassR + 0.25);
  const sandY = THREE.MathUtils.lerp(0.28, 0.02, THREE.MathUtils.clamp((r - grassR) / beachWidth(theta), 0, 1));
  return THREE.MathUtils.lerp(GRASS_Y, sandY, t);
}

function outline(radius: (t: number) => number, cx: number, cz: number, n: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = radius(t);
    // Shape en (x, -z) : l'extrusion est ensuite tournée de -90° autour de X.
    const x = cx + Math.cos(t) * r;
    const y = -(cz + Math.sin(t) * r);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return shape;
}

// ---------- Ombres mouvantes (nuages + feuillage) injectées dans les matériaux du sol ----------
export const worldUniforms = { uTime: { value: 0 } };

export function addDapple(mat: THREE.MeshLambertMaterial, strength = 0.22): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldPos;
        uniform float uTime;
        float dHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float dNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(dHash(i), dHash(i + vec2(1, 0)), f.x), mix(dHash(i + vec2(0, 1)), dHash(i + vec2(1, 1)), f.x), f.y);
        }`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          vec2 p = vWorldPos.xz * 0.22 + vec2(uTime * 0.05, uTime * 0.02);
          float n = dNoise(p) * 0.6 + dNoise(p * 2.7 + vec2(uTime * 0.11, 0.0)) * 0.4;
          float shade = smoothstep(0.52, 0.7, n) * ${strength.toFixed(3)};
          reflectedLight.directDiffuse *= 1.0 - shade * 2.2;
        }`,
      );
  };
}

// ---------- Construction ----------
export function buildIsland(scene: THREE.Scene): { water: THREE.Mesh } {
  const group = new THREE.Group();
  group.name = 'island';

  // Plateau d'herbe (extrusion : dessus herbe, flancs falaise).
  const grassShape = outline((t) => shoreRadius(t) - beachWidth(t), 0, 0, 160);
  const grassGeo = new THREE.ExtrudeGeometry(grassShape, {
    depth: GRASS_Y + 0.6,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.08,
    bevelSegments: 1,
    curveSegments: 1,
  });
  grassGeo.rotateX(-Math.PI / 2);
  grassGeo.translate(0, -0.6, 0);
  const gTex = grassTexture().clone();
  gTex.needsUpdate = true;
  gTex.repeat.set(0.5, 0.5);
  const grassMat = new THREE.MeshLambertMaterial({ map: gTex });
  addDapple(grassMat);
  const cTex = cliffTexture().clone();
  cTex.needsUpdate = true;
  cTex.repeat.set(0.5, 1.6);
  const cliffMat = new THREE.MeshLambertMaterial({ map: cTex });
  const grass = new THREE.Mesh(grassGeo, [grassMat, cliffMat]);
  grass.receiveShadow = true;
  group.add(grass);

  // Colline nord (deuxième niveau, bord de falaise).
  const hillShape = outline(hillRadius, HILL_CENTER.x, HILL_CENTER.y, 64);
  const hillGeo = new THREE.ExtrudeGeometry(hillShape, {
    depth: HILL_Y - GRASS_Y + 0.05,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.08,
    bevelSegments: 1,
  });
  hillGeo.rotateX(-Math.PI / 2);
  hillGeo.translate(0, GRASS_Y - 0.05, 0);
  const hill = new THREE.Mesh(hillGeo, [grassMat, cliffMat]);
  hill.receiveShadow = true;
  hill.castShadow = true;
  group.add(hill);

  // Plage : grille polaire qui descend doucement sous l'eau.
  group.add(buildBeach());

  scene.add(group);
  const water = buildWater();
  scene.add(water);
  return { water };
}

function buildBeach(): THREE.Mesh {
  const seg = 160;
  const rings = 7;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    const shore = shoreRadius(t);
    const inner = shore - beachWidth(t) - 0.2;
    for (let j = 0; j <= rings; j++) {
      const f = j / rings;
      const r = inner + f * (shore + 3 - inner);
      const x = Math.cos(t) * r;
      const z = Math.sin(t) * r;
      const y = r <= shore ? THREE.MathUtils.lerp(0.3, 0.02, (r - inner) / (shore - inner)) : -Math.min(1.2, (r - shore) * 0.45);
      pos.push(x, y, z);
      uv.push(x * 0.5, z * 0.5);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rings; j++) {
      const a = i * (rings + 1) + j;
      const b = (i + 1) * (rings + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const tex = sandTexture();
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  addDapple(mat, 0.14);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function buildWater(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(220, 220, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: worldUniforms.uTime,
      uDeep: { value: new THREE.Color(PAL.waterDeep) },
      uShallow: { value: new THREE.Color(PAL.waterShallow) },
      uFoam: { value: new THREE.Color(PAL.foam) },
      uSun: { value: new THREE.Color('#ffd9a8') },
      fogColor: { value: new THREE.Color('#6fa9b4') },
      fogNear: { value: 30 },
      fogFar: { value: 62 },
    },
    fog: true,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeep, uShallow, uFoam, uSun;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      ${SHORE_GLSL}
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n2(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec2 p = vWorld.xz;
        float th = atan(p.y, p.x);
        float d = length(p) - shoreRadius(th);
        // Pixelisation légère des motifs pour rester dans le ton pixel art.
        vec2 q = floor(p * 6.0) / 6.0;
        float ripple = n2(q * 0.9 + vec2(uTime * 0.25, uTime * 0.12)) * 0.6 + n2(q * 2.3 - vec2(uTime * 0.18, 0.0)) * 0.4;
        float depth = smoothstep(-0.2, 7.0, d);
        vec3 col = mix(uShallow, uDeep, depth);
        col += (ripple - 0.5) * 0.06;
        // Reflets du soleil couchant.
        float glint = step(0.86, n2(q * 2.2 + vec2(uTime * 0.4, uTime * 0.3))) * (1.0 - depth * 0.6);
        col = mix(col, uSun, glint * 0.35);
        // Écume animée qui lèche le rivage.
        float wave = 0.25 + 0.12 * sin(uTime * 1.3 + th * 6.0);
        float foam = smoothstep(wave + 0.08, wave, d) * step(-0.3, d);
        float foam2 = smoothstep(0.07, 0.0, abs(d - (0.8 + 0.3 * sin(uTime * 0.9 + th * 3.0)))) * 0.45;
        col = mix(col, uFoam, clamp(foam + foam2 * (ripple > 0.45 ? 1.0 : 0.0), 0.0, 1.0));
        float alpha = mix(0.72, 0.97, smoothstep(0.0, 2.5, d));
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.0;
  mesh.renderOrder = 1;
  return mesh;
}

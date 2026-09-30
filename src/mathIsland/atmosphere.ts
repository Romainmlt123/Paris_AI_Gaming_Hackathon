import * as THREE from 'three';
import { rockGeometry, type Tick } from './island';
import { cloudTexture, rng, softDotTexture } from './textures';

export const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 22), THREE.MathUtils.degToRad(35));
const HAZE = new THREE.Color('#b9d2ec');

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uCloudTop;
uniform vec3 uAbyss;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col;
  if (y > 0.0) {
    col = mix(uHorizon, uMid, smoothstep(0.0, 0.18, y));
    col = mix(col, uZenith, smoothstep(0.18, 0.8, y));
  } else {
    col = mix(uHorizon, uCloudTop, smoothstep(0.0, 0.03, -y));
    col = mix(col, uAbyss, smoothstep(0.03, 0.55, -y));
  }
  float s = max(dot(d, uSun), 0.0);
  col += vec3(1.0, 0.78, 0.5) * (pow(s, 6.0) * 0.28 + pow(s, 60.0) * 0.35);
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, s) * 0.6;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function skyDome(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uSun: { value: SUN_DIR.clone() },
      uZenith: { value: new THREE.Color('#2f6fc4') },
      uMid: { value: new THREE.Color('#7fb3e6') },
      uHorizon: { value: new THREE.Color('#f4dcc0') },
      uCloudTop: { value: new THREE.Color('#dce9f6') },
      uAbyss: { value: new THREE.Color('#3f7cc4') },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  dome.name = 'sky';
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  return dome;
}

/** Late-afternoon sky dome, reused for image-based lighting, plus matching distance haze. */
export function addSky(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
  scene.add(skyDome());
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(skyDome());
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 2000).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  scene.fog = new THREE.FogExp2(HAZE, 0.0055);
}

function cloudMaterials(): THREE.SpriteMaterial[] {
  return [3, 7, 12, 19].map(
    (seed) => new THREE.SpriteMaterial({ map: cloudTexture(seed), transparent: true, depthWrite: false, toneMapped: false }),
  );
}

/** Sea of clouds under the island, plus far cumulus banks drifting around it. */
export function addClouds(scene: THREE.Scene, ticks: Tick[], count: number): void {
  const rand = rng(61);
  const mats = cloudMaterials();
  const sea = new THREE.Group();
  sea.name = 'cloud-sea';
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 70;
    const mat = mats[i % mats.length].clone();
    mat.rotation = (rand() - 0.5) * 0.6;
    mat.color.setRGB(0.9 + rand() * 0.05, 0.91 + rand() * 0.05, 0.95);
    const s = new THREE.Sprite(mat);
    const size = 10 + rand() * 14;
    s.scale.set(size, size * 0.62, 1);
    s.position.set(Math.cos(a) * r, -11.5 - rand() * 2.5 + (r / 70) * 1.5, Math.sin(a) * r);
    sea.add(s);
  }
  const banks = new THREE.Group();
  banks.name = 'cloud-banks';
  for (let c = 0; c < 9; c++) {
    const a = (c / 9) * Math.PI * 2 + rand() * 0.4;
    const r = 75 + rand() * 40;
    const cy = -16 + rand() * 8;
    for (let i = 0; i < 7; i++) {
      const mat = mats[(c + i) % mats.length].clone();
      const s = new THREE.Sprite(mat);
      const size = 14 + rand() * 18;
      s.scale.set(size, size * 0.6, 1);
      s.position.set(Math.cos(a) * r + (rand() - 0.5) * 22, cy + (rand() - 0.3) * 6, Math.sin(a) * r + (rand() - 0.5) * 22);
      banks.add(s);
    }
  }
  scene.add(sea, banks);
  ticks.push((_t, dt) => {
    sea.rotation.y += dt * 0.004;
    banks.rotation.y -= dt * 0.002;
  });
}

function islet(seed: number): THREE.Group {
  const rand = rng(seed);
  const g = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8a6a4c', roughness: 0.95 });
  const rock = new THREE.Mesh(rockGeometry(seed, 1, 1.4, 2), rockMat);
  rock.scale.set(1, 1, 1);
  rock.position.y = -0.9;
  const cap = new THREE.Mesh(rockGeometry(seed + 1, 1.05, 0.22, 2), new THREE.MeshStandardMaterial({ color: '#6aa83e', roughness: 0.9 }));
  cap.position.y = 0.1;
  g.add(rock, cap);
  const leaves = new THREE.MeshStandardMaterial({ color: '#3f7f2a', roughness: 0.85 });
  for (let i = 0; i < 2 + Math.floor(rand() * 3); i++) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.5, 6), new THREE.MeshStandardMaterial({ color: '#6b4a2f' }));
    trunk.position.y = 0.25;
    const crown = new THREE.Mesh(rockGeometry(seed + 10 + i, 0.32, 1.1, 2), leaves);
    crown.position.y = 0.65;
    tree.add(trunk, crown);
    const a = rand() * Math.PI * 2;
    tree.position.set(Math.cos(a) * 0.5 * rand(), 0.2, Math.sin(a) * 0.5 * rand());
    g.add(tree);
  }
  return g;
}

/** Smaller islands floating in the distance for depth. */
export function addIslets(scene: THREE.Scene, ticks: Tick[]): void {
  const spots: [number, number, number, number][] = [
    [-26, 3, -30, 2.4],
    [30, -2, -24, 3.2],
    [-34, -4, 12, 2.0],
    [22, 5, 30, 1.6],
    [-20, 9, -52, 2.8],
  ];
  spots.forEach(([x, y, z, s], i) => {
    const g = islet(70 + i * 5);
    g.position.set(x, y, z);
    g.scale.setScalar(s);
    g.name = `islet-${i}`;
    scene.add(g);
    ticks.push((t) => {
      g.position.y = y + Math.sin(t * 0.4 + i * 2) * 0.4;
    });
  });
}

/** Warm dust motes drifting in the sunlight. */
export function addMotes(scene: THREE.Scene, ticks: Tick[]): void {
  const rand = rng(83);
  const n = 90;
  const pos = new Float32Array(n * 3);
  const base = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    base[i * 3] = (rand() - 0.5) * 20;
    base[i * 3 + 1] = -3 + rand() * 10;
    base[i * 3 + 2] = (rand() - 0.5) * 18;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      map: softDotTexture(),
      color: '#ffe9b8',
      size: 0.12,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  points.name = 'motes';
  scene.add(points);
  ticks.push((t) => {
    for (let i = 0; i < n; i++) {
      const p = i * 3;
      pos[p] = base[p] + Math.sin(t * 0.2 + i) * 0.6;
      pos[p + 1] = base[p + 1] + Math.sin(t * 0.3 + i * 1.7) * 0.4;
      pos[p + 2] = base[p + 2] + Math.cos(t * 0.25 + i * 0.7) * 0.6;
    }
    geo.attributes.position.needsUpdate = true;
  });
}

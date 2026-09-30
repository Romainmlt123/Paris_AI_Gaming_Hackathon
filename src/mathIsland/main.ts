import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { buildIsland, footprints, scatter, settleOnTerrain, type Tick } from './island';
import { buildProps } from './props';
import { addClouds, addIslets, addMotes, addSky, SUN_DIR } from './atmosphere';

const low = new URLSearchParams(location.search).get('q') === 'low';

function byId<T extends HTMLElement>(id: string, type: { new (): T }): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`#${id} missing`);
  return el;
}

const canvas = byId('scene', HTMLCanvasElement);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = !low;
renderer.shadowMap.type = THREE.PCFShadowMap;

const ticks: Tick[] = [];
const scene = new THREE.Scene();
addSky(renderer, scene);
addClouds(scene, ticks, low ? 40 : 90);
addIslets(scene, ticks);
if (!low) addMotes(scene, ticks);

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 2000);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, -0.6, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 12;
controls.maxDistance = 75;
controls.maxPolarAngle = THREE.MathUtils.degToRad(110);
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;

scene.add(new THREE.HemisphereLight('#cfe3ff', '#6b5238', 0.5));
const sun = new THREE.DirectionalLight('#ffe0b5', 3.0);
sun.position.copy(SUN_DIR).multiplyScalar(30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);
const fill = new THREE.DirectionalLight('#9fc2ff', 0.8);
fill.position.set(-SUN_DIR.x, 0.4, -SUN_DIR.z).multiplyScalar(20);
scene.add(fill);

const island = buildIsland(ticks);
const props = buildProps(ticks);
settleOnTerrain(props);
island.model.add(props);
island.model.add(scatter(footprints(props), { grassClumps: low ? 900 : 2600, flowers: low ? 120 : 320 }, ticks));
const floating = new THREE.Group();
floating.add(island.model, island.fx);
scene.add(floating);

island.model.traverse((obj) => {
  if (!(obj instanceof THREE.Mesh) || obj.name === 'grass' || obj.name === 'flowers') return;
  const basic = Array.isArray(obj.material) ? false : obj.material instanceof THREE.MeshBasicMaterial;
  obj.castShadow = !basic;
  obj.receiveShadow = !basic;
});

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.5, 1.05);
bloom.enabled = !low;
composer.addPass(bloom);
composer.addPass(new OutputPass());
if (!low) composer.addPass(new SMAAPass());

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  frameCamera();
}

function frameCamera(): void {
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(9.2 / tanV, 8.4 / (tanV * camera.aspect));
  const dir = new THREE.Vector3(0, 0.3, 1).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, dist);
}

window.addEventListener('resize', resize);
resize();

let resumeAt = 0;
let userPaused = false;
const spinButton = byId('spin', HTMLButtonElement);
spinButton.addEventListener('click', () => {
  userPaused = !userPaused;
  spinButton.textContent = userPaused ? 'Reprendre rotation' : 'Pause rotation';
});
controls.addEventListener('start', () => {
  resumeAt = Number.POSITIVE_INFINITY;
});
controls.addEventListener('end', () => {
  resumeAt = performance.now() + 4000;
});

byId('export', HTMLButtonElement).addEventListener('click', () => {
  const exporter = new GLTFExporter();
  exporter.parse(
    island.model,
    (result) => {
      if (!(result instanceof ArrayBuffer)) {
        console.error('[ile-maths] GLB export returned JSON instead of binary');
        return;
      }
      const url = URL.createObjectURL(new Blob([result], { type: 'model/gltf-binary' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ile-des-maths.glb';
      a.click();
      URL.revokeObjectURL(url);
    },
    (err) => {
      console.error('[ile-maths] GLB export failed', err);
      window.alert("L'export GLB a échoué, voir la console.");
    },
    { binary: true },
  );
});

const timer = new THREE.Timer();
timer.connect(document);
function loop(timestamp?: number): void {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.1);
  const t = timer.getElapsed();
  floating.position.y = Math.sin(t * 0.8) * 0.3;
  for (const tick of ticks) tick(t, dt);
  controls.autoRotate = !userPaused && performance.now() > resumeAt;
  controls.update(dt);
  composer.render(dt);
  requestAnimationFrame(loop);
}
loop();

Object.assign(window, { ileMaths: { scene, camera, controls, bloom, renderer } });

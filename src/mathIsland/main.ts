import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildIsland, type Tick } from './island';
import { buildProps } from './props';
import { shadowTexture, skyTexture } from './textures';

const low = new URLSearchParams(location.search).get('q') === 'low';

function byId<T extends HTMLElement>(id: string, type: { new (): T }): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`#${id} missing`);
  return el;
}

const canvas = byId('scene', HTMLCanvasElement);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1 : 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = !low;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = skyTexture();

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, -0.6, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 12;
controls.maxDistance = 48;
controls.maxPolarAngle = THREE.MathUtils.degToRad(110);
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;

scene.add(new THREE.HemisphereLight('#ffffff', '#8c7b6b', 1.4));
const sun = new THREE.DirectionalLight('#fff0d8', 2.6);
sun.position.set(7, 14, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -9;
sun.shadow.camera.right = 9;
sun.shadow.camera.top = 9;
sun.shadow.camera.bottom = -9;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun);
const fill = new THREE.DirectionalLight('#cfe2ff', 0.6);
fill.position.set(-8, 4, -6);
scene.add(fill);

const ticks: Tick[] = [];
const island = buildIsland(ticks);
const props = buildProps(ticks);
island.model.add(props);
const floating = new THREE.Group();
floating.add(island.model, island.fx);
scene.add(floating);

island.model.traverse((obj) => {
  if (!(obj instanceof THREE.Mesh)) return;
  const basic = Array.isArray(obj.material) ? false : obj.material instanceof THREE.MeshBasicMaterial;
  obj.castShadow = !basic;
  obj.receiveShadow = !basic;
});

const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = -12;
scene.add(shadow);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.45, 1.0);
bloom.enabled = !low;
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
}

function frameCamera(): void {
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(9.2 / tanV, 8.4 / (tanV * camera.aspect));
  const dir = new THREE.Vector3(0, 0.36, 1).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, dist);
}

window.addEventListener('resize', resize);
resize();
frameCamera();

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
  const s = 13 - floating.position.y * 2;
  shadow.scale.set(s, s * 0.55, 1);
  for (const tick of ticks) tick(t, dt);
  controls.autoRotate = !userPaused && performance.now() > resumeAt;
  controls.update(dt);
  composer.render(dt);
  requestAnimationFrame(loop);
}
loop();

Object.assign(window, { ileMaths: { scene, camera, controls } });

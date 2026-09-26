import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { P } from './textures';

/** Final grade in display space: warm lift, gentle saturation, soft vignette. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.12);
      c = c * vec3(1.03, 1.0, 0.95) + vec3(0.015, 0.01, 0.0);
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.25);
      vec2 d = vUv - 0.5;
      c *= 1.0 - dot(d, d) * 0.55;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export type Quality = 'low' | 'mid' | 'high';

const PITCH = THREE.MathUtils.degToRad(50);
const DISTANCE = 25;

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  quality: Quality;
  setQuality(q: Quality): void;
  resize(): void;
  /** Smoothly frame a world point (the player). */
  follow(target: THREE.Vector3, dt: number): void;
  /** Camera shake, decays over ~0.5 s. */
  shake(power: number): void;
  render(): void;
}

function lights(scene: THREE.Scene): THREE.DirectionalLight {
  scene.add(new THREE.HemisphereLight('#ffe2c2', '#3c5f6e', 1.05));
  const sun = new THREE.DirectionalLight('#ffc98e', 3.1);
  sun.position.set(-10, 8, 4);
  sun.castShadow = true;
  const cam = sun.shadow.camera;
  cam.left = -14;
  cam.right = 14;
  cam.top = 14;
  cam.bottom = -14;
  cam.near = 1;
  cam.far = 50;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  return sun;
}

export function createStage(canvas: HTMLCanvasElement, initial: Quality): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.background);
  scene.fog = new THREE.Fog(P.background, 30, 60);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 120);
  const sun = lights(scene);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.5, 0.82);
  const hTilt = new ShaderPass(HorizontalTiltShiftShader);
  const vTilt = new ShaderPass(VerticalTiltShiftShader);
  for (const p of [hTilt, vTilt]) p.uniforms['r'] = { value: 0.5 };
  composer.addPass(bloom);
  composer.addPass(hTilt);
  composer.addPass(vTilt);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GradeShader));

  const focus = new THREE.Vector3();
  let shaking = 0;
  const stage: Stage = {
    renderer,
    scene,
    camera,
    sun,
    quality: initial,
    setQuality(q) {
      stage.quality = q;
      const size = q === 'low' ? 1024 : q === 'mid' ? 2048 : 4096;
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      bloom.enabled = q !== 'low';
      hTilt.enabled = q === 'high';
      vTilt.enabled = q === 'high';
      stage.resize();
    },
    resize() {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio, stage.quality === 'high' ? 2 : stage.quality === 'mid' ? 1.5 : 1);
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h, false);
      composer.setPixelRatio(ratio);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.fov = w / h < 0.7 ? 38 : 26;
      camera.updateProjectionMatrix();
      hTilt.uniforms['h'] = { value: 1.2 / (w * ratio) };
      vTilt.uniforms['v'] = { value: 1.2 / (h * ratio) };
    },
    follow(target, dt) {
      const k = 1 - Math.exp(-dt * 4);
      focus.lerp(target, focus.lengthSq() === 0 ? 1 : k);
      shaking *= Math.exp(-dt * 6);
      const jx = (Math.random() - 0.5) * shaking;
      const jz = (Math.random() - 0.5) * shaking;
      camera.position.set(focus.x + jx, focus.y + Math.sin(PITCH) * DISTANCE, focus.z + Math.cos(PITCH) * DISTANCE + jz);
      camera.lookAt(focus.x + jx, focus.y, focus.z + jz);
      sun.position.set(focus.x - 10, 8, focus.z + 4);
      sun.target.position.copy(focus);
    },
    shake(power) {
      shaking = Math.max(shaking, power);
    },
    render() {
      if (stage.quality === 'low') renderer.render(scene, camera);
      else composer.render();
    },
  };
  stage.setQuality(initial);
  return stage;
}

/** Drops quality when the frame rate stays low for a couple of seconds. */
export function createQualityGovernor(stage: Stage, onChange: (q: Quality) => void): (dt: number) => number {
  let acc = 0;
  let frames = 0;
  let slow = 0;
  let fps = 60;
  return (dt) => {
    acc += dt;
    frames++;
    if (acc >= 1) {
      fps = frames / acc;
      acc = 0;
      frames = 0;
      slow = fps < 45 ? slow + 1 : 0;
      if (slow >= 2 && stage.quality !== 'low') {
        const next: Quality = stage.quality === 'high' ? 'mid' : 'low';
        stage.setQuality(next);
        onChange(next);
        slow = 0;
      }
    }
    return fps;
  };
}

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { P } from './textures';

export type Quality = 'low' | 'mid' | 'high';

const PITCH = THREE.MathUtils.degToRad(50);
const DISTANCE = 30;

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
  render(): void;
}

function lights(scene: THREE.Scene): THREE.DirectionalLight {
  scene.add(new THREE.HemisphereLight(P.sky, P.skyGround, 1.25));
  const sun = new THREE.DirectionalLight(P.sun, 2.6);
  sun.position.set(-9, 12, 6);
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

  const focus = new THREE.Vector3();
  const stage: Stage = {
    renderer,
    scene,
    camera,
    sun,
    quality: initial,
    setQuality(q) {
      stage.quality = q;
      const size = q === 'low' ? 1024 : 2048;
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
      camera.fov = w / h < 0.7 ? 40 : 28;
      camera.updateProjectionMatrix();
      hTilt.uniforms['h'] = { value: 1.2 / (w * ratio) };
      vTilt.uniforms['v'] = { value: 1.2 / (h * ratio) };
    },
    follow(target, dt) {
      const k = 1 - Math.exp(-dt * 4);
      focus.lerp(target, focus.lengthSq() === 0 ? 1 : k);
      camera.position.set(focus.x, focus.y + Math.sin(PITCH) * DISTANCE, focus.z + Math.cos(PITCH) * DISTANCE);
      camera.lookAt(focus);
      sun.position.set(focus.x - 9, 12, focus.z + 6);
      sun.target.position.copy(focus);
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

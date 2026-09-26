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
  /** Lights the island for a time of day, in minutes since midnight. */
  setClock(minutes: number): void;
  /** 0 by day, 1 at full night (set by `setClock`). */
  night: number;
}

interface Daylight {
  h: number;
  sun: number;
  sunColor: number;
  hemi: number;
  sky: number;
  bg: number;
  exposure: number;
}

/** Keyframes of the day/night cycle; the island stays readable at night (moonlight, not black). */
const DAY: readonly Daylight[] = [
  { h: 0, sun: 1.1, sunColor: 0x8fb0ff, hemi: 0.95, sky: 0x6f84f0, bg: 0x16224f, exposure: 0.92 },
  { h: 5, sun: 1.1, sunColor: 0x9fb4ff, hemi: 0.95, sky: 0x7a86e8, bg: 0x1c2658, exposure: 0.92 },
  { h: 7, sun: 1.8, sunColor: 0xffc49a, hemi: 1.0, sky: 0xffc7b0, bg: 0xf3b9a2, exposure: 0.98 },
  { h: 10, sun: 2.6, sunColor: 0xfff1d6, hemi: 1.25, sky: 0xffffff, bg: 0xffffff, exposure: 1.05 },
  { h: 17, sun: 2.5, sunColor: 0xffe2b8, hemi: 1.2, sky: 0xffffff, bg: 0xffffff, exposure: 1.05 },
  { h: 19.5, sun: 1.6, sunColor: 0xff8a50, hemi: 0.9, sky: 0xff9f7a, bg: 0xe9805f, exposure: 0.95 },
  { h: 21.5, sun: 1.1, sunColor: 0x8fb0ff, hemi: 0.95, sky: 0x6f84f0, bg: 0x16224f, exposure: 0.92 },
  { h: 24, sun: 1.1, sunColor: 0x8fb0ff, hemi: 0.95, sky: 0x6f84f0, bg: 0x16224f, exposure: 0.92 },
];

/** How dark it is: ramps in after sunset, out at dawn. */
export function nightness(minutes: number): number {
  const h = (((minutes / 60) % 24) + 24) % 24;
  const s = (a: number, b: number, x: number): number => Math.min(1, Math.max(0, (x - a) / (b - a)));
  if (h >= 12) return s(19.5, 21.5, h);
  return 1 - s(5, 7, h);
}

function daylightAt(hour: number): { a: Daylight; b: Daylight; t: number } {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < DAY.length - 1; i++) {
    const a = DAY[i];
    const b = DAY[i + 1];
    if (a && b && h >= a.h && h <= b.h) return { a, b, t: (h - a.h) / (b.h - a.h) };
  }
  const last = DAY[0] as Daylight;
  return { a: last, b: last, t: 0 };
}

function lights(scene: THREE.Scene): { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight } {
  const hemi = new THREE.HemisphereLight(P.sky, P.skyGround, 1.25);
  scene.add(hemi);
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
  return { sun, hemi };
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
  const { sun, hemi } = lights(scene);
  const baseBg = new THREE.Color(P.background);
  const baseSky = new THREE.Color(P.sky);
  const baseSun = new THREE.Color(P.sun);
  const ca = new THREE.Color();
  const cb = new THREE.Color();
  const tint = (out: THREE.Color, base: THREE.Color, a: number, b: number, t: number): void => {
    ca.setHex(a);
    cb.setHex(b);
    out.copy(base).multiply(ca.lerp(cb, t));
  };

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
    night: 0,
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
    setClock(minutes) {
      const { a, b, t } = daylightAt(minutes / 60);
      const mix = (x: number, y: number): number => x + (y - x) * t;
      sun.intensity = mix(a.sun, b.sun);
      hemi.intensity = mix(a.hemi, b.hemi);
      tint(sun.color, baseSun, a.sunColor, b.sunColor, t);
      tint(hemi.color, baseSky, a.sky, b.sky, t);
      const bg = scene.background instanceof THREE.Color ? scene.background : new THREE.Color();
      tint(bg, baseBg, a.bg, b.bg, t);
      scene.background = bg;
      scene.fog?.color.copy(bg);
      renderer.toneMappingExposure = mix(a.exposure, b.exposure);
      stage.night = nightness(minutes);
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

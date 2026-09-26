import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PAL } from './palette';

export type Quality = 'low' | 'medium' | 'high';

// Caméra plongeante façon maquette : focale serrée, ~48° de plongée.
const CAM_PITCH = THREE.MathUtils.degToRad(48);
const CAM_DIST = 30;
const CAM_FOV = 26;
// Soleil bas à gauche : longues ombres vers la droite, ambiance fin d'après-midi.
const SUN_OFFSET = new THREE.Vector3(-17, 11, 4);

/** Tilt-shift + étalonnage chaud + vignette, en une seule passe. */
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uBlur: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uBlur;
    varying vec2 vUv;
    void main() {
      // Bande nette au centre (légèrement sous le milieu, là où est le joueur).
      float d = abs(vUv.y - 0.46);
      float amount = smoothstep(0.16, 0.5, d) * uBlur;
      vec2 px = amount * 2.2 / uResolution;
      vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
      c += texture2D(tDiffuse, vUv + vec2(px.x, px.y) * 1.3846153846) * 0.1581081081;
      c += texture2D(tDiffuse, vUv - vec2(px.x, px.y) * 1.3846153846) * 0.1581081081;
      c += texture2D(tDiffuse, vUv + vec2(-px.x, px.y) * 1.3846153846) * 0.1581081081;
      c += texture2D(tDiffuse, vUv - vec2(-px.x, px.y) * 1.3846153846) * 0.1581081081;
      c += texture2D(tDiffuse, vUv + vec2(0.0, px.y) * 3.2307692308) * 0.0702702703;
      c += texture2D(tDiffuse, vUv - vec2(0.0, px.y) * 3.2307692308) * 0.0702702703;
      vec3 col = c.rgb / (0.2270270270 + 0.1581081081 * 4.0 + 0.0702702703 * 2.0);
      // Étalonnage : ombres légèrement bleutées, hautes lumières dorées.
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col * vec3(0.93, 0.97, 1.06), col * vec3(1.06, 1.0, 0.9), smoothstep(0.2, 0.8, l));
      col = mix(vec3(l), col, 1.08);
      // Vignette douce.
      vec2 q = vUv - 0.5;
      col *= 1.0 - dot(q, q) * 0.55;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly camTarget = new THREE.Vector3();
  quality: Quality;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private finish: ShaderPass | null = null;
  private readonly camOffset: THREE.Vector3;

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'high', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = new THREE.Color(PAL.waterDeep);
    this.scene.fog = new THREE.Fog(new THREE.Color('#6fa9b4'), 30, 62);

    this.camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 1, 120);
    this.camOffset = new THREE.Vector3(0, Math.sin(CAM_PITCH) * CAM_DIST, Math.cos(CAM_PITCH) * CAM_DIST);

    // Lumière de fin de journée : soleil bas, orangé, venant de la gauche.
    const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.1);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(PAL.sun, 3.0);
    this.sun.position.copy(SUN_OFFSET);
    this.sun.castShadow = true;
    const sm = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    const cam = this.sun.shadow.camera;
    cam.left = -16;
    cam.right = 16;
    cam.top = 16;
    cam.bottom = -16;
    cam.near = 1;
    cam.far = 60;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);

    this.setupPost();
    this.resize();
  }

  private setupPost(): void {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    this.finish = null;
    if (this.quality === 'low') return;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality === 'high') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.6, 0.82);
      composer.addPass(this.bloom);
    }
    composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    composer.addPass(this.finish);
    this.composer = composer;
  }

  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    const sm = q === 'high' ? 2048 : 1024;
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.sun.shadow.mapSize.set(sm, sm);
    this.setupPost();
    this.resize();
    console.info(`[stage] qualité → ${q}`);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const maxDpr = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // En portrait, on recule un peu pour garder l'île lisible sur 390 px.
    this.camera.fov = w / h < 0.7 ? CAM_FOV * 1.3 : CAM_FOV;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);
    }
    if (this.finish) this.finish.uniforms.uResolution!.value.set(w * dpr, h * dpr);
    if (this.bloom) this.bloom.resolution.set(w / 2, h / 2);
  }

  /** Suivi caméra amorti ; la lumière suit pour garder une shadow map serrée. */
  follow(target: THREE.Vector3, dt: number, snap = false): void {
    const k = snap ? 1 : 1 - Math.exp(-dt * 3.5);
    this.camTarget.lerp(target, k);
    this.camera.position.copy(this.camTarget).add(this.camOffset);
    this.camera.lookAt(this.camTarget);
    this.sun.target.position.copy(this.camTarget);
    this.sun.position.copy(this.camTarget).add(SUN_OFFSET);
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}

/*
 * STUDIO: renderer + luces de estudio (suaves). Portado de js/pet3d/Studio.js.
 *
 * DIFERENCIAS MÓVIL:
 *  - El renderer recibe el contexto de expo-gl (no hay <canvas>): ver createRenderer.
 *  - PCFSoftShadowMap ya no existe en three r18x → PCFShadowMap.
 *  - El entorno PMREM (RoomEnvironment) es opcional: usa render targets de
 *    coma flotante que algunos GPUs Android no soportan en expo-gl. Sin él se
 *    compensa con más luz hemisférica.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface StudioLights {
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  base: { hemi: number; key: number; fill: number; rim: number; env: number };
}

// Superficie mínima que WebGLRenderer espera de un <canvas>
export interface CanvasShim {
  width: number;
  height: number;
  style: Record<string, string>;
  clientWidth: number;
  clientHeight: number;
  addEventListener: () => void;
  removeEventListener: () => void;
  getContext: () => WebGL2RenderingContext;
}

export function createCanvasShim(gl: WebGL2RenderingContext): CanvasShim {
  return {
    width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, style: {},
    clientWidth: gl.drawingBufferWidth, clientHeight: gl.drawingBufferHeight,
    addEventListener: () => {}, removeEventListener: () => {}, getContext: () => gl,
  };
}

/*
 * INCOMPATIBILIDAD expo-gl ↔ three ≥ r163 (documentada en docs/):
 * three rechaza `context instanceof WebGLRenderingContext` ("WebGL 1 is not
 * supported"). expo-gl hace que sus contextos WebGL2 HEREDEN de
 * WebGLRenderingContext (como dice la especificación), así que un contexto
 * WebGL2 válido también cae en esa comprobación. Solución mínima: si expo-gl
 * confirma WebGL2, se oculta el global solo durante el constructor
 * (síncrono) y se restaura. Si el dispositivo solo tiene WebGL1, se lanza un
 * error claro y la UI muestra la ilustración de respaldo.
 */
function constructWebGL2Renderer(gl: WebGL2RenderingContext & { supportsWebGL2?: boolean }, params: THREE.WebGLRendererParameters): THREE.WebGLRenderer {
  if (gl.supportsWebGL2 === false) throw new Error('Este dispositivo solo soporta WebGL 1 (se necesita OpenGL ES 3)');
  const g = globalThis as { WebGLRenderingContext?: unknown };
  const saved = g.WebGLRenderingContext;
  g.WebGLRenderingContext = undefined;
  try {
    return new THREE.WebGLRenderer(params);
  } finally {
    g.WebGLRenderingContext = saved;
  }
}

export function createRenderer(gl: WebGL2RenderingContext, { shadows }: { shadows: boolean }): THREE.WebGLRenderer {
  const canvas = createCanvasShim(gl) as unknown as HTMLCanvasElement;
  const r = constructWebGL2Renderer(gl, { canvas, context: gl, antialias: false, alpha: true, powerPreference: 'high-performance' });
  r.setPixelRatio(1); // el buffer de expo-gl ya está en píxeles físicos
  r.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = shadows;
  r.shadowMap.type = THREE.PCFShadowMap;
  return r;
}

export function setupStudio(scene: THREE.Scene, renderer: THREE.WebGLRenderer, { extent = 4, environment = false } = {}): StudioLights {
  let env = 0;
  if (environment) {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.45;
      env = 0.45;
      pmrem.dispose();
    } catch (e) {
      console.warn('[Studio] Entorno PMREM no disponible, solo luces', e);
    }
  }
  const hemiBase = env ? 0.9 : 1.35;
  const hemi = new THREE.HemisphereLight('#fff6ea', '#e2cfc4', hemiBase);
  scene.add(hemi);

  const key = new THREE.DirectionalLight('#fff1e0', 2.1);
  key.position.set(-3, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  const sc = key.shadow.camera;
  sc.left = -extent; sc.right = extent; sc.top = extent; sc.bottom = -extent; sc.near = 1; sc.far = 20;
  scene.add(key);

  const fill = new THREE.DirectionalLight('#ffe9f0', 0.7);
  fill.position.set(4, 3, 4);
  scene.add(fill);

  const rim = new THREE.DirectionalLight('#ffffff', 0.9);
  rim.position.set(0, 4, -5);
  scene.add(rim);
  return { hemi, key, fill, rim, base: { hemi: hemiBase, key: 2.1, fill: 0.7, rim: 0.9, env } };
}

// Luz apagada: todo baja suavemente y se vuelve azulado
export function setDarkness(scene: THREE.Scene, lights: StudioLights, amount: number): void {
  const b = lights.base, k = 1 - 0.72 * amount;
  lights.hemi.intensity = b.hemi * k;
  lights.key.intensity = b.key * (1 - 0.8 * amount);
  lights.fill.intensity = b.fill * k;
  lights.rim.intensity = b.rim * (1 - 0.4 * amount);
  scene.environmentIntensity = b.env * k;
  lights.hemi.color.set(amount > 0.5 ? '#aab4ff' : '#fff6ea');
}

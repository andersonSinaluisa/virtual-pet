/*
 * PET MATERIALS (portado de js/pet3d/PetMaterials.js)
 * ---------------------------------------------------
 * Materiales compartidos (se crean una vez y se reutilizan).
 * - Felpa: rugosidad alta, sin metal, "sheen" (brillo de tela) y un mapa de
 *   normales de ruido muy suave. Con quality.fur = false, material estándar.
 * - Ojos: negro muy pulido con clearcoat.
 *
 * DIFERENCIA MÓVIL: el prototipo generaba el ruido en un <canvas> 2D; aquí
 * se genera el mismo ruido directamente en un Uint8Array → THREE.DataTexture
 * (no hay DOM en React Native). `transmission` se sustituye por opacidad
 * (evita un render target extra en GPUs móviles).
 */
import * as THREE from 'three';

export const PetQuality = { fur: true, furLayers: 4, furLength: 0.024, shadows: true };

type Rgba = Uint8Array;

function prng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Ruido de valor suavizado (mismo algoritmo que noiseCanvas del prototipo)
function valueNoise(size: number, scale: number, seed: number): Float32Array {
  const rand = prng(seed);
  const g = scale;
  const grid: number[] = [];
  for (let i = 0; i < (g + 1) * (g + 1); i++) grid.push(rand());
  const at = (x: number, y: number) => grid[(y % g) * (g + 1) + (x % g)];
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * g, fy = (y / size) * g, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const v = (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
    out[y * size + x] = v * 0.7 + rand() * 0.3;
  }
  return out;
}

function dataTexture(data: Rgba, size: number, repeat: [number, number], srgb = false): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.repeat.set(...repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

let noiseNormal: THREE.DataTexture | null = null;
let noiseColor: THREE.DataTexture | null = null;
let hairTex: THREE.DataTexture | null = null;

function textures(): void {
  if (noiseNormal) return;
  // Normal map: derivadas del ruido
  const size = 128;
  const h = valueNoise(size, 24, 7);
  const hAt = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  const nrm = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * 2.2, dy = (hAt(x, y + 1) - hAt(x, y - 1)) * 2.2;
    const len = Math.hypot(dx, dy, 1), k = (y * size + x) * 4;
    nrm[k] = ((-dx / len) * 0.5 + 0.5) * 255;
    nrm[k + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
    nrm[k + 2] = ((1 / len) * 0.5 + 0.5) * 255;
    nrm[k + 3] = 255;
  }
  noiseNormal = dataTexture(nrm, size, [7, 7]);

  // Variación de color muy sutil (multiplica el color base)
  const c = valueNoise(size, 10, 91);
  const col = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = 232 + c[i] * 23;
    col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = v;
    col[i * 4 + 3] = 255;
  }
  noiseColor = dataTexture(col, size, [2, 2], true);

  // "Pelos": ruido 64×64 muestreado con filtro lineal (= el canvas ampliado del prototipo)
  const rnd = prng(1234);
  const hair = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i++) {
    const v = rnd() * 255;
    hair[i * 4] = hair[i * 4 + 1] = hair[i * 4 + 2] = v;
    hair[i * 4 + 3] = 255;
  }
  hairTex = dataTexture(hair, 64, [5, 4]);
  hairTex.generateMipmaps = false;
  hairTex.minFilter = THREE.LinearFilter;
}

const cache = new Map<string, THREE.Material>();
function get<T extends THREE.Material>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

export const PetMaterials = {
  plush(color: string): THREE.MeshStandardMaterial {
    textures();
    const fur = PetQuality.fur;
    return get(`plush:${color}:${fur}`, () => {
      const base = new THREE.Color(color);
      if (!fur) return new THREE.MeshStandardMaterial({ color: base, roughness: 0.85, metalness: 0 });
      const sheen = base.clone().lerp(new THREE.Color('#ffffff'), 0.35);
      return new THREE.MeshPhysicalMaterial({
        color: base, roughness: 0.92, metalness: 0,
        map: noiseColor, normalMap: noiseNormal, normalScale: new THREE.Vector2(0.035, 0.035),
        sheen: 0.55, sheenRoughness: 0.5, sheenColor: sheen,
      });
    });
  },
  eye(): THREE.MeshPhysicalMaterial {
    return get('eye', () => new THREE.MeshPhysicalMaterial({ color: '#0b0a10', roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4 }));
  },
  highlight(): THREE.MeshBasicMaterial {
    return get('highlight', () => new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  },
  white(): THREE.MeshStandardMaterial {
    return get('white', () => new THREE.MeshStandardMaterial({ color: '#fffaf2', roughness: 0.4 }));
  },
  glossy(color: string): THREE.MeshPhysicalMaterial {
    return get(`glossy:${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.1 }));
  },
  flat(color: string, rough = 0.7): THREE.MeshStandardMaterial {
    return get(`flat:${color}:${rough}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }));
  },
  basic(color: string, opacity = 1): THREE.MeshBasicMaterial {
    return get(`basic:${color}:${opacity}`, () => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));
  },
  blush(): THREE.MeshStandardMaterial {
    return get('blush', () => new THREE.MeshStandardMaterial({ color: '#ff8fa3', roughness: 0.9, transparent: true, opacity: 0.45, depthWrite: false }));
  },
  tear(): THREE.MeshPhysicalMaterial {
    return get('tear', () => new THREE.MeshPhysicalMaterial({ color: '#8fd3ff', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 }));
  },
  // Capa de pelo i (de n): el mapa de pelos se recorta más en las capas exteriores
  furShell(color: string, i: number, n: number): THREE.Material {
    textures();
    return get(`shell:${color}:${i}:${n}`, () => {
      const f = i / n;
      const m = this.plush(color).clone();
      m.alphaMap = hairTex;
      m.alphaTest = 0.42 + f * 0.5;
      m.color.multiplyScalar(0.97 + 0.05 * f);
      return m;
    });
  },
  clear(): void {
    cache.forEach((m) => m.dispose());
    cache.clear();
  },
};

/* Geometrías compartidas: todas las piezas redondas reutilizan la misma esfera
   y se deforman con escala no uniforme. */
const geoCache = new Map<string, THREE.BufferGeometry>();
const g = <T extends THREE.BufferGeometry>(k: string, make: () => T): T => {
  if (!geoCache.has(k)) geoCache.set(k, make());
  return geoCache.get(k) as T;
};

export const PetGeometry = {
  sphere: () => g('sphere', () => new THREE.SphereGeometry(1, 40, 28)),
  // "Squircle": esfera con los costados más planos (forma de peluche, no de pelota)
  squircle: (p = 2.7) => g(`squircle:${p}`, () => {
    const geo = new THREE.SphereGeometry(1, 56, 40), a = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i);
      const r = Math.pow(Math.abs(v.x) ** p + Math.abs(v.y) ** p + Math.abs(v.z) ** p, 1 / p) || 1;
      v.divideScalar(r);
      a.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }),
  sphereLow: () => g('sphereLow', () => new THREE.SphereGeometry(1, 20, 14)),
  hemi: () => g('hemi', () => new THREE.SphereGeometry(1, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2)),
  capsule: () => g('capsule', () => new THREE.CapsuleGeometry(1, 1, 12, 24)),
  torusArc: () => g('torusArc', () => new THREE.TorusGeometry(1, 0.13, 10, 32, Math.PI)),
  cone: () => g('cone', () => new THREE.ConeGeometry(1, 1, 32, 1)),
  ring: () => g('ring', () => new THREE.TorusGeometry(1, 0.06, 8, 40)),
};

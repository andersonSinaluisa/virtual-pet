/*
 * ENVIRONMENT ASSET MANAGER — precarga, caché, clonado y liberación de GLB.
 *
 *   bytes (inyectados: RN → expo-asset + expo-file-system; tests → fs)
 *     → GLTFLoader.parse
 *     → normalizar: pivote base-centro (y=0 en el punto más bajo), escala a
 *       metros × PROP_SCALE, materiales cozy compartidos, sombras
 *     → plantilla en caché (una por asset)
 *     → instantiate(): clon que COMPARTE geometría y materiales (barato)
 *
 * Solo se cargan los assets del lugar actual (y del contiguo si la mascota se
 * acerca a la salida); `release()` suelta los que ya no hacen falta.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { metersScale, PIVOT_AS_IS } from './EnvironmentAssetInfo';
import { cozyMaterial } from './EnvironmentMaterials';

export type BytesLoader = (assetId: string) => Promise<ArrayBuffer>;

export interface AssetTemplate {
  id: string;
  root: THREE.Group;
  triangles: number;
  meshes: number;
  loadMs: number;
  size: THREE.Vector3; // metros (tras normalizar)
}

// Hermes puede no traer TextDecoder (GLTFLoader lo usa para el bloque JSON del GLB)
function ensureTextDecoder(): void {
  const g = globalThis as { TextDecoder?: unknown };
  if (typeof g.TextDecoder === 'function') return;
  class Utf8Decoder {
    decode(input?: ArrayBufferView | ArrayBuffer): string {
      if (!input) return '';
      const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      let out = '', i = 0;
      while (i < bytes.length) {
        const b = bytes[i++];
        if (b < 0x80) out += String.fromCharCode(b);
        else if (b < 0xe0) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
        else if (b < 0xf0) out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
        else {
          const cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
          const u = cp - 0x10000;
          out += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 0x3ff));
        }
      }
      return out;
    }
  }
  g.TextDecoder = Utf8Decoder;
}

export class EnvironmentAssetManager {
  private readonly templates = new Map<string, Promise<AssetTemplate>>();
  private readonly ready = new Map<string, AssetTemplate>();
  private readonly loader = new GLTFLoader();
  readonly errors: { id: string; message: string }[] = [];

  constructor(private readonly loadBytes: BytesLoader) {
    ensureTextDecoder();
  }

  load(id: string): Promise<AssetTemplate> {
    let p = this.templates.get(id);
    if (!p) {
      p = this.fetch(id);
      this.templates.set(id, p);
      p.catch((e: unknown) => { this.templates.delete(id); this.errors.push({ id, message: e instanceof Error ? e.message : String(e) }); });
    }
    return p;
  }

  // Precarga en segundo plano; nunca lanza (el que construye decide el fallback)
  preload(ids: readonly string[]): Promise<void> {
    return Promise.allSettled(ids.map((id) => this.load(id))).then(() => undefined);
  }

  get(id: string): AssetTemplate | null {
    return this.ready.get(id) ?? null;
  }

  loaded(): string[] {
    return [...this.ready.keys()];
  }

  // Clon que comparte geometría y materiales
  instantiate(id: string): THREE.Group | null {
    const t = this.ready.get(id);
    return t ? (t.root.clone(true) as THREE.Group) : null;
  }

  // Suelta los assets que no estén en `keep` (las geometrías; los materiales cozy son compartidos)
  release(keep: ReadonlySet<string>): void {
    for (const [id, t] of this.ready) {
      if (keep.has(id)) continue;
      t.root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      this.ready.delete(id);
      this.templates.delete(id);
    }
  }

  private async fetch(id: string): Promise<AssetTemplate> {
    const t0 = Date.now();
    const bytes = await this.loadBytes(id);
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      this.loader.parse(bytes, '', (g) => resolve(g as unknown as { scene: THREE.Group }), (e) => reject(e instanceof Error ? e : new Error(String(e))));
    });
    const root = new THREE.Group();
    root.name = `Asset:${id}`;
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    // Pivote base-centro (salvo excepciones con bisagra) y escala a metros
    const box = new THREE.Box3().setFromObject(model);
    const s = metersScale(id);
    if (!PIVOT_AS_IS.has(id)) {
      const c = box.getCenter(new THREE.Vector3());
      model.position.set(-c.x, -box.min.y, -c.z);
    }
    root.add(model);
    root.scale.setScalar(s);
    let triangles = 0, meshes = 0;
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      meshes++;
      const g = o.geometry as THREE.BufferGeometry;
      triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      o.material = Array.isArray(o.material) ? o.material.map(cozyMaterial) : cozyMaterial(o.material);
      o.castShadow = true;
      o.receiveShadow = true;
    });
    root.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    const tpl: AssetTemplate = { id, root, triangles, meshes, loadMs: Date.now() - t0, size };
    this.ready.set(id, tpl);
    return tpl;
  }
}

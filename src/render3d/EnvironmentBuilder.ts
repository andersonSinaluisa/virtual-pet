/*
 * ENVIRONMENT BUILDER — de la capa semántica (EnvironmentLayouts, dominio) a three.js
 * -------------------------------------------------------------------------------
 *   casco procedural (suelo, paredes/fachada, cielo)   → estilo propio, barato
 *   + props GLB colocados según la metadata            → Quaternius (casa) / Kenney (exterior)
 *   + vínculos:  puerta ↔ salida del dominio (se abre/cierra), lámpara ↔ lámpara del mundo,
 *                ventana ↔ cielo real (WorldClock)
 *   + lotes estáticos: lo que no se mueve se fusiona por material (menos draw calls)
 *   + oclusores (se desvanecen si tapan a la mascota) y plantas que se mecen
 *
 * El renderer NUNCA decide conducta ni crea estímulos: solo dibuja lo que el
 * dominio ya sabe. Si falta un asset, ese prop se omite (y se registra); si
 * falla el conjunto, PetScene usa el entorno procedural anterior (fallback).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { ENVIRONMENT_LAYOUTS, FLOOR_METERS, locationSolids, metersOf, type EnvironmentLayout, type PropPlacement } from '@/core/world/EnvironmentLayouts';
import { LOCATIONS, type LocationId } from '@/core/world/Locations';

import type { EnvironmentAssetManager } from './EnvironmentAssetManager';
import { ownMaterial } from './EnvironmentMaterials';
import { PetMaterials } from './PetMaterials';

export type GraphicsQuality = 'low' | 'medium' | 'high';
const QUALITY_DETAIL: Record<GraphicsQuality, number> = { low: 1, medium: 2, high: 3 };

export interface EnvStats {
  source: 'glb' | 'procedural';
  props: number; // props colocados
  skipped: string[]; // props omitidos (asset no cargado)
  meshes: number; // mallas en el entorno (≈ draw calls del entorno)
  triangles: number;
  batchedFrom: number; // mallas antes de fusionar
  buildMs: number;
}

export interface EnvRuntime {
  location: LocationId;
  group: THREE.Group;
  windowMats: THREE.MeshBasicMaterial[]; // cristales que muestran el cielo real
  stars: THREE.Points | null;
  bulbs: THREE.Mesh[]; // farolas del parque
  lampShades: THREE.MeshStandardMaterial[]; // pantallas de lámpara (brillan si la lámpara del mundo está encendida)
  lampLight: THREE.PointLight | null;
  doors: { pivot: THREE.Object3D; exitId: string; open: number }[];
  sway: { obj: THREE.Object3D; amp: number; phase: number }[];
  occluders: { obj: THREE.Object3D; mats: THREE.MeshStandardMaterial[]; sphere: THREE.Sphere; fade: number }[];
  sideWalls: { mesh: THREE.Mesh; x: number; mat: THREE.MeshStandardMaterial }[];
  debug: THREE.Group;
  bg: string;
  outdoor: boolean;
  stats: EnvStats;
}

const toXZ = (loc: LocationId, x: number, y: number) => { const m = metersOf(loc); return { X: (x - 0.5) * m.w, Z: (y - 0.5) * m.d }; };

// ---------------- Cascos (arquitectura procedural con la paleta cozy) ----------------
const std = (color: string, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });

function roomShell(env: EnvRuntime): void {
  const g = env.group, { w, d } = metersOf('room');
  const floor = new THREE.Mesh(new RoundedBoxGeometry(w + 0.9, 0.3, d + 0.8, 3, 0.12), std('#EBCDAE', 0.95));
  floor.position.set(0, -0.15, 0.1); floor.receiveShadow = true; floor.name = 'Floor';
  // Tarimas: franjas sutiles (una sola malla)
  const planks = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.9, d + 0.8, 1, 14), new THREE.MeshStandardMaterial({ color: '#E2BF9C', roughness: 1, wireframe: true, transparent: true, opacity: 0.18 }));
  planks.rotation.x = -Math.PI / 2; planks.position.set(0, 0.002, 0.1);
  const wallMat = std('#F7E6E2', 1), trimMat = std('#FFF7F0', 0.8);
  const H = 2.6, back = -d / 2 - 0.12;
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, H, 0.2), wallMat);
  backWall.position.set(0, H / 2, back - 0.1); backWall.receiveShadow = true;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, 0.12, 0.06), trimMat);
  trim.position.set(0, 0.06, back + 0.02);
  g.add(floor, planks, backWall, trim);
  for (const side of [-1, 1] as const) {
    const mat = wallMat.clone();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, H, d + 0.8), mat);
    const x = side * (w / 2 + 0.45);
    wall.position.set(x, H / 2, 0.1 - 0.0); wall.receiveShadow = true;
    g.add(wall);
    env.sideWalls.push({ mesh: wall, x, mat });
  }
  env.bg = '#F3E7EC';
}

function lawn(g: THREE.Group, w: number, d: number, color: string): void {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w + 1.4, 0.3, d + 1.4, 3, 0.14), std(color, 1));
  m.position.y = -0.15; m.receiveShadow = true; m.name = 'Floor';
  g.add(m);
}

function stars(): THREE.Points {
  const n = 90, pos = new Float32Array(n * 3);
  let s = 7;
  const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  for (let i = 0; i < n; i++) { const a = r() * Math.PI - Math.PI / 2, e = 0.2 + r() * 0.8; pos[i * 3] = Math.sin(a) * 18; pos[i * 3 + 1] = 3 + e * 8; pos[i * 3 + 2] = -11 - r() * 6; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: '#FFF6D5', size: 0.09, transparent: true, opacity: 0 }));
}

function gardenShell(env: EnvRuntime): void {
  const g = env.group, { w, d } = metersOf('garden');
  lawn(g, w, d, '#A9D98C');
  // Fachada de la casa (la puerta y la ventana son props semánticos del layout)
  const facade = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 2.7, 0.3), std('#F7E6E2', 1));
  facade.position.set(0, 1.35, -d / 2 - 0.3); facade.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1.6, 0.25, 0.9), std('#D98C8C', 0.8));
  roof.position.set(0, 2.75, -d / 2 - 0.25); roof.rotation.x = 0.35; roof.castShadow = true;
  g.add(facade, roof);
  const st = stars();
  g.add(st);
  env.stars = st;
  env.bg = '#DCEFFB';
  env.outdoor = true;
}

function parkShell(env: EnvRuntime): void {
  const g = env.group, { w, d } = metersOf('park');
  lawn(g, w, d, '#A2D484');
  // Estanque (obstáculo del dominio 'el estanque')
  const pond = LOCATIONS.park.obstacles.find((o) => o.label === 'el estanque');
  if (pond) {
    const { X, Z } = toXZ('park', pond.x, pond.y);
    const r = pond.r * Math.max(w, d);
    const water = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshStandardMaterial({ color: '#8EC9F0', roughness: 0.15, metalness: 0 }));
    water.rotation.x = -Math.PI / 2; water.position.set(X, 0.012, Z); water.scale.y = 0.85;
    const rim = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.18, 48), std('#E8D7BF', 0.9));
    rim.rotation.x = -Math.PI / 2; rim.position.set(X, 0.01, Z); rim.scale.y = 0.85;
    g.add(water, rim);
  }
  // Banco (obstáculo 'el banco'; semántica BENCH preparada para lo social)
  const bench = LOCATIONS.park.obstacles.find((o) => o.label === 'el banco');
  if (bench) {
    const { X, Z } = toXZ('park', bench.x, bench.y);
    const b = new THREE.Group();
    const wood = PetMaterials.plush('#C8966C');
    const seat = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.08, 0.38, 2, 0.03), wood); seat.position.y = 0.44;
    const back = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.3, 0.06, 2, 0.02), wood); back.position.set(0, 0.68, -0.17);
    b.add(seat, back);
    for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.32), PetMaterials.flat('#6E6873')); leg.position.set(0.5 * s, 0.22, 0); b.add(leg); }
    b.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    b.position.set(X, 0, Z);
    g.add(b);
  }
  // Farolas (se encienden al anochecer: mismas que el piso de luz del dominio en el parque)
  for (const [x, y] of [[0.35, 0.35], [0.7, 0.7]] as [number, number][]) {
    const { X, Z } = toXZ('park', x, y);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 2.3, 8), PetMaterials.flat('#6E6873'));
    pole.position.set(X, 1.15, Z); pole.castShadow = true;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: '#E8E4D8' }));
    bulb.position.set(X, 2.35, Z);
    g.add(pole, bulb);
    env.bulbs.push(bulb);
  }
  const st = stars();
  g.add(st);
  env.stars = st;
  env.bg = '#D6ECFA';
  env.outdoor = true;
}

// Valla perimetral decorativa del jardín (instancias del mismo GLB)
function gardenFence(env: EnvRuntime, assets: EnvironmentAssetManager, placed: THREE.Object3D[]): void {
  const { w, d } = metersOf('garden');
  const tpl = assets.get('outdoor/fence_simple');
  if (!tpl) return;
  const seg = tpl.size.x * 1.2;
  const put = (x: number, z: number, rot: number) => {
    const f = assets.instantiate('outdoor/fence_simple');
    if (!f) return;
    f.scale.multiplyScalar(1.2); f.position.set(x, 0, z); f.rotation.y = rot;
    env.group.add(f); placed.push(f);
  };
  for (const side of [-1, 1]) {
    const x = side * (w / 2 + 0.25);
    for (let z = -d / 2 + seg / 2; z < d / 2 + 0.3; z += seg) {
      // Hueco de la verja (salida garden>park) en el lado derecho
      if (side === 1 && Math.abs(z - (0.5 - 0.5) * d) < seg * 0.9) continue;
      put(x, z, Math.PI / 2);
    }
  }
  for (let x = -w / 2 + seg / 2; x < w / 2; x += seg) put(x, d / 2 + 0.35, 0);
}

// ---------------- Props ----------------
function placeProp(env: EnvRuntime, loc: LocationId, p: PropPlacement, obj: THREE.Object3D): void {
  const { X, Z } = toXZ(loc, p.at.x, p.at.y);
  obj.position.set(X, p.elev ?? 0, Z);
  obj.rotation.y = THREE.MathUtils.degToRad(p.rot ?? 0);
  obj.scale.multiplyScalar(p.scale ?? 1);
  obj.name = `Prop:${p.id}`;
  obj.userData.prop = p.id;
}

function meshesOf(o: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  o.traverse((m) => { if (m instanceof THREE.Mesh) out.push(m); });
  return out;
}

// Fusiona mallas estáticas por material (mismo conjunto de atributos) → una malla por material
function batchStatic(group: THREE.Group, statics: THREE.Object3D[]): number {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; shadow: boolean }>();
  let count = 0;
  for (const s of statics) {
    for (const m of meshesOf(s)) {
      const mat = m.material as THREE.Material;
      const attrs = Object.keys(m.geometry.attributes).sort().join(',');
      const k = `${mat.uuid}|${attrs}|${m.geometry.index ? 'i' : 'n'}`;
      const g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      const b = buckets.get(k) ?? { mat, geos: [], shadow: m.castShadow };
      b.geos.push(g);
      buckets.set(k, b);
      count++;
    }
    s.parent?.remove(s);
  }
  for (const { mat, geos, shadow } of buckets.values()) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) continue;
    if (geos.length > 1) geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.name = 'Batched';
    group.add(mesh);
  }
  return count;
}

// ---------------- Depuración semántica (caminable, obstáculos, interacción, aparición, transiciones) ----------------
function debugLayer(loc: LocationId, layout: EnvironmentLayout): THREE.Group {
  const g = new THREE.Group();
  g.name = 'EnvDebug';
  g.visible = false;
  const m = metersOf(loc), b = LOCATIONS[loc].navigationBounds;
  const mat = (color: string, opacity = 0.35) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  const flat = (mesh: THREE.Mesh, x: number, z: number, y = 0.02) => { mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); g.add(mesh); return mesh; };
  // Caminable (límites de navegación)
  const ww = (b.maxX - b.minX) * m.w, dd = (b.maxY - b.minY) * m.d;
  const walk = flat(new THREE.Mesh(new THREE.PlaneGeometry(ww, dd), mat('#7DD8B7', 0.12)), ((b.minX + b.maxX) / 2 - 0.5) * m.w, ((b.minY + b.maxY) / 2 - 0.5) * m.d, 0.015);
  walk.name = 'Walkable';
  // Obstáculos (los mismos sólidos que usan colisión y navegación)
  for (const s of locationSolids(loc)) {
    const mesh = s.kind === 'circle' ? new THREE.Mesh(new THREE.CircleGeometry(s.r, 24), mat('#E35D8C', 0.35)) : new THREE.Mesh(new THREE.PlaneGeometry(s.hw * 2, s.hd * 2), mat('#E35D8C', 0.35));
    flat(mesh, s.x, s.z, 0.025).name = `Obstacle:${s.id}`;
  }
  // Zonas semánticas, salidas (transición) y puntos de aparición
  for (const z of LOCATIONS[loc].zones) { const { X, Z } = toXZ(loc, z.center.x, z.center.y); flat(new THREE.Mesh(new THREE.RingGeometry(z.radius * m.w * 0.8 - 0.03, z.radius * m.w * 0.8, 40), mat('#93C5FD', 0.6)), X, Z, 0.03).name = `Zone:${z.key}`; }
  for (const e of LOCATIONS[loc].interactionPoints.exits) { const { X, Z } = toXZ(loc, e.at.x, e.at.y); flat(new THREE.Mesh(new THREE.CircleGeometry(0.25, 24), mat('#F2C230', 0.55)), X, Z, 0.035).name = `Transition:${e.id}`; }
  const win = LOCATIONS[loc].interactionPoints.window;
  if (win) { const { X, Z } = toXZ(loc, win.x, win.y); flat(new THREE.Mesh(new THREE.CircleGeometry(0.18, 20), mat('#FFFFFF', 0.7)), X, Z, 0.04).name = 'Interaction:window'; }
  for (const [i, sp] of layout.petSpawns.entries()) {
    const { X, Z } = toXZ(loc, sp.x, sp.y);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 10), mat('#34C759', 0.9));
    c.position.set(X, 0.12, Z); c.name = `Spawn:${i}`; g.add(c);
  }
  return g;
}

// ---------------- Construcción ----------------
export async function buildEnvironmentGLB(loc: LocationId, assets: EnvironmentAssetManager, quality: GraphicsQuality = 'medium'): Promise<EnvRuntime> {
  const t0 = Date.now();
  const layout = ENVIRONMENT_LAYOUTS[loc];
  if (!layout) throw new Error(`Sin layout para ${loc}`);
  const detail = QUALITY_DETAIL[quality];
  const props = layout.props.filter((p) => (p.detail ?? 1) <= detail);
  const extra = loc === 'garden' ? ['outdoor/fence_simple'] : [];
  await assets.preload([...new Set([...props.map((p) => p.asset), ...extra])]);

  const env: EnvRuntime = {
    location: loc, group: new THREE.Group(), windowMats: [], stars: null, bulbs: [], lampShades: [], lampLight: null, doors: [], sway: [],
    occluders: [], sideWalls: [], debug: debugLayer(loc, layout), bg: '#F3E7EC', outdoor: false,
    stats: { source: 'glb', props: 0, skipped: [], meshes: 0, triangles: 0, batchedFrom: 0, buildMs: 0 },
  };
  env.group.name = `Env2:${loc}`;
  if (layout.shell === 'room') roomShell(env); else if (layout.shell === 'garden') gardenShell(env); else parkShell(env);

  const statics: THREE.Object3D[] = [];
  if (loc === 'garden') gardenFence(env, assets, statics);
  for (const p of props) {
    const obj = assets.instantiate(p.asset);
    if (!obj) { env.stats.skipped.push(p.id); continue; }
    placeProp(env, loc, p, obj);
    env.group.add(obj);
    env.stats.props++;
    // Ventana: el cristal muestra el cielo real (color del WorldClock), no el material del pack
    if (p.semantic === 'WINDOW') {
      for (const m of meshesOf(obj)) if ((m.material as THREE.Material).name.toLowerCase() === 'glass') {
        const sky = new THREE.MeshBasicMaterial({ color: '#FFF3E6' });
        m.material = sky; env.windowMats.push(sky);
      }
    }
    if (p.binding?.exitId) {
      // Puerta/verja: gira sobre su bisagra según el estado de la salida en el dominio
      // La puerta de Quaternius tiene su origen en el borde (bisagra): la bisagra va a medio ancho del centro
      const hinge = new THREE.Group();
      const half = p.asset === 'home/door' ? ((assets.get(p.asset)?.size.x ?? 0.67) * (p.scale ?? 1)) / 2 : 0;
      hinge.position.copy(obj.position).add(new THREE.Vector3(half, 0, 0).applyEuler(obj.rotation));
      hinge.rotation.copy(obj.rotation);
      obj.position.set(p.asset === 'home/door' ? 0 : 0, 0, 0); obj.rotation.set(0, 0, 0);
      hinge.add(obj);
      env.group.add(hinge);
      env.doors.push({ pivot: hinge, exitId: p.binding.exitId, open: 0 });
      continue;
    }
    if (p.binding?.lamp) {
      for (const m of meshesOf(obj)) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.name.toLowerCase() === 'white') { const own = ownMaterial(mat); m.material = own; env.lampShades.push(own); }
      }
      if (!env.lampLight && quality !== 'low' && layout.lighting === 'HOME') {
        const light = new THREE.PointLight('#FFC98A', 0, 5, 1.6);
        light.position.set(obj.position.x, (p.elev ?? 0) + 0.45, obj.position.z + 0.15);
        env.group.add(light);
        env.lampLight = light;
      }
      continue;
    }
    if (p.occluder) {
      const mats: THREE.MeshStandardMaterial[] = [];
      for (const m of meshesOf(obj)) { const own = ownMaterial(m.material as THREE.MeshStandardMaterial); m.material = own; mats.push(own); }
      obj.updateMatrixWorld(true);
      const sphere = new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere());
      env.occluders.push({ obj, mats, sphere, fade: 1 });
      if (p.sway && quality !== 'low') env.sway.push({ obj, amp: p.sway, phase: p.at.x * 7 + p.at.y * 3 });
      continue;
    }
    if (p.sway && quality !== 'low') { env.sway.push({ obj, amp: p.sway, phase: p.at.x * 7 + p.at.y * 3 }); continue; }
    statics.push(obj);
  }
  env.stats.batchedFrom = batchStatic(env.group, statics);
  env.group.add(env.debug);
  let meshes = 0, tris = 0;
  env.group.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible || o.parent === env.debug || o.parent?.name === 'EnvDebug') return;
    meshes++;
    const g = o.geometry as THREE.BufferGeometry;
    tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  env.stats.meshes = meshes;
  env.stats.triangles = Math.round(tris);
  env.stats.buildMs = Date.now() - t0;
  return env;
}

// Suelta lo propio del entorno (las geometrías de plantilla y los materiales cozy compartidos se quedan en el gestor)
export function disposeEnvRuntime(env: EnvRuntime): void {
  env.group.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Points)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (!m.userData?.cozy && !PetMaterials.isCached(m)) m.dispose();
    if (!isTemplateGeometry(o)) o.geometry.dispose();
  });
  env.group.parent?.remove(env.group);
}

// Las geometrías de los props (no fusionados) pertenecen a la plantilla del gestor
function isTemplateGeometry(o: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p) { if (p.name.startsWith('Prop:')) return true; p = p.parent; }
  return false;
}

export { FLOOR_METERS };

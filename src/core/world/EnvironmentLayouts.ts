/*
 * ENVIRONMENT LAYOUTS — la capa SEMÁNTICA de cada escenario (dominio, sin three.js)
 * --------------------------------------------------------------------------------
 * Un escenario con assets reales NO es "un GLB en la escena". Es una lista de
 * props con significado:
 *
 *   DECORATIVE   solo se ve (cuadro, alfombra, planta en una repisa)
 *   SEMANTIC     da contexto al lugar (ventana, puerta, chimenea, lámpara)
 *   INTERACTIVE  el cuerpo choca con él o lo usa (sofá, árbol, roca)
 *   (DYNAMIC     los objetos que se mueven —pelota, peluche— siguen siendo WorldObject)
 *
 * Aquí vive lo FÍSICO: dónde está cada cosa, su huella en el suelo (para
 * navegar y chocar) y a qué elemento del dominio está vinculado (la puerta a la
 * salida, la lámpara a la lámpara del mundo). La decoración NUNCA es un
 * estímulo de la SNN: los sensores solo ven WorldObject. El renderer
 * (render3d/EnvironmentBuilder) lee estos datos y pone los modelos; el GLB
 * nunca es el dominio.
 *
 * Coordenadas: posición en el suelo normalizado del lugar (0..1, y=0 al fondo).
 * Huellas en METROS del plano de render (1 unidad three ≈ 1 m): la habitación
 * mide 5.2 × 3.8 m y cada lugar se escala con `size`. Así la colisión coincide
 * exactamente con lo que se dibuja. `rot` en grados (0 = el frente mira a la
 * cámara, +Y); las huellas de caja solo admiten 0/90/180/270.
 */
import type { Point } from '../simulation/Pet';
import { LOCATIONS, type LocationId, type Obstacle } from './Locations';

// Metros por unidad normalizada del lugar (mismo criterio que el render)
export const FLOOR_METERS = { w: 5.2, d: 3.8 } as const;
export const metersOf = (loc: LocationId) => ({ w: FLOOR_METERS.w * LOCATIONS[loc].size.w, d: FLOOR_METERS.d * LOCATIONS[loc].size.h });

export type PropClass = 'DECORATIVE' | 'SEMANTIC' | 'INTERACTIVE';
export type Semantic =
  | 'WINDOW' | 'DOOR' | 'GATE' | 'LAMP' | 'FIREPLACE' | 'SOFA' | 'SHELF' | 'TABLE' | 'PLANT' | 'RUG'
  | 'TREE' | 'BUSH' | 'FLOWERS' | 'GRASS' | 'FENCE' | 'PATH' | 'ROCK' | 'LOG' | 'POND' | 'BENCH' | 'MUSHROOM';

export type Footprint = { kind: 'circle'; r: number } | { kind: 'box'; w: number; d: number };

export interface PropPlacement {
  id: string;
  asset: string; // EnvironmentAssetRegistry (render)
  at: Point;
  rot?: number; // grados
  scale?: number; // sobre la escala del pack
  elev?: number; // metros sobre el suelo (repisas, ventana)
  class: PropClass;
  semantic?: Semantic;
  footprint?: Footprint; // si existe, es un obstáculo físico
  label?: string; // "el sofá" (explicaciones/depuración)
  binding?: { exitId?: string; lamp?: boolean; zone?: string };
  occluder?: boolean; // puede tapar a la mascota (el render lo desvanece)
  sway?: number; // microanimación (plantas, hierba): amplitud
  detail?: 1 | 2 | 3; // calidad mínima para mostrarlo (1 siempre, 3 solo HIGH)
}

export interface CameraProfile {
  // v9.1: cámara casi isométrica tipo "diorama" (giro en diagonal + inclinación, campo de visión estrecho)
  yaw: number; // grados alrededor de Y (0 = de frente; + = desde la derecha)
  pitch: number; // grados de inclinación sobre el suelo (isometría clásica ≈ 35°)
  fov: number;
  distance: number; // multiplicador del desplazamiento base
  height: number; // multiplicador de la altura
  follow: number; // 0 = fija al centro, 1 = sigue a la mascota
  lookHeight: number;
}

export type LightingProfileId = 'HOME' | 'GARDEN' | 'PARK';
export type ShellStyle = 'room' | 'garden' | 'park';

export interface EnvironmentLayout {
  location: LocationId;
  shell: ShellStyle; // casco procedural (suelo, paredes/fachada, cielo)
  props: readonly PropPlacement[];
  lighting: LightingProfileId;
  camera: CameraProfile;
  // Puntos de aparición adicionales (el parque se prepara para varias mascotas; hoy solo una)
  petSpawns: readonly Point[];
}

// ---------------- HOME 2.0 ----------------
// Pared del fondo en y≈0, izquierda x≈0, derecha x≈1; el frente queda abierto hacia la cámara.
const HOME: EnvironmentLayout = {
  location: 'room', shell: 'room', lighting: 'HOME',
  camera: { yaw: 40, pitch: 38, fov: 20, distance: 1, height: 1, follow: 0.3, lookHeight: 0.4 },
  petSpawns: [{ x: 0.45, y: 0.55 }],
  props: [
    { id: 'window', asset: 'home/window_large', at: { x: 0.5, y: -0.03 }, scale: 1.6, elev: 0.85, class: 'SEMANTIC', semantic: 'WINDOW', binding: { zone: 'WINDOW_ZONE' }, label: 'la ventana' },
    { id: 'curtains', asset: 'home/curtains_double', at: { x: 0.5, y: -0.02 }, scale: 1.25, elev: 0.25, class: 'DECORATIVE', sway: 0.015 },
    { id: 'door', asset: 'home/door', at: { x: 0.08, y: -0.03 }, class: 'SEMANTIC', semantic: 'DOOR', binding: { exitId: 'room>garden' }, label: 'la puerta del jardín' },
    { id: 'bedRug', asset: 'home/rug', at: { x: 0.21, y: 0.2 }, rot: 90, scale: 0.9, class: 'DECORATIVE', semantic: 'RUG' },
    { id: 'playRug', asset: 'home/round_rug', at: { x: 0.55, y: 0.68 }, scale: 1.35, class: 'DECORATIVE', semantic: 'RUG' },
    { id: 'nightStand', asset: 'home/night_stand', at: { x: 0.33, y: 0.04 }, class: 'INTERACTIVE', semantic: 'TABLE', footprint: { kind: 'box', w: 0.4, d: 0.4 }, label: 'la mesilla' },
    { id: 'bedLamp', asset: 'home/table_lamp', at: { x: 0.33, y: 0.04 }, elev: 0.36, class: 'SEMANTIC', semantic: 'LAMP', binding: { lamp: true }, label: 'la lámpara' },
    { id: 'drawer', asset: 'home/drawer', at: { x: 0.72, y: 0.05 }, class: 'INTERACTIVE', semantic: 'SHELF', footprint: { kind: 'box', w: 1.1, d: 0.45 }, label: 'la cómoda' },
    { id: 'cactus', asset: 'home/cactus', at: { x: 0.66, y: 0.05 }, elev: 0.52, class: 'DECORATIVE', semantic: 'PLANT', sway: 0.01 },
    { id: 'wallShelf', asset: 'home/shelf_small', at: { x: 0.74, y: -0.02 }, elev: 1.3, class: 'DECORATIVE', semantic: 'SHELF' },
    { id: 'shelfPlant', asset: 'home/houseplant_2', at: { x: 0.77, y: -0.01 }, elev: 1.52, class: 'DECORATIVE', semantic: 'PLANT', sway: 0.02 },
    { id: 'cornerPlant', asset: 'home/houseplant_3', at: { x: 0.95, y: 0.06 }, scale: 1.1, class: 'INTERACTIVE', semantic: 'PLANT', footprint: { kind: 'circle', r: 0.22 }, label: 'la planta', sway: 0.03 },
    { id: 'fireplace', asset: 'home/fireplace', at: { x: 0.012, y: 0.48 }, rot: 90, class: 'SEMANTIC', semantic: 'FIREPLACE', footprint: { kind: 'box', w: 1.25, d: 0.45 }, label: 'la chimenea' },
    { id: 'plantLeft', asset: 'home/houseplant_5', at: { x: 0.04, y: 0.27 }, class: 'INTERACTIVE', semantic: 'PLANT', footprint: { kind: 'circle', r: 0.2 }, label: 'la planta', sway: 0.03 },
    { id: 'sofa', asset: 'home/couch_medium', at: { x: 0.95, y: 0.76 }, rot: -90, class: 'INTERACTIVE', semantic: 'SOFA', footprint: { kind: 'box', w: 1.8, d: 0.85 }, label: 'el sofá', occluder: true },
    { id: 'floorLamp', asset: 'home/light_floor_2', at: { x: 0.955, y: 0.49 }, scale: 0.9, class: 'SEMANTIC', semantic: 'LAMP', binding: { lamp: true }, footprint: { kind: 'circle', r: 0.14 }, label: 'la lámpara de pie' },
  ],
};

// ---------------- GARDEN 2.0 ----------------
const tuft = (id: string, x: number, y: number, big = false): PropPlacement => ({ id, asset: big ? 'outdoor/grass_large' : 'outdoor/grass', at: { x, y }, rot: (x * 997) % 360, class: 'DECORATIVE', semantic: 'GRASS', sway: 0.06, detail: 2 });
const GARDEN: EnvironmentLayout = {
  location: 'garden', shell: 'garden', lighting: 'GARDEN',
  camera: { yaw: 35, pitch: 40, fov: 20, distance: 1.25, height: 1, follow: 0.85, lookHeight: 0.45 },
  petSpawns: [{ x: 0.18, y: 0.2 }],
  props: [
    { id: 'houseDoor', asset: 'home/door', at: { x: 0.1, y: -0.035 }, class: 'SEMANTIC', semantic: 'DOOR', binding: { exitId: 'garden>room' }, label: 'la puerta de casa' },
    { id: 'houseWindow', asset: 'home/window_large', at: { x: 0.42, y: -0.035 }, scale: 1.5, elev: 0.8, class: 'DECORATIVE', semantic: 'WINDOW' },
    { id: 'porchPot', asset: 'outdoor/pot_large', at: { x: 0.2, y: 0.03 }, class: 'DECORATIVE' },
    { id: 'porchPlant', asset: 'home/houseplant_3', at: { x: 0.2, y: 0.03 }, elev: 0.16, class: 'DECORATIVE', semantic: 'PLANT', sway: 0.03 },
    { id: 'tree', asset: 'outdoor/tree_oak', at: { x: 0.3, y: 0.35 }, scale: 1.9, class: 'INTERACTIVE', semantic: 'TREE', footprint: { kind: 'circle', r: 0.4 }, label: 'el árbol', occluder: true, sway: 0.01 },
    { id: 'flower1', asset: 'outdoor/flower_redA', at: { x: 0.79, y: 0.12 }, scale: 1.6, class: 'SEMANTIC', semantic: 'FLOWERS', sway: 0.05 },
    { id: 'flower2', asset: 'outdoor/flower_yellowA', at: { x: 0.84, y: 0.1 }, scale: 1.6, class: 'SEMANTIC', semantic: 'FLOWERS', sway: 0.05 },
    { id: 'flower3', asset: 'outdoor/flower_purpleA', at: { x: 0.85, y: 0.19 }, scale: 1.6, class: 'SEMANTIC', semantic: 'FLOWERS', sway: 0.05 },
    { id: 'flower4', asset: 'outdoor/flower_redA', at: { x: 0.8, y: 0.2 }, rot: 70, scale: 1.4, class: 'SEMANTIC', semantic: 'FLOWERS', sway: 0.05 },
    { id: 'flowerBush', asset: 'outdoor/plant_bushDetailed', at: { x: 0.82, y: 0.15 }, scale: 1.3, class: 'INTERACTIVE', semantic: 'FLOWERS', footprint: { kind: 'circle', r: 0.5 }, label: 'el macizo de flores', sway: 0.02 },
    { id: 'bushBack1', asset: 'outdoor/plant_bushLarge', at: { x: 0.6, y: -0.02 }, scale: 1.4, class: 'DECORATIVE', semantic: 'BUSH', sway: 0.015 },
    { id: 'bushBack2', asset: 'outdoor/plant_bush', at: { x: 0.68, y: -0.03 }, scale: 1.5, class: 'DECORATIVE', semantic: 'BUSH', sway: 0.02 },
    { id: 'gate', asset: 'outdoor/fence_gate', at: { x: 1.0, y: 0.5 }, rot: 90, scale: 1.2, class: 'SEMANTIC', semantic: 'GATE', binding: { exitId: 'garden>park' }, label: 'la verja' },
    { id: 'rock', asset: 'outdoor/rock_largeA', at: { x: 0.9, y: 0.88 }, scale: 1.2, class: 'INTERACTIVE', semantic: 'ROCK', footprint: { kind: 'circle', r: 0.36 }, label: 'la roca' },
    { id: 'log', asset: 'outdoor/log', at: { x: 0.14, y: 0.84 }, rot: 70, scale: 1.4, class: 'INTERACTIVE', semantic: 'LOG', footprint: { kind: 'circle', r: 0.42 }, label: 'el tronco' },
    { id: 'stump', asset: 'outdoor/stump_round', at: { x: 0.64, y: 0.3 }, scale: 1.2, class: 'INTERACTIVE', semantic: 'LOG', footprint: { kind: 'circle', r: 0.25 }, label: 'el tocón' },
    { id: 'mushrooms', asset: 'outdoor/mushroom_redGroup', at: { x: 0.26, y: 0.62 }, scale: 1.3, class: 'DECORATIVE', semantic: 'MUSHROOM' },
    { id: 'path1', asset: 'outdoor/path_stone', at: { x: 0.12, y: 0.1 }, scale: 0.9, class: 'DECORATIVE', semantic: 'PATH' },
    { id: 'path2', asset: 'outdoor/path_stone', at: { x: 0.2, y: 0.22 }, rot: 30, scale: 0.9, class: 'DECORATIVE', semantic: 'PATH' },
    { id: 'path3', asset: 'outdoor/path_stoneCircle', at: { x: 0.34, y: 0.58 }, scale: 1.2, class: 'DECORATIVE', semantic: 'PATH' },
    tuft('g1', 0.45, 0.8, true), tuft('g2', 0.7, 0.62), tuft('g3', 0.12, 0.5), tuft('g4', 0.55, 0.45), tuft('g5', 0.78, 0.8, true), tuft('g6', 0.38, 0.9),
  ],
};

// ---------------- PARK 2.0 ----------------
// Preparado para lo social: varios puntos de aparición y zonas amplias (hoy, una sola mascota)
const bgTree = (id: string, x: number, asset: string, s = 2.4): PropPlacement => ({ id, asset: `outdoor/${asset}`, at: { x, y: -0.06 }, scale: s, class: 'DECORATIVE', semantic: 'TREE', detail: 1 });
const PARK: EnvironmentLayout = {
  location: 'park', shell: 'park', lighting: 'PARK',
  camera: { yaw: 35, pitch: 42, fov: 20, distance: 1.5, height: 1, follow: 0.9, lookHeight: 0.5 },
  petSpawns: [{ x: 0.08, y: 0.5 }, { x: 0.5, y: 0.9 }, { x: 0.92, y: 0.6 }, { x: 0.45, y: 0.3 }],
  props: [
    { id: 'tree1', asset: 'outdoor/tree_default', at: { x: 0.15, y: 0.18 }, scale: 2.2, class: 'INTERACTIVE', semantic: 'TREE', footprint: { kind: 'circle', r: 0.45 }, label: 'un árbol', occluder: true, sway: 0.01 },
    { id: 'tree2', asset: 'outdoor/tree_fat', at: { x: 0.28, y: 0.12 }, scale: 2.2, class: 'INTERACTIVE', semantic: 'TREE', footprint: { kind: 'circle', r: 0.45 }, label: 'un árbol', occluder: true, sway: 0.01 },
    { id: 'tree3', asset: 'outdoor/tree_oak', at: { x: 0.9, y: 0.9 }, scale: 2.0, class: 'INTERACTIVE', semantic: 'TREE', footprint: { kind: 'circle', r: 0.45 }, label: 'un árbol', occluder: true, sway: 0.01 },
    bgTree('bg1', 0.05, 'tree_pineTallA'), bgTree('bg2', 0.2, 'tree_pineRoundA'), bgTree('bg3', 0.38, 'tree_oak', 2.6), bgTree('bg4', 0.55, 'tree_pineTallA'),
    bgTree('bg5', 0.68, 'tree_default', 2.6), bgTree('bg6', 0.85, 'tree_pineRoundA'), bgTree('bg7', 0.97, 'tree_fat', 2.4),
    { id: 'lily1', asset: 'outdoor/lily_large', at: { x: 0.76, y: 0.24 }, scale: 1.6, class: 'DECORATIVE', semantic: 'POND' },
    { id: 'lily2', asset: 'outdoor/lily_small', at: { x: 0.81, y: 0.28 }, scale: 1.6, class: 'DECORATIVE', semantic: 'POND' },
    { id: 'pondRock1', asset: 'outdoor/rock_smallA', at: { x: 0.7, y: 0.33 }, scale: 1.6, class: 'DECORATIVE', semantic: 'ROCK' },
    { id: 'pondRock2', asset: 'outdoor/rock_smallA', at: { x: 0.87, y: 0.17 }, rot: 120, scale: 1.8, class: 'DECORATIVE', semantic: 'ROCK' },
    { id: 'bigLog', asset: 'outdoor/log_large', at: { x: 0.42, y: 0.22 }, rot: 20, scale: 1.4, class: 'INTERACTIVE', semantic: 'LOG', footprint: { kind: 'circle', r: 0.6 }, label: 'el tronco' },
    { id: 'rockBig', asset: 'outdoor/rock_largeA', at: { x: 0.12, y: 0.82 }, scale: 1.5, class: 'INTERACTIVE', semantic: 'ROCK', footprint: { kind: 'circle', r: 0.45 }, label: 'la roca' },
    { id: 'bush1', asset: 'outdoor/plant_bushLarge', at: { x: 0.33, y: 0.95 }, scale: 1.6, class: 'DECORATIVE', semantic: 'BUSH', sway: 0.015 },
    { id: 'bush2', asset: 'outdoor/plant_bushDetailed', at: { x: 0.97, y: 0.3 }, scale: 1.6, class: 'DECORATIVE', semantic: 'BUSH', sway: 0.015 },
    { id: 'flowersA', asset: 'outdoor/flower_yellowA', at: { x: 0.45, y: 0.9 }, scale: 1.8, class: 'DECORATIVE', semantic: 'FLOWERS', sway: 0.05 },
    { id: 'flowersB', asset: 'outdoor/flower_purpleA', at: { x: 0.5, y: 0.93 }, scale: 1.8, class: 'DECORATIVE', semantic: 'FLOWERS', sway: 0.05 },
    { id: 'flowersC', asset: 'outdoor/flower_redA', at: { x: 0.55, y: 0.9 }, scale: 1.8, class: 'DECORATIVE', semantic: 'FLOWERS', sway: 0.05 },
    { id: 'mush', asset: 'outdoor/mushroom_redGroup', at: { x: 0.22, y: 0.3 }, scale: 1.5, class: 'DECORATIVE', semantic: 'MUSHROOM' },
    { id: 'stump', asset: 'outdoor/stump_round', at: { x: 0.62, y: 0.55 }, scale: 1.3, class: 'INTERACTIVE', semantic: 'LOG', footprint: { kind: 'circle', r: 0.28 }, label: 'el tocón' },
    { id: 'pathA', asset: 'outdoor/path_stone', at: { x: 0.06, y: 0.5 }, rot: 90, scale: 1.2, class: 'DECORATIVE', semantic: 'PATH' },
    { id: 'pathB', asset: 'outdoor/path_stone', at: { x: 0.15, y: 0.5 }, rot: 90, scale: 1.2, class: 'DECORATIVE', semantic: 'PATH' },
    { id: 'pathC', asset: 'outdoor/path_stone', at: { x: 0.24, y: 0.52 }, rot: 80, scale: 1.2, class: 'DECORATIVE', semantic: 'PATH' },
    { id: 'pathD', asset: 'outdoor/path_stoneCircle', at: { x: 0.34, y: 0.54 }, scale: 1.4, class: 'DECORATIVE', semantic: 'PATH' },
    tuft('p1', 0.5, 0.7, true), tuft('p2', 0.7, 0.8), tuft('p3', 0.3, 0.7), tuft('p4', 0.58, 0.35), tuft('p5', 0.82, 0.55, true), tuft('p6', 0.4, 0.42), tuft('p7', 0.2, 0.65),
  ],
};

export const ENVIRONMENT_LAYOUTS: Partial<Record<LocationId, EnvironmentLayout>> = { room: HOME, garden: GARDEN, park: PARK };

// ---------------- Geometría física (colisión y rodeos, en METROS) ----------------
export type SolidShape =
  | { kind: 'circle'; x: number; z: number; r: number; label: string; id: string }
  | { kind: 'box'; x: number; z: number; hw: number; hd: number; label: string; id: string };

export const toMeters = (loc: LocationId, p: Point) => { const m = metersOf(loc); return { x: (p.x - 0.5) * m.w, z: (p.y - 0.5) * m.d }; };
export const fromMeters = (loc: LocationId, x: number, z: number): Point => { const m = metersOf(loc); return { x: x / m.w + 0.5, y: z / m.d + 0.5 }; };

const cache = new Map<LocationId, SolidShape[]>();

// Todos los sólidos del lugar: obstáculos declarados en Locations + huellas de los props
export function locationSolids(loc: LocationId): SolidShape[] {
  const hit = cache.get(loc);
  if (hit) return hit;
  const def = LOCATIONS[loc], m = metersOf(loc);
  const out: SolidShape[] = [];
  const layout = ENVIRONMENT_LAYOUTS[loc];
  for (const p of layout?.props ?? []) {
    if (!p.footprint) continue;
    const c = toMeters(loc, p.at);
    if (p.footprint.kind === 'circle') out.push({ kind: 'circle', x: c.x, z: c.z, r: p.footprint.r, label: p.label ?? p.id, id: p.id });
    else {
      const q = Math.round((((p.rot ?? 0) % 360) + 360) % 360 / 90) % 2 === 1;
      out.push({ kind: 'box', x: c.x, z: c.z, hw: (q ? p.footprint.d : p.footprint.w) / 2, hd: (q ? p.footprint.w : p.footprint.d) / 2, label: p.label ?? p.id, id: p.id });
    }
  }
  // Obstáculos del dominio que no tienen prop (p. ej. el estanque o el banco del parque)
  for (const [i, ob] of def.obstacles.entries()) {
    const c = toMeters(loc, ob);
    const covered = out.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < 0.3);
    if (!covered) out.push({ kind: 'circle', x: c.x, z: c.z, r: ob.r * Math.max(m.w, m.d), label: ob.label, id: `ob${i}` });
  }
  cache.set(loc, out);
  return out;
}

// Obstáculos en el formato heredado (normalizado) para quien los necesite
export function locationObstacles(loc: LocationId): Obstacle[] {
  const m = metersOf(loc);
  return locationSolids(loc).map((s) => {
    const p = fromMeters(loc, s.x, s.z);
    const r = s.kind === 'circle' ? s.r : Math.hypot(s.hw, s.hd);
    return { x: p.x, y: p.y, r: r / Math.max(m.w, m.d), label: s.label };
  });
}

// Empuja un círculo (x,z,r) fuera de un sólido; devuelve la corrección o null
export function pushOut(s: SolidShape, x: number, z: number, r: number): { x: number; z: number } | null {
  if (s.kind === 'circle') {
    const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz), min = s.r + r;
    if (d >= min) return null;
    if (d < 1e-6) return { x: s.x + min, z: s.z };
    return { x: s.x + (dx / d) * min, z: s.z + (dz / d) * min };
  }
  const cx = Math.max(s.x - s.hw, Math.min(s.x + s.hw, x)), cz = Math.max(s.z - s.hd, Math.min(s.z + s.hd, z));
  const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
  if (d >= r) return null;
  if (d > 1e-6) return { x: cx + (dx / d) * r, z: cz + (dz / d) * r };
  // Centro dentro de la caja: salir por el lado más cercano
  const exits = [
    { x: s.x - s.hw - r, z, d: x - (s.x - s.hw) }, { x: s.x + s.hw + r, z, d: s.x + s.hw - x },
    { x, z: s.z - s.hd - r, d: z - (s.z - s.hd) }, { x, z: s.z + s.hd + r, d: s.z + s.hd - z },
  ].sort((a, b) => a.d - b.d);
  return { x: exits[0].x, z: exits[0].z };
}

// Resuelve la colisión de un cuerpo redondo contra todos los sólidos (2 pasadas bastan en escenas pequeñas)
export function resolveCollision(loc: LocationId, p: Point, radius: number): { point: Point; hit: boolean } {
  const solids = locationSolids(loc);
  let { x, z } = toMeters(loc, p), hit = false;
  for (let pass = 0; pass < 2; pass++) for (const s of solids) {
    const c = pushOut(s, x, z, radius);
    if (c) { x = c.x; z = c.z; hit = true; }
  }
  return { point: hit ? fromMeters(loc, x, z) : p, hit };
}

export function insideSolid(loc: LocationId, p: Point, radius = 0): SolidShape | null {
  const { x, z } = toMeters(loc, p);
  return locationSolids(loc).find((s) => pushOut(s, x, z, radius) !== null) ?? null;
}

// ¿El segmento a→b (metros) atraviesa el sólido inflado r? Devuelve t de entrada o null
function segmentHit(s: SolidShape, ax: number, az: number, bx: number, bz: number, r: number): number | null {
  const dx = bx - ax, dz = bz - az;
  if (s.kind === 'circle') {
    const R = s.r + r, fx = ax - s.x, fz = az - s.z;
    const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - R * R;
    const disc = b * b - 4 * a * c;
    if (a < 1e-9 || disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t > 0 && t < 1 ? t : null;
  }
  // Caja: slab test
  let t0 = 0, t1 = 1;
  for (const [o, d, lo, hi] of [[ax, dx, s.x - s.hw - r, s.x + s.hw + r], [az, dz, s.z - s.hd - r, s.z + s.hd + r]] as const) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let ta = (lo - o) / d, tb = (hi - o) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0 > 0 && t0 < 1 ? t0 : null;
}

/*
 * Rodeo: primer sólido que corta el camino (sin contar aquel en el que está el
 * destino) → punto de paso a su lado (círculo) o en la esquina de la caja que
 * da el camino más corto. Devuelve null si el camino está libre.
 */
export function detourPoint(loc: LocationId, from: Point, to: Point, radius: number, clearance = 0.12): Point | null {
  const a = toMeters(loc, from), b = toMeters(loc, to);
  let best: { s: SolidShape; t: number } | null = null;
  for (const s of locationSolids(loc)) {
    if (pushOut(s, b.x, b.z, radius * 0.5)) continue; // el destino está en/junto al sólido (ir al árbol)
    const t = segmentHit(s, a.x, a.z, b.x, b.z, radius);
    if (t !== null && (!best || t < best.t)) best = { s, t };
  }
  if (!best) return null;
  const s = best.s, pad = radius + clearance;
  let candidates: { x: number; z: number }[];
  if (s.kind === 'circle') {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len, R = s.r + pad;
    candidates = [{ x: s.x + nx * R, z: s.z + nz * R }, { x: s.x - nx * R, z: s.z - nz * R }];
  } else {
    candidates = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j]) => ({ x: s.x + i * (s.hw + pad), z: s.z + j * (s.hd + pad) }));
  }
  const bounds = LOCATIONS[loc].navigationBounds;
  const valid = candidates
    .map((c) => ({ c, p: fromMeters(loc, c.x, c.z) }))
    .filter(({ p }) => p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY)
    .filter(({ c }) => segmentHit(s, a.x, a.z, c.x, c.z, radius * 0.9) === null)
    .sort((u, v) => Math.hypot(u.c.x - a.x, u.c.z - a.z) + Math.hypot(b.x - u.c.x, b.z - u.c.z) - (Math.hypot(v.c.x - a.x, v.c.z - a.z) + Math.hypot(b.x - v.c.x, b.z - v.c.z)));
  const pick = valid[0] ?? candidates.map((c) => ({ c, p: fromMeters(loc, c.x, c.z) }))[0];
  return { x: Math.max(bounds.minX, Math.min(bounds.maxX, pick.p.x)), y: Math.max(bounds.minY, Math.min(bounds.maxY, pick.p.y)) };
}

// Radio físico de la mascota (metros) según su tamaño visual (bebé más pequeño)
export const PET_BODY_RADIUS = 0.3;

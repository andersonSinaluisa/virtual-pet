/*
 * UBICACIONES (datos, sin comportamiento)
 * ---------------------------------------
 *   🏠 CASA
 *    ├── room    habitación (segura, familiar: cama, juguetes, comida, ventana)
 *    └── garden  jardín (más espacio, plantas, movimiento, sonidos, objetos ocasionales)
 *   🌳 park      parque (gran espacio, objetos desconocidos, más estímulos)
 *   🌲 forest / 🏖️ beach   declarados, todavía no disponibles
 *
 * Una ubicación describe lo FÍSICO: tamaño, límites de navegación, puntos de
 * aparición e interacción (puertas), zonas semánticas, muebles y su perfil
 * sensorial (cuánto espacio abierto, actividad y ruido de fondo, qué
 * microeventos pueden ocurrir). NUNCA contiene "cómo reacciona Milo aquí":
 * el parque produce estímulos y el cerebro decide.
 *
 * Coordenadas: cada ubicación es un suelo normalizado 0..1 × 0..1; `size`
 * lo escala a "unidades de habitación" (1 = el ancho de la habitación,
 * ~5.2 m). Las distancias del mundo se miden siempre en unidades de
 * habitación, así que "estar al lado" significa lo mismo en todas partes y
 * el parque es de verdad más grande.
 */
import type { LifeStage } from '../growth/LifeStage';
import type { Point } from '../simulation/Pet';
import type { ItemKind } from './Items';

export const LOCATION_IDS = ['room', 'garden', 'park', 'forest', 'beach'] as const;
export type LocationId = (typeof LOCATION_IDS)[number];
export type LocationType = 'indoor' | 'yard' | 'outdoor';

// Zonas funcionales que alimentan los sensores de zona existentes (cama, comida, juego, ventana)
export type ZoneSensorKey = 'bed' | 'food' | 'play' | 'window';

export interface ZoneDef {
  key: string; // BED_ZONE, PLAY_ZONE, WINDOW_ZONE, FOOD_ZONE, FLOWERBED...
  label: string;
  center: Point;
  radius: number; // normalizado
  sensor: ZoneSensorKey | null; // a qué sensor de zona contribuye (contexto espacial, no conducta)
  followsKind?: ItemKind; // la zona se mueve con ese objeto (la cama, el plato)
}

export interface ExitDef {
  id: string; // 'room>garden'
  to: LocationId;
  at: Point; // dónde está la salida en esta ubicación
  arriveAt: Point; // dónde aparece al llegar a la otra
  label: string; // "la puerta del jardín"
  autonomous: boolean; // la mascota puede cruzarla sola (si está abierta y puede físicamente)
  defaultOpen: boolean;
}

export interface Obstacle extends Point {
  r: number; // radio normalizado
  label: string;
}

export interface MicroEventRate {
  type: MicroEventType;
  perKTicks: number; // eventos esperados por cada 1000 ticks a actividad 1
  daylightOnly?: boolean;
}

export type MicroEventType = 'LEAF_FELL' | 'BUTTERFLY' | 'SOUND_OUTSIDE' | 'BIRD_SONG' | 'WIND_GUST' | 'CLOUD' | 'FEATHER_FELL' | 'CREAK';

export interface SensoryProfile {
  openness: number; // 0 (habitación) .. 1 (campo abierto): sensor openSpace
  baseActivity: number; // actividad ambiental de fondo de día (hojas, pájaros, gente a lo lejos)
  baseNoise: number; // ruido de fondo
  shelter: number; // 1 = interior (la luz de la lámpara cuenta; el clima no)
  groundFriction: number; // multiplicador del rozamiento (hierba frena más que el parquet)
  visualRange: number; // alcance visual con buena luz (unidades de habitación)
  microEvents: readonly MicroEventRate[];
  ambience: 'room' | 'garden' | 'park' | null; // pista de audio ambiente (reproducción separada del estímulo)
}

export interface FurnitureDef {
  kind: ItemKind;
  at: Point;
  fixed: boolean;
}

export interface LocationDef {
  id: LocationId;
  type: LocationType;
  group: 'home' | 'outdoors';
  name: string; // "Habitación"
  label: string; // "la habitación" / "el jardín"
  emoji: string;
  available: boolean; // forest/beach: arquitectura preparada, sin contenido todavía
  size: { w: number; h: number };
  navigationBounds: { minX: number; maxX: number; minY: number; maxY: number };
  spawnPoints: { pet: Point; objects: Point[] };
  interactionPoints: { window?: Point; exits: ExitDef[] };
  zones: ZoneDef[];
  obstacles: Obstacle[];
  furniture: FurnitureDef[]; // availableObjects: lo que existe aquí de forma permanente
  availableObjects: readonly ItemKind[]; // qué puede aparecer (ambientales incluidos)
  sensoryProfile: SensoryProfile;
  minStage: LifeStage | null; // capacidad física para estar aquí (restricción de producto, no de "nivel")
}

const ROOM_BOUNDS = { minX: 0.04, maxX: 0.96, minY: 0, maxY: 1 };

export const LOCATIONS: Readonly<Record<LocationId, LocationDef>> = {
  room: {
    id: 'room', type: 'indoor', group: 'home', name: 'Habitación', label: 'la habitación', emoji: '🏠', available: true,
    size: { w: 1, h: 1 }, navigationBounds: ROOM_BOUNDS,
    spawnPoints: { pet: { x: 0.45, y: 0.55 }, objects: [{ x: 0.6, y: 0.75 }, { x: 0.4, y: 0.7 }, { x: 0.7, y: 0.6 }] },
    interactionPoints: {
      window: { x: 0.5, y: 0.05 },
      exits: [{ id: 'room>garden', to: 'garden', at: { x: 0.08, y: 0.06 }, arriveAt: { x: 0.18, y: 0.2 }, label: 'la puerta del jardín', autonomous: true, defaultOpen: false }],
    },
    zones: [
      { key: 'BED_ZONE', label: 'la zona de la cama', center: { x: 0.15, y: 0.18 }, radius: 0.28, sensor: 'bed', followsKind: 'bed' },
      { key: 'FOOD_ZONE', label: 'la zona de la comida', center: { x: 0.78, y: 0.22 }, radius: 0.28, sensor: 'food', followsKind: 'bowl' },
      { key: 'PLAY_ZONE', label: 'la zona de juego', center: { x: 0.55, y: 0.7 }, radius: 0.28, sensor: 'play' },
      { key: 'WINDOW_ZONE', label: 'junto a la ventana', center: { x: 0.5, y: 0.05 }, radius: 0.28, sensor: 'window' },
    ],
    obstacles: [],
    furniture: [
      { kind: 'bed', at: { x: 0.15, y: 0.18 }, fixed: true },
      { kind: 'bowl', at: { x: 0.78, y: 0.22 }, fixed: true },
      { kind: 'water', at: { x: 0.93, y: 0.45 }, fixed: true },
      { kind: 'tent', at: { x: 0.08, y: 0.78 }, fixed: true },
    ],
    availableObjects: ['ball', 'teddy', 'mysteryBox', 'mirror', 'cactus', 'gift', 'duck', 'mushroom', 'yoyo', 'crystal', 'shell', 'puzzle', 'rope', 'treat'],
    sensoryProfile: {
      openness: 0, baseActivity: 0, baseNoise: 0.03, shelter: 1, groundFriction: 1, visualRange: 1.3, ambience: 'room',
      // Por la ventana: algún pájaro o un ruido en la calle, de vez en cuando
      microEvents: [{ type: 'SOUND_OUTSIDE', perKTicks: 0.35 }, { type: 'BIRD_SONG', perKTicks: 0.25, daylightOnly: true }],
    },
    minStage: null,
  },
  garden: {
    id: 'garden', type: 'yard', group: 'home', name: 'Jardín', label: 'el jardín', emoji: '🌿', available: true,
    size: { w: 1.7, h: 1.4 }, navigationBounds: { minX: 0.03, maxX: 0.97, minY: 0.02, maxY: 0.98 },
    spawnPoints: { pet: { x: 0.18, y: 0.2 }, objects: [{ x: 0.55, y: 0.65 }, { x: 0.7, y: 0.4 }, { x: 0.35, y: 0.75 }] },
    interactionPoints: {
      exits: [
        { id: 'garden>room', to: 'room', at: { x: 0.1, y: 0.06 }, arriveAt: { x: 0.14, y: 0.12 }, label: 'la puerta de casa', autonomous: true, defaultOpen: false },
        { id: 'garden>park', to: 'park', at: { x: 0.95, y: 0.5 }, arriveAt: { x: 0.06, y: 0.5 }, label: 'la verja', autonomous: false, defaultOpen: false },
      ],
    },
    zones: [
      { key: 'PORCH', label: 'junto a la puerta', center: { x: 0.12, y: 0.12 }, radius: 0.18, sensor: null },
      { key: 'LAWN', label: 'en el césped', center: { x: 0.55, y: 0.6 }, radius: 0.3, sensor: 'play' },
      { key: 'FLOWERBED', label: 'entre las flores', center: { x: 0.82, y: 0.15 }, radius: 0.16, sensor: null },
    ],
    obstacles: [{ x: 0.3, y: 0.35, r: 0.05, label: 'el árbol' }, { x: 0.82, y: 0.15, r: 0.07, label: 'el macizo de flores' }],
    furniture: [],
    availableObjects: ['ball', 'teddy', 'mysteryBox', 'mirror', 'leaf', 'feather', 'butterfly', 'cactus', 'gift', 'duck', 'mushroom', 'yoyo', 'crystal', 'shell', 'puzzle', 'rope'],
    sensoryProfile: {
      openness: 0.55, baseActivity: 0.35, baseNoise: 0.1, shelter: 0, groundFriction: 0.9, visualRange: 2.2, ambience: 'garden',
      microEvents: [
        { type: 'LEAF_FELL', perKTicks: 2.2 }, { type: 'BUTTERFLY', perKTicks: 1.2, daylightOnly: true }, { type: 'BIRD_SONG', perKTicks: 1.5, daylightOnly: true },
        { type: 'WIND_GUST', perKTicks: 0.8 }, { type: 'SOUND_OUTSIDE', perKTicks: 0.6 }, { type: 'CLOUD', perKTicks: 0.5, daylightOnly: true },
      ],
    },
    minStage: 'CHILD',
  },
  park: {
    id: 'park', type: 'outdoor', group: 'outdoors', name: 'Parque', label: 'el parque', emoji: '🌳', available: true,
    size: { w: 2.8, h: 2.2 }, navigationBounds: { minX: 0.02, maxX: 0.98, minY: 0.02, maxY: 0.98 },
    spawnPoints: { pet: { x: 0.08, y: 0.5 }, objects: [{ x: 0.45, y: 0.55 }, { x: 0.65, y: 0.3 }, { x: 0.3, y: 0.8 }, { x: 0.8, y: 0.7 }] },
    interactionPoints: {
      exits: [{ id: 'park>garden', to: 'garden', at: { x: 0.03, y: 0.5 }, arriveAt: { x: 0.92, y: 0.5 }, label: 'el camino a casa', autonomous: false, defaultOpen: false }],
    },
    zones: [
      { key: 'MEADOW', label: 'en la pradera', center: { x: 0.5, y: 0.6 }, radius: 0.3, sensor: 'play' },
      { key: 'POND', label: 'junto al estanque', center: { x: 0.78, y: 0.25 }, radius: 0.14, sensor: null },
      { key: 'TREES', label: 'bajo los árboles', center: { x: 0.2, y: 0.2 }, radius: 0.2, sensor: null },
      { key: 'PATH', label: 'en el camino', center: { x: 0.2, y: 0.5 }, radius: 0.15, sensor: null },
    ],
    obstacles: [
      { x: 0.78, y: 0.25, r: 0.09, label: 'el estanque' }, { x: 0.15, y: 0.18, r: 0.03, label: 'un árbol' },
      { x: 0.28, y: 0.12, r: 0.03, label: 'un árbol' }, { x: 0.6, y: 0.85, r: 0.04, label: 'el banco' },
    ],
    furniture: [],
    availableObjects: ['ball', 'teddy', 'mysteryBox', 'leaf', 'feather', 'butterfly', 'mushroom', 'shell'],
    sensoryProfile: {
      openness: 1, baseActivity: 0.6, baseNoise: 0.2, shelter: 0, groundFriction: 0.85, visualRange: 3.2, ambience: 'park',
      microEvents: [
        { type: 'LEAF_FELL', perKTicks: 3 }, { type: 'BUTTERFLY', perKTicks: 1.5, daylightOnly: true }, { type: 'BIRD_SONG', perKTicks: 2.5, daylightOnly: true },
        { type: 'SOUND_OUTSIDE', perKTicks: 2 }, { type: 'WIND_GUST', perKTicks: 1.2 }, { type: 'FEATHER_FELL', perKTicks: 0.8 }, { type: 'CLOUD', perKTicks: 0.6, daylightOnly: true },
      ],
    },
    minStage: 'YOUNG',
  },
  // ---- Preparados para el futuro (sin contenido, no accesibles) ----
  forest: {
    id: 'forest', type: 'outdoor', group: 'outdoors', name: 'Bosque', label: 'el bosque', emoji: '🌲', available: false,
    size: { w: 3, h: 3 }, navigationBounds: ROOM_BOUNDS, spawnPoints: { pet: { x: 0.5, y: 0.5 }, objects: [] },
    interactionPoints: { exits: [] }, zones: [], obstacles: [], furniture: [], availableObjects: ['leaf', 'feather', 'mushroom'],
    sensoryProfile: { openness: 0.4, baseActivity: 0.5, baseNoise: 0.15, shelter: 0, groundFriction: 0.8, visualRange: 1.8, ambience: null, microEvents: [] },
    minStage: 'ADULT',
  },
  beach: {
    id: 'beach', type: 'outdoor', group: 'outdoors', name: 'Playa', label: 'la playa', emoji: '🏖️', available: false,
    size: { w: 3, h: 2 }, navigationBounds: ROOM_BOUNDS, spawnPoints: { pet: { x: 0.5, y: 0.5 }, objects: [] },
    interactionPoints: { exits: [] }, zones: [], obstacles: [], furniture: [], availableObjects: ['shell', 'feather'],
    sensoryProfile: { openness: 1, baseActivity: 0.5, baseNoise: 0.35, shelter: 0, groundFriction: 0.7, visualRange: 3.5, ambience: null, microEvents: [] },
    minStage: 'ADULT',
  },
};

export const PLAYABLE_LOCATIONS: readonly LocationId[] = LOCATION_IDS.filter((id) => LOCATIONS[id].available);

export function isLocationId(v: unknown): v is LocationId {
  return typeof v === 'string' && (LOCATION_IDS as readonly string[]).includes(v);
}

export function exitBetween(from: LocationId, to: LocationId): ExitDef | null {
  return LOCATIONS[from].interactionPoints.exits.find((e) => e.to === to) ?? null;
}

// Ruta de ubicaciones (BFS sobre las salidas): room → garden → park
export function locationRoute(from: LocationId, to: LocationId): LocationId[] | null {
  if (from === to) return [from];
  const prev = new Map<LocationId, LocationId>();
  const queue: LocationId[] = [from];
  const seen = new Set<LocationId>([from]);
  while (queue.length) {
    const cur = queue.shift() as LocationId;
    for (const e of LOCATIONS[cur].interactionPoints.exits) {
      if (seen.has(e.to)) continue;
      seen.add(e.to); prev.set(e.to, cur);
      if (e.to === to) {
        const path: LocationId[] = [to];
        let p = cur;
        for (;;) { path.unshift(p); if (p === from) break; p = prev.get(p) as LocationId; }
        return path;
      }
      queue.push(e.to);
    }
  }
  return null;
}

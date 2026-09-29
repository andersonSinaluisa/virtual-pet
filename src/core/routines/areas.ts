/*
 * ZONAS FIJAS DE LA HABITACIÓN (para interpretar "dónde" ocurren las cosas).
 * A diferencia de las zonas funcionales del World (que siguen a la cama o al
 * plato), éstas no se mueven: así un hábito como "duerme junto a la ventana"
 * puede CAMBIAR a "duerme en el rincón" si el jugador cambia la cama de sitio.
 */
import type { Point } from '../simulation/Pet';
import type { LocationId } from '../world/Locations';

export const ROOM_AREAS = [
  { key: 'ventana', label: 'junto a la ventana', x: 0.5, y: 0.1 },
  { key: 'puerta', label: 'cerca de la puerta', x: 0.12, y: 0.15 },
  { key: 'cocina', label: 'cerca de su comida', x: 0.85, y: 0.3 },
  { key: 'alfombra', label: 'en la alfombra', x: 0.5, y: 0.62 },
  { key: 'rincon', label: 'en el rincón', x: 0.12, y: 0.82 },
  { key: 'frente', label: 'cerca de ti', x: 0.85, y: 0.85 },
] as const;

export type RoomArea = (typeof ROOM_AREAS)[number]['key'];

export function roomArea(p: Point): RoomArea {
  let best: RoomArea = 'alfombra', d = Infinity;
  for (const a of ROOM_AREAS) {
    const dd = Math.hypot(p.x - a.x, (p.y - a.y) * 0.8);
    if (dd < d) { d = dd; best = a.key; }
  }
  return best;
}

// v7: fuera de la habitación el "dónde" es el lugar (jardín, parque): suficiente para hábitos como
// "suele salir al jardín por las mañanas" (interpretación, nunca una orden)
const OUTDOOR_AREAS: Record<string, string> = { jardin: 'en el jardín', parque: 'en el parque', bosque: 'en el bosque', playa: 'en la playa' };
const LOCATION_AREA: Partial<Record<LocationId, string>> = { garden: 'jardin', park: 'parque', forest: 'bosque', beach: 'playa' };

export function areaOf(location: LocationId, p: Point): string {
  return location === 'room' ? roomArea(p) : LOCATION_AREA[location] ?? location;
}

export function areaLabel(key: string): string {
  return ROOM_AREAS.find((a) => a.key === key)?.label ?? OUTDOOR_AREAS[key] ?? key;
}

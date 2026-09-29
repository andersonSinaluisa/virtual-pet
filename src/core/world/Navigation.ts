/*
 * PET NAVIGATION SYSTEM
 * ---------------------
 *   intención (ya decidida por la SNN)  →  objetivo (TargetResolver)
 *     →  camino (aquí)  →  movimiento (MovementSystem)
 *
 * La SNN decide ACERCARSE / EXPLORAR / ALEJARSE. Aquí solo se resuelve CÓMO
 * llegar: rodear obstáculos del lugar (árbol, estanque, banco) y, si el
 * objetivo está en otra ubicación, ir hasta la salida que la conecta. Cruzar
 * una salida solo es posible si está abierta, es de las que la mascota
 * puede cruzar sola y su cuerpo ya puede estar allí (etapa de vida).
 *
 * Nada de pathfinding dentro de la red.
 */
import type { Point } from '../simulation/Pet';
import type { World } from '../simulation/World';
import { LOCATIONS, locationRoute, type LocationId } from './Locations';

export interface NavGoal {
  location: LocationId;
  point: Point;
  stop: number;
  label?: string;
}

export interface NavStep {
  waypoint: Point; // siguiente punto a pisar en la ubicación actual
  stop: number;
  exitId: string | null; // si el waypoint es una salida que se va a cruzar
  final: boolean; // es el objetivo real (no un rodeo ni una salida)
  reachable: boolean;
}

const EXIT_RADIUS = 0.05;
const CLEARANCE = 0.035;

export class PetNavigationSystem {
  lastGoal: NavGoal | null = null; // depuración (Show Navigation Target)
  lastStep: NavStep | null = null;

  constructor(private readonly world: World) {}

  plan(goal: NavGoal): NavStep {
    const w = this.world;
    this.lastGoal = goal;
    let target = goal.point, stop = goal.stop, exitId: string | null = null, final = true, reachable = true;
    if (goal.location !== w.location) {
      const route = locationRoute(w.location, goal.location);
      const exit = route && route.length > 1 ? LOCATIONS[w.location].interactionPoints.exits.find((e) => e.to === route[1]) : null;
      if (exit && w.canCross(exit.id)) { target = exit.at; stop = 0.01; exitId = exit.id; final = false; }
      else reachable = false;
    }
    const detour = reachable ? this.detour(w.pet, target) : null;
    const step: NavStep = detour ? { waypoint: detour, stop: 0.015, exitId: null, final: false, reachable } : { waypoint: target, stop, exitId, final, reachable };
    this.lastStep = step;
    return step;
  }

  // ¿Llegó a la salida que iba a cruzar? (MovementSystem lo pregunta tras moverse)
  atExit(exitId: string): boolean {
    const exit = LOCATIONS[this.world.location].interactionPoints.exits.find((e) => e.id === exitId);
    return !!exit && this.world.distance(this.world.pet, exit.at) < EXIT_RADIUS;
  }

  // Rodeo simple: si el segmento corta un obstáculo (que no es el destino), pasar por su lado más cercano
  private detour(from: Point, to: Point): Point | null {
    const w = this.world, sx = w.scaleX, sy = w.scaleY;
    for (const ob of LOCATIONS[w.location].obstacles) {
      const r = ob.r + CLEARANCE;
      // En el plano escalado (distancias reales)
      const ax = from.x * sx, ay = from.y * sy, bx = to.x * sx, by = to.y * sy, cx = ob.x * sx, cy = ob.y * sy;
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      if (len2 < 1e-6) continue;
      if (Math.hypot(bx - cx, by - cy) < r * Math.max(sx, sy)) continue; // el destino está en el obstáculo (p. ej. ir al árbol)
      const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2));
      const px = ax + dx * t, py = ay + dy * t;
      const dist = Math.hypot(px - cx, py - cy);
      const rr = r * Math.max(sx, sy);
      if (dist >= rr || t <= 0 || t >= 1) continue;
      // Lado: perpendicular hacia donde queda el punto más cercano del camino
      let nx = px - cx, ny = py - cy;
      const n = Math.hypot(nx, ny);
      if (n < 1e-6) { nx = -dy; ny = dx; } // pasa por el centro: rodear por la izquierda
      const nn = Math.hypot(nx, ny);
      const k = (rr + 0.04) / nn;
      const wx = (cx + nx * k) / sx, wy = (cy + ny * k) / sy;
      const b = LOCATIONS[w.location].navigationBounds;
      return { x: Math.max(b.minX, Math.min(b.maxX, wx)), y: Math.max(b.minY, Math.min(b.maxY, wy)) };
    }
    return null;
  }
}

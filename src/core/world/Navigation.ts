/*
 * PET NAVIGATION SYSTEM
 * ---------------------
 *   intención (ya decidida por la SNN)  →  objetivo (TargetResolver)
 *     →  camino (aquí)  →  movimiento (MovementSystem)
 *
 * La SNN decide ACERCARSE / EXPLORAR / ALEJARSE. Aquí solo se resuelve CÓMO
 * llegar: rodear obstáculos del lugar (sofá, árbol, estanque: círculos y cajas
 * de EnvironmentLayouts, en metros) y, si el
 * objetivo está en otra ubicación, ir hasta la salida que la conecta. Cruzar
 * una salida solo es posible si está abierta, es de las que la mascota
 * puede cruzar sola y su cuerpo ya puede estar allí (etapa de vida).
 *
 * Nada de pathfinding dentro de la red.
 */
import type { Point } from '../simulation/Pet';
import type { World } from '../simulation/World';
import { gridStep } from './NavGrid';
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
    // v9: rejilla de navegación (muebles, árboles, huecos más estrechos que el cuerpo). Un destino
    // imposible (dentro del sofá, en un bolsillo) se convierte en el punto alcanzable más cercano.
    let step: NavStep = { waypoint: target, stop, exitId, final, reachable };
    if (reachable) {
      const g = gridStep(w.location, w.pet, target, w.bodyRadius);
      step = g.direct ? { waypoint: g.goal, stop, exitId, final, reachable } : { waypoint: g.waypoint, stop: 0.015, exitId: null, final: false, reachable };
    }
    this.lastStep = step;
    return step;
  }

  // ¿Llegó a la salida que iba a cruzar? (MovementSystem lo pregunta tras moverse)
  atExit(exitId: string): boolean {
    const exit = LOCATIONS[this.world.location].interactionPoints.exits.find((e) => e.id === exitId);
    return !!exit && this.world.distance(this.world.pet, exit.at) < EXIT_RADIUS;
  }
}

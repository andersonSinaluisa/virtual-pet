/*
 * MOVEMENT SYSTEM
 * ---------------
 * Sabe CÓMO moverse, no CUÁNDO. Recibe "intenciones" de las acciones
 * activas (ir hacia algo, huir de algo, deambular, frenar, acelerar) y
 * las SUMA como vectores. No elige una: si APPROACH y MOVE_AWAY están
 * activos a la vez se cancelan, y el conflicto se ve como duda en pantalla.
 *
 * v7: el mundo tiene tamaño (el parque es más grande que la habitación): el
 * paso se da en unidades de habitación y se convierte al suelo normalizado
 * del lugar. El cuerpo tiene ORIENTACIÓN (define el campo de visión): gira
 * hacia lo que mira o hacia donde camina, con una velocidad de giro máxima.
 * Si el destino era una salida (puerta del jardín) y llega, cruza.
 */
import { angleDiff } from '../world/Perception';
import type { Point } from './Pet';
import type { SimConfig } from './SimConfig';
import type { World } from './World';

export type MoveIntent =
  | { kind: 'seek'; target: Point; speed: number; stop: number; priority?: number; exitId?: string | null }
  | { kind: 'flee'; from: Point; speed: number }
  | { kind: 'wander'; speed: number }
  | { kind: 'brake'; factor: number }
  | { kind: 'boost'; factor: number };

export class MovementSystem {
  constructor(private readonly config: SimConfig) {}

  apply(world: World, intents: readonly MoveIntent[]): void {
    const cfg = this.config.movement, petCfg = this.config.pet, rng = this.config.rng;
    const pet = world.pet;
    let vx = 0, vy = 0, brake = 1, boost = 1;

    // v5: dos destinos a la vez (el agua y la cama) no se promedian: se sigue la decisión más reciente
    // (antes la mascota quedaba a medio camino entre los dos y no llegaba a ninguno)
    let seek: Extract<MoveIntent, { kind: 'seek' }> | null = null;
    for (const it of intents) if (it.kind === 'seek' && (!seek || (it.priority ?? 0) > (seek.priority ?? 0))) seek = it;

    // Direcciones en el plano escalado del lugar (en la habitación, idéntico a antes)
    const sx = world.scaleX, sy = world.scaleY / 0.8;
    for (const it of intents) {
      if (it.kind === 'seek') {
        if (it !== seek) continue;
        const dx = (it.target.x - pet.x) * sx, dy = (it.target.y - pet.y) * sy, d = Math.hypot(dx, dy);
        if (d > it.stop) { vx += (dx / d) * it.speed; vy += (dy / d) * it.speed; }
      } else if (it.kind === 'flee') {
        const dx = (pet.x - it.from.x) * sx, dy = (pet.y - it.from.y) * sy, d = Math.hypot(dx, dy) || 1;
        vx += (dx / d) * it.speed; vy += (dy / d) * it.speed;
      } else if (it.kind === 'wander') {
        if (seek) continue; // v8: quien va a algún sitio no deambula por el camino
        pet.heading = (pet.heading ?? rng() * Math.PI * 2) + (rng() - 0.5) * 0.8;
        vx += Math.cos(pet.heading) * it.speed; vy += Math.sin(pet.heading) * it.speed;
      } else if (it.kind === 'brake') {
        brake = Math.min(brake, it.factor);
      } else {
        boost = Math.max(boost, it.factor);
      }
    }

    // Longitud máxima 1 × velocidad base (× boost al correr)
    const mag = Math.hypot(vx, vy);
    if (mag > 1) { vx /= mag; vy /= mag; }
    const k = cfg.baseSpeed * brake * boost;
    let nx = pet.x + (vx * k) / sx, ny = pet.y + (vy * k) / sy;

    // Paredes / límites del lugar: rebotar el rumbo de deambular
    const b = world.def.navigationBounds;
    if (nx < b.minX || nx > b.maxX) pet.heading = Math.PI - (pet.heading ?? 0);
    if (ny < b.minY || ny > b.maxY) pet.heading = -(pet.heading ?? 0);
    nx = Math.max(b.minX, Math.min(b.maxX, nx));
    ny = Math.max(b.minY, Math.min(b.maxY, ny));

    const dist = Math.hypot((nx - pet.x) * sx, (ny - pet.y) * sy);
    pet.vx = nx - pet.x; pet.vy = ny - pet.y;
    pet.x = nx; pet.y = ny;

    // Moverse cuesta energía y cansa
    pet.change('energy', -dist * petCfg.moveEnergyCost);
    pet.change('fatigue', dist * petCfg.moveFatigueCost);

    const lookX = pet.lookTarget ? pet.lookTarget.x - pet.x : pet.vx;
    if (Math.abs(lookX) > 0.002) pet.facing = lookX > 0 ? 1 : -1;
    pet.speed = dist / cfg.baseSpeed; // 1 = caminar, >1 = correr

    // Orientación: hacia lo que mira; si no mira nada, hacia donde camina. Giro limitado por tick.
    let want: number | null = null;
    const lt = pet.lookTarget;
    if (lt && Math.hypot((lt.x - pet.x) * sx, (lt.y - pet.y) * sy) > 0.01) want = Math.atan2((lt.y - pet.y) * world.scaleY, (lt.x - pet.x) * world.scaleX);
    else if (dist > 0.002) want = Math.atan2(pet.vy * world.scaleY, pet.vx * world.scaleX);
    if (want !== null) {
      const turn = Math.max(-cfg.turnRate, Math.min(cfg.turnRate, angleDiff(want, pet.orientation)));
      pet.orientation = angleDiff(pet.orientation + turn, 0);
    }

    // Llegó a la salida que buscaba: cruza (transición intencional entre escenas)
    if (seek?.exitId && world.canCross(seek.exitId) && world.navigation.atExit(seek.exitId)) {
      const exit = world.def.interactionPoints.exits.find((e) => e.id === seek?.exitId);
      if (exit) world.changeLocation(exit.to, exit.arriveAt, 'walked');
    }
  }
}

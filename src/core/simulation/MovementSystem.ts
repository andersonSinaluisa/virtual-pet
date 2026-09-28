/*
 * MOVEMENT SYSTEM
 * ---------------
 * Sabe CÓMO moverse, no CUÁNDO. Recibe "intenciones" de las acciones
 * activas (ir hacia algo, huir de algo, deambular, frenar, acelerar) y
 * las SUMA como vectores. No elige una: si APPROACH y MOVE_AWAY están
 * activos a la vez se cancelan, y el conflicto se ve como duda en pantalla.
 */
import type { Point } from './Pet';
import type { SimConfig } from './SimConfig';
import type { World } from './World';

export type MoveIntent =
  | { kind: 'seek'; target: Point; speed: number; stop: number }
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

    for (const it of intents) {
      if (it.kind === 'seek') {
        const dx = it.target.x - pet.x, dy = it.target.y - pet.y, d = Math.hypot(dx, dy);
        if (d > it.stop) { vx += (dx / d) * it.speed; vy += (dy / d) * it.speed; }
      } else if (it.kind === 'flee') {
        const dx = pet.x - it.from.x, dy = pet.y - it.from.y, d = Math.hypot(dx, dy) || 1;
        vx += (dx / d) * it.speed; vy += (dy / d) * it.speed;
      } else if (it.kind === 'wander') {
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
    let nx = pet.x + vx * k, ny = pet.y + vy * k;

    // Paredes: rebotar el rumbo de deambular
    if (nx < 0.04 || nx > 0.96) pet.heading = Math.PI - (pet.heading ?? 0);
    if (ny < 0 || ny > 1) pet.heading = -(pet.heading ?? 0);
    nx = Math.max(0.04, Math.min(0.96, nx));
    ny = Math.max(0, Math.min(1, ny));

    const dist = Math.hypot(nx - pet.x, ny - pet.y);
    pet.vx = nx - pet.x; pet.vy = ny - pet.y;
    pet.x = nx; pet.y = ny;

    // Moverse cuesta energía y cansa
    pet.change('energy', -dist * petCfg.moveEnergyCost);
    pet.change('fatigue', dist * petCfg.moveFatigueCost);

    const lookX = pet.lookTarget ? pet.lookTarget.x - pet.x : pet.vx;
    if (Math.abs(lookX) > 0.002) pet.facing = lookX > 0 ? 1 : -1;
    pet.speed = dist / cfg.baseSpeed; // 1 = caminar, >1 = correr
  }
}

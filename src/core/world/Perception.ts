/*
 * WORLD SENSOR SYSTEM — mundo → percepción → señales sensoriales normalizadas
 * --------------------------------------------------------------------------
 *
 *   WORLD (objetos, sonidos, ambiente)
 *     ↓  percepción espacial simplificada (sin omnisciencia)
 *   ObjectPercept / HeardSound     (depuración: "qué percibió")
 *     ↓  agregación
 *   Perception (0..1 por sensor)   → Sensors → corriente → SNN
 *
 * VISTA: un campo de visión (FOV) configurable centrado en la orientación
 * de la mascota. Dentro del cono central se ve bien; hacia la periferia la
 * señal cae hasta 0; detrás no se ve nada. La señal también cae con la
 * distancia (y desaparece más allá del alcance visual del lugar) y con la
 * oscuridad. Muy cerca (bigotes, olfato, tacto) se nota algo aunque esté
 * detrás o a oscuras: `nearSense`.
 *
 *         visión
 *       \       /
 *        \     /        cono completo = fovFullDeg, periferia hasta fovDeg
 *         \ 🐶 /
 *          \ /
 *
 * OÍDO: los sonidos se perciben aunque estén fuera del FOV, atenuados por
 * la distancia. Se calcula su intensidad percibida, su dirección (ángulo
 * respecto a la cabeza) y su novedad (memoria de sonidos).
 *
 * NOVEDAD / FAMILIARIDAD: vienen de ExplorationMemory (exposición real de
 * ESTA mascota), nunca del tipo de objeto.
 *
 * Nada de esto decide qué hace la mascota. No hay "if caja → curiosidad".
 */
import { clamp01 } from '../random';
import type { Pet, Point } from '../simulation/Pet';
import { ITEMS, type ItemKind } from './Items';
import type { SoundKind, SoundStimulus } from './Sound';
import { soundAttenuation } from './Sound';

export interface PerceptionConfig {
  fovDeg: number; // campo visual total (periferia incluida)
  fovFullDeg: number; // cono de visión nítida
  nearSenseRadius: number; // unidades de habitación
  nearSenseGain: number;
  proximityRange: number; // la señal visual cae con la distancia en este rango (0.4 → 1)
  hearingReference: number; // distancia a la que un sonido llega a la mitad
  perceivedThreshold: number; // por debajo, "no lo percibe"
  mirrorRange: number; // distancia a la que la imagen del espejo se mueve con la mascota
}

export const DEFAULT_PERCEPTION: PerceptionConfig = {
  fovDeg: 250, fovFullDeg: 140, nearSenseRadius: 0.15, nearSenseGain: 0.55, proximityRange: 0.8,
  hearingReference: 1.0, perceivedThreshold: 0.08, mirrorRange: 0.5,
};

export interface PerceivableObject extends Point {
  id: number;
  kind: ItemKind;
  fixed: boolean;
  type: string;
  interest: number;
  novelty: number; // transitorio: "algo apareció / se movió" (no es la novedad de memoria)
  vx: number;
  vy: number;
}

export interface ObjectPercept {
  id: number;
  kind: ItemKind;
  distance: number; // unidades de habitación
  meters: number;
  angle: number; // grados, con signo (0 = delante)
  inFov: boolean;
  vision: number; // componente visual 0..1
  near: number; // componente de cercanía (olfato/tacto) 0..1
  signal: number; // intensidad percibida total 0..1
  perceived: boolean;
  movement: number; // 0 quieto .. 1 moviéndose rápido (incluye la imagen del espejo)
  novelty: number; // memoria (0..1)
  familiarity: number; // memoria (0..1)
  transient: number; // "acaba de aparecer / moverse" (0..1)
  salience: number; // lo que tira de la atención (sin sesgo del cerebro)
}

export interface HeardSound extends Point {
  id: number;
  kind: SoundKind;
  heard: number; // intensidad percibida 0..1
  direction: number; // grados con signo respecto a la cabeza
  behind: boolean;
  loud: boolean;
  novelty: number;
  age: number;
  sourceObjectId: number | null;
}

// Geometría del lugar actual (el mundo la aporta)
export interface SpatialFrame {
  scaleX: number; // ancho en unidades de habitación
  scaleY: number; // fondo (con el mismo factor 0.8 que World.distance)
  metersPerUnit: number;
  visualRange: number;
}

export const METERS_PER_UNIT = 5.2;

/*
 * Cuánto tira la novedad de MEMORIA de la atención "de abajo arriba". Pequeño a propósito:
 * lo nuevo llega al cerebro por `newObjectDetected`/`familiarObject` y es la SNN (curiosa o
 * miedosa, según su historia) la que decide acercarse o no. Con 0.5 la novedad arrastraba la
 * atención sola y tapaba lo aprendido (medido: docs/living-world-results.md §Novelty).
 */
export const NOVELTY_PULL = 0.05;

// Ángulo (radianes) de un punto visto desde `from`, en el plano escalado del lugar
export function bearing(frame: SpatialFrame, from: Point, to: Point): number {
  return Math.atan2((to.y - from.y) * frame.scaleY, (to.x - from.x) * frame.scaleX);
}

export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Cuánto entra en el FOV una dirección (0..1): 1 en el cono nítido, cae linealmente hasta el borde
export function fovFactor(cfg: PerceptionConfig, absAngleRad: number): number {
  const deg = (absAngleRad * 180) / Math.PI;
  const full = cfg.fovFullDeg / 2, edge = cfg.fovDeg / 2;
  if (deg <= full) return 1;
  if (deg >= edge) return 0;
  return 1 - (deg - full) / (edge - full);
}

export interface PerceiveInput {
  pet: Pet;
  orientation: number;
  frame: SpatialFrame;
  light: number;
  eyes: number; // 0.15 dormido (ojos cerrados)
  body: number; // 0.6 dormido
  distance: (a: Point, b: Point) => number;
  novelty: (kind: ItemKind) => number;
  familiarity: (kind: ItemKind) => number;
  soundNovelty: (kind: SoundKind) => number;
}

export class WorldSensorSystem {
  constructor(public config: PerceptionConfig = { ...DEFAULT_PERCEPTION }) {}

  perceiveObject(o: PerceivableObject, inp: PerceiveInput): ObjectPercept {
    const cfg = this.config, pet = inp.pet;
    const d = inp.distance(pet, o);
    const angle = angleDiff(bearing(inp.frame, pet, o), inp.orientation);
    const fov = d < 1e-4 ? 1 : fovFactor(cfg, Math.abs(angle));
    const visibility = 0.45 + 0.55 * inp.light; // a oscuras se ve algo (siluetas)
    const range = inp.frame.visualRange;
    const fade = d >= range ? 0 : clamp01((range - d) / (0.25 * range));
    const distF = (0.4 + 0.6 * Math.max(0, 1 - d / cfg.proximityRange)) * fade;
    const vision = clamp01(fov * distF * visibility * inp.eyes);
    const near = d < cfg.nearSenseRadius ? cfg.nearSenseGain * (1 - 0.5 * (d / cfg.nearSenseRadius)) * inp.body : 0;
    const signal = Math.max(vision, near);
    const def = ITEMS[o.kind];

    let movement = clamp01(Math.hypot(o.vx, o.vy) / 0.04);
    // Espejo: su imagen se mueve cuando la mascota se mueve delante de él (estímulo correlacionado con el movimiento propio)
    if (def.sensory.reflective && fov > 0 && d < cfg.mirrorRange) movement = Math.max(movement, clamp01(pet.speed * 0.8) * fov);

    const novelty = inp.novelty(o.kind);
    const familiarity = inp.familiarity(o.kind);
    const transient = clamp01(o.novelty);
    const salience = signal * (transient + novelty * NOVELTY_PULL + o.interest * 0.6 + movement * 0.5);
    return {
      id: o.id, kind: o.kind, distance: d, meters: d * METERS_PER_UNIT, angle: (angle * 180) / Math.PI, inFov: fov > 0,
      vision, near, signal, perceived: signal >= cfg.perceivedThreshold, movement, novelty, familiarity, transient, salience,
    };
  }

  hear(s: SoundStimulus, inp: PerceiveInput): HeardSound {
    const d = inp.distance(inp.pet, s);
    const heard = clamp01(s.intensity * soundAttenuation(d, this.config.hearingReference) * inp.body);
    const dir = d < 1e-4 ? 0 : angleDiff(bearing(inp.frame, inp.pet, s), inp.orientation);
    return {
      id: s.id, kind: s.kind, x: s.x, y: s.y, heard, direction: (dir * 180) / Math.PI, behind: Math.abs(dir) > Math.PI / 2,
      loud: s.loud, novelty: inp.soundNovelty(s.kind), age: s.age, sourceObjectId: s.sourceObjectId,
    };
  }
}

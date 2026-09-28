/*
 * ESTADO FÍSICO DE LA MASCOTA
 * ---------------------------
 * Ocho valores persistentes (0..1). NO son inputs neuronales: el mundo los
 * expone y los sensores los traducen a corriente. Aquí solo hay física:
 * pasar el tiempo, sumar y limitar a 0..1.
 */
import { PET_STATS, type PetStat, type PetStats, type SimConfig } from './SimConfig';

export interface Point {
  x: number;
  y: number;
}

export interface PetBodyState extends PetStats {
  x: number;
  y: number;
  facing: number;
  carrying: number | null;
}

export class Pet implements PetStats {
  static readonly STATS = PET_STATS;

  hunger = 0;
  thirst = 0;
  fatigue = 0;
  boredom = 0;
  affection = 0;
  energy = 0;
  fear = 0;
  curiosity = 0;

  x = 0.45; // posición en el mundo
  y = 0.55;
  vx = 0; // velocidad del último tick
  vy = 0;
  speed = 0; // 1 = caminar, >1 = correr
  heading: number | null = null;
  facing = 1; // 1 derecha, -1 izquierda
  lookTarget: Point | null = null; // hacia dónde mira (jugador, objeto, lugar)
  carrying: number | null = null; // id del objeto que lleva
  hidden = false;
  asleep = false; // durmiendo de verdad (en la cama)

  constructor(private readonly cfg: SimConfig['pet']) {
    this.reset();
  }

  reset(): void {
    Object.assign(this, this.cfg.initial);
    this.x = 0.45; this.y = 0.55;
    this.vx = 0; this.vy = 0; this.speed = 0;
    this.heading = null;
    this.facing = 1;
    this.lookTarget = null;
    this.carrying = null;
    this.hidden = false;
    this.asleep = false;
  }

  // timeScale > 1 solo se usa en la simulación offline (tiempo comprimido).
  passTime(timeScale = 1): void {
    const d = this.cfg.drift;
    for (const stat of PET_STATS) {
      const v = d[stat];
      if (v) this.change(stat, v * timeScale);
    }
    this.fear *= Math.pow(this.cfg.fearDecay, timeScale);
    this.curiosity *= Math.pow(this.cfg.curiosityDecay, timeScale);
  }

  change(stat: PetStat, delta: number): void {
    const next = this[stat] + delta;
    this[stat] = Number.isFinite(next) ? Math.min(1, Math.max(0, next)) : this[stat];
  }

  snapshot(): PetStats {
    const s = {} as PetStats;
    for (const k of PET_STATS) s[k] = this[k];
    return s;
  }

  exportState(): PetBodyState {
    return { ...this.snapshot(), x: this.x, y: this.y, facing: this.facing, carrying: this.carrying };
  }

  importState(s: Partial<PetBodyState>): void {
    for (const k of PET_STATS) {
      const v = s[k];
      if (typeof v === 'number' && Number.isFinite(v)) this[k] = Math.min(1, Math.max(0, v));
    }
    if (typeof s.x === 'number' && Number.isFinite(s.x)) this.x = Math.min(0.96, Math.max(0.04, s.x));
    if (typeof s.y === 'number' && Number.isFinite(s.y)) this.y = Math.min(1, Math.max(0, s.y));
    if (s.facing === 1 || s.facing === -1) this.facing = s.facing;
    this.carrying = typeof s.carrying === 'number' ? s.carrying : null;
  }
}

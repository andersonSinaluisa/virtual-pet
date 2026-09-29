/*
 * AMBIENT EVENT DIRECTOR — microeventos que hacen que el mundo parezca vivo
 * ------------------------------------------------------------------------
 * Una hoja cae, pasa una mariposa, canta un pájaro, suena algo fuera, pasa
 * una nube, sopla una ráfaga. Cada ubicación declara QUÉ puede ocurrir y con
 * qué frecuencia (perfil sensorial); aquí se decide CUÁNDO, teniendo en
 * cuenta:
 *   · la ubicación y la hora (mariposas y pájaros solo de día)
 *   · los eventos recientes (período refractario: discreto, nunca un bombardeo)
 *   · el estado de la mascota SOLO para no amontonar estímulos (si acaba de
 *     asustarse, el mundo no le echa otro encima). Nunca para provocar una
 *     acción concreta.
 *
 * Los eventos cambian el MUNDO (aparece una hoja, suena algo); lo que la
 * mascota haga con ello pasa por percepción → SNN.
 *
 * DETERMINISTA: usa su propio rng con semilla (no gasta el de la simulación)
 * y admite una cola guionizada para tests y depuración:
 *   director.script([{ at: 100, type: 'LEAF_FELL' }, { at: 120, type: 'SOUND_OUTSIDE' }])
 */
import type { Rng } from '../random';
import { LOCATIONS, type LocationId, type MicroEventType } from './Locations';

export interface ScriptedEvent {
  at: number; // tick del mundo
  type: MicroEventType;
  x?: number;
  y?: number;
}

export interface MicroEventRecord {
  tick: number;
  type: MicroEventType;
  location: LocationId;
  x: number;
  y: number;
}

export interface DirectorContext {
  tick: number;
  location: LocationId;
  daylight: number;
  fear: number; // solo para no amontonar
  asleep: boolean;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export interface DirectorConfig {
  enabled: boolean;
  refractoryTicks: number; // mínimo entre dos microeventos
  rateScale: number; // multiplicador global (dev)
}

export const DEFAULT_DIRECTOR: DirectorConfig = { enabled: true, refractoryTicks: 150, rateScale: 1 };

export class AmbientEventDirector {
  lastTick = -Infinity;
  history: MicroEventRecord[] = [];
  private queue: ScriptedEvent[] = [];

  constructor(private rng: Rng, public config: DirectorConfig = { ...DEFAULT_DIRECTOR }) {}

  setRng(rng: Rng): void {
    this.rng = rng;
  }

  script(events: ScriptedEvent[]): void {
    this.queue = [...this.queue, ...events].sort((a, b) => a.at - b.at);
  }

  clearScript(): void {
    this.queue = [];
  }

  // Devuelve los eventos que ocurren en este tick (0 o 1 espontáneo, + los guionizados que tocan)
  update(ctx: DirectorContext): MicroEventRecord[] {
    const out: MicroEventRecord[] = [];
    while (this.queue.length && this.queue[0].at <= ctx.tick) {
      const e = this.queue.shift() as ScriptedEvent;
      out.push(this.record(ctx, e.type, e.x, e.y));
    }
    if (out.length || !this.config.enabled) return out;
    if (ctx.tick - this.lastTick < this.config.refractoryTicks) return out;
    const profile = LOCATIONS[ctx.location].sensoryProfile;
    // Si acaba de asustarse, el mundo "espera" (sin amontonar estímulos)
    const calm = ctx.fear > 0.5 ? 0.3 : 1;
    for (const rate of profile.microEvents) {
      if (rate.daylightOnly && ctx.daylight < 0.35) continue;
      const p = (rate.perKTicks / 1000) * this.config.rateScale * calm;
      if (this.rng() < p) { out.push(this.record(ctx, rate.type)); break; }
    }
    return out;
  }

  private record(ctx: DirectorContext, type: MicroEventType, x?: number, y?: number): MicroEventRecord {
    const b = ctx.bounds;
    const rec: MicroEventRecord = {
      tick: ctx.tick, type, location: ctx.location,
      x: x ?? b.minX + 0.05 + this.rng() * (b.maxX - b.minX - 0.1),
      y: y ?? b.minY + 0.05 + this.rng() * (b.maxY - b.minY - 0.1),
    };
    this.lastTick = ctx.tick;
    this.history.push(rec);
    if (this.history.length > 50) this.history.shift();
    return rec;
  }

  random(): number {
    return this.rng();
  }
}

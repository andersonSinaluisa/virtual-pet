/*
 * WORLD CLOCK
 * -----------
 * El dominio nunca llama a `new Date()` para saber la hora del mundo: recibe
 * un Clock inyectado.
 *
 *   RealWorldClock   la hora del teléfono (× velocidad y + desplazamiento en desarrollo)
 *   SimulationClock  avanza una cantidad fija de tiempo de mundo por tick neural
 *   TestClock        se fija y se avanza a mano
 *
 * El reloj solo INFORMA (hora, luz del día, codificación cíclica). No
 * ejecuta ni sugiere acciones: eso lo decide la SNN con lo que percibe.
 */
export interface Clock {
  now(): number; // epoch ms del mundo
  onTick?(): void; // los relojes de simulación avanzan con el tick neural
}

export class RealWorldClock implements Clock {
  speed = 1; // desarrollo: 1×, 10×, 100×, 1000×
  offset = 0; // desarrollo: saltar horas/días
  private anchorReal = Date.now();
  private anchorWorld = Date.now();

  now(): number {
    const real = Date.now();
    return this.anchorWorld + (real - this.anchorReal) * this.speed + this.offset;
  }

  setSpeed(speed: number): void {
    // Re-ancla para que la hora no salte al cambiar la velocidad
    const current = this.now() - this.offset;
    this.anchorReal = Date.now();
    this.anchorWorld = current;
    this.speed = Math.max(0, speed);
  }

  advance(ms: number): void {
    this.offset += ms;
  }
}

export class SimulationClock implements Clock {
  constructor(private t: number, readonly msPerTick = 60_000) {}
  now(): number { return this.t; }
  onTick(): void { this.t += this.msPerTick; }
  set(t: number): void { this.t = t; }
  advance(ms: number): void { this.t += ms; }
}

export class TestClock implements Clock {
  constructor(private t: number) {}
  now(): number { return this.t; }
  set(t: number): void { this.t = t; }
  advance(ms: number): void { this.t += ms; }
}

export type TimeOfDay = 'DAWN' | 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT';

export interface ClockInfo {
  timestamp: number;
  hour: number;
  minute: number;
  minuteOfDay: number; // 0..1439
  day: number; // días desde el epoch (local)
  dayOfWeek: number; // 0 = domingo
  timeOfDay: TimeOfDay; // SOLO para interpretar/mostrar, nunca para decidir
  timeSin: number;
  timeCos: number;
  daylight: number; // 0..1 luz natural (transiciones suaves)
}

const MIN_PER_DAY = 1440;

export function timeOfDayOf(minuteOfDay: number): TimeOfDay {
  const h = minuteOfDay / 60;
  if (h >= 5 && h < 7) return 'DAWN';
  if (h >= 7 && h < 12) return 'MORNING';
  if (h >= 12 && h < 18) return 'AFTERNOON';
  if (h >= 18 && h < 21.5) return 'EVENING';
  return 'NIGHT';
}

/*
 * Luz del día con transiciones suaves (sin saltos a una hora exacta):
 * elevación solar ≈ −cos(ángulo desde medianoche); smoothstep alrededor del
 * horizonte → amanecer ~6–8 h, atardecer ~18–20 h.
 */
export function daylightAt(minuteOfDay: number): number {
  const elevation = -Math.cos((2 * Math.PI * minuteOfDay) / MIN_PER_DAY);
  const t = Math.max(0, Math.min(1, (elevation + 0.3) / 0.6));
  return t * t * (3 - 2 * t);
}

export function clockInfo(ms: number): ClockInfo {
  const d = new Date(ms);
  const hour = d.getHours(), minute = d.getMinutes();
  const minuteOfDay = hour * 60 + minute + d.getSeconds() / 60;
  const angle = (2 * Math.PI * minuteOfDay) / MIN_PER_DAY;
  const local = ms - d.getTimezoneOffset() * 60_000;
  return {
    timestamp: ms, hour, minute, minuteOfDay,
    day: Math.floor(local / 86_400_000), dayOfWeek: d.getDay(),
    timeOfDay: timeOfDayOf(minuteOfDay),
    timeSin: Math.sin(angle), timeCos: Math.cos(angle),
    daylight: daylightAt(minuteOfDay),
  };
}

/*
 * CODIFICACIÓN PARA LA SNN: las neuronas LIF integran corriente positiva,
 * así que (sin, cos) se proyecta sobre K neuronas con sintonía de fase
 * (código de población en anillo): time_k = max(0, cos(θ − φ_k))^p.
 * cos(θ − φ) = cosθ·cosφ + sinθ·sinφ → se calcula desde timeSin/timeCos.
 */
export const CLOCK_PHASES_HOURS = [0, 4, 8, 12, 16, 20] as const;
const SHARPNESS = 3;

export function clockPopulation(timeSin: number, timeCos: number): number[] {
  return CLOCK_PHASES_HOURS.map((h) => {
    const phi = (2 * Math.PI * h) / 24;
    const c = timeCos * Math.cos(phi) + timeSin * Math.sin(phi);
    return Math.pow(Math.max(0, c), SHARPNESS);
  });
}

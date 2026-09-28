/*
 * TICK ENGINE: el reloj del cerebro, separado del render
 * ------------------------------------------------------
 * El render va a 60 fps (GLView); la SNN a `baseTicksPerSecond × speed`
 * (3 ticks/s por defecto, el valor calibrado del prototipo). Mismo esquema
 * de acumulador que app.js: si el hilo se retrasa, recupera como máximo
 * `maxCatchUp` ticks para no congelar la UI.
 *
 * Solo usa setTimeout (disponible en Hermes y en Node), nada de DOM.
 */
export interface TickEngineOptions {
  ticksPerSecond: number;
  onTick: () => void;
  now?: () => number;
  maxCatchUp?: number;
}

export class TickEngine {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private acc = 0;
  private lastTime = 0;
  private _running = false;
  private _speed = 1;
  private readonly now: () => number;
  private readonly maxCatchUp: number;

  constructor(private readonly opts: TickEngineOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.maxCatchUp = opts.maxCatchUp ?? 8;
  }

  get running(): boolean {
    return this._running;
  }

  get speed(): number {
    return this._speed;
  }

  get interval(): number {
    return 1000 / (this.opts.ticksPerSecond * this._speed);
  }

  setSpeed(speed: number): void {
    this._speed = Math.max(0.05, speed);
    if (this._running) this.schedule();
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this.acc = 0;
    this.lastTime = this.now();
    this.schedule();
  }

  stop(): void {
    this._running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  // Un tick manual (modo desarrollo: Step)
  step(): void {
    this.opts.onTick();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.loop(), Math.max(4, this.interval - this.acc));
  }

  private loop(): void {
    if (!this._running) return;
    const t = this.now();
    this.acc += Math.min(t - this.lastTime, 1000);
    this.lastTime = t;
    let steps = 0;
    while (this.acc >= this.interval && steps < this.maxCatchUp) {
      this.opts.onTick();
      this.acc -= this.interval;
      steps++;
    }
    if (steps >= this.maxCatchUp) this.acc = 0;
    this.schedule();
  }
}

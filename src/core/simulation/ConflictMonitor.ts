/*
 * CONFLICT MONITOR
 * ----------------
 * Observa (no resuelve) pares de acciones incompatibles activas a la vez.
 * Los pares vienen de BrainConfig.conflicts. Más adelante estos datos sirven
 * para calibrar inhibición lateral o winner-take-all DENTRO de la red.
 */
import type { Action } from '../brain/Actions';

export interface ConflictStat {
  a: Action;
  b: Action;
  onsets: number;
  ticks: number;
}

export interface ConflictCheck {
  onsets: [Action, Action][];
  active: [Action, Action][];
}

export class ConflictMonitor {
  active = new Set<string>();
  stats: Record<string, ConflictStat> = {};

  constructor(private readonly pairs: readonly [Action, Action][]) {}

  check(activeActions: readonly Action[]): ConflictCheck {
    const set = new Set(activeActions);
    const now = new Set<string>();
    const onsets: [Action, Action][] = [];
    const active: [Action, Action][] = [];
    for (const [a, b] of this.pairs) {
      if (!set.has(a) || !set.has(b)) continue;
      const key = `${a}|${b}`;
      now.add(key);
      active.push([a, b]);
      const s = (this.stats[key] ??= { a, b, onsets: 0, ticks: 0 });
      s.ticks++;
      if (!this.active.has(key)) { s.onsets++; onsets.push([a, b]); }
    }
    this.active = now;
    return { onsets, active };
  }

  reset(): void {
    this.active = new Set();
    this.stats = {};
  }
}

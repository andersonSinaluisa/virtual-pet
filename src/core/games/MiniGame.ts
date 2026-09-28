/*
 * MINIGAME: contrato común
 * ------------------------
 *   JUGADOR → input() → cambia el MUNDO (lanzar, llamar, colocar objetos)
 *   SNN decide → observe() mira lo que pasó en el tick → view() para la UI
 *
 * Prohibido: mover a la mascota, activar acciones, tocar la red. Un juego
 * solo usa la API del World (la misma que el jugador en la habitación).
 */
import type { Action } from '../brain/Actions';
import { describeBehavior } from '../brain/Actions';
import type { CircuitKey } from '../brain/BrainConfig';
import type { Experience, ExperienceKind, Moment, SubjectKey } from '../memory/types';
import type { Simulation, StepResult } from '../simulation/Simulation';
import type { World } from '../simulation/World';
import type { ItemKind } from '../world/Items';
import type { GameId } from './catalog';

export interface GameContext {
  sim: Simulation;
  world: World;
  petName: string;
  now(): number;
  day(): number;
  ticksPerSecond: number;
  record(kind: ExperienceKind, subject: SubjectKey | null, valence: number, intensity: number): Experience;
  addMoment(m: Pick<Moment, 'title' | 'story' | 'tags' | 'icon' | 'subject'> & { keyMoment?: boolean }): void;
  unlock(kind: ItemKind): void;
  ownedItems(): ItemKind[];
}

export type GameCommand =
  | { type: 'throw'; vx: number; vy: number }
  | { type: 'call'; intensity?: number }
  | { type: 'treat' }
  | { type: 'wait' }
  | { type: 'pet' }
  | { type: 'encourage' }
  | { type: 'keep_distance' }
  | { type: 'toggle_item'; kind: ItemKind }
  | { type: 'begin' };

export interface Narration {
  title: string;
  subtitle: string;
  tone: 'neutral' | 'positive' | 'cautious';
}

export interface GameSummary {
  gameId: GameId;
  headline: string;
  success: boolean;
}

export interface MiniGame<V> {
  readonly id: GameId;
  start(ctx: GameContext): void;
  input(cmd: GameCommand, ctx: GameContext): void;
  observe(result: StepResult, ctx: GameContext): void;
  view(ctx: GameContext): V;
  end(ctx: GameContext): GameSummary;
}

// ---- utilidades compartidas (solo lectura del estado real) ----

// Fracción de ticks recientes en que disparó un circuito (0..1)
export function circuitActivity(sim: Simulation, key: CircuitKey, window = 20): number {
  return sim.trace.rate(sim.brain.circuitKeyToNeuron[key], window);
}

// Lo que está haciendo físicamente, en palabras (acciones activas reales)
export function behaviorLine(active: readonly Action[]): string {
  const shown = active.filter((a) => a !== 'LOOK_AT_OBJECT' || active.length === 1).slice(0, 3);
  return shown.length ? describeBehavior(shown) : 'observa con calma';
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

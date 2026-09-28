/*
 * REWARD MODEL: experiencia → señal de aprendizaje ∈ [−1, 1]
 * ----------------------------------------------------------
 * "Reward" no es "ganó el jugador": es cuánto de buena/mala fue la
 * experiencia para la mascota. Desacoplado de la UI.
 *
 * Las recompensas NATURALES (comer, beber, descansar, jugar) no se deciden
 * aquí: las calcula ExperienceRecorder al terminar el episodio que la red
 * eligió, a partir del resultado (cuánto bajó la necesidad). Aquí solo se
 * limita el rango.
 */
import type { ExperienceKind } from '../memory/types';

// null = la recompensa viene del resultado del episodio (outcome)
const TABLE: Record<ExperienceKind, number | null> = {
  player_rewarded: 0.8,
  petted: 0.3,
  fetch_returned: 0.8,
  fetch_chased: 0.3,
  picked_up: 0.2,
  investigated: 0.05,
  called_responded: 0.6,
  called_ignored: 0,
  mystery_opened: 0.6,
  mystery_avoided: 0,
  greeted: 0.2,
  danced: 0.2,
  approached: 0.1,
  followed: 0.1,
  asked_attention: 0,
  // El miedo no es plástico en esta versión: la memoria lo registra, el cerebro no se "castiga"
  scared: 0,
  hid: 0,
  cried: 0,
  slept: 0,
  game_played: 0,
  choice_made: 0, // se mide en modo evaluación: no debe contaminar
  // Resultado de episodios elegidos por la red
  ate: null,
  drank: null,
  rested: null,
  played: null,
};

export function rewardFor(kind: ExperienceKind, outcome?: number): number {
  const fixed = TABLE[kind];
  const r = fixed ?? outcome ?? 0;
  return Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : 0;
}

/*
 * Recompensa natural de un episodio: cuánto bajó la necesidad, ponderado por
 * cuánta necesidad había al empezar (comer con hambre vale más que sin ella).
 * Si fue a satisfacerla y no pudo (plato vacío), una señal ligeramente negativa.
 */
export const NATURAL_KINDS: ReadonlySet<ExperienceKind> = new Set<ExperienceKind>(['ate', 'drank', 'rested', 'played']);

/*
 * ERROR DE PREDICCIÓN para recompensas naturales: se aprende de r − r̄
 * (lo que salió mejor o peor de lo habitual), no de r. Sin esto, como
 * comer/descansar casi siempre sale bien, las vías de necesidad subían hasta
 * su máximo (medido; ver docs/learning-results.md). Las recompensas del
 * jugador NO pasan por aquí: son escasas y deliberadas.
 */
export class RewardBaseline {
  private readonly values: Record<string, number> = {};
  constructor(private readonly rate = 0.05) {}

  advantage(kind: ExperienceKind, reward: number): number {
    if (!NATURAL_KINDS.has(kind)) return reward;
    if (!Number.isFinite(reward)) return 0;
    const b = this.values[kind] ?? 0;
    this.values[kind] = b + (reward - b) * this.rate;
    return Math.max(-1, Math.min(1, reward - b));
  }

  export(): Record<string, number> {
    return { ...this.values };
  }

  import(v: unknown): void {
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === 'number' && Number.isFinite(x)) this.values[k] = x;
  }
}

export function needOutcome(before: number, after: number): number {
  const relief = before - after;
  if (relief <= 0.02) return -0.1;
  return Math.max(-1, Math.min(1, relief * 3 * (0.5 + before)));
}

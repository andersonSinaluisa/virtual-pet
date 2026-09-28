/*
 * GROWTH CONFIG — todos los números del crecimiento en un solo sitio.
 * Son valores de BALANCE iniciales (ver docs/growth-results.md), no finales.
 *
 * Nada de esto es personalidad: son tendencias de desarrollo que se aplican
 * igual a todas las mascotas de una etapa (con una pequeña variación
 * individual). Lo que hace distinta a cada una sigue siendo su cerebro.
 */
import type { Action } from '../brain/Actions';
import type { ExperienceKind } from '../memory/types';
import type { PetStat } from '../simulation/SimConfig';
import type { LifeStage } from './LifeStage';

export const DAY_MS = 86_400_000;

export interface VisualKeyframe {
  scale: number; // tamaño global
  head: number; // cabeza respecto al cuerpo
  legs: number; // longitud de patas
  ears: number;
  neck: number; // separación cabeza-cuerpo (desplazamiento vertical)
  body: number; // anchura del cuerpo
}

export interface AnimationStyle {
  stepRate: number; // pasos por distancia (más = pasitos cortos)
  bounce: number; // rebote al andar/correr
  wobble: number; // torpeza (balanceo lateral extra)
  curl: number; // cuánto se acurruca al dormir
}

export type VoiceProfile = 'baby' | 'young' | 'adult';

export interface StageConfig {
  minDurationMs: number; // edad mínima en la etapa (cronológica, reloj del mundo)
  developmentPoints: number; // desarrollo necesario para completar la etapa
  plasticity: number; // multiplicador del aprendizaje (nunca 0)
  needs: Partial<Record<PetStat, number>>; // multiplicadores de la deriva de necesidades
  speed: number; // movilidad
  // Capacidades físicas: acción → sustituto posible (o null = no puede hacerla todavía)
  blocked: Partial<Record<Action, Action | null>>;
  visual: VisualKeyframe;
  animation: AnimationStyle;
  voice: VoiceProfile;
}

export const GROWTH_CONFIG = {
  stages: {
    BABY: {
      minDurationMs: 2 * DAY_MS, developmentPoints: 30, plasticity: 1.5,
      needs: { fatigue: 1.3, hunger: 1.15, thirst: 1.1, affection: 1.2 }, speed: 0.7,
      blocked: { RUN: 'WALK', DANCE: null, FOLLOW_PLAYER: 'APPROACH' },
      visual: { scale: 0.62, head: 1.2, legs: 0.72, ears: 0.85, neck: -0.06, body: 0.92 },
      animation: { stepRate: 1.35, bounce: 1.4, wobble: 1, curl: 1 }, voice: 'baby',
    },
    CHILD: {
      minDurationMs: 5 * DAY_MS, developmentPoints: 60, plasticity: 1.25,
      needs: { fatigue: 1.1, boredom: 1.1 }, speed: 0.9,
      blocked: { DANCE: null },
      visual: { scale: 0.78, head: 1.1, legs: 0.86, ears: 0.93, neck: -0.03, body: 0.96 },
      animation: { stepRate: 1.15, bounce: 1.2, wobble: 0.5, curl: 0.6 }, voice: 'young',
    },
    YOUNG: {
      minDurationMs: 10 * DAY_MS, developmentPoints: 100, plasticity: 1.0,
      needs: {}, speed: 1.0,
      blocked: {},
      visual: { scale: 0.9, head: 1.0, legs: 1.0, ears: 1.0, neck: 0, body: 1.0 },
      animation: { stepRate: 1.0, bounce: 1.0, wobble: 0.15, curl: 0.3 }, voice: 'young',
    },
    // Etapa final de esta iteración (SENIOR reservado): no termina nunca
    ADULT: {
      minDurationMs: Number.POSITIVE_INFINITY, developmentPoints: Number.POSITIVE_INFINITY, plasticity: 0.7,
      needs: { fatigue: 0.95, boredom: 0.9 }, speed: 1.0,
      blocked: {},
      visual: { scale: 1.0, head: 0.92, legs: 1.08, ears: 1.05, neck: 0.02, body: 1.04 },
      animation: { stepRate: 0.85, bounce: 0.8, wobble: 0, curl: 0.1 }, voice: 'adult',
    },
  } satisfies Record<LifeStage, StageConfig>,

  // Desarrollo por experiencias SIGNIFICATIVAS (puntos base, antes del rendimiento decreciente)
  experiencePoints: {
    played: 1, investigated: 0.8, picked_up: 0.5, greeted: 0.5, approached: 0.3, followed: 0.4, petted: 0.4,
    called_responded: 1, fetch_chased: 0.6, fetch_returned: 1.2, mystery_opened: 1.5, choice_made: 0.5, game_played: 0.8,
    player_rewarded: 0.3, rested: 0.3, ate: 0.2, drank: 0.1, danced: 0.5, scared: 0.3, hid: 0.1, slept: 0.2,
  } satisfies Partial<Record<ExperienceKind, number>>,
  discoveryPoints: 2, // descubrimiento (incluye hábitos y asociaciones aprendidas)
  momentPoints: 1.5, // primera vez / recuerdo clave
  explorePoints: 0.5, // episodio de exploración

  // Rendimiento decreciente: gain = base / (1 + repeticiones / k); las repeticiones decaen por día
  repeatK: 2,
  repeatDailyDecay: 0.5,
  dailyCap: 12, // puntos por día de mundo (vivir juntos, no maratones)

  // Ausencias: el desarrollo sigue, más despacio y con tope; nunca cambia de etapa solo
  offlineMultiplier: 0.35,
  offlineMaxFractionPerAbsence: 0.5, // de lo que pide la etapa

  // Variación individual (reproducible por id): 1 ± este valor
  individualVariation: 0.08,

  // Cuántos ticks entre evaluaciones de la transición
  evaluateEveryTicks: 30,
  // Visual continuo: dentro de la etapa solo se avanza esta fracción hacia la siguiente
  visualWithinStage: 0.6,
} as const;

export type GrowthConfig = typeof GROWTH_CONFIG;

export const stageConfig = (s: LifeStage): StageConfig => GROWTH_CONFIG.stages[s];

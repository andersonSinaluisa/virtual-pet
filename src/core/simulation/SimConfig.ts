/*
 * CONFIGURACIÓN DEL MUNDO Y LA SIMULACIÓN
 * ---------------------------------------
 * Física del mundo: cómo cambian las necesidades con el tiempo, velocidades
 * de movimiento y efectos de ejecutar cada acción. Nada de esto decide
 * QUÉ hace la mascota; eso está en BrainConfig (los pesos de la red).
 *
 * Valores idénticos al prototipo web salvo los marcados "móvil".
 */
import { defaultRng, type Rng } from '../random';

export const PET_STATS = ['hunger', 'thirst', 'fatigue', 'boredom', 'affection', 'energy', 'fear', 'curiosity'] as const;
export type PetStat = (typeof PET_STATS)[number];
export type PetStats = Record<PetStat, number>;

export interface SimConfig {
  rng: Rng;
  simulation: {
    baseTicksPerSecond: number;
    speeds: number[];
    timelineSize: number;
  };
  pet: {
    initial: PetStats;
    drift: Partial<PetStats>;
    fearDecay: number;
    curiosityDecay: number;
    darknessFear: number;
    soundFear: number;
    noveltyCuriosity: number;
    boredomCuriosity: number;
    touchAffection: number;
    moveEnergyCost: number;
    moveFatigueCost: number;
  };
  movement: {
    baseSpeed: number;
    runMultiplier: number;
    restMultiplier: number;
  };
  world: {
    initialFood: number;
    maxFood: number;
    initialWater: number;
    playerSpeed: number;
    touchTicks: number;
    touchRange: number;
    soundDecay: number;
    noveltyDecay: number;
    maxNovelObjects: number;
    nearRange: number;
    callDecay: number; // móvil: la llamada del jugador se apaga (evento transitorio)
    throwFriction: number; // móvil: frenado por tick de un objeto lanzado
    maxThrowSpeed: number; // móvil: unidades de mundo por tick
    treatAmount: number; // móvil: "galletita" (una fuente de comida pequeña)
    playerHome: { x: number; y: number }; // móvil: el jugador "está" delante de la pantalla
  };
  offline: {
    maxTicks: number; // ticks reales de SNN como máximo al volver del background
    maxTimeScale: number; // compresión máxima de la deriva por tick
    chunk: number; // ticks por bloque asíncrono
  };
}

export function createSimConfig(overrides: { rng?: Rng } = {}): SimConfig {
  return {
    rng: overrides.rng ?? defaultRng,
    simulation: {
      baseTicksPerSecond: 3,
      speeds: [0.25, 0.5, 1, 2, 4],
      timelineSize: 60,
    },
    pet: {
      initial: { hunger: 0.35, thirst: 0.3, fatigue: 0.2, boredom: 0.4, affection: 0.6, energy: 0.75, fear: 0.0, curiosity: 0.3 },
      // Cambio por tick sin que ocurra nada.
      drift: {
        hunger: 0.002, thirst: 0.0025, fatigue: 0.0012, boredom: 0.002,
        affection: -0.0012, energy: 0.001, // la energía se recupera sola si no gasta
      },
      fearDecay: 0.95,
      curiosityDecay: 0.99,
      darknessFear: 0.004,
      soundFear: 0.3,
      noveltyCuriosity: 0.06,
      boredomCuriosity: 0.002, // un animal aburrido se vuelve curioso (dinámica del mundo, no decisión)
      touchAffection: 0.03,
      moveEnergyCost: 0.35,
      moveFatigueCost: 0.12,
    },
    movement: {
      baseSpeed: 0.03,
      runMultiplier: 2.3,
      restMultiplier: 0.2,
    },
    world: {
      initialFood: 2,
      maxFood: 5,
      initialWater: 1,
      playerSpeed: 0.06,
      touchTicks: 8,
      touchRange: 0.14,
      soundDecay: 0.8,
      noveltyDecay: 0.94,
      maxNovelObjects: 4,
      nearRange: 0.6,
      callDecay: 0.8, // mismo decaimiento que un ruido fuerte (soundDecay)
      throwFriction: 0.8,
      maxThrowSpeed: 0.12,
      treatAmount: 0.3,
      playerHome: { x: 0.5, y: 0.98 },
    },
    offline: {
      maxTicks: 900,
      maxTimeScale: 20,
      chunk: 150,
    },
  };
}

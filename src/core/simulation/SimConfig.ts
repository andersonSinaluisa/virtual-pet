/*
 * CONFIGURACIÓN DEL MUNDO Y LA SIMULACIÓN
 * ---------------------------------------
 * Física del mundo: cómo cambian las necesidades con el tiempo, velocidades
 * de movimiento y efectos de ejecutar cada acción. Nada de esto decide
 * QUÉ hace la mascota; eso está en BrainConfig (los pesos de la red).
 *
 * Valores idénticos al prototipo web salvo los marcados "móvil".
 */
import { defaultRng, seededRng, type Rng } from '../random';
import { DEFAULT_DIRECTOR, type DirectorConfig } from '../world/AmbientEventDirector';
import { DEFAULT_PERCEPTION, type PerceptionConfig } from '../world/Perception';

export const PET_STATS = ['hunger', 'thirst', 'fatigue', 'boredom', 'affection', 'energy', 'fear', 'curiosity'] as const;
export type PetStat = (typeof PET_STATS)[number];
export type PetStats = Record<PetStat, number>;

export interface SimConfig {
  rng: Rng;
  // v7: rng propio de los microeventos (no gasta el de la simulación; reproducible con semilla)
  ambientRng: Rng;
  perception: PerceptionConfig; // FOV, oído, sentido cercano
  ambient: DirectorConfig; // microeventos (AmbientEventDirector)
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
    turnRate: number; // v7: radianes por tick que puede girar (orientación → campo de visión)
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
    attentionGain: number; // v4: cuánto sesga la atención neuronal la elección del foco
    attentionCap: number;
    attentionDecay: number; // decaimiento por tick de la actividad de atención
  };
  offline: {
    maxTicks: number; // ticks reales de SNN como máximo al volver del background
    maxTimeScale: number; // compresión máxima de la deriva por tick
    chunk: number; // ticks por bloque asíncrono
  };
}

/*
 * Perfiles de fisiología. Los efectos van POR TICK neural:
 *   app  la app en tiempo real (3 ticks/s): necesidades rápidas para que haya algo que ver
 *   day  simulación a escala de días (1 tick = 1 minuto de mundo): hambre, sed, aburrimiento y
 *        cariño cambian a un ritmo compatible con un día de 1440 ticks (si no, el hambre despierta
 *        a la mascota cada hora de la noche). El cansancio es igual en ambos perfiles.
 */
export type PhysiologyProfile = 'app' | 'day';
export const DAY_SCALE_NEEDS = 0.35;
// Perfil 'day' en valores absolutos (medido en docs/routine-results.md): no cambia si se reequilibra la app
const DAY_NEEDS: Partial<Record<PetStat, number>> = {
  hunger: 0.002 * DAY_SCALE_NEEDS, thirst: 0.0025 * DAY_SCALE_NEEDS, boredom: 0.002 * DAY_SCALE_NEEDS, affection: -0.0012 * DAY_SCALE_NEEDS,
};

export interface BodyModifiers {
  needs: Partial<Record<PetStat, number>>; // × deriva (etapa de vida)
  speed: number; // × velocidad base
}

const NO_BODY_MODIFIERS: BodyModifiers = { needs: {}, speed: 1 };

// Recalcula el cuerpo desde la base: perfil de fisiología × moduladores de etapa (nunca acumula)
export function applyPhysiology(cfg: SimConfig, profile: PhysiologyProfile, body: BodyModifiers = NO_BODY_MODIFIERS): void {
  const base = createSimConfig();
  for (const s of PET_STATS) {
    const b = base.pet.drift[s];
    if (b === undefined) continue;
    const scaled = profile === 'day' ? (DAY_NEEDS[s] ?? b) : b;
    cfg.pet.drift[s] = scaled * (body.needs[s] ?? 1);
  }
  cfg.movement.baseSpeed = base.movement.baseSpeed * body.speed;
}

export function createSimConfig(overrides: { rng?: Rng; ambientRng?: Rng } = {}): SimConfig {
  return {
    rng: overrides.rng ?? defaultRng,
    ambientRng: overrides.ambientRng ?? seededRng(20260929),
    perception: { ...DEFAULT_PERCEPTION },
    ambient: { ...DEFAULT_DIRECTOR },
    simulation: {
      baseTicksPerSecond: 3,
      speeds: [0.25, 0.5, 1, 2, 4],
      timelineSize: 60,
    },
    pet: {
      initial: { hunger: 0.35, thirst: 0.3, fatigue: 0.2, boredom: 0.4, affection: 0.6, energy: 0.75, fear: 0.0, curiosity: 0.3 },
      // Cambio por tick sin que ocurra nada.
      drift: {
        // v5: fatigue 0.0012 → 0.0008 (ver ActionSystem.SLEEP y docs/routine-results.md)
        // v8: sed 0.0025 → 0.0008 (a 3 ticks/s se llenaba en ~2 min y buscaba agua todo el rato)
        hunger: 0.002, thirst: 0.0008, fatigue: 0.0008, boredom: 0.002,
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
      turnRate: 0.9,
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
      callDecay: 0.9, // una llamada ("¡Milo, Milo!") dura más que un ruido puntual
      throwFriction: 0.8,
      maxThrowSpeed: 0.12,
      treatAmount: 0.3,
      playerHome: { x: 0.5, y: 0.98 },
      attentionGain: 0.2,
      attentionCap: 4,
      attentionDecay: 0.85,
    },
    offline: {
      maxTicks: 900,
      maxTimeScale: 20,
      chunk: 150,
    },
  };
}

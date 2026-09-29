/*
 * PERFILES DE VOCALIZACIÓN POR ESPECIE
 * ------------------------------------
 * Una intención (qué QUIERE expresar la mascota) se convierte en sonido según
 * la especie. Cada intención tiene un VocalizationSet:
 *
 *   probability   probabilidad de vocalizar cuando surge la intención
 *                 (el resto es SILENCIO: una respuesta válida)
 *   cooldownMs    tiempo mínimo entre dos vocalizaciones de la misma intención
 *   gain          volumen [mín, máx] según la intensidad (0..1)
 *
 * Además, cada especie tiene CAPAS continuas (bucles con fundido):
 *   gato   ronroneo al acariciar (entra poco a poco, sale con fundido)
 *   perro  jadeo suave al acariciar / tras jugar o correr
 *   conejo ronroneo dental casi inaudible (o nada)
 *   todas  respiración/ronquido al dormir
 *
 * Los números están ajustados con la simulación de 30 min (docs/pet-audio-results.md):
 * un conejo casi no suena; un gato no maúlla cada vez que lo miras; un perro no ladra en bucle.
 */
import type { AudioSpecies, VocalizationIntent } from './types';

export interface VocalizationSet {
  probability: number;
  cooldownMs: number;
  gain: [number, number];
}

export type LayerId = 'purr' | 'pant' | 'teethPurr' | 'sleep';

export interface LayerSpec {
  intent: VocalizationIntent; // qué assets de capa usa
  fadeInMs: number;
  fadeOutMs: number;
  maxGain: number;
  rampMs: number; // cuánto tarda en llegar a su nivel pleno mientras dura la causa (ronroneo gradual)
  holdMs: number; // cuánto sigue tras acabar la causa antes de empezar a apagarse
}

export interface SpeciesVocalizationProfile {
  species: Exclude<AudioSpecies, 'foley'>;
  globalCooldownMs: number; // entre dos one-shots cualesquiera
  maxPerMinute: number; // techo anti-molestia (ventana deslizante)
  sets: Partial<Record<VocalizationIntent, VocalizationSet>>;
  layers: Partial<Record<LayerId, LayerSpec>>;
  pettingLayer: LayerId | null; // qué capa despierta una caricia
  pettingLayerChance: number; // conejo: no siempre
}

const s = (probability: number, cooldownMs: number, gain: [number, number] = [0.55, 0.9]): VocalizationSet => ({ probability, cooldownMs, gain });

const SLEEP: LayerSpec = { intent: 'SLEEPING', fadeInMs: 4000, fadeOutMs: 2500, maxGain: 0.55, rampMs: 6000, holdMs: 0 };

export const SPECIES_PROFILES: Readonly<Record<SpeciesVocalizationProfile['species'], SpeciesVocalizationProfile>> = {
  dog: {
    species: 'dog', globalCooldownMs: 2000, maxPerMinute: 6,
    sets: {
      GREETING: s(0.85, 25000, [0.55, 0.95]),
      EXCITED: s(0.8, 5000, [0.65, 1]),
      HAPPY: s(0.45, 7000, [0.4, 0.7]),
      AFFECTION: s(0.4, 12000, [0.3, 0.55]), // un "yip" suave; el resto lo dice el jadeo
      ATTENTION: s(0.7, 30000, [0.5, 0.85]),
      PLAYFUL: s(0.55, 4500, [0.5, 0.85]),
      CURIOUS: s(0.45, 20000, [0.45, 0.75]), // olfateo
      RELAXED: s(0.5, 60000, [0.35, 0.6]), // suspiro
      SLEEPY: s(0.5, 180000, [0.3, 0.55]),
      SCARED: s(0.6, 12000, [0.25, 0.5]), // gemido bajito, nunca un aullido
      UNCOMFORTABLE: s(0.5, 15000, [0.25, 0.45]),
      ALERT: s(0.35, 15000, [0.45, 0.7]), // un ladrido corto, no una ráfaga
    },
    layers: {
      pant: { intent: 'AFFECTION', fadeInMs: 900, fadeOutMs: 1800, maxGain: 0.5, rampMs: 1500, holdMs: 3000 },
      sleep: SLEEP,
    },
    pettingLayer: 'pant', pettingLayerChance: 1,
  },
  cat: {
    species: 'cat', globalCooldownMs: 2500, maxPerMinute: 5,
    sets: {
      GREETING: s(0.6, 25000, [0.45, 0.85]),
      EXCITED: s(0.5, 8000, [0.5, 0.8]),
      HAPPY: s(0.35, 10000, [0.4, 0.7]),
      AFFECTION: s(0.25, 20000, [0.3, 0.55]), // a veces un trino; lo principal es el ronroneo
      ATTENTION: s(0.7, 40000, [0.5, 0.85]),
      PLAYFUL: s(0.35, 8000, [0.4, 0.7]),
      CURIOUS: s(0.4, 25000, [0.35, 0.6]),
      RELAXED: s(0, 60000, [0.3, 0.5]), // relajado = ronroneo bajo (capa), sin one-shot
      SLEEPY: s(0.5, 240000, [0.35, 0.6]), // bostezo (uno de vez en cuando)
      SCARED: s(0.35, 20000, [0.2, 0.4]), // bufido suave, volumen bajo
      UNCOMFORTABLE: s(0.2, 20000, [0.25, 0.4]),
      ALERT: s(0.25, 15000, [0.35, 0.55]), // gorjeo corto
    },
    layers: {
      purr: { intent: 'AFFECTION', fadeInMs: 2500, fadeOutMs: 3500, maxGain: 0.75, rampMs: 4000, holdMs: 2500 },
      sleep: SLEEP,
    },
    pettingLayer: 'purr', pettingLayerChance: 1,
  },
  bear: {
    species: 'bear', globalCooldownMs: 3000, maxPerMinute: 4,
    sets: {
      GREETING: s(0.6, 25000, [0.5, 0.85]),
      EXCITED: s(0.55, 8000, [0.5, 0.8]),
      HAPPY: s(0.4, 12000, [0.4, 0.7]),
      AFFECTION: s(0.8, 12000, [0.4, 0.7]), // gruñidito amistoso al acariciar
      ATTENTION: s(0.5, 35000, [0.45, 0.75]),
      PLAYFUL: s(0.4, 10000, [0.45, 0.75]),
      CURIOUS: s(0.4, 25000, [0.4, 0.7]),
      RELAXED: s(0.35, 60000, [0.3, 0.5]),
      SLEEPY: s(0.3, 180000, [0.3, 0.5]),
      SCARED: s(0.4, 15000, [0.25, 0.45]),
      UNCOMFORTABLE: s(0.35, 20000, [0.25, 0.4]),
      ALERT: s(0.2, 20000, [0.35, 0.55]),
    },
    layers: { sleep: { ...SLEEP, maxGain: 0.5 } },
    pettingLayer: null, pettingLayerChance: 0,
  },
  rabbit: {
    // Realista: los conejos casi no vocalizan. Silencio frecuente, sonidos muy bajos.
    species: 'rabbit', globalCooldownMs: 6000, maxPerMinute: 3,
    sets: {
      GREETING: s(0.2, 20000, [0.3, 0.5]), // un resoplido
      EXCITED: s(0.35, 12000, [0.35, 0.55]), // "honk" al estar contento
      HAPPY: s(0.25, 15000, [0.3, 0.5]),
      PLAYFUL: s(0.3, 20000, [0.3, 0.5]),
      CURIOUS: s(0.3, 30000, [0.25, 0.45]), // olfateo / estornudo
      SCARED: s(0.45, 15000, [0.35, 0.6]), // golpe de pata (thump), no un chillido
      ALERT: s(0.4, 15000, [0.35, 0.6]),
    },
    layers: {
      teethPurr: { intent: 'AFFECTION', fadeInMs: 2000, fadeOutMs: 2500, maxGain: 0.35, rampMs: 3500, holdMs: 1500 },
      sleep: { ...SLEEP, maxGain: 0 }, // un conejo dormido no se oye
    },
    pettingLayer: 'teethPurr', pettingLayerChance: 0.6,
  },
};

// Cuando dos intenciones surgen a la vez gana la más urgente
export const INTENT_PRIORITY: Readonly<Record<VocalizationIntent, number>> = {
  SCARED: 12, ALERT: 11, GREETING: 10, ATTENTION: 9, EXCITED: 8, PLAYFUL: 7, AFFECTION: 6, HAPPY: 5,
  CURIOUS: 4, UNCOMFORTABLE: 3, RELAXED: 2, SLEEPY: 1, SLEEPING: 0,
};

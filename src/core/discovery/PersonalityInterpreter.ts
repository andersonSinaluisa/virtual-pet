/*
 * PERSONALITY INTERPRETER — interpreta, NO controla.
 *
 *   SNN (pesos actuales vs. iniciales) + historial de conducta
 *                     ↓
 *          etiquetas para el jugador ("Curioso", "Le encanta la pelota")
 *
 * Nada de lo que devuelve se consulta para decidir acciones: las decisiones
 * siguen siendo Sensors → SNN → Spikes → Actions. Como los rasgos comparan el
 * genoma actual con el base, lo APRENDIDO ya se refleja en ellos.
 */
import { OBJECT_CHANNELS, type BrainConfig } from '../brain/BrainConfig';
import type { LearningEvidence } from './DiscoveryEvaluator';
import type { PetMemory } from '../memory/PetMemory';
import { computeTraits, type TraitReading } from './Personality';

export function interpretPersonality(config: BrainConfig, memory: PetMemory): TraitReading[] {
  return computeTraits(config, memory.stats);
}

export interface ObjectPreference {
  kind: (typeof OBJECT_CHANNELS)[number]['kind'];
  brain: number; // Σ cambio aprendido en la vía del objeto
  history: number; // puntuación de preferencia del historial (−1..1)
  interactions: number;
  score: number; // combinación para ordenar en la UI
}

export function interpretObjectPreferences(memory: PetMemory, learning: LearningEvidence): ObjectPreference[] {
  return OBJECT_CHANNELS.map((ch) => {
    const brain = learning.pathwayDelta(ch.sensor) + learning.pathwayDelta(ch.attention);
    const pref = memory.preference(ch.kind);
    const history = pref?.score ?? 0;
    const interactions = memory.stats.objectStats[ch.kind]?.interactions ?? 0;
    return { kind: ch.kind, brain, history, interactions, score: 0.5 * Math.tanh(brain * 2) + 0.5 * history };
  }).sort((a, b) => b.score - a.score);
}

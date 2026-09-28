/*
 * PERSONALIDAD EMERGENTE
 * ----------------------
 * NO hay un campo `personality = "curious"`. Cada rasgo se CALCULA a partir de:
 *
 *   genoma     cuánto se desvían sus pesos del genoma base (presets, futura plasticidad)
 *   conducta   con qué frecuencia la red eligió realmente esas acciones
 *   evidencia  cuántas veces se observó (sin evidencia, el rasgo no se revela)
 *
 * Las etiquetas ("Muy sociable") son presentación de esos números.
 */
import type { Action } from '../brain/Actions';
import { ACTION_LIST } from '../brain/Actions';
import {
  baseBrainConfig, getCircuitWeight, getSensorWeight,
  type BrainConfig, type CircuitKey, type SensorKey,
} from '../brain/BrainConfig';
import type { BehaviorStats } from '../memory/types';

export const TRAIT_KEYS = ['sociable', 'curious', 'playful', 'calm', 'soundSensitive', 'attached', 'nocturnal'] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];

type GeneRef =
  | { layer: 'sensorToCircuit'; from: SensorKey; to: CircuitKey; sign?: 1 | -1 }
  | { layer: 'circuitToAction'; from: CircuitKey; to: Action; sign?: 1 | -1 };

interface TraitDef {
  key: TraitKey;
  label: string;
  description: string;
  icon: string;
  accent: 'primary' | 'secondary' | 'tertiary' | 'rose' | 'sky' | 'butter';
  genes: GeneRef[];
  actions: Action[];
  evidence: number; // observaciones necesarias para revelarlo
  behavior?: (s: BehaviorStats) => { score: number; evidence: number };
}

const TRAITS: readonly TraitDef[] = [
  {
    key: 'sociable', label: 'Muy sociable', icon: 'heartHand', accent: 'rose',
    description: 'Busca tu compañía: se acerca, te saluda y sonríe cuando estás cerca.',
    genes: [
      { layer: 'sensorToCircuit', from: 'playerNear', to: 'socialCircuit' },
      { layer: 'circuitToAction', from: 'socialCircuit', to: 'APPROACH' },
      { layer: 'circuitToAction', from: 'socialCircuit', to: 'GREET' },
    ],
    actions: ['APPROACH', 'GREET', 'SMILE'], evidence: 12,
  },
  {
    key: 'curious', label: 'Gran curiosidad', icon: 'searchInsights', accent: 'secondary',
    description: 'Observa con paciencia los objetos desconocidos antes de tocarlos.',
    genes: [
      { layer: 'sensorToCircuit', from: 'curiosity', to: 'curiosityCircuit' },
      { layer: 'sensorToCircuit', from: 'newObjectDetected', to: 'curiosityCircuit' },
      { layer: 'circuitToAction', from: 'curiosityCircuit', to: 'INVESTIGATE' },
    ],
    actions: ['INVESTIGATE', 'LOOK_AT_OBJECT', 'EXPLORE', 'PICK_UP_OBJECT'], evidence: 12,
  },
  {
    key: 'playful', label: 'Activo y juguetón', icon: 'bolt', accent: 'primary',
    description: 'Prefiere corretear y jugar antes que quedarse quieto.',
    genes: [
      { layer: 'sensorToCircuit', from: 'boredom', to: 'playCircuit' },
      { layer: 'sensorToCircuit', from: 'toyAvailable', to: 'playCircuit' },
      { layer: 'circuitToAction', from: 'playCircuit', to: 'PLAY' },
    ],
    actions: ['PLAY', 'DANCE', 'RUN'], evidence: 10,
  },
  {
    key: 'calm', label: 'Tranquilo', icon: 'spa', accent: 'sky',
    description: 'Disfruta de las siestas y los ratos de calma.',
    genes: [
      { layer: 'sensorToCircuit', from: 'fatigue', to: 'restCircuit' },
      { layer: 'circuitToAction', from: 'restCircuit', to: 'REST' },
      { layer: 'circuitToAction', from: 'restCircuit', to: 'SLEEP' },
    ],
    actions: ['REST', 'SLEEP'], evidence: 10,
  },
  {
    key: 'soundSensitive', label: 'Sensible a los sonidos', icon: 'waterDrop', accent: 'sky',
    description: 'Los ruidos fuertes lo sobresaltan y busca refugio.',
    genes: [
      { layer: 'sensorToCircuit', from: 'loudSound', to: 'fearCircuit' },
      { layer: 'circuitToAction', from: 'fearCircuit', to: 'HIDE' },
    ],
    actions: ['GET_SCARED', 'HIDE', 'MOVE_AWAY'], evidence: 4,
    behavior: (s) => {
      const n = s.scaredBy.loudSound ?? 0;
      return { score: Math.min(1, 0.3 + n * 0.15), evidence: n };
    },
  },
  {
    key: 'attached', label: 'Apegado', icon: 'paw', accent: 'butter',
    description: 'Te sigue por la habitación y te pide atención.',
    genes: [
      { layer: 'sensorToCircuit', from: 'playerMoving', to: 'followCircuit' },
      { layer: 'sensorToCircuit', from: 'affectionNeed', to: 'lonelinessCircuit' },
      { layer: 'circuitToAction', from: 'followCircuit', to: 'FOLLOW_PLAYER' },
    ],
    actions: ['FOLLOW_PLAYER', 'ASK_ATTENTION'], evidence: 8,
  },
  {
    key: 'nocturnal', label: 'Noctámbulo tierno', icon: 'moon', accent: 'tertiary',
    description: 'Con las luces apagadas sigue despierto, curioseando en silencio.',
    genes: [
      { layer: 'sensorToCircuit', from: 'darkness', to: 'activityCircuit' },
      { layer: 'sensorToCircuit', from: 'darkness', to: 'restCircuit', sign: -1 },
    ],
    actions: [], evidence: 30,
    behavior: (s) => ({ score: s.darkTicks ? s.darkActiveTicks / s.darkTicks : 0, evidence: s.darkTicks }),
  },
];

export interface TraitReading {
  key: TraitKey;
  label: string;
  description: string;
  icon: string;
  accent: TraitDef['accent'];
  genome: number; // 0..1 (0.5 = genoma base)
  behavior: number; // 0..1
  score: number; // 0..1
  evidence: number;
  required: number;
  revealed: boolean;
}

function gene(cfg: BrainConfig | Readonly<BrainConfig>, g: GeneRef): number {
  return g.layer === 'sensorToCircuit' ? getSensorWeight(cfg, g.from, g.to) : getCircuitWeight(cfg, g.from, g.to);
}

export function computeTraits(config: BrainConfig, stats: BehaviorStats): TraitReading[] {
  const base = baseBrainConfig();
  const onsets = stats.actionOnsets;
  const totalOnsets = ACTION_LIST.reduce((n, a) => n + (onsets[a] ?? 0), 0);

  return TRAITS.map((t) => {
    const delta = t.genes.reduce((acc, g) => acc + (g.sign ?? 1) * (gene(config, g) - gene(base, g)), 0);
    const genome = Math.max(0, Math.min(1, 0.5 + delta));

    let behavior = 0, evidence = 0;
    if (t.behavior) {
      ({ score: behavior, evidence } = t.behavior(stats));
    } else {
      evidence = t.actions.reduce((n, a) => n + (onsets[a] ?? 0), 0);
      const share = totalOnsets ? evidence / totalOnsets : 0;
      const expected = t.actions.length / ACTION_LIST.length;
      behavior = Math.max(0, Math.min(1, 0.5 * (share / expected)));
    }
    const score = 0.4 * genome + 0.6 * behavior;
    return {
      key: t.key, label: t.label, description: t.description, icon: t.icon, accent: t.accent,
      genome, behavior, score, evidence, required: t.evidence,
      revealed: evidence >= t.evidence && score >= 0.5,
    };
  });
}

// Resumen corto para la UI: "Contento y curioso" usa el estado; esto usa rasgos revelados
export function dominantTraits(traits: readonly TraitReading[], n = 2): TraitReading[] {
  return traits.filter((t) => t.revealed).sort((a, b) => b.score - a.score).slice(0, n);
}

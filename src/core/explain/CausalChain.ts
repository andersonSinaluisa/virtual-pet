/*
 * CADENA CAUSAL REAL
 * ------------------
 * Reconstruye, a partir del SpikeTrace, por qué disparó una neurona de acción:
 *
 *   tick t    acción A disparó ← corriente de circuitos que dispararon en t−1
 *   tick t−1  circuito C disparó ← corriente de sensores que dispararon en t−2
 *   tick t−2  sensor S disparó  ← corriente externa (gain × percepción)
 *
 * Todo sale de `lastArrivals` / `lastExternal` de la red. Si la traza no
 * alcanza, la cadena queda incompleta (no se rellena con datos inventados).
 */
import { ACTION_INFO, type Action } from '../brain/Actions';
import type { Brain } from '../brain/Brain';
import type { CircuitKey, SensorKey } from '../brain/BrainConfig';
import type { NeuronId } from '../neural/Neuron';
import type { SpikeTrace } from '../simulation/SpikeTrace';

export interface ChainLink {
  neuron: NeuronId;
  key: string;
  label: string;
  weight: number; // peso de la sinapsis hacia el siguiente eslabón
  effective: number; // lo que aportó al disparo (Σ peso·λ^k desde el último reset)
  ticksAgo: number; // la aportación más reciente llegó hace k ticks
  tick: number; // tick en que disparó este eslabón (la corriente llega en tick+1)
}

export interface CausalChain {
  action: Action;
  actionNeuron: NeuronId;
  tick: number;
  circuits: ChainLink[]; // circuitos excitatorios que llegaron a la acción
  sensors: ChainLink[]; // sensores que excitaron al circuito principal
  inhibitors: ChainLink[]; // entradas negativas que recibió la acción
  complete: boolean;
}

export function explainAction(brain: Brain, trace: SpikeTrace, action?: Action, maxLookback = 40): CausalChain | null {
  const entries = trace.all();
  for (let i = entries.length - 1; i >= 0 && entries.length - i <= maxLookback; i--) {
    const e = entries[i];
    const outputs = e.spiked.filter((id) => brain.outputNeuronToAction[id] && (!action || brain.outputNeuronToAction[id] === action));
    if (!outputs.length) continue;
    const leak = brain.config.neuron.leak;
    // Suma temporal: todo lo que integró la neurona desde su último reset, con la fuga aplicada
    const grouped = (id: NeuronId, tick: number): ChainLink[] => {
      const byFrom = new Map<NeuronId, ChainLink>();
      for (const c of trace.contributions(id, tick, leak)) {
        const d = brain.describe(c.from);
        const prev = byFrom.get(c.from);
        if (prev) { prev.effective += c.effective; prev.ticksAgo = Math.min(prev.ticksAgo, c.ticksAgo); }
        else byFrom.set(c.from, { neuron: c.from, key: d.key, label: d.label, weight: c.weight, effective: c.effective, ticksAgo: c.ticksAgo, tick: tick - c.ticksAgo - 1 });
      }
      return [...byFrom.values()];
    };
    const strength = (id: NeuronId) => grouped(id, e.tick).reduce((s, l) => s + Math.max(0, l.effective), 0);
    // La acción con más corriente excitatoria acumulada (la decisión más "fuerte" del tick)
    const actionNeuron = outputs.sort((a, b) => strength(b) - strength(a))[0];
    const act = brain.outputNeuronToAction[actionNeuron];

    const inputs = grouped(actionNeuron, e.tick);
    const circuits = inputs.filter((l) => l.effective > 0).sort((a, b) => b.effective - a.effective);
    const inhibitors = inputs.filter((l) => l.effective < 0).sort((a, b) => a.effective - b.effective);

    // El circuito principal disparó el tick en que su spike salió hacia la acción
    const main = circuits[0];
    const sensors = main ? grouped(main.neuron, main.tick).filter((l) => l.effective > 0).sort((a, b) => b.effective - a.effective) : [];
    return { action: act, actionNeuron, tick: e.tick, circuits, sensors, inhibitors, complete: !!main && sensors.length > 0 };
  }
  return null;
}

// ---- Presentación para el modo SIMPLE (etiquetas amables, mismos datos) ----

const SENSOR_PHRASE: Record<SensorKey, string> = {
  hunger: 'Sintió hambre', thirst: 'Sintió sed', fatigue: 'Notó cansancio', boredom: 'Se aburría',
  affectionNeed: 'Echaba de menos cariño', energy: 'Tenía energía', fear: 'Sentía miedo', curiosity: 'Sentía curiosidad',
  playerNear: 'Te vio cerca', playerTouching: 'Sintió tu caricia', playerMoving: 'Te vio moverte', foodAvailable: 'Vio comida',
  waterAvailable: 'Vio agua', bedAvailable: 'Vio su camita', toyAvailable: 'Vio un juguete', interestingObjectVisible: 'Vio algo interesante',
  hidingPlaceAvailable: 'Vio un escondite', darkness: 'Notó la oscuridad', loudSound: 'Oyó un ruido fuerte',
  newObjectDetected: 'Algo nuevo apareció', playerCalling: 'Oyó que lo llamabas',
};

const CIRCUIT_EMOTION: Record<CircuitKey, string> = {
  feedingCircuit: 'Apetito', drinkingCircuit: 'Sed', restCircuit: 'Ganas de descansar', activityCircuit: 'Ganas de moverse',
  playCircuit: 'Ganas de jugar', socialCircuit: 'Ganas de compañía', lonelinessCircuit: 'Soledad', followCircuit: 'Ganas de seguirte',
  joyCircuit: 'Alegría', distressCircuit: 'Malestar', curiosityCircuit: 'Curiosidad', fearCircuit: 'Miedo',
};

export function sensorPhrase(key: string): string {
  return SENSOR_PHRASE[key as SensorKey] ?? key;
}

export function circuitEmotion(key: string): string {
  return CIRCUIT_EMOTION[key as CircuitKey] ?? key;
}

export function actionPhrase(a: Action): string {
  const p = ACTION_INFO[a].phrase;
  return p[0].toUpperCase() + p.slice(1);
}

/*
 * DECISION TRACE: "¿Por qué hizo eso?"
 * ------------------------------------
 * Al EMPEZAR una acción relevante se guarda una instantánea explicable de la
 * decisión, sacada de la traza real de spikes: sensores que la iniciaron,
 * circuitos activados, neurona de acción, y las sinapsis de esa vía con su
 * peso inicial y actual (lo que la experiencia cambió). Se guardan solo las
 * últimas N (no se persisten: son para explicar lo reciente).
 */
import { clockInfo } from '../time/WorldClock';
import type { Action } from '../brain/Actions';
import type { Brain } from '../brain/Brain';
import type { Perception } from '../simulation/World';
import type { SpikeTrace } from '../simulation/SpikeTrace';
import type { SubjectKey } from '../memory/types';
import { explainAction, type CausalChain } from './CausalChain';

export interface PathwaySynapse {
  key: string; // "seesBall→ballAttention"
  from: number;
  to: number;
  initial: number;
  current: number;
  plastic: boolean;
}

export interface DecisionTrace {
  id: string;
  tick: number;
  at: number;
  action: Action;
  subject: SubjectKey | null; // objeto al que atendía o que llevaba
  sensors: { key: string; label: string; value: number }[];
  chain: CausalChain;
  pathway: PathwaySynapse[];
  learnedDelta: number; // Σ (actual − inicial) en la vía de esta decisión
  context: { minuteOfDay: number; darkness: number }; // v5: lo que percibía en ese momento
}

export const EXPLAINED_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  'PLAY', 'INVESTIGATE', 'PICK_UP_OBJECT', 'LOOK_AT_OBJECT', 'APPROACH', 'FOLLOW_PLAYER', 'GREET',
  'EAT', 'DRINK', 'SLEEP', 'GET_SCARED', 'HIDE', 'DANCE', 'ASK_ATTENTION',
]);

let counter = 0;

export function buildDecisionTrace(
  brain: Brain, trace: SpikeTrace, action: Action, perception: Perception, subject: SubjectKey | null, at: number,
): DecisionTrace | null {
  const chain = explainAction(brain, trace, action, 4);
  if (!chain) return null;
  const net = brain.network;
  const pathway: PathwaySynapse[] = [];
  const main = chain.circuits[0];
  const link = (fromId: number, toId: number) => {
    const s = net.findSynapse(fromId, toId);
    if (!s) return;
    pathway.push({
      key: `${brain.describe(fromId).key}→${brain.describe(toId).key}`, from: fromId, to: toId,
      initial: s.initialWeight, current: s.weight, plastic: s.plastic,
    });
  };
  if (main) {
    for (const sensor of chain.sensors.slice(0, 3)) link(sensor.neuron, main.neuron);
    for (const c of chain.circuits.slice(0, 3)) link(c.neuron, chain.actionNeuron);
  }
  const sensors = chain.sensors.slice(0, 3).map((s) => ({ key: s.key, label: s.label, value: perception[s.key as keyof Perception] ?? 0 }));
  counter = (counter + 1) % 1e6;
  return {
    id: `dec_${at.toString(36)}_${counter}`, tick: chain.tick, at, action, subject, sensors, chain, pathway,
    learnedDelta: pathway.reduce((s, p) => s + (p.current - p.initial), 0),
    context: { minuteOfDay: Math.round(clockInfo(at).minuteOfDay), darkness: perception.darkness ?? 0 },
  };
}

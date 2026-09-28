/*
 * PLASTICIDAD SINÁPTICA — Hebb modulado por recompensa con trazas de elegibilidad
 * -----------------------------------------------------------------------------
 *
 *   cada tick (gancho network.plasticity):
 *       e ← e × eligibilityDecay
 *       si pre disparó en t−1 y post dispara en t:  e ← min(1, e + eligibilityIncrement)
 *
 *   al llegar una experiencia con reward r:
 *       Δw = learningRate × rate × e × r        (|Δw| ≤ maxDeltaPerSynapse)
 *       Σ|Δw| ≤ maxWeightChangePerExperience     (si no, se escalan todos)
 *       w ← clamp(w + Δw, minWeight, maxWeight)
 *       e ← e × eligibilityConsumption
 *       homeostasis: presupuesto de pesos positivos entrantes por neurona
 *
 * Solo cambian las sinapsis declaradas plásticas en BrainConfig.plasticity.rules
 * y solo si participaron en una cadena pre → post reciente. Ver
 * docs/learning-system.md. Los cambios se escriben también en el genoma por
 * nombre (BrainConfig) para que el save los conserve.
 */
import type { Action } from '../brain/Actions';
import type { Brain } from '../brain/Brain';
import {
  CIRCUIT_KEYS, getCircuitWeight, getSensorWeight, setCircuitWeight, setSensorWeight,
  type BrainConfig, type CircuitKey, type ModulationChannel, type PlasticityRule, type SensorKey,
} from '../brain/BrainConfig';
import { ACTION_LIST } from '../brain/Actions';
import type { NeuronId } from '../neural/Neuron';
import type { Synapse } from '../neural/Synapse';

export interface PlasticEntry {
  synapse: Synapse;
  layer: 'sensorToCircuit' | 'circuitToAction';
  from: SensorKey | CircuitKey;
  to: CircuitKey | Action;
  key: string; // "seesBall→ballAttention"
  rate: number;
  channel: ModulationChannel;
}

export interface WeightChange {
  key: string;
  from: NeuronId;
  to: NeuronId;
  before: number;
  delta: number;
  after: number;
  eligibility: number;
}

export interface LearningEvent {
  id: string;
  at: number;
  tick: number;
  source: string; // tipo de experiencia o "inject"
  subject: string | null;
  reward: number;
  changes: WeightChange[]; // las más grandes (para inspección)
  changedCount: number;
  totalAbsDelta: number;
  capped: boolean; // se aplicó el tope por experiencia
  homeostasis: number; // sinapsis reescaladas por el presupuesto
}

export interface LearningState {
  enabled: boolean;
  learningRate: number;
  experiencesApplied: number;
  totalAbsDelta: number;
  rewardHistogram: number[]; // 10 cubetas de −1 a 1
  log: LearningEvent[];
  baselines?: Record<string, number>; // r̄ por tipo de recompensa natural (RewardBaseline)
}

const LOG_SIZE = 60;
const MIN_ELIGIBILITY = 1e-3;

let counter = 0;
function learningId(at: number): string {
  counter = (counter + 1) % 1e6;
  return `lrn_${at.toString(36)}_${counter.toString(36)}`;
}

export class SynapticPlasticity {
  readonly entries: PlasticEntry[] = [];
  enabled: boolean;
  stageMultiplier = 1; // v6: etapa de vida (BABY aprende más, ADULT menos, nunca 0)
  learningRate: number;
  frozen = false; // modo evaluación: se registran experiencias, pero los pesos no cambian
  experiencesApplied = 0;
  totalAbsDelta = 0;
  rewardHistogram = new Array<number>(10).fill(0);
  log: LearningEvent[] = [];
  private prevSpiked = new Set<NeuronId>();
  private readonly byKey = new Map<string, PlasticEntry>();

  constructor(readonly brain: Brain, readonly initial: BrainConfig) {
    const cfg = brain.config.plasticity;
    this.enabled = cfg.enabled;
    this.learningRate = cfg.learningRate;
    for (const rule of cfg.rules) this.addRule(rule);
    brain.network.plasticity = (_net, spiked) => this.onTick(spiked);
  }

  detach(): void {
    if (this.brain.network.plasticity) this.brain.network.plasticity = null;
  }

  private addRule(rule: PlasticityRule): void {
    const b = this.brain, net = b.network;
    const add = (fromId: NeuronId, toId: NeuronId, layer: PlasticEntry['layer'], from: PlasticEntry['from'], to: PlasticEntry['to'], init: number) => {
      const key = `${from}→${to}`;
      if (this.byKey.has(key)) return; // la primera regla que coincide manda
      const syn = net.findSynapse(fromId, toId);
      if (!syn) return;
      let min = rule.span !== undefined ? init - rule.span : rule.min ?? init;
      let max = rule.span !== undefined ? init + rule.span : rule.max ?? init;
      min = Math.min(min, init); max = Math.max(max, init);
      syn.plastic = true;
      syn.initialWeight = init;
      syn.minWeight = min;
      syn.maxWeight = max;
      syn.learningRate = rule.rate ?? 1;
      syn.weight = Math.max(min, Math.min(max, syn.weight));
      const entry: PlasticEntry = { synapse: syn, layer, from, to, key, rate: syn.learningRate, channel: rule.channel ?? 'all' };
      this.entries.push(entry);
      this.byKey.set(key, entry);
    };
    if (rule.layer === 'sensorToCircuit') {
      const targets = rule.to === '*' ? CIRCUIT_KEYS : rule.to;
      for (const f of rule.from) for (const t of targets) {
        add(b.sensorKeyToNeuron[f], b.circuitKeyToNeuron[t], 'sensorToCircuit', f, t, getSensorWeight(this.initial, f, t));
      }
    } else {
      const targets = rule.to === '*' ? ACTION_LIST : rule.to;
      for (const f of rule.from) for (const t of targets) {
        add(b.circuitKeyToNeuron[f], b.actionToOutputNeuron[t], 'circuitToAction', f, t, getCircuitWeight(this.initial, f, t));
      }
    }
  }

  entry(key: string): PlasticEntry | undefined {
    return this.byKey.get(key);
  }

  // ---- Trazas de elegibilidad (cada tick) ----
  onTick(spiked: readonly NeuronId[]): void {
    const now = new Set(spiked);
    const decay = this.brain.config.plasticity.eligibilityDecay;
    const inc = this.brain.config.plasticity.eligibilityIncrement;
    for (const e of this.entries) {
      const s = e.synapse;
      s.eligibility *= decay;
      if (this.prevSpiked.has(s.fromNeuron) && now.has(s.toNeuron)) s.eligibility = Math.min(1, s.eligibility + inc);
      else if (s.eligibility < MIN_ELIGIBILITY) s.eligibility = 0;
    }
    this.prevSpiked = now;
  }

  // ---- Señal de aprendizaje ----
  // natural = la recompensa viene del resultado de una necesidad; si no, solo modula vías 'all'
  applyReward(reward: number, meta: { source: string; subject: string | null; at: number; tick: number; natural?: boolean }): LearningEvent | null {
    const r = Math.max(-1, Math.min(1, reward));
    if (!this.enabled || this.frozen || !r || !Number.isFinite(r)) return null;
    const cfg = this.brain.config.plasticity;

    const proposals: { e: PlasticEntry; delta: number; elig: number }[] = [];
    for (const e of this.entries) {
      const elig = e.synapse.eligibility;
      if (elig < MIN_ELIGIBILITY) continue;
      if (e.channel === 'natural' && !meta.natural) continue;
      // stageMultiplier (crecimiento): escala el cambio Y su tope, si no el tope escondería el efecto
      const k = this.stageMultiplier;
      let d = this.learningRate * k * e.rate * elig * r;
      d = Math.max(-cfg.maxDeltaPerSynapse * k, Math.min(cfg.maxDeltaPerSynapse * k, d));
      if (d) proposals.push({ e, delta: d, elig });
    }
    const total = proposals.reduce((s, p) => s + Math.abs(p.delta), 0);
    const scale = total > cfg.maxWeightChangePerExperience ? cfg.maxWeightChangePerExperience / total : 1;

    const changes: WeightChange[] = [];
    const touched = new Set<NeuronId>();
    for (const p of proposals) {
      const s = p.e.synapse;
      const before = s.weight;
      const after = Math.max(s.minWeight, Math.min(s.maxWeight, before + p.delta * scale));
      this.write(p.e, after);
      s.lastDelta = after - before;
      s.lastReward = r;
      s.lastEligibility = p.elig;
      s.eligibility *= cfg.eligibilityConsumption;
      if (after !== before) {
        changes.push({ key: p.e.key, from: s.fromNeuron, to: s.toNeuron, before, delta: after - before, after, eligibility: p.elig });
        touched.add(s.toNeuron);
      }
    }
    const homeostasis = this.homeostasis(touched);

    const abs = changes.reduce((s, c) => s + Math.abs(c.delta), 0);
    this.experiencesApplied++;
    this.totalAbsDelta += abs;
    this.rewardHistogram[Math.min(9, Math.floor(((r + 1) / 2) * 10))]++;
    const event: LearningEvent = {
      id: learningId(meta.at), at: meta.at, tick: meta.tick, source: meta.source, subject: meta.subject, reward: r,
      changes: [...changes].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 12),
      changedCount: changes.length, totalAbsDelta: abs, capped: scale < 1, homeostasis,
    };
    this.log.unshift(event);
    if (this.log.length > LOG_SIZE) this.log.length = LOG_SIZE;
    return event;
  }

  /*
   * HOMEOSTASIS (synaptic scaling): la suma de pesos positivos plásticos que
   * llegan a una neurona no puede superar max(inicial × factor, inicial + 0.3).
   * Fortalecer una entrada debilita relativamente las demás en vez de saturar.
   */
  private homeostasis(posts: Set<NeuronId>): number {
    const factor = this.brain.config.plasticity.incomingBudgetFactor;
    let scaled = 0;
    for (const post of posts) {
      const incoming = this.entries.filter((e) => e.synapse.toNeuron === post);
      const pos = incoming.reduce((s, e) => s + Math.max(0, e.synapse.weight), 0);
      const init = incoming.reduce((s, e) => s + Math.max(0, e.synapse.initialWeight), 0);
      const budget = Math.max(init * factor, init + 0.3);
      if (pos <= budget) continue;
      // El exceso se quita proporcionalmente a lo GANADO por aprendizaje (peso por encima del
      // inicial). Lo innato está protegido: sin esto, una vía nueva (p. ej. pelota→alegría)
      // borraba poco a poco vías innatas que no se usaban (llamada→alegría 0.15→0, medido).
      const excess = pos - budget;
      const floor = (e: PlasticEntry) => Math.max(0, e.synapse.minWeight, e.synapse.initialWeight);
      const room = incoming.reduce((s, e) => s + Math.max(0, e.synapse.weight - floor(e)), 0);
      if (room <= 0) continue;
      const k = Math.min(1, excess / room);
      for (const e of incoming) {
        const margin = e.synapse.weight - floor(e);
        if (margin <= 0) continue;
        this.write(e, e.synapse.weight - margin * k);
        scaled++;
      }
    }
    return scaled;
  }

  private write(e: PlasticEntry, w: number): void {
    e.synapse.weight = w;
    if (e.layer === 'sensorToCircuit') setSensorWeight(this.brain.config, e.from as SensorKey, e.to as CircuitKey, w);
    else setCircuitWeight(this.brain.config, e.from as CircuitKey, e.to as Action, w);
  }

  // ---- Herramientas ----
  resetLearned(): void {
    for (const e of this.entries) {
      this.write(e, e.synapse.initialWeight);
      e.synapse.eligibility = 0;
      e.synapse.lastDelta = 0;
    }
    this.experiencesApplied = 0;
    this.totalAbsDelta = 0;
    this.rewardHistogram.fill(0);
    this.log = [];
  }

  topChanged(n = 12): PlasticEntry[] {
    return [...this.entries].sort((a, b) => Math.abs(b.synapse.lifetimeDelta) - Math.abs(a.synapse.lifetimeDelta)).slice(0, n)
      .filter((e) => e.synapse.lifetimeDelta !== 0);
  }

  // Suma de cambios aprendidos en las vías que salen de un sensor (evidencia para la UI)
  synapseDelta(key: string): number {
    return this.byKey.get(key)?.synapse.lifetimeDelta ?? 0;
  }

  pathwayDelta(from: SensorKey | CircuitKey): number {
    return this.entries.filter((e) => e.from === from).reduce((s, e) => s + e.synapse.lifetimeDelta, 0);
  }

  exportState(): LearningState {
    return {
      enabled: this.enabled, learningRate: this.learningRate, experiencesApplied: this.experiencesApplied,
      totalAbsDelta: this.totalAbsDelta, rewardHistogram: [...this.rewardHistogram], log: JSON.parse(JSON.stringify(this.log)) as LearningEvent[],
    };
  }

  importState(s: Partial<LearningState> | null | undefined): void {
    if (!s) return;
    if (typeof s.enabled === 'boolean') this.enabled = s.enabled;
    if (typeof s.learningRate === 'number' && Number.isFinite(s.learningRate) && s.learningRate >= 0) this.learningRate = Math.min(1, s.learningRate);
    this.experiencesApplied = Number.isFinite(s.experiencesApplied) ? (s.experiencesApplied as number) : 0;
    this.totalAbsDelta = Number.isFinite(s.totalAbsDelta) ? (s.totalAbsDelta as number) : 0;
    if (Array.isArray(s.rewardHistogram) && s.rewardHistogram.length === 10) this.rewardHistogram = s.rewardHistogram.map((v) => (Number.isFinite(v) ? v : 0));
    if (Array.isArray(s.log)) this.log = s.log.slice(0, LOG_SIZE);
  }
}

export function defaultLearningState(config: BrainConfig): LearningState {
  return { enabled: config.plasticity.enabled, learningRate: config.plasticity.learningRate, experiencesApplied: 0, totalAbsDelta: 0, rewardHistogram: new Array<number>(10).fill(0), log: [] };
}

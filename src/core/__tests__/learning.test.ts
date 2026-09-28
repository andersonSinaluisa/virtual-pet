import { describe, expect, it } from '@jest/globals';

import { Brain } from '../brain/Brain';
import { cloneBrainConfig, createBrainConfig, getSensorWeight } from '../brain/BrainConfig';
import { needOutcome, rewardFor } from '../learning/RewardModel';
import { SynapticPlasticity } from '../learning/Plasticity';

function setup() {
  const config = createBrainConfig();
  const brain = new Brain(config);
  const plasticity = new SynapticPlasticity(brain, cloneBrainConfig(config));
  const entry = plasticity.entry('seesBall→ballAttention');
  if (!entry) throw new Error('falta la sinapsis plástica');
  return { config, brain, plasticity, entry, syn: entry.synapse };
}

// Simula una coincidencia causal pre(t−1) → post(t) en la vía de la sinapsis
function pair(p: SynapticPlasticity, from: number, to: number) {
  p.onTick([from]);
  p.onTick([to]);
}

describe('Sinapsis plásticas', () => {
  it('solo las vías declaradas son plásticas', () => {
    const { brain, plasticity } = setup();
    expect(plasticity.entries.length).toBeGreaterThan(20);
    const fear = brain.network.findSynapse(brain.sensorKeyToNeuron.loudSound, brain.circuitKeyToNeuron.fearCircuit);
    expect(fear?.plastic).toBe(false);
    expect(plasticity.entry('seesBall→feedingCircuit')).toBeUndefined(); // sin asociaciones espurias
  });

  it('guarda initialWeight, límites y learningRate', () => {
    const { syn } = setup();
    expect(syn.plastic).toBe(true);
    expect(syn.initialWeight).toBe(0.55);
    expect(syn.minWeight).toBeLessThanOrEqual(0.55);
    expect(syn.maxWeight).toBeGreaterThanOrEqual(0.55);
    expect(syn.learningRate).toBe(0.25); // la atención aprende más despacio (ver BrainConfig)
  });
});

describe('Trazas de elegibilidad', () => {
  it('aumenta con una coincidencia pre → post y luego decae', () => {
    const { plasticity, syn } = setup();
    pair(plasticity, syn.fromNeuron, syn.toNeuron);
    const e = syn.eligibility;
    expect(e).toBeGreaterThan(0.4);
    plasticity.onTick([]);
    expect(syn.eligibility).toBeCloseTo(e * 0.93);
  });

  it('no aumenta si solo dispara una de las dos neuronas o en orden inverso', () => {
    const { plasticity, syn } = setup();
    plasticity.onTick([syn.fromNeuron]);
    plasticity.onTick([]);
    expect(syn.eligibility).toBe(0);
    plasticity.onTick([syn.toNeuron]);
    plasticity.onTick([syn.fromNeuron]);
    expect(syn.eligibility).toBe(0);
  });
});

describe('Regla Δw = lr × e × r', () => {
  it('una recompensa cambia solo sinapsis elegibles, poco y en la dirección de r', () => {
    const { plasticity, syn, config, brain } = setup();
    pair(plasticity, syn.fromNeuron, syn.toNeuron);
    const other = plasticity.entry('seesTeddy→teddyAttention')!.synapse;
    const w0 = syn.weight, o0 = other.weight;
    const ev = plasticity.applyReward(1, { source: 'test', subject: 'ball', at: 0, tick: 0 });
    expect(ev?.changedCount).toBeGreaterThan(0);
    expect(syn.weight).toBeGreaterThan(w0);
    expect(syn.weight - w0).toBeLessThanOrEqual(config.plasticity.maxDeltaPerSynapse + 1e-12); // gradual
    expect(other.weight).toBe(o0);
    // El genoma (lo que se guarda) refleja el cambio
    expect(getSensorWeight(brain.config, 'seesBall', 'ballAttention')).toBeCloseTo(syn.weight);
  });

  it('una recompensa negativa lo debilita', () => {
    const { plasticity, syn } = setup();
    pair(plasticity, syn.fromNeuron, syn.toNeuron);
    const w0 = syn.weight;
    plasticity.applyReward(-1, { source: 'test', subject: null, at: 0, tick: 0 });
    expect(syn.weight).toBeLessThan(w0);
  });

  it('sin elegibilidad no cambia nada (no es "weight += reward")', () => {
    const { plasticity } = setup();
    const before = plasticity.entries.map((e) => e.synapse.weight);
    plasticity.applyReward(1, { source: 'test', subject: null, at: 0, tick: 0 });
    expect(plasticity.entries.map((e) => e.synapse.weight)).toEqual(before);
  });

  it('respeta maxWeight aunque se recompense muchas veces', () => {
    const { plasticity, syn } = setup();
    for (let i = 0; i < 500; i++) { pair(plasticity, syn.fromNeuron, syn.toNeuron); plasticity.applyReward(1, { source: 't', subject: null, at: 0, tick: i }); }
    expect(syn.weight).toBeLessThanOrEqual(syn.maxWeight + 1e-12);
    for (let i = 0; i < 500; i++) { pair(plasticity, syn.fromNeuron, syn.toNeuron); plasticity.applyReward(-1, { source: 't', subject: null, at: 0, tick: i }); }
    expect(syn.weight).toBeGreaterThanOrEqual(syn.minWeight - 1e-12);
  });

  it('limita el cambio total por experiencia', () => {
    const { plasticity, config } = setup();
    for (const e of plasticity.entries) e.synapse.eligibility = 1;
    const ev = plasticity.applyReward(1, { source: 't', subject: null, at: 0, tick: 0 });
    expect(ev?.capped).toBe(true);
    expect(ev?.totalAbsDelta).toBeLessThanOrEqual(config.plasticity.maxWeightChangePerExperience + 1e-9);
  });

  it('modo evaluación (frozen) y aprendizaje apagado no cambian pesos', () => {
    const { plasticity, syn } = setup();
    pair(plasticity, syn.fromNeuron, syn.toNeuron);
    const w0 = syn.weight;
    plasticity.frozen = true;
    expect(plasticity.applyReward(1, { source: 't', subject: null, at: 0, tick: 0 })).toBeNull();
    plasticity.frozen = false;
    plasticity.enabled = false;
    expect(plasticity.applyReward(1, { source: 't', subject: null, at: 0, tick: 0 })).toBeNull();
    expect(syn.weight).toBe(w0);
  });

  it('homeostasis: el presupuesto de pesos positivos entrantes no se supera', () => {
    const { plasticity, config } = setup();
    const post = plasticity.entry('seesBall→playCircuit')!.synapse.toNeuron;
    const incoming = plasticity.entries.filter((e) => e.synapse.toNeuron === post);
    for (let i = 0; i < 400; i++) {
      for (const e of incoming) e.synapse.eligibility = 1;
      plasticity.applyReward(1, { source: 't', subject: null, at: 0, tick: i });
    }
    const pos = incoming.reduce((s, e) => s + Math.max(0, e.synapse.weight), 0);
    const init = incoming.reduce((s, e) => s + Math.max(0, e.synapse.initialWeight), 0);
    expect(pos).toBeLessThanOrEqual(Math.max(init * config.plasticity.incomingBudgetFactor, init + 0.3) + 1e-9);
  });

  it('resetLearned vuelve a los pesos iniciales', () => {
    const { plasticity, syn } = setup();
    pair(plasticity, syn.fromNeuron, syn.toNeuron);
    plasticity.applyReward(1, { source: 't', subject: null, at: 0, tick: 0 });
    plasticity.resetLearned();
    expect(syn.weight).toBe(syn.initialWeight);
    expect(plasticity.log).toEqual([]);
  });
});

describe('RewardModel', () => {
  it('recompensa por tabla y por resultado del episodio', () => {
    expect(rewardFor('player_rewarded')).toBe(0.8);
    expect(rewardFor('scared')).toBe(0); // el miedo no es plástico
    expect(rewardFor('ate', 0.4)).toBe(0.4);
    expect(needOutcome(0.8, 0.5)).toBeGreaterThan(needOutcome(0.4, 0.1)); // comer con más hambre vale más
    expect(needOutcome(0.5, 0.5)).toBe(-0.1); // intentó y no pudo
  });
});

import { describe, expect, it } from '@jest/globals';

import { Network } from '../neural/Network';
import { Neuron } from '../neural/Neuron';
import { Synapse } from '../neural/Synapse';

describe('Neuron (LIF)', () => {
  it('dispara al alcanzar el umbral y se resetea a 0', () => {
    const n = new Neuron(0, { threshold: 1, leak: 0.9 });
    expect(n.update(1.0, 1)).toBe(true);
    expect(n.potential).toBe(0);
    expect(n.peakPotential).toBe(1);
    expect(n.spikeCount).toBe(1);
    expect(n.lastSpikeTick).toBe(1);
  });

  it('no dispara por debajo del umbral', () => {
    const n = new Neuron(0, { threshold: 1, leak: 0.9 });
    expect(n.update(0.99, 1)).toBe(false);
    expect(n.potential).toBeCloseTo(0.99);
  });

  it('aplica la fuga ANTES de integrar', () => {
    const n = new Neuron(0, { threshold: 10, leak: 0.5 });
    n.update(1, 1); // 0·0.5 + 1 = 1
    n.update(1, 2); // 1·0.5 + 1 = 1.5
    expect(n.potential).toBeCloseTo(1.5);
    n.update(0, 3); // 1.5·0.5 = 0.75
    expect(n.potential).toBeCloseTo(0.75);
  });

  it('una corriente constante I converge a I/(1−λ) (sin disparar si < θ)', () => {
    const n = new Neuron(0, { threshold: 1, leak: 0.9 });
    let fired = false;
    for (let t = 1; t <= 500; t++) fired = n.update(0.09, t) || fired;
    expect(fired).toBe(false);
    expect(n.potential).toBeCloseTo(0.9, 2);
  });

  it('suma temporal: dos spikes de 0.6 seguidos alcanzan θ=1 con λ=0.9', () => {
    const n = new Neuron(0, { threshold: 1, leak: 0.9 });
    expect(n.update(0.6, 1)).toBe(false);
    expect(n.update(0.6, 2)).toBe(true); // 0.54 + 0.6 = 1.14
  });

  it('la inhibición deja el potencial negativo y la fuga lo devuelve hacia 0', () => {
    const n = new Neuron(0, { threshold: 1, leak: 0.9 });
    n.update(-0.5, 1);
    expect(n.potential).toBeCloseTo(-0.5);
    n.update(0, 2);
    expect(n.potential).toBeCloseTo(-0.45);
  });

  it('reset limpia todo el estado', () => {
    const n = new Neuron(0);
    n.update(2, 1);
    n.update(0.3, 2);
    n.reset();
    expect(n).toMatchObject({ potential: 0, spiked: false, spikeCount: 0, lastSpikeTick: -1, lastInput: 0 });
  });
});

describe('Synapse', () => {
  it('clasifica excitatoria / inhibitoria por el signo del peso', () => {
    expect(new Synapse(0, 1, 0.5).isExcitatory).toBe(true);
    expect(new Synapse(0, 1, -0.5).isInhibitory).toBe(true);
    const zero = new Synapse(0, 1, 0);
    expect(zero.isExcitatory || zero.isInhibitory).toBe(false);
  });
});

function chain(weights: number[]): Network {
  const net = new Network();
  const layers = weights.concat(0).map((_, i) => net.addLayer([new Neuron(i)]));
  weights.forEach((w, i) => net.connectLayers(layers[i], layers[i + 1], [[w]]));
  return net;
}

describe('Network: propagación temporal', () => {
  it('A→B→C tarda un tick por capa (inputs vs nextInputs)', () => {
    const net = chain([1.2, 1.2]);
    net.stimulate(0, 5);
    const fired = [net.tick(), net.tick(), net.tick()];
    expect(fired).toEqual([[0], [1], [2]]);
  });

  it('un spike escribe en nextInputs, no en inputs del tick actual', () => {
    const net = chain([1.2]);
    net.stimulate(0, 5);
    net.tick();
    // Tras el tick, la corriente del spike está en `inputs` (será consumida en el próximo)
    expect(net.inputs[1]).toBeCloseTo(1.2);
    expect(net.lastInputs[1]).toBe(0);
    expect(net.nextInputs.every((v) => v === 0)).toBe(true);
  });

  it('el orden de procesamiento no importa (B antes que A en el array)', () => {
    const net = new Network();
    const [b] = net.addLayer([new Neuron(0)]); // B = N0
    const [a] = net.addLayer([new Neuron(1)]); // A = N1
    net.connect(a.id, b.id, 1.5);
    net.stimulate(a.id, 2);
    expect(net.tick()).toEqual([1]); // B no dispara en el mismo tick que A
    expect(net.tick()).toEqual([0]);
  });

  it('excitación: pesos que suman θ disparan al destino', () => {
    const net = new Network();
    const src = net.addLayer([new Neuron(0), new Neuron(1)]);
    const dst = net.addLayer([new Neuron(2)]);
    net.connectLayers(src, dst, [[0.5], [0.5]]);
    net.stimulate(0, 2); net.stimulate(1, 2);
    net.tick();
    expect(net.tick()).toEqual([2]);
  });

  it('inhibición: un peso negativo impide el disparo', () => {
    const net = new Network();
    const src = net.addLayer([new Neuron(0), new Neuron(1)]);
    const dst = net.addLayer([new Neuron(2)]);
    net.connectLayers(src, dst, [[1.0], [-0.6]]);
    net.stimulate(0, 2); net.stimulate(1, 2);
    net.tick();
    expect(net.tick()).toEqual([]);
    expect(net.neurons[2].potential).toBeCloseTo(0.4);
  });

  it('registra el origen de cada llegada (arrivals) para explicar un spike', () => {
    const net = chain([1.2]);
    net.stimulate(0, 5);
    net.tick();
    net.tick();
    expect(net.lastArrivals[1]).toEqual([{ from: 0, weight: 1.2 }]);
    expect(net.lastExternal[0]).toBe(0);
  });

  it('rechaza matrices de dimensiones incorrectas y sinapsis a neuronas inexistentes', () => {
    const net = new Network();
    const a = net.addLayer([new Neuron(0), new Neuron(1)]);
    const b = net.addLayer([new Neuron(2)]);
    expect(() => net.connectLayers(a, b, [[1]])).toThrow();
    expect(() => net.connect(0, 99, 1)).toThrow();
  });

  it('exporta e importa el estado dinámico', () => {
    const net = chain([0.7]);
    net.stimulate(0, 0.5);
    net.tick();
    const state = JSON.parse(JSON.stringify(net.exportState()));
    const copy = chain([0.7]);
    copy.importState(state);
    expect(copy.neurons[0].potential).toBeCloseTo(net.neurons[0].potential);
    expect(copy.tickCount).toBe(net.tickCount);
  });
});

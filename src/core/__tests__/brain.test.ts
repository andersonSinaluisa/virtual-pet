import { describe, expect, it } from '@jest/globals';

import { ACTION_LIST } from '../brain/Actions';
import { Brain } from '../brain/Brain';
import { auditBrain } from '../brain/BrainAudit';
import { BRAIN_PRESETS, createBrainConfig, getCircuitWeight, getSensorWeight, type PresetKey } from '../brain/BrainConfig';
import { denseWeights, exportWeights, importWeights } from '../brain/BrainWeights';
import { ActionTranslator } from '../simulation/ActionTranslator';

describe('Brain', () => {
  const config = createBrainConfig();
  const brain = new Brain(config);

  it('tiene exactamente 22 acciones, cada una con su neurona de salida', () => {
    expect(ACTION_LIST).toHaveLength(22);
    expect(new Set(ACTION_LIST).size).toBe(22);
    const outs = ACTION_LIST.map((a) => brain.actionToOutputNeuron[a]);
    expect(outs.every((id) => typeof id === 'number')).toBe(true);
    expect(new Set(outs).size).toBe(22);
  });

  it('IDs únicos y calculados por capa', () => {
    const ids = brain.network.neurons.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(ids.map((_, i) => i));
    expect(brain.sensorLayer[0].id).toBe(0);
    expect(brain.circuitLayer[0].id).toBe(config.sensors.length);
    expect(brain.outputLayer[0].id).toBe(config.sensors.length + config.circuits.length);
  });

  it('matrices con las dimensiones correctas', () => {
    const s = denseWeights(config, 'sensorToCircuit');
    const c = denseWeights(config, 'circuitToAction');
    expect(s).toHaveLength(config.sensors.length);
    s.forEach((row) => expect(row).toHaveLength(config.circuits.length));
    expect(c).toHaveLength(config.circuits.length);
    c.forEach((row) => expect(row).toHaveLength(22));
  });

  it('todas las sinapsis conectan neuronas existentes (incluidas las de peso 0)', () => {
    const n = brain.network.neurons.length;
    expect(brain.network.synapses).toHaveLength(config.sensors.length * config.circuits.length + config.circuits.length * 22);
    for (const s of brain.network.synapses) {
      expect(s.fromNeuron).toBeGreaterThanOrEqual(0);
      expect(s.toNeuron).toBeLessThan(n);
      expect(Number.isFinite(s.weight)).toBe(true);
    }
  });

  it('mapea spikes de salida a acciones (ActionTranslator) e ignora otras neuronas', () => {
    const tr = new ActionTranslator(brain.outputNeuronToAction);
    const spikes = [0, brain.circuitLayer[0].id, brain.actionToOutputNeuron.EAT, brain.actionToOutputNeuron.HIDE];
    expect(tr.fromSpikes(spikes).map((a) => a.action)).toEqual(['EAT', 'HIDE']);
  });

  it.each(Object.keys(BRAIN_PRESETS) as PresetKey[])('auditoría sin salidas imposibles ni débiles (%s)', (preset) => {
    const report = auditBrain(new Brain(createBrainConfig(preset)));
    expect(report.actions.filter((a) => a.level === 'imposible' || a.level === 'débil')).toEqual([]);
    expect(report.sensors.every((s) => s.connections > 0 && s.fires)).toBe(true);
    expect(report.excitatory).toBeGreaterThan(0);
    expect(report.inhibitory).toBeGreaterThan(0);
  });

  it('los presets parchean el genoma sin tocar el base', () => {
    const curioso = createBrainConfig('curioso');
    expect(getSensorWeight(curioso, 'newObjectDetected', 'curiosityCircuit')).toBe(1.0);
    expect(getSensorWeight(createBrainConfig(), 'newObjectDetected', 'curiosityCircuit')).toBe(0.7);
  });

  it('el sensor v3 playerCalling no modificó ningún peso existente', () => {
    const c = createBrainConfig();
    expect(getSensorWeight(c, 'playerNear', 'socialCircuit')).toBe(0.6);
    expect(getCircuitWeight(c, 'fearCircuit', 'GET_SCARED')).toBe(1.0);
    expect(getSensorWeight(c, 'playerCalling', 'socialCircuit')).toBe(0.45);
  });
});

describe('Serialización de pesos', () => {
  it('ida y vuelta por JSON produce la misma red', () => {
    const a = createBrainConfig('apegado');
    const json = JSON.stringify(exportWeights(a));
    const b = createBrainConfig();
    const report = importWeights(b, JSON.parse(json));
    expect(report.ignored).toEqual([]);
    expect(denseWeights(b, 'sensorToCircuit')).toEqual(denseWeights(a, 'sensorToCircuit'));
    expect(denseWeights(b, 'circuitToAction')).toEqual(denseWeights(a, 'circuitToAction'));
    const netA = new Brain(a).network.synapses.map((s) => s.weight);
    const netB = new Brain(b).network.synapses.map((s) => s.weight);
    expect(netB).toEqual(netA);
  });

  it('ignora claves desconocidas y valores no finitos (no corrompe la red)', () => {
    const c = createBrainConfig();
    const report = importWeights(c, {
      sensorToCircuit: { hunger: { feedingCircuit: 0.5, nope: 1 }, ghost: { x: 1 } },
      circuitToAction: { joyCircuit: { SMILE: Number.NaN, DANCE: 0.1 } },
    });
    expect(report.ignored).toEqual(expect.arrayContaining(['hunger→nope', 'sensor:ghost', 'joyCircuit→SMILE']));
    expect(getSensorWeight(c, 'hunger', 'feedingCircuit')).toBe(0.5);
    expect(getCircuitWeight(c, 'joyCircuit', 'DANCE')).toBe(0.1);
  });

  it('un save antiguo sin el sensor nuevo conserva los pesos por defecto de ese sensor', () => {
    const c = createBrainConfig();
    const old = exportWeights(c);
    delete old.sensorToCircuit.playerCalling;
    const d = createBrainConfig();
    importWeights(d, old);
    expect(getSensorWeight(d, 'playerCalling', 'followCircuit')).toBe(0.35);
  });

  it('rechaza datos sin matrices', () => {
    expect(() => importWeights(createBrainConfig(), { foo: 1 })).toThrow();
  });
});

/*
 * BRAIN BUILDER
 * -------------
 * Convierte BrainConfig (con nombres) en una Network (solo IDs y números).
 * Los IDs se CALCULAN a partir del tamaño de cada capa; no hay números
 * mágicos repartidos por el código:
 *
 *   sensores  → N0 .. N(S-1)
 *   circuitos → NS .. N(S+C-1)
 *   salidas   → N(S+C) .. N(S+C+A-1)
 *
 * El resultado incluye los mapas que usa la aplicación
 * (outputNeuronToAction, sensorKeyToNeuron, ...). La Network no los ve.
 */
import { Network } from '../neural/Network';
import { Neuron, type NeuronId } from '../neural/Neuron';
import { ACTION_INFO, ACTION_LIST, type Action } from './Actions';
import type { BrainConfig, CircuitKey, SensorGroup, SensorKey } from './BrainConfig';
import { denseWeights } from './BrainWeights';

export type NeuronRole = 'sensor' | 'circuito' | 'salida';

export interface NeuronDescription {
  layer: number;
  role: NeuronRole | '?';
  key: string;
  label: string;
  group?: SensorGroup;
}

export class Brain {
  readonly config: BrainConfig;
  readonly network = new Network();
  readonly sensorLayer: Neuron[];
  readonly circuitLayer: Neuron[];
  readonly outputLayer: Neuron[];

  // Mapas nombre ↔ neurona (capa de aplicación)
  readonly sensorKeyToNeuron = {} as Record<SensorKey, NeuronId>;
  readonly circuitKeyToNeuron = {} as Record<CircuitKey, NeuronId>;
  readonly outputNeuronToAction: Record<NeuronId, Action> = {};
  readonly actionToOutputNeuron = {} as Record<Action, NeuronId>;

  constructor(config: BrainConfig) {
    this.config = config;
    let nextId = 0;
    const makeLayer = (n: number) => Array.from({ length: n }, () => new Neuron(nextId++, config.neuron));

    this.sensorLayer = this.network.addLayer(makeLayer(config.sensors.length));
    this.circuitLayer = this.network.addLayer(makeLayer(config.circuits.length));
    this.outputLayer = this.network.addLayer(makeLayer(ACTION_LIST.length));

    config.sensors.forEach((s, i) => { this.sensorKeyToNeuron[s.key] = this.sensorLayer[i].id; });
    config.circuits.forEach((c, i) => { this.circuitKeyToNeuron[c.key] = this.circuitLayer[i].id; });
    ACTION_LIST.forEach((a, i) => {
      this.outputNeuronToAction[this.outputLayer[i].id] = a;
      this.actionToOutputNeuron[a] = this.outputLayer[i].id;
    });

    // Todas las sinapsis entre capas existen (también las de peso 0),
    // para que una futura regla de plasticidad pueda crearlas "de la nada".
    this.network.connectLayers(this.sensorLayer, this.circuitLayer, denseWeights(config, 'sensorToCircuit'));
    this.network.connectLayers(this.circuitLayer, this.outputLayer, denseWeights(config, 'circuitToAction'));

    // Competencia entre acciones (apagada por defecto).
    if (config.lateralInhibition.enabled) {
      for (const [a, b] of config.conflicts) {
        this.network.connect(this.actionToOutputNeuron[a], this.actionToOutputNeuron[b], config.lateralInhibition.weight);
        this.network.connect(this.actionToOutputNeuron[b], this.actionToOutputNeuron[a], config.lateralInhibition.weight);
      }
    }
  }

  // Tras editar el genoma en caliente, copia los pesos a las sinapsis.
  syncWeights(): void {
    const sw = denseWeights(this.config, 'sensorToCircuit');
    const cw = denseWeights(this.config, 'circuitToAction');
    this.sensorLayer.forEach((s, i) => this.circuitLayer.forEach((c, j) => {
      const syn = this.network.findSynapse(s.id, c.id);
      if (syn) syn.weight = sw[i][j];
    }));
    this.circuitLayer.forEach((c, i) => this.outputLayer.forEach((o, j) => {
      const syn = this.network.findSynapse(c.id, o.id);
      if (syn) syn.weight = cw[i][j];
    }));
  }

  // Descripción legible de una neurona (solo para la interfaz).
  describe(id: NeuronId): NeuronDescription {
    const s = this.sensorLayer.findIndex((n) => n.id === id);
    if (s >= 0) {
      const def = this.config.sensors[s];
      return { layer: 0, role: 'sensor', key: def.key, label: def.label, group: def.group };
    }
    const c = this.circuitLayer.findIndex((n) => n.id === id);
    if (c >= 0) return { layer: 1, role: 'circuito', key: this.config.circuits[c].key, label: this.config.circuits[c].label };
    const action = this.outputNeuronToAction[id];
    if (action) return { layer: 2, role: 'salida', key: action, label: ACTION_INFO[action].label };
    return { layer: -1, role: '?', key: `N${id}`, label: `N${id}` };
  }

  // Nombre corto en mayúsculas: HUNGER, SOCIAL CIRCUIT, APPROACH...
  tag(id: NeuronId): string {
    const d = this.describe(id);
    if (d.role === 'sensor') return d.key.replace(/([A-Z])/g, '_$1').toUpperCase();
    if (d.role === 'circuito') return d.key.replace('Circuit', '').toUpperCase() + ' CIRCUIT';
    return d.key;
  }
}

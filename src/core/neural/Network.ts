/*
 * RED NEURONAL DE SPIKES
 * ----------------------
 * La red solo conoce neuronas, sinapsis, pesos, inputs y spikes.
 * No sabe qué es "hambre" ni "comer": eso lo decide la aplicación.
 *
 * PROPAGACIÓN TEMPORAL
 * Un spike NO atraviesa la red en un solo tick. Durante tick() cada neurona
 * lee `inputs` (lo que llegó para este tick) y, si dispara, escribe en
 * `nextInputs` (lo que llegará en el siguiente). Solo cuando TODAS las
 * neuronas se procesaron se hace `inputs = nextInputs`.
 *
 *   tick X   : un sensor dispara
 *   tick X+1 : el circuito interno recibe el peso sensor→circuito
 *   tick X+2 : si el circuito disparó en X+1, la salida recibe circuito→salida
 *
 * Gracias a esto el orden en que se procesan las neuronas no importa.
 */
import { Neuron, type NeuronId, type NeuronState } from './Neuron';
import { Synapse } from './Synapse';

export interface Arrival {
  from: NeuronId;
  weight: number;
}

// Gancho para aprendizaje futuro (STDP, Hebb...). null = pesos fijos.
export type PlasticityHook = (network: Network, spikedIds: readonly NeuronId[]) => void;

export interface NetworkState {
  tickCount: number;
  neurons: NeuronState[];
  // Corriente ya en vuelo hacia el próximo tick (spikes del último tick).
  inputs: number[];
}

export class Network {
  layers: Neuron[][] = []; // arrays de neuronas, en orden
  neurons: Neuron[] = []; // indexadas por id
  synapses: Synapse[] = [];
  inputs: number[] = []; // corriente que se consume en el tick actual
  nextInputs: number[] = []; // corriente que se acumula para el tick siguiente
  lastInputs: number[] = []; // copia de lo consumido en el último tick (inspección)

  // Qué produjo cada input (para explicar por qué disparó una neurona).
  arrivals: Arrival[][] = []; // por neurona, para el tick actual
  nextArrivals: Arrival[][] = []; // por neurona, para el siguiente
  lastArrivals: Arrival[][] = []; // lo consumido en el último tick
  external: number[] = []; // corriente externa (sensores) para el tick actual
  lastExternal: number[] = [];

  spikedIds: NeuronId[] = [];
  tickCount = 0;
  plasticity: PlasticityHook | null = null;

  private readonly _outgoing = new Map<NeuronId, Synapse[]>();
  private readonly _incoming = new Map<NeuronId, Synapse[]>();

  addLayer(neurons: Neuron[]): Neuron[] {
    this.layers.push(neurons);
    for (const neuron of neurons) {
      this.neurons[neuron.id] = neuron;
      this._outgoing.set(neuron.id, []);
      this._incoming.set(neuron.id, []);
    }
    this._clearBuffers();
    return neurons;
  }

  connect(fromId: NeuronId, toId: NeuronId, weight: number): Synapse {
    const out = this._outgoing.get(fromId);
    const inc = this._incoming.get(toId);
    if (!out || !inc) throw new Error(`Sinapsis inválida N${fromId} → N${toId}: neurona inexistente`);
    const synapse = new Synapse(fromId, toId, weight);
    this.synapses.push(synapse);
    out.push(synapse);
    inc.push(synapse);
    return synapse;
  }

  // weightMatrix[i][j] = peso de fromLayer[i] → toLayer[j]
  connectLayers(fromLayer: Neuron[], toLayer: Neuron[], weightMatrix: number[][]): void {
    if (weightMatrix.length !== fromLayer.length || weightMatrix.some((row) => row.length !== toLayer.length)) {
      throw new Error(`Matriz de pesos ${weightMatrix.length}×${weightMatrix[0]?.length ?? 0} no coincide con capas ${fromLayer.length}×${toLayer.length}`);
    }
    fromLayer.forEach((source, i) => {
      toLayer.forEach((target, j) => {
        this.connect(source.id, target.id, weightMatrix[i][j]);
      });
    });
  }

  // Corriente externa (por ejemplo, de un sensor) para el tick que viene.
  stimulate(neuronId: NeuronId, amount: number): void {
    this.inputs[neuronId] += amount;
    this.external[neuronId] += amount;
  }

  tick(): NeuronId[] {
    const spiked: NeuronId[] = [];

    for (const neuron of this.neurons) {
      const fired = neuron.update(this.inputs[neuron.id], this.tickCount + 1);
      if (!fired) continue;

      spiked.push(neuron.id);
      // El spike viaja por cada sinapsis saliente... pero llega en el próximo tick.
      for (const synapse of this._outgoing.get(neuron.id) ?? []) {
        if (synapse.weight === 0) continue;
        this.nextInputs[synapse.toNeuron] += synapse.weight;
        this.nextArrivals[synapse.toNeuron].push({ from: neuron.id, weight: synapse.weight });
      }
    }

    // Todas las neuronas terminaron: ahora sí avanza el tiempo.
    const n = this.neurons.length;
    this.lastInputs = this.inputs;
    this.lastArrivals = this.arrivals;
    this.lastExternal = this.external;
    this.inputs = this.nextInputs;
    this.arrivals = this.nextArrivals;
    this.nextInputs = zeros(n);
    this.nextArrivals = lists(n);
    this.external = zeros(n);

    this.spikedIds = spiked;
    this.tickCount++;
    if (this.plasticity) this.plasticity(this, spiked);
    return spiked;
  }

  outgoing(neuronId: NeuronId): Synapse[] {
    return this._outgoing.get(neuronId) ?? [];
  }

  incoming(neuronId: NeuronId): Synapse[] {
    return this._incoming.get(neuronId) ?? [];
  }

  findSynapse(fromId: NeuronId, toId: NeuronId): Synapse | null {
    return this.outgoing(fromId).find((s) => s.toNeuron === toId) ?? null;
  }

  setWeight(fromId: NeuronId, toId: NeuronId, weight: number): Synapse | null {
    const s = this.findSynapse(fromId, toId);
    if (s) s.weight = weight;
    return s;
  }

  layerIndexOf(neuronId: NeuronId): number {
    return this.layers.findIndex((layer) => layer.some((n) => n.id === neuronId));
  }

  reset(): void {
    this.neurons.forEach((n) => n.reset());
    this._clearBuffers();
    this.spikedIds = [];
    this.tickCount = 0;
  }

  // Estado dinámico (potenciales y corriente en vuelo) para guardar/restaurar.
  exportState(): NetworkState {
    return { tickCount: this.tickCount, neurons: this.neurons.map((n) => n.exportState()), inputs: [...this.inputs] };
  }

  importState(state: NetworkState): void {
    if (state.neurons.length !== this.neurons.length) return; // topología distinta: se ignora el estado dinámico
    state.neurons.forEach((s, i) => this.neurons[i].importState(s));
    this.tickCount = Number.isFinite(state.tickCount) ? state.tickCount : 0;
    if (state.inputs.length === this.neurons.length) this.inputs = state.inputs.map((v) => (Number.isFinite(v) ? v : 0));
  }

  private _clearBuffers(): void {
    const n = this.neurons.length;
    this.inputs = zeros(n);
    this.nextInputs = zeros(n);
    this.lastInputs = zeros(n);
    this.arrivals = lists(n);
    this.nextArrivals = lists(n);
    this.lastArrivals = lists(n);
    this.external = zeros(n);
    this.lastExternal = zeros(n);
  }
}

function zeros(n: number): number[] {
  return new Array<number>(n).fill(0);
}

function lists(n: number): Arrival[][] {
  return Array.from({ length: n }, () => []);
}

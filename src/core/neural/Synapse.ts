/*
 * SINAPSIS
 * --------
 * Conexión dirigida entre dos neuronas. Cuando `fromNeuron` dispara,
 * `toNeuron` recibe `weight` como input en el SIGUIENTE tick.
 *
 * weight > 0 → excitatoria · weight < 0 → inhibitoria · |weight| = fuerza.
 * Con threshold = 1, un peso de 0.8 no basta por sí solo: el destino
 * necesita dos spikes cercanos en el tiempo (o de varias neuronas).
 *
 * PLASTICIDAD (opcional): una sinapsis `plastic` puede cambiar su peso con
 * la experiencia dentro de [minWeight, maxWeight]. `eligibility` recuerda
 * si participó hace poco en una cadena pre → post. Por defecto NO es
 * plástica: el genoma se mantiene fijo salvo en las vías declaradas.
 */
import type { NeuronId } from './Neuron';

export class Synapse {
  plastic = false;
  initialWeight: number;
  minWeight: number;
  maxWeight: number;
  learningRate = 0; // multiplicador propio (× learningRate global)
  eligibility = 0;

  // Inspección (Brain View / Learning Inspector)
  lastEligibility = 0; // traza en el momento de la última recompensa aplicada
  lastReward = 0;
  lastDelta = 0;

  constructor(
    readonly fromNeuron: NeuronId,
    readonly toNeuron: NeuronId,
    public weight: number,
  ) {
    this.initialWeight = weight;
    this.minWeight = weight;
    this.maxWeight = weight;
  }

  get isExcitatory(): boolean {
    return this.weight > 0;
  }

  get isInhibitory(): boolean {
    return this.weight < 0;
  }

  // Cambio acumulado respecto al peso con el que nació
  get lifetimeDelta(): number {
    return this.weight - this.initialWeight;
  }
}

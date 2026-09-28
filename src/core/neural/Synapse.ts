/*
 * SINAPSIS
 * --------
 * Conexión dirigida entre dos neuronas. Cuando `fromNeuron` dispara,
 * `toNeuron` recibe `weight` como input en el SIGUIENTE tick.
 *
 * weight > 0 → excitatoria · weight < 0 → inhibitoria · |weight| = fuerza.
 * Con threshold = 1, un peso de 0.8 no basta por sí solo: el destino
 * necesita dos spikes cercanos en el tiempo (o de varias neuronas).
 */
import type { NeuronId } from './Neuron';

export class Synapse {
  constructor(
    readonly fromNeuron: NeuronId,
    readonly toNeuron: NeuronId,
    public weight: number,
  ) {}

  get isExcitatory(): boolean {
    return this.weight > 0;
  }

  get isInhibitory(): boolean {
    return this.weight < 0;
  }
}

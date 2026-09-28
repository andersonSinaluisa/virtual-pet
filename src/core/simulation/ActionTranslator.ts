/*
 * ACTION TRANSLATOR: spikes de salida → nombres de acción
 * -------------------------------------------------------
 * La decisión ya la tomó la red. Esto solo consulta el mapa
 * outputNeuronToAction. Si disparan varias salidas, se devuelven TODAS.
 */
import type { Action } from '../brain/Actions';
import type { NeuronId } from '../neural/Neuron';

export interface FiredAction {
  neuron: NeuronId;
  action: Action;
}

export class ActionTranslator {
  constructor(private readonly map: Readonly<Record<NeuronId, Action>>) {}

  fromSpikes(spikedIds: readonly NeuronId[]): FiredAction[] {
    return spikedIds.filter((id) => id in this.map).map((id) => ({ neuron: id, action: this.map[id] }));
  }
}

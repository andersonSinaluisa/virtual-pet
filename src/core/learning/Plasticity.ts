/*
 * PLASTICIDAD (preparado, NO implementado)
 * ----------------------------------------
 * El prototipo no tiene aprendizaje sináptico: los pesos son fijos (el
 * genoma). Dejó preparado el gancho `network.plasticity` y todas las
 * sinapsis entre capas existen con peso 0 para que una regla pueda
 * crearlas "de la nada".
 *
 * Aquí solo se define el contrato. Ninguna regla está activa, y ninguna
 * pantalla habla de "aprendizaje" neuronal mientras no exista.
 *
 * Una regla futura (STDP, Hebb con recompensa...) debe:
 *  - modificar `synapse.weight` en la Network;
 *  - reflejar el cambio en el genoma por nombre (setSensorWeight/setCircuitWeight)
 *    para que se persista con el save;
 *  - ser determinista dado el mismo RNG (para los tests).
 */
import type { BrainConfig } from '../brain/BrainConfig';
import type { Brain } from '../brain/Brain';
import type { NeuronId } from '../neural/Neuron';

export interface PlasticityContext {
  brain: Brain;
  config: BrainConfig;
  spiked: readonly NeuronId[];
  reward: number; // -1..1 (p. ej. caricia = +, susto = −); 0 si no hay señal
}

export interface PlasticityRule {
  readonly name: string;
  apply(ctx: PlasticityContext): void;
}

// Conecta una regla al gancho existente de la red. Devuelve la función para desconectarla.
export function attachPlasticity(brain: Brain, rule: PlasticityRule, rewardSignal: () => number): () => void {
  brain.network.plasticity = (_net, spiked) => rule.apply({ brain, config: brain.config, spiked, reward: rewardSignal() });
  return () => { brain.network.plasticity = null; };
}

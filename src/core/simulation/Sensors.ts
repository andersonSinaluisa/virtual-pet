/*
 * SENSORES: percepción (0..1) → corriente neuronal
 * ------------------------------------------------
 * `pet.hunger = 0.82` no es lo mismo que `network.inputs[0]`.
 * Cada sensor convierte un valor del mundo en corriente:
 *
 *   corriente = gain × valor
 *
 * Con leak = 0.9, una corriente constante I lleva el potencial hacia 10·I.
 * Si 10·I < threshold, la neurona sensorial nunca dispara. Si es mayor,
 * dispara más seguido cuanto mayor sea el valor (codificación por frecuencia).
 * Aquí no hay ningún "if hambre > 0.8": solo una traducción continua.
 */
import type { Brain } from '../brain/Brain';
import type { SensorDef, SensorKey } from '../brain/BrainConfig';
import type { Network } from '../neural/Network';
import type { NeuronId } from '../neural/Neuron';

export interface SensorReading {
  key: SensorKey;
  neuron: NeuronId;
  value: number;
  current: number;
}

export class Sensors {
  lastReadings: SensorReading[] = [];
  private readonly defs: SensorDef[];

  constructor(private readonly brain: Brain) {
    this.defs = brain.config.sensors;
  }

  feed(perception: Partial<Record<SensorKey, number>>, network: Network): SensorReading[] {
    this.lastReadings = this.defs.map((def) => {
      const raw = perception[def.key] ?? 0;
      const value = Number.isFinite(raw) ? raw : 0;
      const neuron = this.brain.sensorKeyToNeuron[def.key];
      const current = def.gain * value;
      network.stimulate(neuron, current);
      return { key: def.key, neuron, value, current };
    });
    return this.lastReadings;
  }
}

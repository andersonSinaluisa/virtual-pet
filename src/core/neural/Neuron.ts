/*
 * NEURONA LIF (Leaky Integrate-and-Fire)
 * --------------------------------------
 * Modelo muy simplificado de una neurona biológica:
 *
 * - potential (potencial de membrana): la "carga" acumulada.
 * - Integrate: cada tick suma la corriente que le llega (input).
 * - Leak (fuga): antes de sumar, el potencial se multiplica por `leak` (<1),
 *   así que la carga se escapa con el tiempo.
 * - threshold (umbral): si el potencial lo alcanza, la neurona dispara.
 * - Fire / spike: evento binario (sí/no). La intensidad de un estímulo se
 *   codifica en la FRECUENCIA de spikes.
 * - Reset: tras disparar, el potencial vuelve a 0.
 *
 * El potencial puede quedar negativo si recibe inhibición; la fuga lo
 * devuelve poco a poco hacia 0.
 */
export type NeuronId = number;

export interface NeuronParams {
  potential?: number;
  threshold?: number;
  leak?: number;
}

export interface NeuronState {
  potential: number;
  lastSpikeTick: number;
  spikeCount: number;
}

export class Neuron {
  readonly id: NeuronId;
  potential: number;
  threshold: number;
  leak: number;
  spiked = false;

  // Para inspección (y para futuras reglas de plasticidad como STDP).
  lastInput = 0;
  prevPotential = 0; // potencial al empezar el tick (antes de la fuga)
  peakPotential = 0; // potencial tras integrar (antes del reset)
  lastSpikeTick = -1;
  spikeCount = 0;

  constructor(id: NeuronId, { potential = 0, threshold = 1, leak = 0.9 }: NeuronParams = {}) {
    this.id = id;
    this.potential = potential;
    this.threshold = threshold;
    this.leak = leak;
  }

  update(input: number, tick: number): boolean {
    this.lastInput = input;
    this.prevPotential = this.potential;

    this.potential *= this.leak; // 1. fuga
    this.potential += input; // 2. integración

    this.peakPotential = this.potential;
    this.spiked = this.potential >= this.threshold; // 3. ¿supera el umbral?

    if (this.spiked) {
      // 4. spike
      this.potential = 0; // 5. reset
      this.lastSpikeTick = tick;
      this.spikeCount++;
    }
    return this.spiked;
  }

  reset(): void {
    this.potential = 0;
    this.spiked = false;
    this.lastInput = 0;
    this.prevPotential = 0;
    this.peakPotential = 0;
    this.lastSpikeTick = -1;
    this.spikeCount = 0;
  }

  exportState(): NeuronState {
    return { potential: this.potential, lastSpikeTick: this.lastSpikeTick, spikeCount: this.spikeCount };
  }

  importState(s: NeuronState): void {
    this.potential = Number.isFinite(s.potential) ? s.potential : 0;
    this.lastSpikeTick = Number.isFinite(s.lastSpikeTick) ? s.lastSpikeTick : -1;
    this.spikeCount = Number.isFinite(s.spikeCount) ? s.spikeCount : 0;
  }
}

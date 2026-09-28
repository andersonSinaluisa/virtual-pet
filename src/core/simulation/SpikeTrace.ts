/*
 * SPIKE TRACE
 * -----------
 * Memoria corta de los últimos N ticks de la red: quién disparó y QUÉ
 * corriente llegó a cada neurona (sinapsis de origen o corriente externa de
 * sensores). Es la base del Brain View: las explicaciones se reconstruyen
 * desde aquí, nunca se inventan.
 *
 * Una neurona LIF integra en el tiempo: un spike puede deberse a entradas de
 * varios ticks anteriores (suma temporal). `contributions()` las recupera con
 * el factor de fuga λ^k desde el último reset de la neurona.
 */
import type { Arrival, Network } from '../neural/Network';
import type { NeuronId } from '../neural/Neuron';

export interface TraceEntry {
  tick: number;
  spiked: NeuronId[];
  // Toda neurona que recibió corriente sináptica en ese tick (disperso)
  arrivals: Record<NeuronId, Arrival[]>;
  external: Record<NeuronId, number>;
}

export interface Contribution {
  from: NeuronId;
  weight: number; // peso de la sinapsis
  effective: number; // peso × λ^k (lo que quedaba de esa entrada al disparar)
  ticksAgo: number;
}

export class SpikeTrace {
  private entries: TraceEntry[] = [];

  constructor(readonly capacity: number) {}

  record(network: Network, spiked: readonly NeuronId[]): void {
    const arrivals: Record<NeuronId, Arrival[]> = {};
    const external: Record<NeuronId, number> = {};
    network.lastArrivals.forEach((list, id) => { if (list.length) arrivals[id] = [...list]; });
    network.lastExternal.forEach((v, id) => { if (v) external[id] = v; });
    this.entries.push({ tick: network.tickCount, spiked: [...spiked], arrivals, external });
    if (this.entries.length > this.capacity) this.entries.shift();
  }

  clear(): void {
    this.entries = [];
  }

  all(): readonly TraceEntry[] {
    return this.entries;
  }

  at(tick: number): TraceEntry | undefined {
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i].tick === tick) return this.entries[i];
    return undefined;
  }

  // Entradas sinápticas que sumaron al spike de `id` en `tick` (desde su último reset)
  contributions(id: NeuronId, tick: number, leak: number, maxBack = 8): Contribution[] {
    const out: Contribution[] = [];
    for (let k = 0; k <= maxBack; k++) {
      const e = this.at(tick - k);
      if (!e) break;
      if (k > 0 && e.spiked.includes(id)) break; // se reseteó: lo anterior no cuenta
      const factor = Math.pow(leak, k);
      for (const a of e.arrivals[id] ?? []) out.push({ from: a.from, weight: a.weight, effective: a.weight * factor, ticksAgo: k });
    }
    return out;
  }

  // Spikes por tick de una neurona en la ventana (0..1)
  rate(id: NeuronId, window: number): number {
    const slice = this.entries.slice(-window);
    if (!slice.length) return 0;
    return slice.reduce((n, e) => n + (e.spiked.includes(id) ? 1 : 0), 0) / slice.length;
  }

  // Spikes totales de la red por tick en la ventana
  totalRate(window: number): number {
    const slice = this.entries.slice(-window);
    if (!slice.length) return 0;
    return slice.reduce((n, e) => n + e.spiked.length, 0) / slice.length;
  }
}

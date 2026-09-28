/*
 * TELEMETRÍA LOCAL DE INVESTIGACIÓN (solo desarrollo; nunca sale del dispositivo)
 * Se calcula bajo demanda a partir del estado real: la traza de spikes, los
 * potenciales, los pesos plásticos y el registro de aprendizaje.
 */
import type { GameSession } from '../session/GameSession';

export interface ResearchTelemetry {
  window: number; // ticks analizados
  spikeRate: { sensors: number; circuits: number; outputs: number }; // spikes/neurona/tick
  topOutputs: { action: string; rate: number }[];
  avgPotential: { sensors: number; circuits: number; outputs: number };
  weightHistogram: { from: number; to: number; count: number }[]; // pesos plásticos
  deltaHistogram: { from: number; to: number; count: number }[]; // Δ de por vida
  rewardHistogram: number[]; // −1..1 en 10 cubetas
  plasticCount: number;
  changedCount: number;
  meanAbsDelta: number;
}

function histogram(values: number[], lo: number, hi: number, bins: number) {
  const out = Array.from({ length: bins }, (_, i) => ({ from: lo + ((hi - lo) * i) / bins, to: lo + ((hi - lo) * (i + 1)) / bins, count: 0 }));
  for (const v of values) out[Math.max(0, Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins)))].count++;
  return out;
}

export function computeTelemetry(s: GameSession, window = 90): ResearchTelemetry {
  const b = s.sim.brain, entries = s.sim.trace.all().slice(-window);
  const n = Math.max(1, entries.length);
  const layerRate = (ids: number[]) => entries.reduce((acc, e) => acc + e.spiked.filter((id) => ids.includes(id)).length, 0) / (n * ids.length);
  const sensors = b.sensorLayer.map((x) => x.id), circuits = b.circuitLayer.map((x) => x.id), outputs = b.outputLayer.map((x) => x.id);
  const avg = (ids: number[]) => ids.reduce((acc, id) => acc + b.network.neurons[id].potential, 0) / ids.length;
  const deltas = s.plasticity.entries.map((e) => e.synapse.lifetimeDelta);
  return {
    window: entries.length,
    spikeRate: { sensors: layerRate(sensors), circuits: layerRate(circuits), outputs: layerRate(outputs) },
    topOutputs: outputs.map((id) => ({ action: b.outputNeuronToAction[id], rate: s.sim.trace.rate(id, window) }))
      .sort((x, y) => y.rate - x.rate).slice(0, 6),
    avgPotential: { sensors: avg(sensors), circuits: avg(circuits), outputs: avg(outputs) },
    weightHistogram: histogram(s.plasticity.entries.map((e) => e.synapse.weight), -0.4, 1.2, 8),
    deltaHistogram: histogram(deltas, -0.4, 0.4, 8),
    rewardHistogram: [...s.plasticity.rewardHistogram],
    plasticCount: deltas.length,
    changedCount: deltas.filter((d) => Math.abs(d) > 1e-6).length,
    meanAbsDelta: deltas.reduce((acc, d) => acc + Math.abs(d), 0) / Math.max(1, deltas.length),
  };
}

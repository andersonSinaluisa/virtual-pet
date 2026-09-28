/*
 * BRAIN AUDIT
 * -----------
 * Revisión estática de la red: ¿cada acción tiene neurona? ¿puede llegar
 * a disparar con estos pesos? ¿cada sensor alimenta algún circuito?
 *
 * Criterio de alcanzabilidad de una neurona (threshold θ, leak λ):
 *   - "directa": algún peso entrante ≥ θ → un solo spike basta.
 *   - "por suma": los pesos positivos, sumados, alcanzan θ.
 *   - "temporal": el peso mayor llega a θ con dos spikes seguidos (w + w·λ ≥ θ).
 *   - "débil": necesita ráfagas largas y sostenidas; casi nunca ocurre.
 *   - "imposible": no tiene entradas positivas desde neuronas alcanzables.
 */
import type { NeuronId } from '../neural/Neuron';
import { ACTION_LIST, type Action } from './Actions';
import type { Brain } from './Brain';

export type ReachLevel = 'directa' | 'por suma' | 'temporal' | 'débil' | 'imposible';

interface Reach {
  level: ReachLevel;
  sum: number;
  max: number;
  sources: number;
}

export interface AuditReport {
  actions: ({ id: NeuronId; action: Action } & Reach)[];
  circuits: ({ id: NeuronId; key: string; outputs: number } & Reach)[];
  sensors: { id: NeuronId; key: string; connections: number; fires: boolean }[];
  excitatory: number;
  inhibitory: number;
  zero: number;
  problems: string[];
}

export function auditBrain(brain: Brain): AuditReport {
  const config = brain.config;
  const net = brain.network;
  const theta = config.neuron.threshold;
  const lambda = config.neuron.leak;
  const report: AuditReport = { actions: [], circuits: [], sensors: [], excitatory: 0, inhibitory: 0, zero: 0, problems: [] };

  for (const s of net.synapses) {
    if (s.weight > 0) report.excitatory++;
    else if (s.weight < 0) report.inhibitory++;
    else report.zero++;
  }

  const reach = (id: NeuronId, reachable: Set<NeuronId>): Reach => {
    const pos = net.incoming(id).filter((s) => s.weight > 0 && reachable.has(s.fromNeuron));
    const sum = pos.reduce((a, s) => a + s.weight, 0);
    const max = pos.reduce((a, s) => Math.max(a, s.weight), 0);
    const level: ReachLevel = !pos.length ? 'imposible' : max >= theta ? 'directa' : sum >= theta ? 'por suma'
      : max * (1 + lambda) >= theta ? 'temporal' : 'débil';
    return { level, sum, max, sources: pos.length };
  };

  // Sensores: alcanzables si gain/(1−λ) ≥ θ (corriente máxima sostenida)
  const reachable = new Set<NeuronId>();
  brain.sensorLayer.forEach((n, i) => {
    const def = config.sensors[i];
    const out = net.outgoing(n.id).filter((s) => s.weight !== 0).length;
    const ok = def.gain / (1 - lambda) >= theta;
    if (ok) reachable.add(n.id);
    report.sensors.push({ id: n.id, key: def.key, connections: out, fires: ok });
    if (!out) report.problems.push(`Sensor ${def.key} (N${n.id}) no está conectado a ningún circuito`);
    if (!ok) report.problems.push(`Sensor ${def.key} (N${n.id}) nunca dispara: gain demasiado bajo`);
  });

  brain.circuitLayer.forEach((n, i) => {
    const r = reach(n.id, reachable);
    if (r.level !== 'imposible') reachable.add(n.id);
    const out = net.outgoing(n.id).filter((s) => s.weight > 0).length;
    report.circuits.push({ id: n.id, key: config.circuits[i].key, ...r, outputs: out });
    if (r.level === 'imposible') report.problems.push(`Circuito ${config.circuits[i].key} (N${n.id}) no puede disparar`);
    if (!out) report.problems.push(`Circuito ${config.circuits[i].key} (N${n.id}) no excita ninguna acción`);
  });

  brain.outputLayer.forEach((n) => {
    const action = brain.outputNeuronToAction[n.id];
    const r = reach(n.id, reachable);
    report.actions.push({ id: n.id, action, ...r });
    if (r.level === 'imposible') report.problems.push(`${action} (N${n.id}) es imposible de alcanzar`);
    if (r.level === 'débil') report.problems.push(`${action} (N${n.id}) casi no puede disparar (suma de pesos positivos ${r.sum.toFixed(2)})`);
  });

  ACTION_LIST.filter((a) => brain.actionToOutputNeuron[a] === undefined)
    .forEach((a) => report.problems.push(`${a} no tiene neurona de salida`));
  if (!report.excitatory) report.problems.push('No hay sinapsis excitatorias');
  if (!report.inhibitory) report.problems.push('No hay sinapsis inhibitorias');
  return report;
}

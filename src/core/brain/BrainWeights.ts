/*
 * Utilidades para leer/escribir pesos por nombre (preparado para plasticidad).
 * Los pesos se serializan SIEMPRE por nombre (sensor/circuito/acción), nunca
 * por ID de neurona: así un save sobrevive a cambios de topología.
 */
import { ACTION_LIST, isAction } from './Actions';
import {
  CIRCUIT_KEYS,
  SENSOR_KEYS,
  type BrainConfig,
  type BrainWeightsData,
  type CircuitKey,
  type SensorKey,
  getCircuitWeight,
  getSensorWeight,
  setCircuitWeight,
  setSensorWeight,
} from './BrainConfig';

export type WeightLayer = 'sensorToCircuit' | 'circuitToAction';

// Matriz densa [filas][columnas] para connectLayers().
export function denseWeights(config: BrainConfig, layer: WeightLayer): number[][] {
  if (layer === 'sensorToCircuit') {
    return config.sensors.map((s) => config.circuits.map((c) => getSensorWeight(config, s.key, c.key)));
  }
  return config.circuits.map((c) => ACTION_LIST.map((a) => getCircuitWeight(config, c.key, a)));
}

export function exportWeights(config: BrainWeightsData): BrainWeightsData {
  return JSON.parse(JSON.stringify({ sensorToCircuit: config.sensorToCircuit, circuitToAction: config.circuitToAction })) as BrainWeightsData;
}

const isSensorKey = (k: string): k is SensorKey => (SENSOR_KEYS as readonly string[]).includes(k);
const isCircuitKey = (k: string): k is CircuitKey => (CIRCUIT_KEYS as readonly string[]).includes(k);

export interface WeightImportReport {
  applied: number;
  ignored: string[]; // claves desconocidas o valores inválidos (no se aplican)
}

/*
 * Aplica pesos guardados sobre un genoma. Las claves desconocidas o los valores
 * no finitos se ignoran (y se informan); las conexiones que el save no conoce
 * (p. ej. un sensor nuevo) conservan el valor del genoma actual.
 */
export function importWeights(config: BrainConfig, data: unknown): WeightImportReport {
  const report: WeightImportReport = { applied: 0, ignored: [] };
  if (!data || typeof data !== 'object') throw new Error('Pesos inválidos: se esperaba un objeto');
  const { sensorToCircuit, circuitToAction } = data as Record<string, unknown>;
  if (!sensorToCircuit || !circuitToAction || typeof sensorToCircuit !== 'object' || typeof circuitToAction !== 'object') {
    throw new Error('Faltan sensorToCircuit o circuitToAction');
  }
  for (const [from, row] of Object.entries(sensorToCircuit as Record<string, unknown>)) {
    if (!isSensorKey(from) || !row || typeof row !== 'object') { report.ignored.push(`sensor:${from}`); continue; }
    // El save es la verdad para las filas que conoce: se borra la fila y se reescribe
    config.sensorToCircuit[from] = {};
    for (const [to, w] of Object.entries(row as Record<string, unknown>)) {
      if (!isCircuitKey(to) || typeof w !== 'number' || !Number.isFinite(w)) { report.ignored.push(`${from}→${to}`); continue; }
      setSensorWeight(config, from, to, w);
      report.applied++;
    }
  }
  for (const [from, row] of Object.entries(circuitToAction as Record<string, unknown>)) {
    if (!isCircuitKey(from) || !row || typeof row !== 'object') { report.ignored.push(`circuit:${from}`); continue; }
    config.circuitToAction[from] = {};
    for (const [to, w] of Object.entries(row as Record<string, unknown>)) {
      if (!isAction(to) || typeof w !== 'number' || !Number.isFinite(w)) { report.ignored.push(`${from}→${to}`); continue; }
      setCircuitWeight(config, from, to, w);
      report.applied++;
    }
  }
  return report;
}

/*
 * "¿POR QUÉ HIZO ESO?" — explicación simple a partir de un DecisionTrace real.
 *
 *   Milo vio la pelota. → Su curiosidad se activó. → Decidió acercarse. → Empezó a jugar.
 *
 * La frase "ha tenido buenas experiencias con este juguete" SOLO se añade si
 * los datos lo respaldan: historial positivo con ese objeto Y la vía de ese
 * objeto en el cerebro creció realmente por aprendizaje.
 */
import { ACTION_INFO } from '../brain/Actions';
import { CLOCK_SENSORS, OBJECT_CHANNELS } from '../brain/BrainConfig';
import type { Habit } from '../routines/HabitDetector';
import { clockPopulation } from '../time/WorldClock';
import type { LearningEvidence } from '../discovery/DiscoveryEvaluator';
import type { PetMemory } from '../memory/PetMemory';
import { subjectLabel } from '../memory/subjects';
import { circuitEmotion, sensorPhrase } from './CausalChain';
import type { DecisionTrace } from './DecisionTrace';

export const WHY_RULES = { minPositive: 3, minScore: 0.2, minPathwayDelta: 0.02, dark: 0.6, habitConfidence: 0.5, habitWindowMinutes: 90 } as const;

export interface WhyExplanation {
  steps: string[];
  goodHistory: string | null;
  context: string[]; // v5: contexto (oscuridad, hora habitual) SOLO con respaldo
}

export interface WhyRoutineContext {
  habits: readonly Habit[];
}

const RESTING = new Set(['SLEEP', 'REST']);

/*
 * Contexto de descanso: "estaba oscuro" es un hecho percibido. "Suele dormirse a
 * esta hora" solo si (1) el detector ve ese hábito con confianza, (2) ahora está
 * dentro de su franja y (3) la vía hora→descanso de su cerebro creció aprendiendo.
 * Sin las tres, no se insinúa que la hora influyó.
 */
function routineContext(d: DecisionTrace, name: string, learning: LearningEvidence, r: WhyRoutineContext): string[] {
  if (!RESTING.has(d.action)) return [];
  const out: string[] = [];
  const { minuteOfDay, darkness } = d.context;
  if (darkness >= WHY_RULES.dark) out.push('Estaba oscuro.');
  const sleep = r.habits.find((h) => h.type === 'SLEEP_TIME_PATTERN' && h.confidence >= WHY_RULES.habitConfidence);
  if (sleep && sleep.params.meanMinute !== undefined) {
    const diff = Math.abs(minuteOfDay - sleep.params.meanMinute);
    const near = Math.min(diff, 1440 - diff) <= WHY_RULES.habitWindowMinutes;
    const clock = clockPopulation(Math.sin((2 * Math.PI * minuteOfDay) / 1440), Math.cos((2 * Math.PI * minuteOfDay) / 1440));
    const top = CLOCK_SENSORS.map((k, i) => ({ k, v: clock[i] })).sort((a, b) => b.v - a.v)[0];
    const learned = learning.synapseDelta?.(`${top.k}→restCircuit`) ?? 0;
    if (near && learned >= WHY_RULES.minPathwayDelta) out.push(`Es la hora a la que ${name} suele dormirse, y su cerebro ha reforzado esa costumbre.`);
  }
  return out;
}

export function explainWhy(d: DecisionTrace, name: string, memory: PetMemory, learning: LearningEvidence, routine?: WhyRoutineContext): WhyExplanation {
  const steps: string[] = [];
  const sensor = d.chain.sensors[0];
  if (sensor) steps.push(`${name} ${sensorPhrase(sensor.key).charAt(0).toLowerCase()}${sensorPhrase(sensor.key).slice(1)}.`);
  const circuit = d.chain.circuits[0];
  if (circuit) steps.push(`Se activó: ${circuitEmotion(circuit.key).toLowerCase()}.`);
  steps.push(`Decidió: ${ACTION_INFO[d.action].phrase}.`);

  let goodHistory: string | null = null;
  const ch = OBJECT_CHANNELS.find((c) => c.kind === d.subject);
  if (ch && d.subject) {
    const pref = memory.preference(d.subject);
    const grew = learning.pathwayDelta(ch.sensor) >= WHY_RULES.minPathwayDelta;
    if (pref && pref.positive >= WHY_RULES.minPositive && pref.score >= WHY_RULES.minScore && grew) {
      goodHistory = `${name} ha tenido buenas experiencias anteriores con ${subjectLabel(d.subject)}.`;
    }
  }
  return { steps, goodHistory, context: routine ? routineContext(d, name, learning, routine) : [] };
}

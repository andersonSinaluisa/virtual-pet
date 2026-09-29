/*
 * HISTORIA DEL CRECIMIENTO (texto a partir de datos reales).
 *
 * - Hitos: solo los que ocurrieron (GrowthSystem los registra en el momento).
 * - Recuerdos para "¿Recuerdas?": momentos reales, priorizando los clave.
 * - "Antes / Ahora": valencia media por sujeto en la etapa anterior frente a
 *   la actual, con evidencia mínima en ambas. Si no hay datos, no se dice nada.
 */
import { subjectLabel } from '../memory/subjects';
import type { Experience, Moment, SubjectKey } from '../memory/types';
import type { SpeciesKey } from '../persistence/SaveGame';
import type { GrowthMilestone, MilestoneType, StageSubjects, SubjectSummary } from './GrowthSystem';
import { stageLabel, type LifeStage } from './LifeStage';

const MILESTONE_TEXT: Record<MilestoneType, (name: string, subject: string | null, species: SpeciesKey) => string> = {
  ARRIVED: (n) => `${n} llegó a casa.`,
  FIRST_PLAY: (n, s) => `${n} jugó ${s ? `con ${subjectLabel(s as SubjectKey)}` : ''} por primera vez.`.replace('  ', ' '),
  FIRST_SLEEP_ALONE: (n) => `${n} durmió solo en su camita por primera vez.`,
  FIRST_DISCOVERY: () => 'Descubriste algo nuevo sobre cómo es.',
  FIRST_LEARNED_ASSOCIATION: (n) => `${n} aprendió su primera asociación.`,
  FIRST_HABIT: (n) => `${n} desarrolló su primera costumbre.`,
  FIRST_EXPLORE: (n) => `${n} exploró la habitación por primera vez.`,
  FIRST_FETCH: (n) => `${n} te trajo la pelota por primera vez.`,
  GREW: (n, s, species) => `${n} creció: ahora es ${s ? stageLabel(s as LifeStage, species).toLowerCase() : 'más grande'}.`,
  FIRST_OUTING: (n) => `${n} salió al jardín por primera vez.`,
  FIRST_PARK: (n) => `${n} conoció el parque.`,
};

export const MILESTONE_EMOJI: Record<MilestoneType, string> = {
  ARRIVED: '🏠', FIRST_PLAY: '⚽', FIRST_SLEEP_ALONE: '🌙', FIRST_DISCOVERY: '✨', FIRST_LEARNED_ASSOCIATION: '🧠',
  FIRST_HABIT: '🕰️', FIRST_EXPLORE: '🧭', FIRST_FETCH: '🎾', GREW: '🌱', FIRST_OUTING: '🌿', FIRST_PARK: '🌳',
};

export function milestoneText(m: GrowthMilestone, name: string, species: SpeciesKey): string {
  return MILESTONE_TEXT[m.type](name, m.subject, species);
}

// 2–3 recuerdos reales para la celebración: primero los clave y favoritos, repartidos en el tiempo
// `stage`: se prefieren los recuerdos de la etapa que termina (cada crecimiento cuenta SU historia)
export function recapMoments(moments: readonly Moment[], max = 3, stage?: LifeStage): Moment[] {
  const pool = moments.filter((m) => m.kind !== 'captured' && m.kind !== 'away' && m.kind !== 'milestone');
  const score = (m: Moment) => (m.favorite ? 3 : 0) + (m.keyMoment ? 2 : 0) + (m.kind === 'first_time' ? 1 : 0) + (stage && m.lifeStage === stage ? 5 : 0);
  const ranked = [...pool].sort((a, b) => score(b) - score(a) || a.createdAt - b.createdAt);
  const out: Moment[] = [];
  for (const m of ranked) {
    if (out.length >= max) break;
    if (!out.some((o) => o.title === m.title)) out.push(m);
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

export interface StageComparison {
  subject: SubjectKey;
  before: string;
  now: string;
  delta: number;
}

const MIN_EVIDENCE = 3;

function mean(xs: readonly Experience[]): number {
  return xs.reduce((s, e) => s + e.valence * Math.max(0.2, e.intensity), 0) / Math.max(1, xs.reduce((s, e) => s + Math.max(0.2, e.intensity), 0));
}

const describe = (v: number, subject: SubjectKey): string => {
  const l = subjectLabel(subject);
  if (v <= -0.25) return `Le daba miedo ${l}.`;
  if (v < 0.1) return `${l.charAt(0).toUpperCase()}${l.slice(1)} no le llamaba mucho la atención.`;
  if (v < 0.4) return `Le gustaba un poco ${l}.`;
  return `Le encantaba ${l}.`;
};

const describeNow = (v: number, subject: SubjectKey): string => {
  const l = subjectLabel(subject);
  if (v <= -0.25) return `Ahora le cuesta acercarse a ${l}.`.replace(' a el ', ' al ');
  if (v < 0.1) return `Ahora ${l} le da un poco igual.`;
  if (v < 0.4) return `Ahora suele acercarse a ${l}.`.replace(' a el ', ' al ');
  return `Ahora ${l} es de lo primero que busca.`;
};

// Cambios reales de relación con cada sujeto entre dos grupos de experiencias (los más grandes primero)
export function compareGroups(early: readonly Experience[], late: readonly Experience[], max = 2): StageComparison[] {
  const by = new Map<SubjectKey, { a: Experience[]; b: Experience[] }>();
  const add = (e: Experience, side: 'a' | 'b') => {
    if (!e.subject || e.subject === 'player') return;
    const slot = by.get(e.subject) ?? { a: [], b: [] };
    slot[side].push(e);
    by.set(e.subject, slot);
  };
  early.forEach((e) => add(e, 'a'));
  late.forEach((e) => add(e, 'b'));
  const out: StageComparison[] = [];
  for (const [subject, { a, b }] of by) {
    if (a.length < MIN_EVIDENCE || b.length < MIN_EVIDENCE) continue;
    const va = mean(a), vb = mean(b);
    if (Math.abs(vb - va) < 0.25) continue;
    out.push({ subject, before: describe(va, subject), now: describeNow(vb, subject), delta: vb - va });
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, max);
}

// "Cuando era bebé…" a partir de los resúmenes por etapa (no dependen del registro acotado)
export function compareSummaries(before: Record<string, SubjectSummary> | undefined, now: Record<string, SubjectSummary> | undefined, max = 2): StageComparison[] {
  const out: StageComparison[] = [];
  for (const [subject, a] of Object.entries(before ?? {})) {
    const b = now?.[subject];
    if (!b || a.n < MIN_EVIDENCE || b.n < MIN_EVIDENCE) continue;
    const va = a.sum / a.weight, vb = b.sum / b.weight;
    if (Math.abs(vb - va) < 0.25) continue;
    out.push({ subject: subject as SubjectKey, before: describe(va, subject as SubjectKey), now: describeNow(vb, subject as SubjectKey), delta: vb - va });
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, max);
}

// "Cuando era bebé…" frente a la etapa actual
export function compareStages(subjects: StageSubjects, before: LifeStage, now: LifeStage, max = 2): StageComparison[] {
  return compareSummaries(subjects[before], subjects[now], max);
}

// Al terminar una etapa: su primera mitad frente a la segunda (lo que cambió mientras la vivía)
export function compareWithinStage(experiences: readonly Experience[], stage: LifeStage, max = 2): StageComparison[] {
  const xs = experiences.filter((e) => e.lifeStage === stage).sort((a, b) => a.at - b.at);
  const half = Math.floor(xs.length / 2);
  return compareGroups(xs.slice(0, half), xs.slice(half), max);
}

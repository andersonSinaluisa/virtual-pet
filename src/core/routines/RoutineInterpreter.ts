/*
 * ROUTINE INTERPRETER — de hábitos detectados a descripciones amables.
 *
 * Una rutina es una DESCRIPCIÓN de patrones observados, nunca un script.
 * No usa horas exactas ("a las 22:03"): con evidencia fuerte y poca
 * dispersión dice "alrededor de las 10 de la noche"; si no, "por la noche".
 */
import { subjectLabel } from '../memory/subjects';
import type { HabitSnapshot, HabitSnapshotEntry, SubjectKey } from '../memory/types';
import { areaLabel } from './areas';
import type { Habit, HabitType } from './HabitDetector';

export const ROUTINE_TEXT_RULES = {
  showConfidence: 0.5, // "parece aparecer un patrón"
  preciseConfidence: 0.75, // se atreve a dar una hora aproximada
  preciseSpread: 75, // minutos de dispersión como máximo para dar hora
  discoveryConfidence: 0.55, // un descubrimiento ("nuevo hábito") pide algo más que mostrar la tarjeta
} as const;

export interface RoutineCard {
  id: 'night' | 'morning' | 'return' | 'object';
  emoji: string;
  title: string;
  lines: string[];
  days: number;
  confidence: number;
}

export function periodOf(minute: number): string {
  const h = minute / 60;
  if (h >= 5 && h < 12) return 'por la mañana';
  if (h >= 12 && h < 17) return 'por la tarde';
  if (h >= 17 && h < 21) return 'al atardecer';
  return 'por la noche';
}

// "alrededor de las 10 de la noche" (redondeado a la hora; nunca minutos exactos)
export function approxHour(minute: number): string {
  let h = Math.round(minute / 60) % 24;
  const part = h >= 5 && h < 12 ? 'de la mañana' : h >= 12 && h < 20 ? 'de la tarde' : 'de la noche';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (h === 0) return 'alrededor de la medianoche';
  if (h === 12) return 'alrededor del mediodía';
  h = h12;
  return `alrededor de ${h === 1 ? 'la 1' : `las ${h}`} ${part}`;
}

const get = (hs: readonly Habit[], t: HabitType) => hs.find((h) => h.type === t && h.confidence >= ROUTINE_TEXT_RULES.showConfidence);

export function interpretRoutines(habits: readonly Habit[], name: string): RoutineCard[] {
  const cards: RoutineCard[] = [];
  const sleep = get(habits, 'SLEEP_TIME_PATTERN');
  const place = get(habits, 'FAVORITE_SLEEP_LOCATION');
  const wind = get(habits, 'BEDTIME_WIND_DOWN');
  if (sleep) {
    const m = sleep.params.meanMinute ?? 0;
    const precise = sleep.confidence >= ROUTINE_TEXT_RULES.preciseConfidence && (sleep.params.spreadMinutes ?? 999) <= ROUTINE_TEXT_RULES.preciseSpread;
    const lines = [precise ? `Últimamente ${name} suele dormirse ${approxHour(m)}.` : `${name} suele prepararse para dormir ${periodOf(m)}.`];
    if (wind) lines.push('Antes de dormir baja su actividad.');
    if (place?.params.area) lines.push(`Suele dormir ${areaLabel(place.params.area)}.`);
    cards.push({ id: 'night', emoji: '🌙', title: 'Antes de dormir', lines, days: sleep.days, confidence: sleep.confidence });
  }
  const wake = get(habits, 'POST_WAKE_PLAY');
  const morning = get(habits, 'MORNING_EXPLORATION');
  if (wake || morning) {
    const lines: string[] = [];
    if (morning) lines.push(`Últimamente le gusta explorar la habitación por las mañanas.`);
    if (wake) lines.push(`Después de despertar suele ponerse a jugar o a curiosear.`);
    cards.push({ id: 'morning', emoji: '☀️', title: 'Al despertar', lines, days: Math.max(wake?.days ?? 0, morning?.days ?? 0), confidence: Math.max(wake?.confidence ?? 0, morning?.confidence ?? 0) });
  }
  const back = get(habits, 'PLAYER_RETURN_GREETING');
  if (back) cards.push({ id: 'return', emoji: '❤️', title: 'Cuando vuelves', lines: [`Suele acercarse a recibirte.`], days: back.days, confidence: back.confidence });
  const obj = get(habits, 'REPEATED_OBJECT_PLAY');
  if (obj?.params.subject) {
    const when = obj.params.meanMinute !== undefined ? `${periodOf(obj.params.meanMinute).replace(/^por /, 'Por ').replace(/^al /, 'Al ')} ` : '';
    const label = subjectLabel(obj.params.subject as SubjectKey);
    cards.push({ id: 'object', emoji: '⚽', title: 'Su juguete', lines: [`${when || ''}${when ? 'suele' : 'Suele'} buscar ${label} para jugar.`], days: obj.days, confidence: obj.confidence });
  }
  return cards;
}

export function hasClearRoutine(habits: readonly Habit[]): boolean {
  return interpretRoutines(habits, '').length > 0;
}

const isNightish = (minute: number) => minute >= 18 * 60 || minute < 5 * 60;

// Titular del diario (sobre el día y la noche): solo habla de rutina si el patrón de sueño es claro;
// las demás costumbres (juguete, recibirte) aparecen como tarjetas aparte
export function routineHeadline(habits: readonly Habit[], name: string): string {
  const sleep = get(habits, 'SLEEP_TIME_PATTERN');
  if (sleep && isNightish(sleep.params.meanMinute ?? 0)) return `${name} parece haber desarrollado una rutina nocturna.`;
  if (sleep) return `${name} parece dormir a horas parecidas cada día.`;
  return 'Todavía no observamos una rutina clara.';
}

// ---- Instantáneas diarias y evolución (solo cambios que ocurrieron de verdad) ----
export function snapshotEntries(habits: readonly Habit[]): HabitSnapshotEntry[] {
  return habits.map((h) => ({
    type: h.type, confidence: Math.round(h.confidence * 100) / 100,
    key: h.params.area ?? h.params.subject ?? (h.params.meanMinute !== undefined ? periodOf(h.params.meanMinute) : null),
  }));
}

export interface EvolutionEntry {
  petDay: number;
  text: string;
}

const STARTED: Partial<Record<HabitType, (key: string | null) => string>> = {
  SLEEP_TIME_PATTERN: (k) => `Empezó a dormirse sobre todo ${k ?? 'a la misma hora'}.`,
  FAVORITE_SLEEP_LOCATION: (k) => `Empezó a dormir ${areaLabel(k ?? '')}.`,
  BEDTIME_WIND_DOWN: () => 'Empezó a calmarse antes de dormir.',
  POST_WAKE_PLAY: () => 'Empezó a jugar al despertar.',
  PLAYER_RETURN_GREETING: () => 'Empezó a recibirte cuando vuelves.',
  REPEATED_OBJECT_PLAY: (k) => `Empezó a buscar ${k ? subjectLabel(k as SubjectKey) : 'un juguete'} para jugar.`,
  MORNING_EXPLORATION: () => 'Empezó a explorar por las mañanas.',
};

const STOPPED: Partial<Record<HabitType, string>> = {
  SLEEP_TIME_PATTERN: 'Dejó de tener una hora clara para dormir.',
  FAVORITE_SLEEP_LOCATION: 'Dejó de tener un sitio fijo para dormir.',
  BEDTIME_WIND_DOWN: 'Ya no se calma tanto antes de dormir.',
  POST_WAKE_PLAY: 'Ya no juega tanto al despertar.',
  PLAYER_RETURN_GREETING: 'Ya no sale tanto a recibirte.',
  REPEATED_OBJECT_PLAY: 'Ya no busca tanto el mismo juguete.',
  MORNING_EXPLORATION: 'Ya no explora tanto por las mañanas.',
};

// Histéresis: un hábito "empieza" al pasar de showConfidence y solo "se deja" al bajar de stopConfidence
// (si no, un valor que ronda el umbral contaría una historia de idas y venidas que no ocurrió)
export const EVOLUTION_RULES = { stopConfidence: 0.35 } as const;

export function interpretEvolution(snapshots: readonly HabitSnapshot[]): EvolutionEntry[] {
  const out: EvolutionEntry[] = [];
  const active = new Map<string, HabitSnapshotEntry>();
  for (const snap of snapshots) {
    const now = new Map(snap.habits.map((e) => [e.type, e]));
    for (const [type, e] of now) {
      const p = active.get(type);
      if (!p) {
        if (e.confidence < ROUTINE_TEXT_RULES.showConfidence) continue;
        out.push({ petDay: snap.petDay, text: STARTED[type as HabitType]?.(e.key) ?? type });
        active.set(type, e);
      } else if (e.confidence >= ROUTINE_TEXT_RULES.showConfidence && p.key !== e.key) {
        if (type === 'FAVORITE_SLEEP_LOCATION') out.push({ petDay: snap.petDay, text: `Ahora suele dormir ${areaLabel(e.key ?? '')}.` });
        else if (type === 'REPEATED_OBJECT_PLAY') out.push({ petDay: snap.petDay, text: `Ahora prefiere ${e.key ? subjectLabel(e.key as SubjectKey) : 'otro juguete'}.` });
        else if (type === 'SLEEP_TIME_PATTERN') out.push({ petDay: snap.petDay, text: `Ahora suele dormirse ${e.key ?? 'a otra hora'}.` });
        active.set(type, e);
      } else if (e.confidence >= EVOLUTION_RULES.stopConfidence) {
        active.set(type, { ...e, key: p.key && e.confidence < ROUTINE_TEXT_RULES.showConfidence ? p.key : e.key });
      }
    }
    for (const [type] of [...active]) {
      const e = now.get(type);
      if (!e || e.confidence < EVOLUTION_RULES.stopConfidence) {
        out.push({ petDay: snap.petDay, text: STOPPED[type as HabitType] ?? 'Cambió una costumbre.' });
        active.delete(type);
      }
    }
  }
  return out;
}

// Descubrimientos candidatos (los registra el DiscoveryEvaluator solo una vez)
export function routineDiscoveries(habits: readonly Habit[], name: string): { key: string; title: string; text: string; icon: string }[] {
  const out: { key: string; title: string; text: string; icon: string }[] = [];
  const strong = (t: HabitType) => habits.find((h) => h.type === t && h.confidence >= ROUTINE_TEXT_RULES.discoveryConfidence);
  const sleep = strong('SLEEP_TIME_PATTERN');
  if (sleep && isNightish(sleep.params.meanMinute ?? 0)) out.push({ key: 'habit:night', title: 'Nuevo hábito', text: `${name} parece haber desarrollado una rutina nocturna.`, icon: 'moon' });
  if (sleep && strong('BEDTIME_WIND_DOWN')) out.push({ key: 'habit:bedtime', title: 'Nuevo hábito', text: `Antes de dormir, ${name} se va calmando.`, icon: 'moon' });
  const place = strong('FAVORITE_SLEEP_LOCATION');
  if (place?.params.area) out.push({ key: `habit:sleep-area:${place.params.area}`, title: 'Nuevo hábito', text: `Últimamente ${name} busca dormir ${areaLabel(place.params.area)}.`, icon: 'moon' });
  if (strong('MORNING_EXPLORATION')) out.push({ key: 'habit:morning', title: 'Algo está cambiando', text: `${name} está empezando a explorar más durante las mañanas.`, icon: 'sun' });
  if (strong('PLAYER_RETURN_GREETING')) out.push({ key: 'habit:return', title: 'Nuevo hábito', text: `${name} suele venir a recibirte.`, icon: 'heart' });
  return out;
}

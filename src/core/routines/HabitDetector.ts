/*
 * HABIT DETECTOR — interpreta, NO decide.
 *
 *   episodios reales (sueño, juego, exploración, regresos del jugador)
 *                 ↓
 *   patrones con evidencia, consistencia, recencia y días distintos
 *                 ↓
 *   Habit { type, confidence, evidenceCount, days, params }
 *
 * La SNN nunca consulta estos hábitos. Aquí no hay textos (los pone el
 * RoutineInterpreter). La evidencia se pondera por RECENCIA (vida media en
 * días) para que un hábito pueda cambiar (habit drift) en lugar de quedar
 * fijado por lo que pasó hace mucho. Los episodios offline (simulación
 * comprimida mientras no estabas) no cuentan como evidencia.
 */
import type { EpisodeRecord } from '../memory/types';

export const HABIT_TYPES = [
  'SLEEP_TIME_PATTERN', 'FAVORITE_SLEEP_LOCATION', 'BEDTIME_WIND_DOWN', 'POST_WAKE_PLAY',
  'PLAYER_RETURN_GREETING', 'REPEATED_OBJECT_PLAY', 'MORNING_EXPLORATION',
] as const;
export type HabitType = (typeof HABIT_TYPES)[number];

export interface Habit {
  id: string;
  type: HabitType;
  confidence: number; // 0..1: 0.2 "no sabemos", 0.5 "aparece un patrón", 0.8 "bastante consistente"
  evidenceCount: number; // episodios en la ventana
  days: number; // días distintos con evidencia
  firstObservedAt: number;
  lastObservedAt: number;
  params: { meanMinute?: number; spreadMinutes?: number; area?: string; subject?: string; share?: number };
}

export const HABIT_RULES = {
  windowDays: 21, // solo se mira el último tramo
  halfLifeDays: 5, // peso de un episodio de hace 5 días = 0.5
  minEvidence: 6,
  minDays: 3,
  reportConfidence: 0.35, // por debajo no se informa
  minShare: 0.5, // proporción mínima para "lugar/objeto favorito"
  windDownActivity: 0.25, // actividad reciente baja antes de dormir
  postWakeWindowMs: 2 * 3600_000, // "después de despertar"
  morningFrom: 6 * 60, morningTo: 12 * 60,
  mainSleepMinMs: 90 * 60_000, // el sueño principal del día dura al menos hora y media
} as const;

const DAY_MS = 86_400_000;
const TAU = Math.PI * 2;

interface Weighted<T> { item: T; w: number }

function weighted<T extends EpisodeRecord>(eps: readonly T[], now: number): Weighted<T>[] {
  return eps
    .filter((e) => !e.offline && now - e.start <= HABIT_RULES.windowDays * DAY_MS)
    .map((e) => ({ item: e, w: Math.pow(0.5, (now - e.start) / (HABIT_RULES.halfLifeDays * DAY_MS)) }));
}

// Media circular ponderada de minutos del día: 23:50 y 00:10 están juntos
export function circularStats(xs: Weighted<{ minuteOfDay: number }>[]): { mean: number; r: number; spread: number } {
  let s = 0, c = 0, wsum = 0;
  for (const { item, w } of xs) { const a = (TAU * item.minuteOfDay) / 1440; s += w * Math.sin(a); c += w * Math.cos(a); wsum += w; }
  if (!wsum) return { mean: 0, r: 0, spread: 720 };
  const r = Math.hypot(s, c) / wsum;
  let mean = (Math.atan2(s, c) / TAU) * 1440;
  if (mean < 0) mean += 1440;
  const spread = r > 0 ? (Math.sqrt(-2 * Math.log(Math.max(1e-6, r))) / TAU) * 1440 : 720;
  return { mean, r, spread };
}

// Factor de evidencia: 0 con pocas observaciones, 1 con suficientes
function evidenceFactor(nEff: number, days: number): number {
  if (days < HABIT_RULES.minDays) return 0;
  return Math.min(1, nEff / (HABIT_RULES.minEvidence * 1.5));
}

function base(type: HabitType, list: Weighted<EpisodeRecord>[]): Omit<Habit, 'confidence' | 'params'> {
  const items = list.map((x) => x.item);
  return {
    id: type, type, evidenceCount: items.length, days: new Set(items.map((e) => e.day)).size,
    firstObservedAt: Math.min(...items.map((e) => e.start)), lastObservedAt: Math.max(...items.map((e) => e.end)),
  };
}

function topShare<T extends EpisodeRecord>(list: Weighted<T>[], key: (e: T) => string | null): { key: string | null; share: number } {
  const acc = new Map<string, number>();
  let total = 0;
  for (const { item, w } of list) { const k = key(item); if (!k) continue; acc.set(k, (acc.get(k) ?? 0) + w); total += w; }
  let best: string | null = null, bw = 0;
  for (const [k, v] of acc) if (v > bw) { bw = v; best = k; }
  return { key: best, share: total ? bw / total : 0 };
}

/*
 * El sueño PRINCIPAL de cada "día de sueño" (de mediodía a mediodía): el episodio más largo.
 * Las siestas no definen a qué hora "se duerme"; así una mascota que duerme de noche y
 * además echa siestas sigue teniendo un horario, y una que duerme a cualquier hora no.
 */
export function mainSleeps(episodes: readonly EpisodeRecord[]): EpisodeRecord[] {
  const byDay = new Map<number, EpisodeRecord>();
  for (const e of episodes) {
    if (e.kind !== 'sleep' || e.end - e.start < HABIT_RULES.mainSleepMinMs) continue;
    const sleepDay = e.minuteOfDay < 720 ? e.day - 1 : e.day;
    const cur = byDay.get(sleepDay);
    if (!cur || e.end - e.start > cur.end - cur.start) byDay.set(sleepDay, e);
  }
  return [...byDay.values()].sort((a, b) => a.start - b.start);
}

export function detectHabits(episodes: readonly EpisodeRecord[], now: number): Habit[] {
  const out: Habit[] = [];
  const of = (k: EpisodeRecord['kind']) => weighted(episodes.filter((e) => e.kind === k), now);
  const nEff = (l: Weighted<EpisodeRecord>[]) => l.reduce((s, x) => s + x.w, 0);
  const push = (h: Habit) => { if (h.confidence >= HABIT_RULES.reportConfidence && h.evidenceCount >= HABIT_RULES.minEvidence) out.push(h); };

  const sleeps = weighted(mainSleeps(episodes), now);
  if (sleeps.length) {
    const b = base('SLEEP_TIME_PATTERN', sleeps);
    const st = circularStats(sleeps);
    push({ ...b, confidence: st.r * evidenceFactor(nEff(sleeps), b.days), params: { meanMinute: st.mean, spreadMinutes: st.spread } });

    const loc = topShare(sleeps, (e) => e.area);
    if (loc.key && loc.share >= HABIT_RULES.minShare) {
      push({ ...base('FAVORITE_SLEEP_LOCATION', sleeps), confidence: loc.share * evidenceFactor(nEff(sleeps), b.days), params: { area: loc.key, share: loc.share } });
    }

    // Antes de dormir baja la actividad (rutina de "prepararse")
    const calm = sleeps.reduce((s, x) => s + (x.item.activityBefore <= HABIT_RULES.windDownActivity ? x.w : 0), 0) / Math.max(1e-9, nEff(sleeps));
    push({ ...base('BEDTIME_WIND_DOWN', sleeps), confidence: calm * st.r * evidenceFactor(nEff(sleeps), b.days), params: { share: calm } });

    // Después de despertar: ¿juega o explora antes que otra cosa?
    const later = episodes.filter((e) => !e.offline && (e.kind === 'play' || e.kind === 'explore' || e.kind === 'eat' || e.kind === 'rest'));
    let playAfter = 0, wakes = 0;
    for (const { item: s, w } of sleeps) {
      const next = later.find((e) => e.start >= s.end && e.start - s.end <= HABIT_RULES.postWakeWindowMs);
      if (!next) continue;
      wakes += w;
      if (next.kind === 'play' || next.kind === 'explore') playAfter += w;
    }
    if (wakes > 0) push({ ...base('POST_WAKE_PLAY', sleeps), confidence: (playAfter / wakes) * evidenceFactor(wakes, b.days), params: { share: playAfter / wakes } });
  }

  const returns = of('return');
  if (returns.length) {
    const b = base('PLAYER_RETURN_GREETING', returns);
    const share = returns.reduce((s, x) => s + (x.item.responded ? x.w : 0), 0) / Math.max(1e-9, nEff(returns));
    push({ ...b, confidence: share * evidenceFactor(nEff(returns), b.days), params: { share } });
  }

  const plays = of('play');
  if (plays.length) {
    const obj = topShare(plays, (e) => e.subject);
    if (obj.key && obj.share >= HABIT_RULES.minShare) {
      const withObj = plays.filter((x) => x.item.subject === obj.key);
      const st = circularStats(withObj);
      const b = base('REPEATED_OBJECT_PLAY', withObj);
      push({ ...b, confidence: obj.share * evidenceFactor(nEff(withObj), b.days), params: { subject: obj.key, share: obj.share, meanMinute: st.r > 0.5 ? st.mean : undefined, spreadMinutes: st.spread } });
    }
  }

  const explores = of('explore');
  if (explores.length) {
    const m = explores.reduce((s, x) => s + (x.item.minuteOfDay >= HABIT_RULES.morningFrom && x.item.minuteOfDay < HABIT_RULES.morningTo ? x.w : 0), 0) / Math.max(1e-9, nEff(explores));
    const expected = (HABIT_RULES.morningTo - HABIT_RULES.morningFrom) / 1440; // si fuera uniforme
    const b = base('MORNING_EXPLORATION', explores);
    push({ ...b, confidence: Math.max(0, Math.min(1, (m - expected) / (1 - expected))) * evidenceFactor(nEff(explores), b.days), params: { share: m } });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

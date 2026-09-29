/*
 * PET MEMORY: memoria de largo plazo
 * ----------------------------------
 * Guarda experiencias (acotadas), recuerdos, preferencias, descubrimientos
 * y estadísticas de conducta. No decide nada: la SNN sigue decidiendo.
 * Las preferencias son EVIDENCIA acumulada (no una etiqueta).
 */
import type { Action } from '../brain/Actions';
import { ExplorationMemory, emptyExploration } from '../world/ExplorationMemory';
import type {
  BehaviorStats, Discovery, EpisodeRecord, Experience, ExperienceKind, HabitSnapshot, MemoryState, Moment, Preference, SubjectKey,
} from './types';

const MAX_EXPERIENCES = 400;
const MAX_MOMENTS = 300;

// Tipos de experiencia que cuentan como evidencia de gusto/disgusto por el sujeto
const PREFERENCE_KINDS: ReadonlySet<ExperienceKind> = new Set<ExperienceKind>([
  'played', 'picked_up', 'investigated', 'ate', 'petted', 'scared', 'hid', 'choice_made',
  'fetch_chased', 'fetch_returned', 'mystery_opened', 'mystery_avoided', 'called_responded', 'called_ignored', 'greeted',
  'player_rewarded',
]);

export function emptyStats(): BehaviorStats {
  return { actionOnsets: {}, experiencesByKind: {}, scaredBy: {}, firsts: [], onlineTicks: 0, offlineTicks: 0, darkTicks: 0, darkActiveTicks: 0, objectStats: {} };
}

export function emptyMemory(): MemoryState {
  return { experiences: [], moments: [], preferences: {}, discoveries: [], stats: emptyStats(), routine: { episodes: [], snapshots: [] }, exploration: emptyExploration() };
}

const MAX_EPISODES = 4000; // ~2 meses de conducta resumida
const MAX_SNAPSHOTS = 120;

export class PetMemory {
  state: MemoryState;
  // v7: lugares, objetos y sonidos conocidos. Comparte el objeto de estado (se guarda con la memoria)
  exploration: ExplorationMemory;

  constructor(state: MemoryState = emptyMemory()) {
    this.state = state;
    this.exploration = new ExplorationMemory(state.exploration);
    this.state.exploration = this.exploration.state;
  }

  get experiences(): readonly Experience[] { return this.state.experiences; }
  get moments(): readonly Moment[] { return this.state.moments; }
  get discoveries(): readonly Discovery[] { return this.state.discoveries; }
  get stats(): BehaviorStats { return this.state.stats; }

  preference(subject: SubjectKey): Preference | null {
    return this.state.preferences[subject] ?? null;
  }

  preferences(): Preference[] {
    return Object.values(this.state.preferences).filter((p): p is Preference => !!p);
  }

  // Devuelve si es la primera vez de este tipo con este sujeto
  addExperience(exp: Experience): { first: boolean } {
    const s = this.state;
    s.experiences.push(exp);
    if (s.experiences.length > MAX_EXPERIENCES) s.experiences.splice(0, s.experiences.length - MAX_EXPERIENCES);
    s.stats.experiencesByKind[exp.kind] = (s.stats.experiencesByKind[exp.kind] ?? 0) + 1;
    if (exp.kind === 'scared' && exp.subject) s.stats.scaredBy[exp.subject] = (s.stats.scaredBy[exp.subject] ?? 0) + 1;

    const key = `${exp.kind}:${exp.subject ?? '-'}`;
    const first = !s.stats.firsts.includes(key);
    if (first) s.stats.firsts.push(key);

    if (exp.subject && PREFERENCE_KINDS.has(exp.kind)) this.updatePreference(exp);
    if (exp.subject) this.updateObjectStats(exp);
    return { first };
  }

  // Historial por objeto (Behavioral history): datos agregados, no decisiones
  private updateObjectStats(exp: Experience): void {
    const subject = exp.subject;
    if (!subject || subject === 'player' || subject === 'loudSound' || subject === 'darkness') return;
    const o = (this.state.stats.objectStats[subject] ??= { interactions: 0, approaches: 0, plays: 0, picks: 0, avoidances: 0, rewarded: 0 });
    o.interactions++;
    if (exp.kind === 'investigated') o.approaches++;
    else if (exp.kind === 'played' || exp.kind === 'fetch_chased' || exp.kind === 'fetch_returned') o.plays++;
    else if (exp.kind === 'picked_up') o.picks++;
    else if (exp.kind === 'scared' || exp.kind === 'hid' || exp.kind === 'mystery_avoided') o.avoidances++;
    else if (exp.kind === 'player_rewarded') o.rewarded++;
  }

  private updatePreference(exp: Experience): void {
    const subject = exp.subject;
    if (!subject) return;
    const p = (this.state.preferences[subject] ??= { subject, score: 0, total: 0, weight: 0, positive: 0, negative: 0, interactions: 0, lastAt: 0 });
    const w = Math.max(0.05, Math.min(1, exp.intensity));
    p.total += exp.valence * w;
    p.weight += w;
    // +1 en el denominador: con poca evidencia la preferencia se queda cerca de 0
    p.score = p.total / (p.weight + 1);
    if (exp.valence > 0.2) p.positive++;
    else if (exp.valence < -0.2) p.negative++;
    p.interactions++;
    p.lastAt = exp.at;
  }

  countActionOnset(action: Action): void {
    const a = this.state.stats.actionOnsets;
    a[action] = (a[action] ?? 0) + 1;
  }

  // ---- Evidencia de hábitos (v3) ----
  clearRoutine(): void {
    this.state.routine = { episodes: [], snapshots: [] };
  }

  addEpisode(e: EpisodeRecord): void {
    const eps = this.state.routine.episodes;
    eps.push(e);
    if (eps.length > MAX_EPISODES) eps.splice(0, eps.length - MAX_EPISODES);
  }

  addHabitSnapshot(s: HabitSnapshot): void {
    const snaps = this.state.routine.snapshots;
    if (snaps.length && snaps[snaps.length - 1].day === s.day) snaps[snaps.length - 1] = s;
    else snaps.push(s);
    if (snaps.length > MAX_SNAPSHOTS) snaps.splice(0, snaps.length - MAX_SNAPSHOTS);
  }

  get episodes(): readonly EpisodeRecord[] { return this.state.routine.episodes; }
  get habitSnapshots(): readonly HabitSnapshot[] { return this.state.routine.snapshots; }

  addMoment(m: Moment): void {
    this.state.moments.unshift(m);
    if (this.state.moments.length > MAX_MOMENTS) {
      // Nunca se descartan favoritos ni hitos
      const keep = this.state.moments.filter((x, i) => i < MAX_MOMENTS || x.favorite || x.keyMoment);
      this.state.moments = keep;
    }
  }

  moment(id: string): Moment | null {
    return this.state.moments.find((m) => m.id === id) ?? null;
  }

  toggleFavorite(id: string): boolean {
    const m = this.moment(id);
    if (!m) return false;
    m.favorite = !m.favorite;
    return m.favorite;
  }

  hasDiscovery(key: string): boolean {
    return this.state.discoveries.some((d) => d.key === key);
  }

  addDiscovery(d: Discovery): void {
    if (this.hasDiscovery(d.key)) return;
    this.state.discoveries.unshift(d);
  }

  clear(): void {
    this.state = emptyMemory();
    this.exploration.state = this.state.exploration as NonNullable<MemoryState['exploration']>;
  }

  exportState(): MemoryState {
    return JSON.parse(JSON.stringify(this.state)) as MemoryState;
  }
}

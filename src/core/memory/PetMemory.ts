/*
 * PET MEMORY: memoria de largo plazo
 * ----------------------------------
 * Guarda experiencias (acotadas), recuerdos, preferencias, descubrimientos
 * y estadísticas de conducta. No decide nada: la SNN sigue decidiendo.
 * Las preferencias son EVIDENCIA acumulada (no una etiqueta).
 */
import type { Action } from '../brain/Actions';
import type {
  BehaviorStats, Discovery, Experience, ExperienceKind, MemoryState, Moment, Preference, SubjectKey,
} from './types';

const MAX_EXPERIENCES = 400;
const MAX_MOMENTS = 300;

// Tipos de experiencia que cuentan como evidencia de gusto/disgusto por el sujeto
const PREFERENCE_KINDS: ReadonlySet<ExperienceKind> = new Set<ExperienceKind>([
  'played', 'picked_up', 'investigated', 'ate', 'petted', 'scared', 'hid', 'choice_made',
  'fetch_chased', 'fetch_returned', 'mystery_opened', 'mystery_avoided', 'called_responded', 'called_ignored', 'greeted',
]);

export function emptyStats(): BehaviorStats {
  return { actionOnsets: {}, experiencesByKind: {}, scaredBy: {}, firsts: [], onlineTicks: 0, offlineTicks: 0, darkTicks: 0, darkActiveTicks: 0 };
}

export function emptyMemory(): MemoryState {
  return { experiences: [], moments: [], preferences: {}, discoveries: [], stats: emptyStats() };
}

export class PetMemory {
  state: MemoryState;

  constructor(state: MemoryState = emptyMemory()) {
    this.state = state;
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
    return { first };
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
  }

  exportState(): MemoryState {
    return JSON.parse(JSON.stringify(this.state)) as MemoryState;
  }
}

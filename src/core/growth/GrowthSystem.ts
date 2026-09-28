/*
 * GROWTH SYSTEM: edad, desarrollo, capacidades e hitos de UNA mascota.
 *
 *   edad cronológica  = reloj del mundo − bornAt           (pasa sola)
 *   desarrollo        = experiencias significativas vividas (rendimiento decreciente, tope diario)
 *   transición        = edad mínima en la etapa ∧ desarrollo completo → un solo paso
 *
 * Nunca toca el cerebro: GameSession aplica el multiplicador de plasticidad,
 * los moduladores del cuerpo y las capacidades que aquí se DESCRIBEN.
 */
import type { Action } from '../brain/Actions';
import type { ExperienceKind } from '../memory/types';
import { DAY_MS, GROWTH_CONFIG, stageConfig, type StageConfig } from './GrowthConfig';
import { LIFE_STAGES, nextStage, stageIndex, type LifeStage } from './LifeStage';

export const MILESTONE_TYPES = [
  'ARRIVED', 'FIRST_PLAY', 'FIRST_SLEEP_ALONE', 'FIRST_DISCOVERY', 'FIRST_LEARNED_ASSOCIATION',
  'FIRST_HABIT', 'FIRST_EXPLORE', 'FIRST_FETCH', 'GREW',
] as const;
export type MilestoneType = (typeof MILESTONE_TYPES)[number];

export interface GrowthMilestone {
  type: MilestoneType;
  at: number;
  petDay: number;
  lifeStage: LifeStage;
  subject: string | null; // objeto, clave de descubrimiento o etapa alcanzada
  momentId: string | null;
}

export interface DevelopmentState {
  points: number; // en la etapa actual
  repeats: Record<string, number>; // "kind:subject" → repeticiones recientes (decaen por día)
  day: number; // día de mundo de los contadores
  dayPoints: number; // puntos ganados hoy
  awayPoints: number | null; // puntos ganados en la ausencia en curso (null = presente)
  lifetimePoints: number;
}

export interface IndividualModifiers {
  growthRate: number; // × duración mínima (<1 crece antes)
  size: number; // × tamaño visual
  development: number; // × puntos ganados
}

export interface StageRecord { stage: LifeStage; at: number; petDay: number }

// Resumen compacto por sujeto y etapa: sobrevive aunque el registro de experiencias (acotado) rote
export interface SubjectSummary { sum: number; weight: number; n: number }
export type StageSubjects = Partial<Record<LifeStage, Record<string, SubjectSummary>>>;

export interface GrowthState {
  xp: number; // heredado (save ≤ v3); ya no se muestra
  bornAt: number;
  stage: LifeStage;
  stageStartedAt: number;
  development: DevelopmentState;
  modifiers: IndividualModifiers;
  milestones: GrowthMilestone[];
  pending: { to: LifeStage; since: number } | null;
  history: StageRecord[];
  subjects: StageSubjects; // v4: "cuando era bebé…" a largo plazo
}

// Semilla reproducible a partir de la parte ALEATORIA (sembrada) del id: la misma semilla da la
// misma variación, sin depender de la hora de creación (sin genética: solo pequeñas diferencias)
export function individualModifiers(petId: string): IndividualModifiers {
  const id = petId.split('_').pop() ?? petId;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  const next = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  const v = GROWTH_CONFIG.individualVariation;
  const r = () => 1 + (next() * 2 - 1) * v;
  return { growthRate: r(), size: r(), development: r() };
}

export function newGrowthState(id: string, bornAt: number, stage: LifeStage = 'BABY'): GrowthState {
  return {
    xp: 0, bornAt, stage, stageStartedAt: bornAt,
    development: { points: 0, repeats: {}, day: Math.floor(bornAt / DAY_MS), dayPoints: 0, awayPoints: null, lifetimePoints: 0 },
    modifiers: individualModifiers(id), milestones: [], pending: null, history: [{ stage, at: bornAt, petDay: 1 }], subjects: {},
  };
}

export type Eligibility = { eligible: boolean; ageOk: boolean; developmentOk: boolean; to: LifeStage | null };

export class GrowthSystem {
  // Registro (solo diagnóstico) de salidas de la SNN que el cuerpo aún no puede ejecutar
  readonly blockedCounts: Partial<Record<Action, number>> = {};

  constructor(public state: GrowthState) {}

  get stage(): LifeStage { return this.state.stage; }
  get config(): StageConfig { return stageConfig(this.state.stage); }
  get plasticityMultiplier(): number { return getPlasticityMultiplier(this.state.stage); }

  // Progreso de desarrollo de la etapa ∈ [0,1] (interno: la UI nunca lo muestra como número)
  get progress(): number {
    const need = this.config.developmentPoints;
    return Number.isFinite(need) ? Math.min(1, this.state.development.points / need) : 1;
  }

  minDurationMs(stage = this.state.stage): number {
    return stageConfig(stage).minDurationMs * this.state.modifiers.growthRate;
  }

  timeInStage(now: number): number { return Math.max(0, now - this.state.stageStartedAt); }
  ageMs(now: number): number { return Math.max(0, now - this.state.bornAt); }

  // Valor visual continuo: índice de etapa + un avance sutil dentro de la etapa
  visualValue(now: number): number {
    const i = stageIndex(this.state.stage);
    if (!nextStage(this.state.stage)) return i;
    const timeFrac = Math.min(1, this.timeInStage(now) / this.minDurationMs());
    return i + GROWTH_CONFIG.visualWithinStage * Math.min(this.progress, timeFrac);
  }

  // ---- Capacidades: ¿puede FÍSICAMENTE? (la SNN ya decidió si quiere) ----
  gate(action: Action): Action | null {
    const blocked = this.config.blocked;
    if (!(action in blocked)) return action;
    this.blockedCounts[action] = (this.blockedCounts[action] ?? 0) + 1;
    return blocked[action] ?? null;
  }

  canDo(action: Action): boolean { return !(action in this.config.blocked); }

  // ---- Desarrollo ----
  private rollDay(now: number): void {
    const d = this.state.development, day = Math.floor(now / DAY_MS);
    if (day === d.day) return;
    const k = Math.pow(GROWTH_CONFIG.repeatDailyDecay, Math.max(1, day - d.day));
    for (const key of Object.keys(d.repeats)) {
      d.repeats[key] *= k;
      if (d.repeats[key] < 0.05) delete d.repeats[key];
    }
    d.day = day;
    d.dayPoints = 0;
  }

  // Suma desarrollo por algo significativo. Devuelve los puntos efectivos.
  addDevelopment(key: string, base: number, now: number, offline = false): number {
    if (!(base > 0) || !nextStage(this.state.stage)) return 0;
    this.rollDay(now);
    const d = this.state.development;
    const reps = d.repeats[key] ?? 0;
    let gain = (base / (1 + reps / GROWTH_CONFIG.repeatK)) * this.state.modifiers.development;
    d.repeats[key] = reps + 1;
    gain = Math.min(gain, Math.max(0, GROWTH_CONFIG.dailyCap - d.dayPoints));
    if (offline || d.awayPoints !== null) {
      gain *= GROWTH_CONFIG.offlineMultiplier;
      const cap = GROWTH_CONFIG.offlineMaxFractionPerAbsence * this.config.developmentPoints;
      gain = Math.min(gain, Math.max(0, cap - (d.awayPoints ?? 0)));
      d.awayPoints = (d.awayPoints ?? 0) + gain;
    }
    // Nunca más de lo que pide la etapa: el sobrante NO pasa a la siguiente (no se saltan etapas)
    gain = Math.min(gain, Math.max(0, this.config.developmentPoints - d.points));
    d.points += gain;
    d.dayPoints += gain;
    d.lifetimePoints += gain;
    return gain;
  }

  // Relación con un sujeto en esta etapa (valencia media ponderada), para comparar etapas más tarde
  private summarize(subject: string | null, valence: number, intensity: number): void {
    if (!subject || subject === 'player' || !Number.isFinite(valence)) return;
    const w = Math.max(0.2, intensity);
    const bucket = (this.state.subjects[this.state.stage] ??= {});
    const cur = (bucket[subject] ??= { sum: 0, weight: 0, n: 0 });
    cur.sum += valence * w; cur.weight += w; cur.n++;
  }

  noteExperience(kind: ExperienceKind, subject: string | null, reward: number, now: number, offline: boolean, valence = 0, intensity = 0): number {
    this.summarize(subject, valence, intensity);
    const base = (GROWTH_CONFIG.experiencePoints as Partial<Record<ExperienceKind, number>>)[kind] ?? 0;
    // Descansar solo cuenta si de verdad le sentó bien (no por dormir sin sueño)
    if (kind === 'rested' && !(reward > 0)) return 0;
    return this.addDevelopment(`${kind}:${subject ?? '-'}`, base, now, offline);
  }

  beginAway(): void { this.state.development.awayPoints = 0; }
  endAway(): void { this.state.development.awayPoints = null; }

  // ---- Elegibilidad y transición ----
  eligibility(now: number): Eligibility {
    const to = nextStage(this.state.stage);
    const ageOk = !!to && this.timeInStage(now) >= this.minDurationMs();
    const developmentOk = !!to && this.progress >= 1;
    return { eligible: ageOk && developmentOk, ageOk, developmentOk, to };
  }

  markPending(now: number): void {
    const to = nextStage(this.state.stage);
    if (to && !this.state.pending) this.state.pending = { to, since: now };
  }

  // Aplica UN paso de etapa (la transacción completa la orquesta GameSession)
  advance(now: number, petDay: number): { from: LifeStage; to: LifeStage } | null {
    const to = nextStage(this.state.stage);
    if (!to) return null;
    const from = this.state.stage;
    const d = this.state.development;
    this.state.stage = to;
    this.state.stageStartedAt = now;
    this.state.pending = null;
    d.points = 0;
    d.repeats = {}; // lo nuevo vuelve a ser nuevo en otra etapa
    this.state.history.push({ stage: to, at: now, petDay });
    return { from, to };
  }

  // ---- Hitos (recuerdos del desarrollo; no controlan el crecimiento) ----
  hasMilestone(type: MilestoneType): boolean { return this.state.milestones.some((m) => m.type === type); }

  addMilestone(type: MilestoneType, at: number, petDay: number, subject: string | null = null, momentId: string | null = null): GrowthMilestone | null {
    if (type !== 'GREW' && this.hasMilestone(type)) return null;
    const m: GrowthMilestone = { type, at, petDay, lifeStage: this.state.stage, subject, momentId };
    this.state.milestones.push(m);
    return m;
  }

  exportState(): GrowthState { return JSON.parse(JSON.stringify(this.state)) as GrowthState; }
}

export function getPlasticityMultiplier(stage: LifeStage): number {
  return stageConfig(stage).plasticity;
}

export { LIFE_STAGES };

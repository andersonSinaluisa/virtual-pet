/*
 * EXPLORATION MEMORY — qué lugares, objetos y sonidos conoce ESTA mascota
 * ----------------------------------------------------------------------
 *   ObjectMemory     por tipo de objeto: primera/última vez, exposición,
 *                    encuentros, etapa de conocimiento, experiencias + / −
 *   LocationMemory   por ubicación: visitas, tiempo pasado, + / −, tiempo
 *                    por zona (qué rincones le resultan familiares)
 *   SoundMemory      por tipo de sonido: cuántas veces lo oyó
 *
 * Esta memoria NO decide conducta. Solo produce dos señales distintas:
 *
 *   NOVELTY ∈ [0,1]      "no lo he visto (mucho) / hace mucho que no lo veo".
 *                        Cae con la EXPOSICIÓN (habituación) y se recupera en
 *                        parte con el tiempo sin verlo.
 *   FAMILIARITY ∈ [0,1]  "lo conozco". Crece con encuentros e interacciones
 *                        y apenas se olvida.
 *
 * Primera caja: novelty ≈ 1, familiarity ≈ 0. Tras muchas experiencias:
 * novelty baja, familiarity alta. Tras semanas sin verla: la novedad vuelve
 * en parte, la familiaridad no. Qué hace la mascota con eso lo decide su SNN.
 */
import type { ItemKind } from './Items';
import type { LocationId } from './Locations';
import type { SoundKind } from './Sound';

export type KnowledgeStage = 'SAW' | 'APPROACHED' | 'INVESTIGATED' | 'INTERACTED';
export const KNOWLEDGE_STAGES: readonly KnowledgeStage[] = ['SAW', 'APPROACHED', 'INVESTIGATED', 'INTERACTED'];

export interface ObjectMemory {
  firstSeenAt: number;
  lastSeenAt: number;
  exposure: number; // habituación acumulada (visión ponderada + investigación + interacción)
  encounterCount: number; // episodios de verlo separados por un rato sin verlo
  investigateTicks: number;
  interactions: number;
  positiveExperiences: number;
  negativeExperiences: number;
  stage: KnowledgeStage;
  stageAt: Partial<Record<KnowledgeStage, number>>;
}

export interface LocationMemory {
  firstVisitAt: number | null;
  lastVisitAt: number | null;
  visits: number;
  ticksSpent: number;
  positiveExperiences: number;
  negativeExperiences: number;
  zoneTicks: Record<string, number>; // tiempo por zona semántica (contexto espacial familiar)
}

export interface SoundMemory {
  heard: number;
  lastHeardAt: number;
}

export interface ExplorationState {
  version: 1;
  objects: Partial<Record<ItemKind, ObjectMemory>>;
  locations: Partial<Record<LocationId, LocationMemory>>;
  sounds: Partial<Record<SoundKind, SoundMemory>>;
}

export interface StageEvent {
  kind: ItemKind;
  stage: KnowledgeStage;
  at: number;
  first: boolean; // primera vez que alcanza esa etapa
}

// ---- Parámetros (balance; ver docs/living-world.md §Novelty) ----
export const EXPLORATION_PARAMS = {
  seeRate: 0.015, // exposición por tick de verlo (× intensidad de la señal)
  investigateRate: 0.12, // exposición por tick de investigarlo de cerca
  interactRate: 0.35, // exposición por interacción (cogerlo, jugar)
  noveltyScale: 2.5, // novelty = exp(−exposición efectiva / escala)
  recoveryDays: 4, // la habituación se recupera hasta la mitad tras días sin verlo
  recoveryShare: 0.5,
  encounterGapMs: 90_000, // sin verlo ≥ 1.5 min de mundo → el siguiente avistamiento es otro encuentro
  familiarityScale: 6, // familiarity = 1 − exp(−conocimiento / escala)
  locationFamiliarTicks: 1800, // ~10 min de app para que un lugar empiece a ser familiar
  soundScale: 4,
} as const;

const DAY_MS = 86_400_000;

export function emptyExploration(): ExplorationState {
  return { version: 1, objects: {}, locations: {}, sounds: {} };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const stageIndex = (s: KnowledgeStage) => KNOWLEDGE_STAGES.indexOf(s);

export class ExplorationMemory {
  state: ExplorationState;
  private pending: StageEvent[] = [];
  private visitStart: { id: LocationId; at: number } | null = null;

  constructor(state?: ExplorationState | null) {
    this.state = ExplorationMemory.sanitize(state);
  }

  // ---------- Objetos ----------
  object(kind: ItemKind): ObjectMemory | null {
    return this.state.objects[kind] ?? null;
  }

  private ensure(kind: ItemKind, now: number): ObjectMemory {
    let m = this.state.objects[kind];
    if (!m) {
      m = { firstSeenAt: now, lastSeenAt: now, exposure: 0, encounterCount: 1, investigateTicks: 0, interactions: 0, positiveExperiences: 0, negativeExperiences: 0, stage: 'SAW', stageAt: { SAW: now } };
      this.state.objects[kind] = m;
      this.pending.push({ kind, stage: 'SAW', at: now, first: true });
    }
    return m;
  }

  // La mascota lo percibe este tick con intensidad `signal` (0..1)
  see(kind: ItemKind, signal: number, now: number): void {
    const existed = !!this.state.objects[kind];
    const m = this.ensure(kind, now);
    if (existed && now - m.lastSeenAt >= EXPLORATION_PARAMS.encounterGapMs) m.encounterCount++;
    m.lastSeenAt = now;
    m.exposure += EXPLORATION_PARAMS.seeRate * clamp01(signal);
  }

  advance(kind: ItemKind, stage: KnowledgeStage, now: number): void {
    const m = this.ensure(kind, now);
    const first = m.stageAt[stage] === undefined;
    if (first) m.stageAt[stage] = now;
    if (stageIndex(stage) > stageIndex(m.stage)) m.stage = stage;
    if (first) this.pending.push({ kind, stage, at: now, first });
  }

  investigate(kind: ItemKind, now: number): void {
    const m = this.ensure(kind, now);
    m.investigateTicks++;
    m.exposure += EXPLORATION_PARAMS.investigateRate;
    m.lastSeenAt = now;
    this.advance(kind, 'INVESTIGATED', now);
  }

  interact(kind: ItemKind, now: number): void {
    const m = this.ensure(kind, now);
    m.interactions++;
    m.exposure += EXPLORATION_PARAMS.interactRate;
    m.lastSeenAt = now;
    this.advance(kind, 'INTERACTED', now);
  }

  noteOutcome(kind: ItemKind, valence: number, now: number): void {
    const m = this.ensure(kind, now);
    if (valence > 0.2) m.positiveExperiences++;
    else if (valence < -0.2) m.negativeExperiences++;
  }

  // Novedad: habituación por exposición con recuperación parcial tras días sin verlo
  novelty(kind: ItemKind, now: number): number {
    const m = this.state.objects[kind];
    if (!m) return 1;
    const p = EXPLORATION_PARAMS;
    const days = Math.max(0, now - m.lastSeenAt) / DAY_MS;
    const retained = 1 - p.recoveryShare * (1 - Math.exp(-days / p.recoveryDays));
    return clamp01(Math.exp(-(m.exposure * retained) / p.noveltyScale));
  }

  // Familiaridad: conocimiento acumulado (encuentros + investigación + interacción); casi no se olvida
  familiarity(kind: ItemKind): number {
    const m = this.state.objects[kind];
    if (!m) return 0;
    const knowledge = m.encounterCount * 0.35 + m.investigateTicks * 0.08 + m.interactions * 0.5 + Math.min(4, m.exposure * 0.5);
    return clamp01(1 - Math.exp(-knowledge / EXPLORATION_PARAMS.familiarityScale));
  }

  // ---------- Ubicaciones ----------
  location(id: LocationId): LocationMemory | null {
    return this.state.locations[id] ?? null;
  }

  private ensureLocation(id: LocationId): LocationMemory {
    return (this.state.locations[id] ??= { firstVisitAt: null, lastVisitAt: null, visits: 0, ticksSpent: 0, positiveExperiences: 0, negativeExperiences: 0, zoneTicks: {} });
  }

  // Devuelve true si es la PRIMERA visita
  enterLocation(id: LocationId, now: number): boolean {
    const m = this.ensureLocation(id);
    const first = m.firstVisitAt === null;
    if (first) m.firstVisitAt = now;
    m.visits++;
    m.lastVisitAt = now;
    this.visitStart = { id, at: now };
    return first;
  }

  stay(id: LocationId, zone: string | null, now: number, ticks = 1): void {
    const m = this.ensureLocation(id);
    if (m.firstVisitAt === null) { m.firstVisitAt = now; m.visits = 1; }
    m.ticksSpent += ticks;
    m.lastVisitAt = now;
    if (zone) m.zoneTicks[zone] = (m.zoneTicks[zone] ?? 0) + ticks;
  }

  noteLocationOutcome(id: LocationId, valence: number): void {
    const m = this.ensureLocation(id);
    if (valence > 0.2) m.positiveExperiences++;
    else if (valence < -0.2) m.negativeExperiences++;
  }

  locationFamiliarity(id: LocationId): number {
    const m = this.state.locations[id];
    if (!m) return 0;
    return clamp01(1 - Math.exp(-m.ticksSpent / EXPLORATION_PARAMS.locationFamiliarTicks));
  }

  zoneFamiliarity(id: LocationId, zone: string): number {
    const t = this.state.locations[id]?.zoneTicks[zone] ?? 0;
    return clamp01(1 - Math.exp(-t / (EXPLORATION_PARAMS.locationFamiliarTicks / 3)));
  }

  // ---------- Sonidos ----------
  hear(kind: SoundKind, now: number): void {
    const m = (this.state.sounds[kind] ??= { heard: 0, lastHeardAt: now });
    m.heard++;
    m.lastHeardAt = now;
  }

  soundNovelty(kind: SoundKind): number {
    const n = this.state.sounds[kind]?.heard ?? 0;
    return clamp01(Math.exp(-n / EXPLORATION_PARAMS.soundScale));
  }

  // ---------- Siembra inicial ----------
  // El día de la adopción la mascota llega a SU habitación con SUS muebles: se registran como vividos
  // (lo que haya dentro de la caja, en el parque o en el jardín sigue siendo desconocido).
  seedHome(now: number, furniture: readonly ItemKind[]): void {
    const room = this.ensureLocation('room');
    if (room.firstVisitAt === null) { room.firstVisitAt = now; room.visits = 1; room.lastVisitAt = now; }
    room.ticksSpent = Math.max(room.ticksSpent, EXPLORATION_PARAMS.locationFamiliarTicks * 3);
    for (const kind of furniture) {
      if (this.state.objects[kind]) continue;
      this.state.objects[kind] = {
        firstSeenAt: now, lastSeenAt: now, exposure: 20, encounterCount: 20, investigateTicks: 40, interactions: 10,
        positiveExperiences: 0, negativeExperiences: 0, stage: 'INTERACTED', stageAt: { SAW: now, APPROACHED: now, INVESTIGATED: now, INTERACTED: now },
      };
    }
  }

  drainStageEvents(): StageEvent[] {
    const p = this.pending;
    this.pending = [];
    return p;
  }

  exportState(): ExplorationState {
    return JSON.parse(JSON.stringify(this.state)) as ExplorationState;
  }

  static sanitize(raw: unknown): ExplorationState {
    const base = emptyExploration();
    if (!raw || typeof raw !== 'object') return base;
    const r = raw as Partial<ExplorationState>;
    const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    if (r.objects && typeof r.objects === 'object') {
      for (const [k, v] of Object.entries(r.objects)) {
        if (!v || typeof v !== 'object') continue;
        const m = v as ObjectMemory;
        base.objects[k as ItemKind] = {
          firstSeenAt: num(m.firstSeenAt), lastSeenAt: num(m.lastSeenAt), exposure: Math.max(0, num(m.exposure)),
          encounterCount: Math.max(1, num(m.encounterCount, 1)), investigateTicks: Math.max(0, num(m.investigateTicks)),
          interactions: Math.max(0, num(m.interactions)), positiveExperiences: Math.max(0, num(m.positiveExperiences)),
          negativeExperiences: Math.max(0, num(m.negativeExperiences)),
          stage: KNOWLEDGE_STAGES.includes(m.stage) ? m.stage : 'SAW',
          stageAt: m.stageAt && typeof m.stageAt === 'object' ? { ...m.stageAt } : { SAW: num(m.firstSeenAt) },
        };
      }
    }
    if (r.locations && typeof r.locations === 'object') {
      for (const [k, v] of Object.entries(r.locations)) {
        if (!v || typeof v !== 'object') continue;
        const m = v as LocationMemory;
        base.locations[k as LocationId] = {
          firstVisitAt: m.firstVisitAt == null ? null : num(m.firstVisitAt), lastVisitAt: m.lastVisitAt == null ? null : num(m.lastVisitAt),
          visits: Math.max(0, num(m.visits)), ticksSpent: Math.max(0, num(m.ticksSpent)),
          positiveExperiences: Math.max(0, num(m.positiveExperiences)), negativeExperiences: Math.max(0, num(m.negativeExperiences)),
          zoneTicks: m.zoneTicks && typeof m.zoneTicks === 'object' ? Object.fromEntries(Object.entries(m.zoneTicks).filter(([, t]) => Number.isFinite(t))) : {},
        };
      }
    }
    if (r.sounds && typeof r.sounds === 'object') {
      for (const [k, v] of Object.entries(r.sounds)) {
        if (v && typeof v === 'object') base.sounds[k as SoundKind] = { heard: Math.max(0, num((v as SoundMemory).heard)), lastHeardAt: num((v as SoundMemory).lastHeardAt) };
      }
    }
    return base;
  }
}

// Palabras para la UI (sin números)
export function familiarityWord(f: number, visited: boolean): string {
  if (!visited) return 'Aún por descubrir';
  if (f > 0.75) return 'Muy familiar';
  if (f > 0.4) return 'Conocido';
  if (f > 0.1) return 'Empieza a conocerlo';
  return 'Recién descubierto';
}

export const STAGE_WORD: Record<KnowledgeStage, string> = {
  SAW: 'Lo ha visto', APPROACHED: 'Se acercó', INVESTIGATED: 'Lo investigó', INTERACTED: 'Jugó con él',
};

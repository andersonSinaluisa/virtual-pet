/*
 * Tipos de memoria.
 *
 *   ShortTermState  lo que acaba de pasar (acciones activas, foco, eventos
 *                   recientes). Vive en ExperienceRecorder, no se persiste.
 *   Experience      un hecho con valencia: "jugó con la pelota (+0.6)".
 *   Preference      evidencia acumulada sobre un sujeto (objeto, jugador...).
 *   Moment          recuerdo de largo plazo presentado en "Nuestros recuerdos".
 *   Discovery       conclusión sobre la mascota tras evidencia repetida.
 */
import type { Action } from '../brain/Actions';
import type { GameId } from '../games/catalog';
import type { LifeStage } from '../growth/LifeStage';
import type { ItemKind } from '../world/Items';

export type SubjectKey = ItemKind | 'player' | 'loudSound' | 'darkness';

export const EXPERIENCE_KINDS = [
  'played', 'picked_up', 'investigated', 'ate', 'drank', 'slept', 'petted', 'greeted', 'approached',
  'followed', 'asked_attention', 'scared', 'hid', 'cried', 'danced',
  'called_responded', 'called_ignored', 'fetch_chased', 'fetch_returned', 'mystery_opened', 'mystery_avoided',
  'choice_made', 'game_played',
  // v2 (aprendizaje)
  'player_rewarded', 'rested',
] as const;
export type ExperienceKind = (typeof EXPERIENCE_KINDS)[number];

export interface Experience {
  id: string;
  at: number; // epoch ms
  day: number; // día de vida de la mascota (1 = adopción)
  tick: number;
  kind: ExperienceKind;
  subject: SubjectKey | null;
  valence: number; // -1..1
  intensity: number; // 0..1
  gameId: GameId | null;
  offline: boolean;
  // v2: señal de aprendizaje (RewardModel) y acciones activas cuando ocurrió
  reward: number; // -1..1
  actions: Action[];
  context?: ExperienceContext; // v3
  lifeStage?: LifeStage; // v4: etapa en la que ocurrió ("cuando era bebé")
}

/*
 * v3: contexto COMPACTO de una experiencia (no un snapshot del mundo):
 * cuándo, con cuánta luz, dónde, qué había cerca, si estabas y cómo estaba.
 */
export interface ExperienceContext {
  minuteOfDay: number;
  day: number; // día del reloj del mundo
  light: number;
  area: string; // zona de la habitación (routines/areas)
  zone: string | null; // zona funcional (cama, comida, juego, ventana)
  objects: string[]; // hasta 3 tipos de objeto cercanos
  playerPresent: boolean;
  fatigue: number;
  hunger: number;
  energy: number;
  boredom: number;
}

/*
 * v3: EPISODIOS para detectar hábitos. Un registro por episodio de conducta
 * (no por tick): dormir, descansar, jugar, explorar, comer, y cómo respondió
 * cuando volviste. Es evidencia para interpretar, nunca una instrucción.
 */
export type EpisodeKind = 'sleep' | 'rest' | 'play' | 'explore' | 'eat' | 'return';

export interface EpisodeRecord {
  kind: EpisodeKind;
  start: number; // ms del reloj del mundo
  end: number;
  minuteOfDay: number; // al empezar
  day: number;
  area: string;
  light: number;
  activityBefore: number; // actividad reciente al empezar (0..1)
  subject: string | null;
  responded?: boolean; // solo 'return'
  latencyTicks?: number;
  offline: boolean;
  lifeStage?: LifeStage; // v4
}

export interface HabitSnapshotEntry {
  type: string;
  confidence: number;
  key: string | null; // parámetro principal (zona, objeto, franja)
}

export interface HabitSnapshot {
  day: number; // día del reloj del mundo
  petDay: number; // día de vida de la mascota
  habits: HabitSnapshotEntry[];
}

export interface RoutineState {
  episodes: EpisodeRecord[];
  snapshots: HabitSnapshot[];
}

// Historial agregado por objeto (qué hizo con él, no cómo reacciona)
export interface ObjectStats {
  interactions: number;
  approaches: number; // lo investigó de cerca
  plays: number;
  picks: number;
  avoidances: number;
  rewarded: number; // veces que el jugador lo recompensó con ese objeto delante
}

export interface Preference {
  subject: SubjectKey;
  score: number; // -1..1, se acerca a 0 con poca evidencia
  total: number; // Σ valencia·intensidad
  weight: number; // Σ intensidad
  positive: number;
  negative: number;
  interactions: number;
  lastAt: number;
}

export type MomentKind = 'first_time' | 'game' | 'discovery' | 'milestone' | 'captured' | 'away';

export interface Moment {
  id: string;
  createdAt: number;
  day: number;
  kind: MomentKind;
  title: string;
  story: string;
  tags: string[];
  icon: string; // clave semántica de icono (la UI la traduce)
  favorite: boolean;
  keyMoment: boolean; // "Hitos clave"
  subject: SubjectKey | null;
  snapshotUri: string | null; // captura del GLView (si había escena activa)
  experienceIds: string[];
  gameId: GameId | null;
  lifeStage?: LifeStage; // v4
}

export interface Discovery {
  id: string;
  key: string; // único: "likes:ball", "trait:sociable", "unique:first_mystery"
  title: string;
  text: string;
  icon: string;
  at: number;
  day: number;
  evidence: number;
  subject: SubjectKey | null;
}

export interface BehaviorStats {
  actionOnsets: Partial<Record<Action, number>>;
  experiencesByKind: Partial<Record<ExperienceKind, number>>;
  scaredBy: Partial<Record<SubjectKey, number>>;
  firsts: string[]; // `${kind}:${subject}` ya vividos
  onlineTicks: number;
  offlineTicks: number;
  darkTicks: number;
  darkActiveTicks: number; // ticks a oscuras con actividad (no dormir/descansar)
  objectStats: Partial<Record<SubjectKey, ObjectStats>>;
}

export interface MemoryState {
  experiences: Experience[];
  moments: Moment[];
  preferences: Partial<Record<SubjectKey, Preference>>;
  discoveries: Discovery[];
  stats: BehaviorStats;
  routine: RoutineState; // v3
}

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
import type { ItemKind } from '../world/Items';

export type SubjectKey = ItemKind | 'player' | 'loudSound' | 'darkness';

export const EXPERIENCE_KINDS = [
  'played', 'picked_up', 'investigated', 'ate', 'drank', 'slept', 'petted', 'greeted', 'approached',
  'followed', 'asked_attention', 'scared', 'hid', 'cried', 'danced',
  'called_responded', 'called_ignored', 'fetch_chased', 'fetch_returned', 'mystery_opened', 'mystery_avoided',
  'choice_made', 'game_played',
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
}

export interface MemoryState {
  experiences: Experience[];
  moments: Moment[];
  preferences: Partial<Record<SubjectKey, Preference>>;
  discoveries: Discovery[];
  stats: BehaviorStats;
}

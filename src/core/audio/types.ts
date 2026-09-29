/*
 * TIPOS DEL AUDIO DE MASCOTAS (dominio, sin plataforma)
 * ----------------------------------------------------
 *   SNN → acción / estado / contexto → VocalizationIntent
 *       → SpeciesVocalizationProfile → SoundVariantSelector → (plataforma) PetAudioManager
 *
 * Aquí solo hay datos: qué assets existen, de dónde salieron y con qué licencia.
 * Ningún require(): el mapa id → archivo vive en services/audio (petAudioFiles.generated).
 */
import type { LifeStage } from '../growth/LifeStage';

export const VOCALIZATION_INTENTS = [
  'GREETING', 'ATTENTION', 'HAPPY', 'EXCITED', 'AFFECTION', 'RELAXED', 'CURIOUS', 'PLAYFUL',
  'SCARED', 'ALERT', 'UNCOMFORTABLE', 'SLEEPY', 'SLEEPING',
] as const;
export type VocalizationIntent = (typeof VOCALIZATION_INTENTS)[number];

export const AUDIO_SPECIES = ['dog', 'cat', 'bear', 'rabbit', 'foley'] as const;
export type AudioSpecies = (typeof AUDIO_SPECIES)[number];

// Categorías del mezclador (el volumen de cada una lo decide Ajustes)
export const AUDIO_CATEGORIES = ['VOCAL', 'FOLEY', 'AMBIENCE', 'UI', 'MUSIC'] as const;
export type AudioCategory = (typeof AUDIO_CATEGORIES)[number];

export type PetAudioKind = 'vocal' | 'layer' | 'foley';
export type FoleyKind = 'step_floor' | 'step_grass' | 'step_dirt' | 'land' | 'scratch' | 'body' | 'drink';

export interface PetAudioAsset {
  id: string;
  species: AudioSpecies;
  kind: PetAudioKind; // vocal = one-shot; layer = bucle continuo (ronroneo, jadeo, sueño); foley = cuerpo
  intents: VocalizationIntent[];
  file: string; // relativo a la raíz del proyecto (el validador lo comprueba)
  durationMs: number;
  loop: boolean;
  sourceId: string; // → AudioSourceRecord (licencia)
  stages?: LifeStage[]; // si se limita a ciertas etapas (maullidos de gatito → BABY/CHILD)
  foley?: FoleyKind;
  rate?: number; // cambio de tono aplicado al procesar (osezno ×1.12)
}

export interface AudioSourceRecord {
  id: string;
  provider: string;
  title: string;
  author: string;
  url: string;
  license: string;
  licenseUrl: string;
  attributionRequired: boolean;
  originalFilename: string;
  species: string;
}

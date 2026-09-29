/*
 * VOICE PROFILE — la voz propia de CADA mascota (estable, se genera una vez)
 * -------------------------------------------------------------------------
 * Dos gatos no suenan idénticos aunque compartan grabaciones: cada uno tiene
 * un tono, un volumen, una "charlatanería" y unas variantes favoritas propias,
 * en rangos PEQUEÑOS (±5 % de tono: suena a otro individuo, no a un efecto).
 *
 * Se deriva de una semilla (id + especie + adopción) y se GUARDA (SaveGame v6):
 * aunque cambie este algoritmo, la mascota conserva su voz.
 *
 * (No confundir con GrowthConfig.VoiceProfile 'baby'|'young'|'adult', que es
 * la etapa; aquí la etapa solo añade un ajuste muy moderado: stageRate.)
 */
import type { LifeStage } from '../growth/LifeStage';
import type { SpeciesKey } from '../persistence/SaveGame';
import { seededRng } from '../random';
import { audioSpecies, PET_AUDIO_ASSETS } from './petAudioManifest';

export interface PetVoiceProfile {
  version: 1;
  pitch: number; // 0.95..1.05 (se aplica como playbackRate sin corrección de tono)
  volume: number; // 0.85..1
  vocalizationFrequency: number; // 0.8..1.2 (multiplica las probabilidades)
  preferredVariants: string[]; // ~30 % de sus one-shots: "su" manera de maullar
}

export function hashSeed(text: string): number {
  let h = 7;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 2147483647;
  return h;
}

export function generateVoiceProfile(seedText: string, species: SpeciesKey): PetVoiceProfile {
  const rng = seededRng(hashSeed(seedText));
  const range = (a: number, b: number) => Math.round((a + (b - a) * rng()) * 1000) / 1000;
  const sp = audioSpecies(species);
  const vocal = PET_AUDIO_ASSETS.filter((a) => a.species === sp && a.kind === 'vocal').map((a) => a.id);
  const preferredVariants = vocal.filter(() => rng() < 0.3);
  return { version: 1, pitch: range(0.95, 1.05), volume: range(0.85, 1), vocalizationFrequency: range(0.8, 1.2), preferredVariants };
}

// La etapa cambia la voz MUY poco (los gatitos además tienen grabaciones propias)
export const STAGE_RATE: Readonly<Record<LifeStage, number>> = { BABY: 1.08, CHILD: 1.04, YOUNG: 1, ADULT: 0.97 };
export const STAGE_VOLUME: Readonly<Record<LifeStage, number>> = { BABY: 0.85, CHILD: 0.92, YOUNG: 1, ADULT: 1 };

export function isVoiceProfile(v: unknown): v is PetVoiceProfile {
  const p = v as PetVoiceProfile | null;
  return !!p && p.version === 1 && typeof p.pitch === 'number' && typeof p.volume === 'number' && Array.isArray(p.preferredVariants);
}

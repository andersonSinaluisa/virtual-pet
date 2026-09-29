/*
 * PET AUDIO MANIFEST — único punto de entrada a los assets de audio de mascotas
 * ----------------------------------------------------------------------------
 * Los datos se GENERAN (scripts/audio/process_pet_audio.py) a partir de dos
 * fuentes editadas a mano:
 *   scripts/audio/pet_audio_sources.json   procedencia + licencia verificada
 *   scripts/audio/pet_audio_recipes.json   fragmento → asset → intenciones
 * Nadie más enumera archivos: los perfiles piden "variantes de GREETING para
 * gato en etapa BABY" y el manifest responde con lo que exista de verdad.
 */
import type { SpeciesKey } from '../persistence/SaveGame';
import type { LifeStage } from '../growth/LifeStage';
import { PET_AUDIO_ASSETS } from './petAudioAssets.generated';
import { PET_AUDIO_SOURCES } from './petAudioSources.generated';
import type { AudioSourceRecord, AudioSpecies, FoleyKind, PetAudioAsset, VocalizationIntent } from './types';

export { PET_AUDIO_ASSETS, PET_AUDIO_SOURCES };

// La especie del juego (`bunny`) se llama `rabbit` en los assets (carpeta assets/audio/pets/rabbit)
export function audioSpecies(s: SpeciesKey): Exclude<AudioSpecies, 'foley'> {
  return s === 'bunny' ? 'rabbit' : s;
}

const BY_ID = new Map(PET_AUDIO_ASSETS.map((a) => [a.id, a]));
const SOURCES = new Map(PET_AUDIO_SOURCES.map((s) => [s.id, s]));

export function getAsset(id: string): PetAudioAsset | undefined {
  return BY_ID.get(id);
}

export function sourceOf(asset: PetAudioAsset): AudioSourceRecord | undefined {
  return SOURCES.get(asset.sourceId);
}

export function stageAllows(a: PetAudioAsset, stage: LifeStage | null): boolean {
  return !stage || !a.stages || a.stages.includes(stage);
}

// One-shots de una intención (kind 'vocal'); si la etapa deja sin ninguna, se ignora el filtro de etapa
export function vocalVariants(species: AudioSpecies, intent: VocalizationIntent, stage: LifeStage | null = null): PetAudioAsset[] {
  const all = PET_AUDIO_ASSETS.filter((a) => a.species === species && a.kind === 'vocal' && a.intents.includes(intent));
  const staged = all.filter((a) => stageAllows(a, stage));
  return staged.length ? staged : all;
}

export function layerAssets(species: AudioSpecies, intent: VocalizationIntent): PetAudioAsset[] {
  return PET_AUDIO_ASSETS.filter((a) => a.species === species && a.kind === 'layer' && a.intents.includes(intent));
}

export function foleyVariants(kind: FoleyKind): PetAudioAsset[] {
  return PET_AUDIO_ASSETS.filter((a) => a.foley === kind);
}

// Textos de atribución obligatoria (CC-BY) para la pantalla de créditos
export function attributionLines(): string[] {
  return PET_AUDIO_SOURCES.filter((s) => s.attributionRequired).map((s) => `"${s.title}" — ${s.author} (${s.url}), ${s.license}. Modificado.`);
}

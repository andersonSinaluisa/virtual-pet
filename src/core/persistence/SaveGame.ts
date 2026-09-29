/*
 * SAVE GAME (versionado)
 * ----------------------
 * Un único documento JSON por mascota (escritura atómica). `saveVersion`
 * cambia cuando cambia la FORMA del documento; `brain.configVersion` cuando
 * cambia el genoma. Los pesos se guardan por nombre (ver BrainWeights).
 */
import type { Action } from '../brain/Actions';
import type { BrainWeightsData, PresetKey } from '../brain/BrainConfig';
import type { GrowthState } from '../growth/GrowthSystem';
import type { LearningState } from '../learning/Plasticity';
import type { MemoryState } from '../memory/types';
import type { NetworkState } from '../neural/Network';
import type { PetBodyState } from '../simulation/Pet';
import type { WorldState } from '../simulation/World';
import type { ItemKind } from '../world/Items';
import type { PetVoiceProfile } from '../audio/PetVoiceProfile';

export const CURRENT_SAVE_VERSION = 6;

export const SPECIES = ['dog', 'cat', 'bear', 'bunny'] as const;
export type SpeciesKey = (typeof SPECIES)[number];

export interface PetProfile {
  id: string;
  name: string;
  species: SpeciesKey;
  adoptedAt: number;
  preset: PresetKey;
}

export interface Growth {
  xp: number;
}

export interface Inventory {
  owned: ItemKind[];
}

export interface SettingsData {
  // v6: mezclador por categorías (todo × masterVolume)
  masterVolume: number;
  petVolume: number; // voz de la mascota y su cuerpo (foley)
  ambientVolume: number; // ambiente del lugar y sonidos del mundo
  musicVolume: number;
  uiVolume: number;
  effectsVolume: number; // (v1–v5) se conserva para no perder el ajuste antiguo; ya no se muestra
  muted: boolean;
  haptics: boolean;
  fur: boolean; // pelaje por capas (calidad 3D)
  shadows: boolean;
}

export const DEFAULT_SETTINGS: SettingsData = { masterVolume: 1, petVolume: 0.85, ambientVolume: 0.5, musicVolume: 0.5, uiVolume: 0.6, effectsVolume: 0.8, muted: false, haptics: true, fur: true, shadows: true };

export interface SaveGameV1 {
  saveVersion: 1;
  savedAt: number;
  lastActiveAt: number;
  profile: PetProfile;
  growth: Growth;
  inventory: Inventory;
  pet: PetBodyState;
  world: WorldState;
  brain: {
    configVersion: number;
    weights: BrainWeightsData;
    network: NetworkState | null;
    actions: { hold: Partial<Record<Action, number>>; carryTimer: number };
  };
  memory: MemoryState;
  settings: SettingsData;
}

/*
 * v2 (aprendizaje): pesos iniciales (con los que nació) además de los actuales
 * (aprendidos) y el estado del aprendizaje. La elegibilidad y los spikes NO
 * se guardan: son transitorios.
 */
export interface SaveGameV2 extends Omit<SaveGameV1, 'saveVersion' | 'brain'> {
  saveVersion: 2;
  brain: SaveGameV1['brain'] & { initialWeights: BrainWeightsData };
  learning: LearningState;
}

/*
 * v3 (rutinas): memoria de episodios con contexto (hora, zona, luz) e
 * instantáneas diarias de hábitos; `world.lightOn` pasa a ser la LÁMPARA (la
 * luz natural la da la hora del mundo). Los hábitos no se guardan: se
 * recalculan a partir de los episodios.
 */
export interface SaveGameV3 extends Omit<SaveGameV2, 'saveVersion'> {
  saveVersion: 3;
}

/*
 * v4 (crecimiento): `growth` pasa de { xp } a GrowthState (nacimiento, etapa,
 * desarrollo, variación individual, hitos, transición pendiente, historial).
 * Experiencias, momentos y episodios nuevos llevan `lifeStage`.
 */
export interface SaveGameV4 extends Omit<SaveGameV3, 'saveVersion' | 'growth'> {
  saveVersion: 4;
  growth: GrowthState;
}

/*
 * v5 (mundo vivo): el mundo guarda la ubicación actual, los objetos que se
 * quedaron en las demás ubicaciones (con su estado: caja cerrada/abierta,
 * plato vacío...), las puertas y el clima persistente; la memoria guarda la
 * exploración (objetos/lugares/sonidos conocidos → novedad y familiaridad);
 * la mascota, su orientación. NO se guarda nada visual ni derivado
 * (percepciones, atención, sonidos en curso, iluminación calculada).
 */
export interface SaveGameV5 extends Omit<SaveGameV4, 'saveVersion'> {
  saveVersion: 5;
}

/*
 * v6 (voz de la mascota): la VOZ PROPIA de cada mascota (tono, volumen, frecuencia,
 * variantes favoritas) se genera una vez y se guarda; Ajustes gana volúmenes por
 * categoría. Lo que dijo mientras no estabas NO se guarda como audio.
 */
export interface SaveGameV6 extends Omit<SaveGameV5, 'saveVersion'> {
  saveVersion: 6;
  audio: { voice: PetVoiceProfile };
}

export type SaveGame = SaveGameV6;

export const DEFAULT_INVENTORY: ItemKind[] = ['ball', 'teddy', 'duck', 'rope', 'mysteryBox', 'mirror'];

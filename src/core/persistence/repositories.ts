/*
 * REPOSITORIOS DEL DOMINIO
 * ------------------------
 * Cada área del dominio accede a SU sección del save a través de un
 * repositorio, sin saber cómo ni dónde se guarda. El almacenamiento es un
 * único documento (SaveGameStore → KeyValueStore) para que la escritura sea
 * atómica: nunca queda un cerebro de una versión con recuerdos de otra.
 */
import type { MemoryState } from '../memory/types';
import type { PetBodyState } from '../simulation/Pet';
import type { WorldState } from '../simulation/World';
import type { Growth, Inventory, PetProfile, SaveGame, SettingsData } from './SaveGame';
import type { SaveGameStore } from './SaveGameStore';

export interface PetRecord { profile: PetProfile; body: PetBodyState; growth: Growth }
export type BrainRecord = SaveGame['brain'];
export interface GameRecord { world: WorldState; inventory: Inventory; settings: SettingsData; lastActiveAt: number }

export interface SectionRepository<T> {
  load(): Promise<T | null>;
  save(value: T): Promise<void>;
}

export type PetRepository = SectionRepository<PetRecord>;
export type BrainRepository = SectionRepository<BrainRecord>;
export type MemoryRepository = SectionRepository<MemoryState>;
export type GameRepository = SectionRepository<GameRecord>;

export interface Repositories {
  pets: PetRepository;
  brains: BrainRepository;
  memories: MemoryRepository;
  games: GameRepository;
}

function section<T>(store: SaveGameStore, read: (s: SaveGame) => T, write: (s: SaveGame, v: T) => SaveGame): SectionRepository<T> {
  return {
    async load() {
      const r = await store.load();
      return r.status === 'ok' || r.status === 'recovered' ? read(r.save) : null;
    },
    async save(value) {
      const r = await store.load();
      if (r.status !== 'ok' && r.status !== 'recovered') throw new Error('No hay una partida guardada a la que escribir');
      await store.save({ ...write(r.save, value), savedAt: Date.now() });
    },
  };
}

export function createRepositories(store: SaveGameStore): Repositories {
  return {
    pets: section(store, (s) => ({ profile: s.profile, body: s.pet, growth: s.growth }), (s, v) => ({ ...s, profile: v.profile, pet: v.body, growth: v.growth })),
    brains: section(store, (s) => s.brain, (s, v) => ({ ...s, brain: v })),
    memories: section(store, (s) => s.memory, (s, v) => ({ ...s, memory: v })),
    games: section(
      store,
      (s) => ({ world: s.world, inventory: s.inventory, settings: s.settings, lastActiveAt: s.lastActiveAt }),
      (s, v) => ({ ...s, world: v.world, inventory: v.inventory, settings: v.settings, lastActiveAt: v.lastActiveAt }),
    ),
  };
}

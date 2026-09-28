/*
 * MIGRACIONES DE SAVE
 * -------------------
 * `MIGRATIONS[n]` transforma un save de la versión n a la n+1. Para añadir
 * una versión: subir CURRENT_SAVE_VERSION, escribir la migración n→n+1 y un
 * test con un save real de la versión anterior. Nunca se borran migraciones.
 *
 * Después de migrar, `validateSave` sanea el documento (valores fuera de
 * rango, campos que faltan) sin descartar la mascota.
 */
import { SENSOR_KEYS } from '../brain/BrainConfig';
import { emptyMemory, emptyStats } from '../memory/PetMemory';
import { isItemKind } from '../world/Items';
import { CURRENT_SAVE_VERSION, DEFAULT_INVENTORY, DEFAULT_SETTINGS, SPECIES, type SaveGame } from './SaveGame';

type Json = Record<string, unknown>;
type Migration = (save: Json) => Json;

export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // Ejemplo de la forma esperada (v1 → v2), aún no existe:
  // 1: (s) => ({ ...s, saveVersion: 2, nuevoCampo: valorPorDefecto }),
};

export class SaveError extends Error {
  constructor(message: string, readonly recoverable: boolean) {
    super(message);
  }
}

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function migrateSave(raw: unknown): SaveGame {
  if (!isObj(raw)) throw new SaveError('El save no es un objeto', false);
  let version = raw.saveVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new SaveError('saveVersion ausente o inválido', false);
  if (version > CURRENT_SAVE_VERSION) throw new SaveError(`Save de una versión más nueva (${version})`, false);
  let doc: Json = raw;
  while (version < CURRENT_SAVE_VERSION) {
    const m = MIGRATIONS[version];
    if (!m) throw new SaveError(`Falta la migración ${version}→${version + 1}`, false);
    doc = m(doc);
    version++;
  }
  return validateSave(doc);
}

export function validateSave(doc: Json): SaveGame {
  const profile = doc.profile;
  if (!isObj(profile) || typeof profile.name !== 'string' || !profile.name.trim()) throw new SaveError('Perfil de mascota inválido', false);
  const brain = doc.brain;
  if (!isObj(brain) || !isObj(brain.weights)) throw new SaveError('Faltan los pesos del cerebro', false);

  const species = SPECIES.includes(profile.species as never) ? (profile.species as SaveGame['profile']['species']) : 'dog';
  const memory = isObj(doc.memory) ? (doc.memory as unknown as SaveGame['memory']) : emptyMemory();
  memory.experiences = Array.isArray(memory.experiences) ? memory.experiences : [];
  memory.moments = Array.isArray(memory.moments) ? memory.moments : [];
  memory.discoveries = Array.isArray(memory.discoveries) ? memory.discoveries : [];
  memory.preferences = isObj(memory.preferences) ? memory.preferences : {};
  memory.stats = isObj(memory.stats) ? { ...emptyStats(), ...memory.stats } : emptyStats();

  const inv = isObj(doc.inventory) && Array.isArray(doc.inventory.owned) ? doc.inventory.owned.filter(isItemKind) : [...DEFAULT_INVENTORY];
  const settings = isObj(doc.settings) ? { ...DEFAULT_SETTINGS, ...(doc.settings as Partial<SaveGame['settings']>) } : { ...DEFAULT_SETTINGS };
  const now = Date.now();

  return {
    saveVersion: 1,
    savedAt: num(doc.savedAt, now),
    lastActiveAt: num(doc.lastActiveAt, now),
    profile: {
      id: typeof profile.id === 'string' ? profile.id : `pet_${now.toString(36)}`,
      name: profile.name.trim().slice(0, 24),
      species,
      adoptedAt: num(profile.adoptedAt, now),
      preset: (['equilibrado', 'curioso', 'miedoso', 'apegado'] as const).includes(profile.preset as never) ? (profile.preset as SaveGame['profile']['preset']) : 'equilibrado',
    },
    growth: { xp: Math.max(0, num(isObj(doc.growth) ? doc.growth.xp : 0, 0)) },
    inventory: { owned: inv.length ? [...new Set(inv)] : [...DEFAULT_INVENTORY] },
    // Pet.importState sanea cada campo (rango 0..1, posición dentro del mundo)
    pet: (isObj(doc.pet) ? doc.pet : {}) as unknown as SaveGame['pet'],
    world: isObj(doc.world) && Array.isArray(doc.world.objects) ? (doc.world as unknown as SaveGame['world']) : { objects: [], lightOn: true, nextId: 1, tick: 0 },
    brain: {
      configVersion: num(brain.configVersion, 0),
      weights: brain.weights as unknown as SaveGame['brain']['weights'],
      network: isObj(brain.network) ? (brain.network as unknown as SaveGame['brain']['network']) : null,
      actions: isObj(brain.actions) ? (brain.actions as unknown as SaveGame['brain']['actions']) : { hold: {}, carryTimer: 0 },
    },
    memory,
    settings,
  };
}

// Número de sensores conocidos: si el save es de un genoma con otra topología, el estado dinámico se descarta.
export const SENSOR_COUNT = SENSOR_KEYS.length;

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
import { baseBrainConfig, SENSOR_KEYS } from '../brain/BrainConfig';
import { defaultLearningState, type LearningState } from '../learning/Plasticity';
import { individualModifiers, newGrowthState, type GrowthState } from '../growth/GrowthSystem';
import { isLifeStage, type LifeStage } from '../growth/LifeStage';
import { emptyMemory, emptyStats } from '../memory/PetMemory';
import { isItemKind } from '../world/Items';
import { CURRENT_SAVE_VERSION, DEFAULT_INVENTORY, DEFAULT_SETTINGS, SPECIES, type SaveGame } from './SaveGame';

type Json = Record<string, unknown>;
type Migration = (save: Json) => Json;

export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // v1 → v2 (aprendizaje): la mascota existente NO se pierde. Sus pesos
  // actuales pasan a ser a la vez los iniciales y los actuales; el estado de
  // aprendizaje empieza vacío; las experiencias antiguas no se re-aplican.
  1: (s) => {
    const brain = isObj(s.brain) ? s.brain : {};
    const memory = isObj(s.memory) ? s.memory : null;
    const experiences = memory && Array.isArray(memory.experiences)
      ? memory.experiences.map((e) => (isObj(e) ? { ...e, reward: 0, actions: [] } : e))
      : [];
    return {
      ...s,
      saveVersion: 2,
      brain: { ...brain, initialWeights: JSON.parse(JSON.stringify(brain.weights ?? null)) as unknown },
      learning: null,
      memory: memory ? { ...memory, experiences } : memory,
    };
  },
  // v2 → v3 (rutinas): sin episodios previos (no se inventan hábitos a partir de datos sin
  // contexto); la luz guardada era "la luz de la habitación" y ahora es la lámpara → apagada.
  2: (s) => {
    const memory = isObj(s.memory) ? s.memory : null;
    const world = isObj(s.world) ? s.world : null;
    return {
      ...s,
      saveVersion: 3,
      memory: memory ? { ...memory, routine: { episodes: [], snapshots: [] } } : memory,
      world: world ? { ...world, lightOn: false } : world,
    };
  },
  // v3 → v4 (crecimiento): una mascota existente NO pasa a adulta por antigüedad. Empieza como
  // BEBÉ, o como CACHORRO si ya vivió bastante (experiencias registradas), nunca más; la edad
  // mínima de la etapa empieza a contar al migrar. Así vive al menos una transición con recuerdos.
  3: (s) => {
    const profile = isObj(s.profile) ? s.profile : {};
    const memory = isObj(s.memory) ? s.memory : {};
    const old = isObj(s.growth) ? s.growth : {};
    const now = num(s.savedAt, Date.now());
    const lived = Array.isArray(memory.experiences) ? memory.experiences.length : 0;
    const stage: LifeStage = lived >= MIGRATION_CHILD_EXPERIENCES ? 'CHILD' : 'BABY';
    const bornAt = num(profile.adoptedAt, now);
    const g = newGrowthState(typeof profile.id === 'string' ? profile.id : 'pet', bornAt, stage);
    g.xp = num(old.xp, 0);
    g.stageStartedAt = now;
    g.history = [{ stage: 'BABY', at: bornAt, petDay: 1 }, ...(stage === 'CHILD' ? [{ stage, at: now, petDay: 1 + Math.floor((now - bornAt) / 86_400_000) }] : [])];
    return { ...s, saveVersion: 4, growth: g };
  },
};

// Experiencias registradas a partir de las cuales una mascota migrada empieza como CACHORRO
export const MIGRATION_CHILD_EXPERIENCES = 150;

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
  const routine = isObj(memory.routine) ? memory.routine : null;
  memory.routine = {
    episodes: routine && Array.isArray(routine.episodes) ? routine.episodes.filter((e) => isObj(e) && Number.isFinite(e.start) && Number.isFinite(e.end)) : [],
    snapshots: routine && Array.isArray(routine.snapshots) ? routine.snapshots.filter((x) => isObj(x) && Array.isArray(x.habits)) : [],
  };
  memory.experiences = memory.experiences.map((e) => ({
    ...e,
    reward: typeof e.reward === 'number' && Number.isFinite(e.reward) ? e.reward : 0,
    actions: Array.isArray(e.actions) ? e.actions : [],
  }));
  const learning: LearningState = isObj(doc.learning)
    ? { ...defaultLearningState(baseBrainConfig() as never), ...(doc.learning as Partial<LearningState>) }
    : defaultLearningState(baseBrainConfig() as never);

  const inv = isObj(doc.inventory) && Array.isArray(doc.inventory.owned) ? doc.inventory.owned.filter(isItemKind) : [...DEFAULT_INVENTORY];
  const settings = isObj(doc.settings) ? { ...DEFAULT_SETTINGS, ...(doc.settings as Partial<SaveGame['settings']>) } : { ...DEFAULT_SETTINGS };
  const now = Date.now();

  return {
    saveVersion: 4,
    savedAt: num(doc.savedAt, now),
    lastActiveAt: num(doc.lastActiveAt, now),
    profile: {
      id: typeof profile.id === 'string' ? profile.id : `pet_${now.toString(36)}`,
      name: profile.name.trim().slice(0, 24),
      species,
      adoptedAt: num(profile.adoptedAt, now),
      preset: (['equilibrado', 'curioso', 'miedoso', 'apegado'] as const).includes(profile.preset as never) ? (profile.preset as SaveGame['profile']['preset']) : 'equilibrado',
    },
    growth: validGrowth(doc.growth, typeof profile.id === 'string' ? profile.id : `pet_${now.toString(36)}`, num(profile.adoptedAt, now)),
    inventory: { owned: inv.length ? [...new Set(inv)] : [...DEFAULT_INVENTORY] },
    // Pet.importState sanea cada campo (rango 0..1, posición dentro del mundo)
    pet: (isObj(doc.pet) ? doc.pet : {}) as unknown as SaveGame['pet'],
    world: isObj(doc.world) && Array.isArray(doc.world.objects) ? (doc.world as unknown as SaveGame['world']) : { objects: [], lightOn: false, nextId: 1, tick: 0 },
    brain: {
      configVersion: num(brain.configVersion, 0),
      weights: brain.weights as unknown as SaveGame['brain']['weights'],
      initialWeights: (isObj(brain.initialWeights) ? brain.initialWeights : brain.weights) as unknown as SaveGame['brain']['initialWeights'],
      network: isObj(brain.network) ? (brain.network as unknown as SaveGame['brain']['network']) : null,
      actions: isObj(brain.actions) ? (brain.actions as unknown as SaveGame['brain']['actions']) : { hold: {}, carryTimer: 0 },
    },
    memory,
    settings,
    learning,
  };
}

// Crecimiento saneado: etapa válida, números finitos, listas presentes (nunca adulto por defecto)
function validGrowth(raw: unknown, id: string, bornAt: number): GrowthState {
  const base = newGrowthState(id, bornAt);
  if (!isObj(raw) || !isLifeStage(raw.stage)) return base;
  const dev = isObj(raw.development) ? raw.development : {};
  const mods = isObj(raw.modifiers) ? raw.modifiers : {};
  const def = individualModifiers(id);
  const clampMod = (v: unknown, d: number) => Math.max(0.8, Math.min(1.2, num(v, d)));
  const pending = isObj(raw.pending) && isLifeStage(raw.pending.to) ? { to: raw.pending.to, since: num(raw.pending.since, bornAt) } : null;
  return {
    xp: Math.max(0, num(raw.xp, 0)),
    bornAt: num(raw.bornAt, bornAt),
    stage: raw.stage,
    stageStartedAt: num(raw.stageStartedAt, bornAt),
    development: {
      points: Math.max(0, num(dev.points, 0)),
      repeats: isObj(dev.repeats) ? Object.fromEntries(Object.entries(dev.repeats).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))) as Record<string, number> : {},
      day: num(dev.day, base.development.day),
      dayPoints: Math.max(0, num(dev.dayPoints, 0)),
      awayPoints: null,
      lifetimePoints: Math.max(0, num(dev.lifetimePoints, 0)),
    },
    modifiers: { growthRate: clampMod(mods.growthRate, def.growthRate), size: clampMod(mods.size, def.size), development: clampMod(mods.development, def.development) },
    milestones: Array.isArray(raw.milestones) ? (raw.milestones.filter((m) => isObj(m) && typeof m.type === 'string') as unknown as GrowthState['milestones']) : [],
    pending,
    history: Array.isArray(raw.history) ? (raw.history.filter((h) => isObj(h) && isLifeStage(h.stage)) as unknown as GrowthState['history']) : base.history,
    subjects: isObj(raw.subjects) ? (raw.subjects as unknown as GrowthState['subjects']) : {},
  };
}

// Número de sensores conocidos: si el save es de un genoma con otra topología, el estado dinámico se descarta.
export const SENSOR_COUNT = SENSOR_KEYS.length;

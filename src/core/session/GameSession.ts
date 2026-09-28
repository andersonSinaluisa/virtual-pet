/*
 * GAME SESSION
 * ------------
 * Une las piezas del dominio para UNA mascota:
 *
 *   Simulation (mundo + cerebro) ──► ExperienceRecorder ──► PetMemory
 *                                  ├─► MiniGame activo (observe)
 *                                  └─► DiscoveryEvaluator ──► Moments / Discoveries
 *
 * La app (React Native) solo llama a métodos de aquí y escucha eventos.
 * Nada de React, Expo ni Three.js.
 */
import type { Action } from '../brain/Actions';
import {
  BRAIN_CONFIG_VERSION, createBrainConfig, type BrainConfig, type PresetKey, type SensorKey,
} from '../brain/BrainConfig';
import { exportWeights, importWeights, type WeightImportReport } from '../brain/BrainWeights';
import { computeTraits, type TraitReading } from '../discovery/Personality';
import { evaluateDiscoveries } from '../discovery/DiscoveryEvaluator';
import { behaviorLabel, moodEmoji, moodLabel, thoughtFor } from '../explain/Narrator';
import type { GameId } from '../games/catalog';
import { createGame, type AnyGameView, type AnyMiniGame } from '../games';
import type { GameCommand, GameContext, GameSummary } from '../games/MiniGame';
import { ExperienceRecorder } from '../memory/ExperienceRecorder';
import { composeAdoption, composeDiscovery, composeFirstTime, makeMoment, moodSentence } from '../memory/MomentComposer';
import { PetMemory } from '../memory/PetMemory';
import type { Discovery, Experience, ExperienceKind, Moment, SubjectKey } from '../memory/types';
import {
  CURRENT_SAVE_VERSION, DEFAULT_INVENTORY, type Growth, type Inventory, type PetProfile, type SaveGame, type SettingsData, type SpeciesKey,
} from '../persistence/SaveGame';
import { defaultRng, makeId, type Rng } from '../random';
import { createSimConfig, type PetStat, type PetStats, type SimConfig } from '../simulation/SimConfig';
import { Simulation, type StepOptions, type StepResult } from '../simulation/Simulation';
import type { World } from '../simulation/World';
import { ITEMS, type ItemKind } from '../world/Items';
import { Emitter } from './Emitter';

export interface SessionOptions {
  rng?: Rng;
  now?: () => number;
}

export type SessionEvents = {
  tick: StepResult;
  experience: Experience;
  moment: Moment;
  discovery: Discovery;
  gameEnded: GameSummary;
  changed: undefined;
};

export type WorldInteraction = 'food' | 'water' | 'toy' | 'novel' | 'noise' | 'light' | 'caress' | 'call' | 'treat';

export interface PetSnapshot {
  name: string;
  species: SpeciesKey;
  level: number;
  levelProgress: number; // 0..1 hacia el siguiente nivel
  day: number;
  stats: PetStats;
  mood: string;
  moodEmoji: string;
  thought: string;
  behavior: string;
  active: Action[];
  asleep: boolean;
  lightOn: boolean;
  tick: number;
  playerPresent: boolean;
}

const DAY_MS = 86_400_000;
const DISCOVERY_EVERY = 30; // ticks

export function levelFromXp(xp: number): { level: number; progress: number } {
  const level = 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 25));
  const cur = 25 * (level - 1) ** 2, next = 25 * level ** 2;
  return { level, progress: (xp - cur) / (next - cur) };
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export class GameSession {
  readonly events = new Emitter<SessionEvents>();
  readonly config: SimConfig;
  readonly sim: Simulation;
  readonly memory: PetMemory;
  readonly recorder = new ExperienceRecorder();
  profile: PetProfile;
  growth: Growth;
  inventory: Inventory;
  private activeGame: { id: GameId; game: AnyMiniGame; ctx: GameContext } | null = null;
  private readonly now: () => number;

  private constructor(profile: PetProfile, brainConfig: BrainConfig, opts: SessionOptions, memory = new PetMemory()) {
    this.profile = profile;
    this.now = opts.now ?? (() => Date.now());
    this.config = createSimConfig({ rng: opts.rng ?? defaultRng });
    this.sim = new Simulation(this.config, brainConfig);
    this.memory = memory;
    this.growth = { xp: 0 };
    this.inventory = { owned: [...DEFAULT_INVENTORY] };
  }

  // ---------- Creación ----------
  static create(input: { name: string; species: SpeciesKey; preset?: PresetKey }, opts: SessionOptions = {}): GameSession {
    const now = (opts.now ?? Date.now)();
    const preset = input.preset ?? 'equilibrado';
    const profile: PetProfile = { id: makeId('pet', opts.rng), name: input.name.trim() || 'Milo', species: input.species, adoptedAt: now, preset };
    const s = new GameSession(profile, createBrainConfig(preset), opts);
    s.memory.addMoment(composeAdoption(profile.name, now));
    return s;
  }

  static fromSave(save: SaveGame, opts: SessionOptions = {}): { session: GameSession; weights: WeightImportReport } {
    const config = createBrainConfig(save.profile.preset);
    const weights = importWeights(config, save.brain.weights);
    const s = new GameSession(save.profile, config, opts, new PetMemory(save.memory));
    s.growth = { ...save.growth };
    s.inventory = { owned: [...save.inventory.owned] };
    s.world.importState(save.world);
    s.world.pet.importState(save.pet);
    s.sim.buildBrain(); // sinapsis desde el genoma restaurado
    // El estado dinámico (potenciales) solo si el genoma es de la misma topología
    if (save.brain.network && save.brain.configVersion === BRAIN_CONFIG_VERSION) s.sim.network.importState(save.brain.network);
    s.sim.actionSystem.importState(save.brain.actions);
    return { session: s, weights };
  }

  toSave(settings: SettingsData, lastActiveAt: number): SaveGame {
    return {
      saveVersion: CURRENT_SAVE_VERSION,
      savedAt: this.now(),
      lastActiveAt,
      profile: { ...this.profile },
      growth: { ...this.growth },
      inventory: { owned: [...this.inventory.owned] },
      pet: this.world.pet.exportState(),
      world: this.world.exportState(),
      brain: {
        configVersion: BRAIN_CONFIG_VERSION,
        weights: exportWeights(this.sim.brainConfig),
        network: this.sim.network.exportState(),
        actions: this.sim.actionSystem.exportState(),
      },
      memory: this.memory.exportState(),
      settings: { ...settings },
    };
  }

  get world(): World {
    return this.sim.world;
  }

  get ticksPerSecond(): number {
    return this.config.simulation.baseTicksPerSecond;
  }

  day(at = this.now()): number {
    return Math.max(1, Math.floor((startOfDay(at) - startOfDay(this.profile.adoptedAt)) / DAY_MS) + 1);
  }

  // ---------- Tick ----------
  tick(opts: StepOptions = {}): StepResult {
    const r = this.sim.step(opts);
    this.afterStep(r);
    return r;
  }

  private afterStep(r: StepResult): void {
    const stats = this.memory.stats;
    if (r.offline) stats.offlineTicks++;
    else stats.onlineTicks++;
    if (!this.world.lightOn) {
      stats.darkTicks++;
      if (ExperienceRecorder.isActiveInDark(r.active)) stats.darkActiveTicks++;
    }

    const now = this.now();
    const { onsets, experiences } = this.recorder.observe(r, this.world, { now, day: this.day(now) });
    for (const a of onsets) this.memory.countActionOnset(a);
    for (const e of experiences) this.ingest(e);

    if (this.activeGame) this.activeGame.game.observe(r, this.activeGame.ctx);
    if (experiences.length || r.tick % DISCOVERY_EVERY === 0) this.evaluateDiscoveries();
    this.events.emit('tick', r);
  }

  private ingest(exp: Experience): void {
    const { first } = this.memory.addExperience(exp);
    if (exp.valence > 0) this.growth.xp += exp.valence * exp.intensity * 10;
    this.events.emit('experience', exp);
    if (first) {
      const m = composeFirstTime(exp, this.profile.name, this.world.pet.snapshot());
      if (m) this.addMoment(m);
    }
  }

  private addMoment(m: Moment): void {
    this.memory.addMoment(m);
    this.events.emit('moment', m);
  }

  private evaluateDiscoveries(): void {
    const now = this.now();
    for (const d of evaluateDiscoveries(this.memory, this.sim.brainConfig, this.profile.name, now, this.day(now))) {
      this.memory.addDiscovery(d);
      this.events.emit('discovery', d);
      this.addMoment(composeDiscovery(d));
    }
  }

  // Experiencia registrada por un minijuego (contexto de juego)
  recordExperience(kind: ExperienceKind, subject: SubjectKey | null, valence: number, intensity: number, gameId: GameId | null): Experience {
    const now = this.now();
    const exp: Experience = {
      id: makeId('exp', this.config.rng), at: now, day: this.day(now), tick: this.sim.network.tickCount, kind, subject,
      valence: Math.max(-1, Math.min(1, valence)), intensity: Math.max(0, Math.min(1, intensity)), gameId, offline: false,
    };
    this.ingest(exp);
    return exp;
  }

  // ---------- Interacciones del jugador (solo mundo) ----------
  setPlayerPresent(present: boolean): void {
    this.world.setPlayerPresent(present);
  }

  interact(kind: WorldInteraction): void {
    const w = this.world;
    switch (kind) {
      case 'food': w.addFood(); break;
      case 'water': w.addWater(); break;
      case 'toy': w.placeToy(); break;
      case 'novel': w.addNovelObject(); break;
      case 'noise': w.makeNoise(); break;
      case 'light': w.toggleLight(); break;
      case 'caress': w.caress(); break;
      case 'call': w.callPet(1); break;
      case 'treat': w.offerTreat(); break;
    }
  }

  petDirect(): void {
    this.world.petDirect();
  }

  placeItem(kind: ItemKind): boolean {
    if (!this.inventory.owned.includes(kind) || !ITEMS[kind].inventory) return false;
    // Un objeto de cada tipo en la habitación: si ya está, se mueve cerca de ti
    const existing = this.world.objects.find((o) => o.kind === kind && o.tag === null);
    if (existing) this.world.removeObject(existing.id);
    this.world.placeItem(kind);
    return true;
  }

  storeItem(kind: ItemKind): void {
    const existing = this.world.objects.find((o) => o.kind === kind && o.tag === null && !o.fixed);
    if (existing) this.world.removeObject(existing.id);
  }

  unlock(kind: ItemKind): void {
    if (!this.inventory.owned.includes(kind)) {
      this.inventory.owned.push(kind);
      this.events.emit('changed', undefined);
    }
  }

  // ---------- Minijuegos ----------
  startGame(id: GameId): boolean {
    if (this.activeGame) this.endGame();
    const game = createGame(id);
    if (!game) return false;
    const ctx: GameContext = {
      sim: this.sim,
      world: this.world,
      petName: this.profile.name,
      now: this.now,
      day: () => this.day(),
      ticksPerSecond: this.ticksPerSecond,
      record: (kind, subject, valence, intensity) => this.recordExperience(kind, subject, valence, intensity, id),
      addMoment: (m) => {
        const now = this.now();
        this.addMoment(makeMoment({ ...m, now, day: this.day(now), kind: 'game', gameId: id }));
      },
      unlock: (k) => this.unlock(k),
      ownedItems: () => [...this.inventory.owned],
    };
    game.start(ctx);
    this.activeGame = { id, game, ctx };
    return true;
  }

  get activeGameId(): GameId | null {
    return this.activeGame?.id ?? null;
  }

  gameInput(cmd: GameCommand): void {
    if (this.activeGame) this.activeGame.game.input(cmd, this.activeGame.ctx);
  }

  gameView(): AnyGameView | null {
    return this.activeGame ? this.activeGame.game.view(this.activeGame.ctx) : null;
  }

  endGame(): GameSummary | null {
    const g = this.activeGame;
    if (!g) return null;
    this.activeGame = null;
    const summary = g.game.end(g.ctx);
    this.evaluateDiscoveries();
    this.events.emit('gameEnded', summary);
    return summary;
  }

  // ---------- Recuerdos ----------
  captureMoment(snapshotUri: string | null): Moment {
    const now = this.now(), pet = this.world.pet;
    const m = makeMoment({
      now, day: this.day(now), kind: 'captured', title: `${this.profile.name} ${behaviorLabel(this.sim.last.active).toLowerCase()}`,
      story: `${thoughtFor(this.sim.last.active, this.world, this.profile.name)} ${moodSentence(this.profile.name, pet.snapshot())}`,
      tags: ['#Instantánea'], icon: 'camera', snapshotUri,
    });
    this.addMoment(m);
    return m;
  }

  attachSnapshot(momentId: string, uri: string): void {
    const m = this.memory.moment(momentId);
    if (m && !m.snapshotUri) { m.snapshotUri = uri; this.events.emit('changed', undefined); }
  }

  toggleFavorite(momentId: string): boolean {
    const v = this.memory.toggleFavorite(momentId);
    this.events.emit('changed', undefined);
    return v;
  }

  // ---------- Lectura para la UI ----------
  snapshot(): PetSnapshot {
    const pet = this.world.pet, stats = pet.snapshot(), last = this.sim.last;
    const { level, progress } = levelFromXp(this.growth.xp);
    return {
      name: this.profile.name, species: this.profile.species, level, levelProgress: progress, day: this.day(), stats,
      mood: moodLabel(stats), moodEmoji: moodEmoji(stats), thought: thoughtFor(last.active, this.world, this.profile.name),
      behavior: behaviorLabel(last.active), active: [...last.active], asleep: pet.asleep, lightOn: this.world.lightOn,
      tick: this.sim.network.tickCount, playerPresent: this.world.player.present,
    };
  }

  traits(): TraitReading[] {
    return computeTraits(this.sim.brainConfig, this.memory.stats);
  }

  // ---------- Herramientas de desarrollo ----------
  forceSensor(key: SensorKey, value: number, ticks = 15): void {
    this.sim.forceSensor(key, value, ticks);
  }

  setPetStat(stat: PetStat, value: number): void {
    const pet = this.world.pet;
    pet.change(stat, value - pet[stat]);
  }

  clearMemory(): void {
    this.memory.clear();
    this.recorder.reset();
    this.events.emit('changed', undefined);
  }
}

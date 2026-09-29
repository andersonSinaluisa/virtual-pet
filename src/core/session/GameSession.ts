/*
 * GAME SESSION
 * ------------
 * Une las piezas del dominio para UNA mascota:
 *
 *   Simulation (mundo + cerebro) ──► ExperienceRecorder ──► PetMemory
 *                                  │                      └─► reward ──► SynapticPlasticity ──► pesos
 *                                  ├─► MiniGame activo (observe)
 *                                  ├─► DecisionTrace ("¿por qué hizo eso?")
 *                                  └─► DiscoveryEvaluator ──► Moments / Discoveries
 *
 * La app (React Native) solo llama a métodos de aquí y escucha eventos.
 * Nada de React, Expo ni Three.js.
 */
import type { Action } from '../brain/Actions';
import {
  BRAIN_CONFIG_VERSION, cloneBrainConfig, createBrainConfig, type BrainConfig, type PresetKey, type SensorKey,
} from '../brain/BrainConfig';
import { buildDecisionTrace, EXPLAINED_ACTIONS, type DecisionTrace } from '../explain/DecisionTrace';
import { NATURAL_KINDS, RewardBaseline, rewardFor, threatFor } from '../learning/RewardModel';
import { SynapticPlasticity, type LearningEvent, type LearningState } from '../learning/Plasticity';
import { exportWeights, importWeights, type WeightImportReport } from '../brain/BrainWeights';
import { computeTraits, type TraitReading } from '../discovery/Personality';
import { evaluateDiscoveries } from '../discovery/DiscoveryEvaluator';
import { behaviorLabel, moodEmoji, moodLabel, thoughtFor } from '../explain/Narrator';
import type { GameId } from '../games/catalog';
import { createGame, type AnyGameView, type AnyMiniGame } from '../games';
import type { GameCommand, GameContext, GameSummary } from '../games/MiniGame';
import { ExperienceRecorder , buildContext } from '../memory/ExperienceRecorder';
import { composeAdoption, composeDiscovery, composeFirstTime, makeMoment, moodSentence } from '../memory/MomentComposer';
import { PetMemory } from '../memory/PetMemory';
import type { Discovery, Experience, ExperienceKind, Moment, SubjectKey , EpisodeRecord } from '../memory/types';
import {
  CURRENT_SAVE_VERSION, DEFAULT_INVENTORY, DEFAULT_SETTINGS, type Inventory, type PetProfile, type SaveGame, type SettingsData, type SpeciesKey,
} from '../persistence/SaveGame';
import { defaultRng, makeId, seededRng, type Rng } from '../random';
import { applyPhysiology, createSimConfig, type PetStat, type PetStats, type PhysiologyProfile, type SimConfig } from '../simulation/SimConfig';
import { Simulation, type StepOptions, type StepResult } from '../simulation/Simulation';
import type { World } from '../simulation/World';
import { ITEMS, isItemKind, type ItemKind } from '../world/Items';
import { LOCATIONS, PLAYABLE_LOCATIONS, exitBetween, type LocationId } from '../world/Locations';
import { familiarityWord, KNOWLEDGE_STAGES, STAGE_WORD, type KnowledgeStage, type StageEvent } from '../world/ExplorationMemory';
import { stageIndex } from '../growth/LifeStage';
import type { Point } from '../simulation/Pet';
import { Emitter } from './Emitter';
import { generateVoiceProfile, hashSeed, type PetVoiceProfile } from '../audio/PetVoiceProfile';
import { VocalizationSystem, type LayerState, type VocalContext, type VocalizationEvent } from '../audio/VocalizationSystem';
import type { LayerId } from '../audio/SpeciesVocalizationProfile';
import { weightsHash } from '../growth/brainHash';
import { GROWTH_CONFIG, stageConfig } from '../growth/GrowthConfig';
import { compareSummaries, compareWithinStage, recapMoments, type StageComparison } from '../growth/GrowthStory';
import { GrowthSystem, newGrowthState, type Eligibility } from '../growth/GrowthSystem';
import { stageLabel, type LifeStage } from '../growth/LifeStage';


import { areaOf } from '../routines/areas';
import { detectHabits, type Habit } from '../routines/HabitDetector';
import { interpretRoutines, routineDiscoveries, snapshotEntries, type RoutineCard } from '../routines/RoutineInterpreter';
import { clockInfo, type Clock, type TimeOfDay } from '../time/WorldClock';

export interface SessionOptions {
  rng?: Rng;
  now?: () => number; // compatibilidad: equivale a un reloj { now }
  clock?: Clock; // v5: reloj del mundo inyectado (real, simulación o test)
  physiology?: PhysiologyProfile; // v5: 'day' para simular días a 1 minuto por tick
  lifeStage?: LifeStage; // v6: etapa al NACER (solo create; experimentos de referencia usan YOUNG)
}

// v6: lo que se conserva al crecer (se comprueba en cada transición)
export interface IdentitySnapshot {
  weightsHash: string;
  experiences: number;
  moments: number;
  episodes: number;
  discoveries: number;
}

export interface GrowthEvent {
  from: LifeStage;
  to: LifeStage;
  at: number;
  petDay: number;
  before: IdentitySnapshot;
  after: IdentitySnapshot;
  brainPreserved: boolean; // mismos pesos antes y después (la transición no toca el cerebro)
  recap: Moment[]; // 2–3 recuerdos reales
  comparisons: StageComparison[]; // "antes / ahora" derivado del historial
  momentId: string;
}

// Ventana para considerar que la mascota "salió a recibirte" al volver
const RETURN_WINDOW = 20;
const RETURN_FAR = 0.3;
export const GREETING: ReadonlySet<Action> = new Set<Action>(['APPROACH', 'GREET', 'FOLLOW_PLAYER']);

export type SessionEvents = {
  tick: StepResult;
  experience: Experience;
  growth: GrowthEvent;
  moment: Moment;
  discovery: Discovery;
  gameEnded: GameSummary;
  changed: undefined;
  learning: LearningEvent;
  // v8 (voz): qué dice la mascota (la plataforma lo reproduce) y sus capas continuas
  vocalization: VocalizationEvent;
  audioLayers: Record<LayerId, LayerState>;
};

// Acciones que el jugador puede recompensar justo después (❤️ Recompensar)
const REWARDABLE: ReadonlySet<Action> = new Set<Action>(['APPROACH', 'FOLLOW_PLAYER', 'INVESTIGATE', 'PICK_UP_OBJECT', 'PLAY', 'GREET']);
const REWARD_WINDOW = 12; // ticks tras el inicio de la acción
const REWARD_COOLDOWN = 8;
const MAX_DECISIONS = 20;

export interface BrainBundle {
  format: 'milo-brain';
  version: 1;
  exportedAt: number;
  pet: { name: string; species: SpeciesKey; preset: PresetKey };
  brain: { configVersion: number; weights: SaveGame['brain']['weights']; initialWeights: SaveGame['brain']['initialWeights'] };
  learning: LearningState;
  memory?: SaveGame['memory'];
  personality: string[]; // interpretación (solo informativa)
  preferences: { subject: string; score: number; positive: number }[];
}

export type WorldInteraction = 'food' | 'water' | 'toy' | 'novel' | 'noise' | 'light' | 'caress' | 'call' | 'treat';

export interface PetSnapshot {
  name: string;
  species: SpeciesKey;
  // v6: crecimiento (sin XP visible)
  lifeStage: LifeStage;
  stageLabel: string;
  growthVisual: number; // 0..3 continuo (índice de etapa + avance sutil dentro de la etapa)
  sizeModifier: number; // variación individual del tamaño
  growthPending: boolean;
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
  rewardable: Action | null; // acción reciente que el jugador puede recompensar
  learnedExperiences: number;
  // v5: contexto (solo informativo para la UI)
  minuteOfDay: number;
  timeOfDay: TimeOfDay;
  lightLevel: number;
  lampOn: boolean;
  area: string;
  recentActivity: number;
  // v7: mundo vivo
  location: LocationId;
  locationLabel: string;
  locationEmoji: string;
  gardenDoorOpen: boolean;
  weather: string;
}

// v7: lo que la UI enseña de cada lugar (sin números)
export interface PlaceSummary {
  id: LocationId;
  name: string;
  emoji: string;
  here: boolean;
  visited: boolean;
  familiarity: string; // "Muy familiar", "Conocido", "Aún por descubrir"
  canBeThere: boolean; // su cuerpo ya puede (etapa de vida)
  readyHint: string | null; // "Milo parece listo para conocer el jardín"
  available: boolean; // forest/beach: aún no
}

export interface ObjectDiscoverySummary {
  kind: ItemKind;
  name: string;
  emoji: string;
  stage: KnowledgeStage;
  stageWord: string;
  familiarity: string;
  firstSeenDay: number;
}

// v7: primera visita a un lugar en curso (se observa lo que HACE, no se le dice qué hacer)
interface VisitObservation {
  location: LocationId;
  startTick: number;
  start: number;
  offline: boolean;
  arrive: Point;
  ticks: number;
  maxDist: number;
  onsets: Partial<Record<Action, number>>;
  seen: ItemKind[];
}
const FIRST_VISIT_TICKS = 180; // ~1 minuto de app

const DAY_MS = 86_400_000;
const UNSAFE_FOR_GROWTH: ReadonlySet<Action> = new Set<Action>(['PLAY', 'PICK_UP_OBJECT', 'EAT', 'DRINK', 'GET_SCARED', 'HIDE', 'RUN', 'SLEEP']);
const DISCOVERY_EVERY = 30; // ticks

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
  growth: GrowthSystem;
  inventory: Inventory;
  plasticity!: SynapticPlasticity;
  initialBrain: BrainConfig; // genoma con el que nació (referencia de lo aprendido)
  readonly decisions: DecisionTrace[] = [];
  readonly baseline = new RewardBaseline();
  private lastRewardable: { action: Action; tick: number } | null = null;
  private lastPlayerRewardTick = -Infinity;
  private activeGame: { id: GameId; game: AnyMiniGame; ctx: GameContext } | null = null;
  private readonly now: () => number;
  readonly clock: Clock;
  private timeOverride: number | null = null; // simulación offline: la hora de cada tick pasado
  private pendingReturn: { tick: number; start: number; minuteOfDay: number; day: number; area: string; light: number; activity: number; offline: boolean; d0: number } | null = null;
  private lastHabitDay: number | null = null;
  private physiology: PhysiologyProfile;
  lastGrowth: GrowthEvent | null = null; // última transición (herramientas: comparar antes/después)
  private visit: VisitObservation | null = null;
  // v8: la voz (interpreta lo que ya hizo la SNN; nunca decide comportamiento)
  vocal!: VocalizationSystem;
  private traitCache: { tick: number; traits: VocalContext['traits']; familiarity: number } | null = null;

  private constructor(profile: PetProfile, brainConfig: BrainConfig, opts: SessionOptions, memory = new PetMemory(), initial?: BrainConfig) {
    this.profile = profile;
    this.clock = opts.clock ?? { now: opts.now ?? (() => Date.now()) };
    this.now = () => this.timeOverride ?? this.clock.now();
    this.config = createSimConfig({ rng: opts.rng ?? defaultRng });
    this.physiology = opts.physiology ?? 'app';
    this.sim = new Simulation(this.config, brainConfig);
    this.memory = memory;
    this.growth = new GrowthSystem(newGrowthState(profile.id, profile.adoptedAt, opts.lifeStage ?? 'BABY'));
    this.inventory = { owned: [...DEFAULT_INVENTORY] };
    this.initialBrain = initial ?? cloneBrainConfig(brainConfig);
    this.attachPlasticity();
    this.attachWorld();
    this.applyStage();
    this.attachVoice(generateVoiceProfile(`${profile.name}|${profile.species}|${profile.adoptedAt}`, profile.species));
  }

  // v8: voz propia (estable) + sistema de vocalización con semilla por mascota
  attachVoice(voice: PetVoiceProfile): void {
    // Semilla estable (nombre + especie + adopción, como los microeventos): reproducible en tests
    const seed = hashSeed(`${this.profile.name}|${this.profile.species}|${this.profile.adoptedAt}|voice`);
    this.vocal = new VocalizationSystem(this.profile.species, voice, seededRng(seed), this.profile.adoptedAt);
  }

  get voice(): PetVoiceProfile {
    return this.vocal.voice;
  }

  // `now` se pasa siempre: leer el reloj avanza los relojes simulados de los tests
  vocalContext(now: number, offline = false): VocalContext {
    const pet = this.world.pet;
    const tick = this.sim.network.tickCount;
    if (!this.traitCache || tick - this.traitCache.tick > 90) {
      const petted = this.memory.experiences.filter((e) => e.kind === 'petted').length;
      this.traitCache = { tick, traits: Object.fromEntries(this.traits().map((t) => [t.key, t.score])), familiarity: Math.min(1, (this.day(now) - 1) / 14 + petted / 60) };
    }
    return {
      nowMs: now, species: this.profile.species, stage: this.growth.stage, asleep: pet.asleep,
      stats: { energy: pet.energy, fatigue: pet.fatigue, affection: pet.affection, fear: pet.fear, boredom: pet.boredom },
      speed: pet.speed, playerPresent: this.world.player.present, petting: this.world.player.touchTicks > 0,
      familiarity: this.traitCache.familiarity, traits: this.traitCache.traits, offline,
    };
  }

  private vocalize(r: StepResult, onsets: readonly Action[], now: number): void {
    const ctx = this.vocalContext(now, r.offline);
    const { events, layers } = this.vocal.update(ctx, { tick: r.tick, onsets, active: r.active, events: r.events });
    if (r.offline) return; // offline: solo se cuentan intenciones (nadie estaba escuchando)
    for (const e of events) {
      // Opcional: la voz como estímulo del mundo (futuras mascotas). Audio ≠ estímulo.
      if (e.stimulus > 0) this.world.emitSound({ kind: 'voice', intensity: e.stimulus, x: this.world.pet.x, y: this.world.pet.y });
      this.events.emit('vocalization', e);
    }
    this.events.emit('audioLayers', layers);
  }

  // v7: el mundo percibe con la memoria de ESTA mascota; su cuerpo decide dónde puede estar;
  // los microeventos tienen su propia semilla (reproducibles por mascota)
  private attachWorld(): void {
    this.world.knowledge = this.memory.exploration;
    this.world.setClock(this.now()); // la hora del mundo desde el primer momento (no desde el primer tick)
    this.world.capability = (loc) => {
      const min = LOCATIONS[loc].minStage;
      return !min || stageIndex(this.growth.stage) >= stageIndex(min);
    };
    // Semilla estable por mascota (nombre + especie + adopción): reproducible en tests y tras cargar
    let h = 7;
    for (const c of `${this.profile.name}|${this.profile.species}|${this.profile.adoptedAt}`) h = (h * 31 + c.charCodeAt(0)) % 2147483647;
    this.world.ambient.setRng(seededRng(h));
  }

  // v6: lo que la ETAPA modula (nunca el cerebro): plasticidad, cuerpo y capacidades
  private applyStage(): void {
    const c = stageConfig(this.growth.stage);
    this.plasticity.stageMultiplier = this.growth.plasticityMultiplier;
    applyPhysiology(this.config, this.physiology, { needs: c.needs, speed: c.speed });
    this.sim.actionSystem.gate = (a) => this.growth.gate(a);
  }

  // (Re)conecta la plasticidad al cerebro actual (tras construir o reconstruir la red)
  private attachPlasticity(state?: LearningState | null): void {
    const prev = this.plasticity as SynapticPlasticity | undefined;
    prev?.detach();
    this.plasticity = new SynapticPlasticity(this.sim.brain, this.initialBrain);
    if (state) { this.plasticity.importState(state); this.baseline.import(state.baselines); }
    else if (prev) this.plasticity.importState(prev.exportState());
  }

  // ---------- Creación ----------
  static create(input: { name: string; species: SpeciesKey; preset?: PresetKey }, opts: SessionOptions = {}): GameSession {
    const now = opts.clock ? opts.clock.now() : (opts.now ?? Date.now)();
    const preset = input.preset ?? 'equilibrado';
    const profile: PetProfile = { id: makeId('pet', opts.rng), name: input.name.trim() || 'Milo', species: input.species, adoptedAt: now, preset };
    const s = new GameSession(profile, createBrainConfig(preset), opts);
    // Llega a SU habitación con SUS muebles (lo demás del mundo le es desconocido)
    s.memory.exploration.seedHome(now, LOCATIONS.room.furniture.map((f) => f.kind));
    const arrival = composeAdoption(profile.name, now);
    arrival.lifeStage = s.growth.stage;
    s.memory.addMoment(arrival);
    s.growth.addMilestone('ARRIVED', now, 1, null, arrival.id);
    return s;
  }

  static fromSave(save: SaveGame, opts: SessionOptions = {}): { session: GameSession; weights: WeightImportReport } {
    const config = createBrainConfig(save.profile.preset);
    const weights = importWeights(config, save.brain.weights);
    const initial = createBrainConfig(save.profile.preset);
    importWeights(initial, save.brain.initialWeights ?? save.brain.weights);
    const s = new GameSession(save.profile, config, opts, new PetMemory(save.memory), initial);
    s.growth = new GrowthSystem(JSON.parse(JSON.stringify(save.growth)) as SaveGame['growth']);
    s.attachWorld();
    s.inventory = { owned: [...save.inventory.owned] };
    s.world.importState(save.world);
    s.world.pet.importState(save.pet);
    s.sim.buildBrain(); // sinapsis desde el genoma restaurado
    // El estado dinámico (potenciales) solo si el genoma es de la misma topología
    if (save.brain.network && save.brain.configVersion === BRAIN_CONFIG_VERSION) s.sim.network.importState(save.brain.network);
    s.sim.actionSystem.importState(save.brain.actions);
    s.attachPlasticity(save.learning); // tras reconstruir la red: pesos iniciales/actuales y estado
    s.applyStage();
    s.attachVoice(save.audio.voice);
    return { session: s, weights };
  }

  toSave(settings: SettingsData, lastActiveAt: number): SaveGame {
    return {
      saveVersion: CURRENT_SAVE_VERSION,
      savedAt: this.now(),
      lastActiveAt,
      profile: { ...this.profile },
      growth: this.growth.exportState(),
      inventory: { owned: [...this.inventory.owned] },
      pet: this.world.pet.exportState(),
      world: this.world.exportState(),
      brain: {
        configVersion: BRAIN_CONFIG_VERSION,
        weights: exportWeights(this.sim.brainConfig),
        initialWeights: exportWeights(this.initialBrain),
        network: this.sim.network.exportState(),
        actions: this.sim.actionSystem.exportState(),
      },
      memory: this.memory.exportState(),
      settings: { ...settings },
      learning: { ...this.plasticity.exportState(), baselines: this.baseline.export() },
      audio: { voice: { ...this.vocal.voice, preferredVariants: [...this.vocal.voice.preferredVariants] } },
    };
  }

  // Copia independiente (mismo cerebro, misma memoria) para experimentos y evaluación
  static clone(source: GameSession, opts: SessionOptions = {}): GameSession {
    const save = JSON.parse(JSON.stringify(source.toSave(DEFAULT_SETTINGS, source.now()))) as SaveGame;
    return GameSession.fromSave(save, opts).session;
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
    // El tiempo es CONTEXTO: el mundo recibe la hora y la mascota la percibe (nunca la obedece)
    if (this.timeOverride === null) this.clock.onTick?.();
    this.world.setClock(this.now());
    const r = this.sim.step(opts);
    this.afterStep(r);
    return r;
  }

  private afterStep(r: StepResult): void {
    const stats = this.memory.stats;
    if (r.offline) stats.offlineTicks++;
    else stats.onlineTicks++;
    if (this.world.lightLevel < 0.3) {
      stats.darkTicks++;
      if (ExperienceRecorder.isActiveInDark(r.active)) stats.darkActiveTicks++;
    }

    const now = this.now();
    this.onWorldEvents(r, now);
    const { onsets, experiences, episodes } = this.recorder.observe(r, this.world, { now, day: this.day(now) });
    for (const e of episodes) this.onEpisode(e, now);
    this.trackReturn(r, onsets, now);
    for (const a of onsets) {
      this.memory.countActionOnset(a);
      if (REWARDABLE.has(a)) this.lastRewardable = { action: a, tick: r.tick };
      if (EXPLAINED_ACTIONS.has(a) && !r.offline) this.recordDecision(a, r, now);
    }
    for (const e of experiences) this.ingest(e);
    this.onKnowledge(this.world.knowledge.drainStageEvents(), r, now);
    this.observeVisit(r, onsets, now);
    this.vocalize(r, onsets, now);

    if (this.activeGame) this.activeGame.game.observe(r, this.activeGame.ctx);
    if (experiences.length || r.tick % DISCOVERY_EVERY === 0) this.evaluateDiscoveries();
    const day = clockInfo(now).day;
    if (day !== this.lastHabitDay && !r.offline) { this.lastHabitDay = day; this.onNewDay(now, day); }
    if (r.tick % GROWTH_CONFIG.evaluateEveryTicks === 0 || this.growth.state.pending) this.checkGrowth(r, now);
    this.events.emit('tick', r);
  }

  // ---------- Crecimiento (v6) ----------
  private onEpisode(e: EpisodeRecord, now: number): void {
    e.lifeStage = this.growth.stage;
    this.memory.addEpisode(e);
    if (e.offline) return;
    const petDay = this.day(now);
    if (e.kind === 'explore') {
      this.growth.addDevelopment(`explore:${e.area}`, GROWTH_CONFIG.explorePoints, now);
      this.growth.addMilestone('FIRST_EXPLORE', e.start, this.day(e.start), e.area);
    }
    if (e.kind === 'sleep' && !this.world.player.present) this.growth.addMilestone('FIRST_SLEEP_ALONE', e.start, petDay);
  }

  private onDiscovery(d: Discovery): void {
    const now = this.now(), petDay = this.day(now);
    this.growth.addDevelopment(`discovery:${d.key}`, GROWTH_CONFIG.discoveryPoints, now);
    this.growth.addMilestone('FIRST_DISCOVERY', now, petDay, d.key);
    if (d.key.startsWith('learned:')) this.growth.addMilestone('FIRST_LEARNED_ASSOCIATION', now, petDay, d.key);
    if (d.key.startsWith('habit:')) this.growth.addMilestone('FIRST_HABIT', now, petDay, d.key);
  }

  // Momento seguro para crecer: no en medio de dormir, jugar, comer, un susto o un minijuego
  private isSafeForGrowth(): boolean {
    if (this.world.pet.asleep || this.activeGame) return false;
    return !this.sim.last.active.some((a) => UNSAFE_FOR_GROWTH.has(a));
  }

  growthEligibility(now = this.now()): Eligibility {
    return this.growth.eligibility(now);
  }

  private checkGrowth(r: StepResult, now: number): void {
    const pending = !!this.growth.state.pending;
    if (!pending && !this.growth.eligibility(now).eligible) return;
    // Offline nunca crece solo: queda pendiente para vivirlo al volver
    if (r.offline || !this.isSafeForGrowth()) { this.growth.markPending(now); return; }
    this.transition(now);
  }

  identity(): IdentitySnapshot {
    return {
      weightsHash: weightsHash(exportWeights(this.sim.brainConfig)), experiences: this.memory.experiences.length,
      moments: this.memory.moments.length, episodes: this.memory.episodes.length, discoveries: this.memory.discoveries.length,
    };
  }

  /*
   * LifeStageTransition (transaccional):
   *   instantánea → un paso de etapa → moduladores/capacidades → hito + recuerdo → evento.
   * Si algo falla, se restaura el estado de crecimiento anterior (nunca queda a medias).
   * El cerebro NO se toca: se comprueba con el hash de pesos antes/después.
   */
  transition(now = this.now()): GrowthEvent | null {
    const prev = this.growth.exportState();
    const before = this.identity();
    const petDay = this.day(now);
    try {
      const step = this.growth.advance(now, petDay);
      if (!step) return null;
      this.applyStage();
      const label = stageLabel(step.to, this.profile.species);
      const name = this.profile.name;
      const recap = recapMoments(this.memory.moments, 3, step.from);
      // Primer crecimiento: lo que cambió durante la infancia; después, etapa anterior vs la que termina
      const prevStage = this.growth.state.history.length >= 3 ? this.growth.state.history[this.growth.state.history.length - 3].stage : null;
      const comparisons = prevStage
        ? compareSummaries(this.growth.state.subjects[prevStage], this.growth.state.subjects[step.from])
        : compareWithinStage(this.memory.experiences, step.from);
      const moment = makeMoment({
        now, day: petDay, kind: 'milestone', title: `${name} está creciendo`,
        story: `Ahora es ${label.toLowerCase()}. Parece que fue ayer cuando ${name} llegó a casa.`,
        tags: ['#Crecimiento'], icon: 'sparkle', keyMoment: true,
      });
      moment.lifeStage = step.to;
      this.memory.addMoment(moment);
      this.growth.addMilestone('GREW', now, petDay, step.to, moment.id);
      const after = this.identity();
      const ev: GrowthEvent = {
        ...step, at: now, petDay, before, after, brainPreserved: before.weightsHash === after.weightsHash, recap, comparisons, momentId: moment.id,
      };
      this.lastGrowth = ev;
      this.events.emit('moment', moment);
      this.events.emit('growth', ev);
      return ev;
    } catch (e) {
      this.growth.state = prev;
      this.applyStage();
      throw e;
    }
  }

  // ---- Herramientas de desarrollo (nunca desde la UI de producción) ----
  devSetDevelopmentProgress(p: number): void {
    const need = stageConfig(this.growth.stage).developmentPoints;
    if (Number.isFinite(need)) this.growth.state.development.points = Math.max(0, Math.min(1, p)) * need;
  }

  devAddDevelopment(points: number): void {
    const d = this.growth.state.development, need = stageConfig(this.growth.stage).developmentPoints;
    if (Number.isFinite(need)) d.points = Math.min(need, d.points + Math.max(0, points));
  }

  // Desarrollo por N experiencias variadas SIN pasar por el cerebro (no se inventan recuerdos ni pesos)
  devSimulateExperiences(n: number): number {
    const kinds = Object.keys(GROWTH_CONFIG.experiencePoints) as ExperienceKind[];
    const subjects = ['ball', 'teddy', 'duck', 'rope', 'player', null];
    let gained = 0;
    for (let i = 0; i < n; i++) {
      const at = this.now() + i * 60_000; // repartidas en el tiempo (el tope diario sigue aplicando)
      gained += this.growth.noteExperience(kinds[i % kinds.length], subjects[i % subjects.length], 1, at, false);
    }
    return gained;
  }

  devSatisfyAge(): void {
    const min = this.growth.minDurationMs();
    if (Number.isFinite(min)) this.growth.state.stageStartedAt = Math.min(this.growth.state.stageStartedAt, this.now() - min);
  }

  // Cuando vuelves: ¿salió a recibirte? (evidencia para el hábito, no una orden)
  private trackReturn(r: StepResult, onsets: readonly Action[], now: number): void {
    if (r.events.some((e) => e.type === 'PLAYER_ENTERED')) {
      const info = clockInfo(now);
      this.pendingReturn = {
        tick: r.tick, start: now, minuteOfDay: Math.round(info.minuteOfDay), day: info.day, area: areaOf(this.world.location, this.world.pet),
        light: this.world.lightLevel, activity: this.world.recentActivity, offline: r.offline,
        d0: this.world.distance(this.world.pet, this.world.player),
      };
    }
    const p = this.pendingReturn;
    if (!p) return;
    // Salir a recibir = empezar a acercarse/saludar, o llegar hasta ti si estaba lejos
    // (mirar hacia la puerta o estar ya al lado no cuenta)
    const greeted = onsets.some((a) => GREETING.has(a)) || (p.d0 >= RETURN_FAR && this.world.distance(this.world.pet, this.world.player) < 0.2);
    const elapsed = r.tick - p.tick;
    if (greeted || elapsed >= RETURN_WINDOW) {
      const rec: EpisodeRecord = {
        kind: 'return', start: p.start, end: now, minuteOfDay: p.minuteOfDay, day: p.day, area: p.area, light: p.light,
        activityBefore: p.activity, subject: 'player', responded: greeted, latencyTicks: elapsed, offline: p.offline,
      };
      this.memory.addEpisode(rec);
      this.pendingReturn = null;
    }
  }

  // Una vez por día del mundo: instantánea de hábitos (para la evolución) y descubrimientos de rutina
  private onNewDay(now: number, day: number): void {
    const habits = this.habits(now);
    this.memory.addHabitSnapshot({ day, petDay: this.day(now), habits: snapshotEntries(habits) });
    for (const d of routineDiscoveries(habits, this.profile.name)) {
      if (this.memory.hasDiscovery(d.key)) continue;
      const disc: Discovery = { ...d, id: makeId('dis', this.config.rng), at: now, day: this.day(now), evidence: habits[0]?.evidenceCount ?? 0, subject: null };
      this.memory.addDiscovery(disc);
      this.onDiscovery(disc);
      this.events.emit('discovery', disc);
      this.addMoment(composeDiscovery(disc));
    }
  }

  // ---------- Hábitos y rutinas (INTERPRETACIÓN del comportamiento; la SNN no los consulta) ----------
  habits(now = this.now()): Habit[] {
    return detectHabits(this.memory.episodes, now);
  }

  routines(now = this.now()): RoutineCard[] {
    return interpretRoutines(this.habits(now), this.profile.name);
  }

  // Simulación offline: cada tick pasado ocurre a su hora (la noche pasa de verdad)
  // Evaluación / herramientas: olvida los episodios de rutina (no toca el cerebro)
  clearRoutineEvidence(): void {
    this.memory.clearRoutine();
    this.lastHabitDay = null;
  }

  setPhysiology(profile: PhysiologyProfile): void {
    this.physiology = profile;
    this.applyStage();
  }

  setTimeOverride(ms: number | null): void {
    this.timeOverride = ms;
  }

  private ingest(exp: Experience): void {
    exp.lifeStage ??= this.growth.stage;
    const { first } = this.memory.addExperience(exp);
    // EXPERIENCE → REWARD → PLASTICITY (el aprendizaje se ejecuta antes que cualquier efecto de UI)
    // v5: las recompensas naturales pasan SIEMPRE por el error de predicción, también con resultado 0:
    // dormir descansado no resuelve nada → peor que lo habitual → la asociación se debilita
    const signal = this.baseline.advantage(exp.kind, exp.reward);
    if (signal) {
      const ev = this.plasticity.applyReward(signal, { source: exp.kind, subject: exp.subject, at: exp.at, tick: exp.tick, natural: NATURAL_KINDS.has(exp.kind) });
      if (ev) this.events.emit('learning', ev);
    }
    // v7: segundo modulador (AMENAZA): un susto real refuerza estímulo→miedo; la exposición segura lo extingue
    const threat = threatFor(exp);
    if (threat) {
      const ev = this.plasticity.applyThreat(threat, { source: exp.kind, subject: exp.subject, at: exp.at, tick: exp.tick });
      if (ev) this.events.emit('learning', ev);
    }
    // La memoria de exploración anota el resultado (evidencia; no decide nada)
    if (exp.subject && isItemKind(exp.subject)) this.world.knowledge.noteOutcome(exp.subject, exp.valence, exp.at);
    if (exp.valence > 0.2 || exp.valence < -0.2) this.world.knowledge.noteLocationOutcome(this.world.location, exp.valence);
    this.growth.noteExperience(exp.kind, exp.subject, exp.reward, exp.at, exp.offline, exp.valence, exp.intensity);
    this.vocal?.noteExperience(exp, this.vocalContext(exp.at, exp.offline));
    if (!exp.offline) {
      if (exp.kind === 'played') this.growth.addMilestone('FIRST_PLAY', exp.at, exp.day, exp.subject);
      if (exp.kind === 'fetch_returned') this.growth.addMilestone('FIRST_FETCH', exp.at, exp.day, exp.subject);
    }
    this.events.emit('experience', exp);
    if (first) {
      const m = composeFirstTime(exp, this.profile.name, this.world.pet.snapshot());
      if (m) this.addMoment(m);
    }
  }

  private addMoment(m: Moment): void {
    m.lifeStage ??= this.growth.stage;
    this.memory.addMoment(m);
    if (m.keyMoment || m.kind === 'first_time') this.growth.addDevelopment(`moment:${m.title}`, GROWTH_CONFIG.momentPoints, m.createdAt);
    this.events.emit('moment', m);
  }

  private evaluateDiscoveries(): void {
    const now = this.now();
    for (const d of evaluateDiscoveries(this.memory, this.sim.brainConfig, this.profile.name, now, this.day(now), this.plasticity)) {
      this.memory.addDiscovery(d);
      this.onDiscovery(d);
      this.events.emit('discovery', d);
      this.addMoment(composeDiscovery(d));
    }
  }

  // Experiencia registrada por un minijuego (contexto de juego)
  recordExperience(kind: ExperienceKind, subject: SubjectKey | null, valence: number, intensity: number, gameId: GameId | null, offline = false): Experience {
    const now = this.now();
    const exp: Experience = {
      id: makeId('exp', this.config.rng), at: now, day: this.day(now), tick: this.sim.network.tickCount, kind, subject,
      valence: Math.max(-1, Math.min(1, valence)), intensity: Math.max(0, Math.min(1, intensity)), gameId, offline,
      reward: rewardFor(kind), actions: [...this.sim.last.active], context: buildContext(this.world, now),
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
      setEvaluation: (on) => this.setEvaluation(on),
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
    this.setEvaluation(false);
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
    return {
      name: this.profile.name, species: this.profile.species, day: this.day(), stats,
      lifeStage: this.growth.stage, stageLabel: stageLabel(this.growth.stage, this.profile.species),
      growthVisual: this.growth.visualValue(this.now()), sizeModifier: this.growth.state.modifiers.size, growthPending: !!this.growth.state.pending,
      mood: moodLabel(stats), moodEmoji: moodEmoji(stats), thought: thoughtFor(last.active, this.world, this.profile.name),
      behavior: behaviorLabel(last.active), active: [...last.active], asleep: pet.asleep, lightOn: this.world.lightOn,
      tick: this.sim.network.tickCount, playerPresent: this.world.player.present,
      rewardable: this.rewardable(), learnedExperiences: this.plasticity.experiencesApplied,
      ...this.contextSnapshot(),
    };
  }

  // ---------- Aprendizaje ----------
  // ¿Hay una acción reciente que el jugador pueda recompensar? (contextual, no permanente)
  rewardable(): Action | null {
    const t = this.sim.network.tickCount, lr = this.lastRewardable;
    if (!lr || !this.world.player.present) return null;
    if (t - lr.tick > REWARD_WINDOW || t - this.lastPlayerRewardTick < REWARD_COOLDOWN) return null;
    return lr.action;
  }

  // ❤️ Recompensar: primero el evento de aprendizaje, después la caricia (alegría)
  rewardPlayer(): LearningEvent | null {
    if (!this.rewardable()) return null;
    const w = this.world;
    const subject = (w.getObject(w.pet.carrying) ?? w.getObject(w.focusObjectId))?.kind ?? 'player';
    const before = this.plasticity.log[0];
    this.recordExperience('player_rewarded', subject, 0.8, 0.8, this.activeGameId);
    this.lastPlayerRewardTick = this.sim.network.tickCount;
    this.lastRewardable = null;
    w.petDirect();
    const ev = this.plasticity.log[0];
    return ev && ev !== before ? ev : null;
  }

  // Herramienta de desarrollo: recompensa sin experiencia asociada
  injectReward(reward: number): LearningEvent | null {
    const ev = this.plasticity.applyReward(reward, { source: 'inject', subject: null, at: this.now(), tick: this.sim.network.tickCount, natural: true });
    if (ev) this.events.emit('learning', ev);
    return ev;
  }

  // Modo evaluación: las experiencias se registran pero los pesos no cambian
  setEvaluation(on: boolean): void {
    this.plasticity.frozen = on;
  }

  resetLearnedWeights(): void {
    this.plasticity.resetLearned();
    this.events.emit('changed', undefined);
  }

  private recordDecision(action: Action, r: StepResult, now: number): void {
    const w = this.world;
    const subject = (w.getObject(w.pet.carrying) ?? w.getObject(r.focusObjectId))?.kind ?? null;
    const d = buildDecisionTrace(this.sim.brain, this.sim.trace, action, r.perception, subject, now);
    if (!d) return;
    this.decisions.unshift(d);
    if (this.decisions.length > MAX_DECISIONS) this.decisions.length = MAX_DECISIONS;
  }

  // ---------- Exportar / importar cerebro ----------
  exportBrain(includeMemory = true): BrainBundle {
    return {
      format: 'milo-brain', version: 1, exportedAt: this.now(),
      pet: { name: this.profile.name, species: this.profile.species, preset: this.profile.preset },
      brain: { configVersion: BRAIN_CONFIG_VERSION, weights: exportWeights(this.sim.brainConfig), initialWeights: exportWeights(this.initialBrain) },
      learning: { ...this.plasticity.exportState(), baselines: this.baseline.export() },
      memory: includeMemory ? this.memory.exportState() : undefined,
      personality: this.traits().filter((t) => t.revealed).map((t) => t.label),
      preferences: this.memory.preferences().map((p) => ({ subject: p.subject, score: p.score, positive: p.positive })),
    };
  }

  // Aplica un cerebro exportado a esta mascota (solo cerebro: la memoria no se toca)
  importBrain(bundle: unknown): WeightImportReport {
    const b = bundle as Partial<BrainBundle> | null;
    if (!b || b.format !== 'milo-brain' || !b.brain) throw new Error('No es un cerebro exportado de Milo');
    const current = createBrainConfig(this.profile.preset);
    const report = importWeights(current, b.brain.weights);
    const initial = createBrainConfig(this.profile.preset);
    importWeights(initial, b.brain.initialWeights ?? b.brain.weights);
    this.sim.brainConfig.sensorToCircuit = current.sensorToCircuit;
    this.sim.brainConfig.circuitToAction = current.circuitToAction;
    this.sim.syncWeights();
    this.initialBrain = initial;
    this.attachPlasticity(b.learning ?? null);
    this.events.emit('changed', undefined);
    return report;
  }

  private contextSnapshot() {
    const info = clockInfo(this.now()), w = this.world;
    return {
      minuteOfDay: Math.round(info.minuteOfDay), timeOfDay: info.timeOfDay, lightLevel: w.lightLevel, lampOn: w.lightOn,
      area: areaOf(w.location, w.pet), recentActivity: w.recentActivity,
      location: w.location, locationLabel: LOCATIONS[w.location].name, locationEmoji: LOCATIONS[w.location].emoji,
      gardenDoorOpen: this.gardenDoorOpen(), weather: w.env.weatherState,
    };
  }

  // ---------- Mundo vivo (v7) ----------
  // Lo que pasó en el mundo este tick y que es una EXPERIENCIA (no una orden): la caja se abrió
  private onWorldEvents(r: StepResult, now: number): void {
    for (const e of r.events) {
      if (e.type !== 'OBJECT_OPENED') continue;
      const kind = isItemKind(e.detail) ? e.detail : null;
      this.world.knowledge.interact('mysteryBox', now);
      if (kind) this.unlock(kind);
      const exp = this.recordExperience('mystery_opened', kind, 0.7, 0.8, this.activeGameId, r.offline);
      if (!this.activeGame && !r.offline) {
        this.addMoment(makeMoment({
          now, day: this.day(now), kind: 'first_time', title: `${this.profile.name} abrió la caja misteriosa`,
          story: `La olfateó y la empujó con el hocico hasta que cedió.${kind ? ` Dentro había ${ITEMS[kind].label}.` : ''}`,
          tags: ['#Curiosidad', '#Aventura'], icon: 'box', subject: kind, experienceIds: [exp.id],
        }));
      }
    }
  }

  // Etapas de conocimiento: VER no es CONOCER. Se acercó → experiencia; lo investigó/usó → descubrimiento
  private onKnowledge(events: readonly StageEvent[], r: StepResult, now: number): void {
    if (this.visit) for (const e of events) if (e.stage === 'SAW' && !this.visit.seen.includes(e.kind)) this.visit.seen.push(e.kind);
    for (const e of events) {
      if (!e.first || ITEMS[e.kind].type === 'bed' || ITEMS[e.kind].type === 'food' || ITEMS[e.kind].type === 'water') continue;
      if (e.stage === 'APPROACHED') {
        const fear = this.world.pet.fear;
        const exp: Experience = {
          id: makeId('exp', this.config.rng), at: now, day: this.day(now), tick: r.tick, kind: 'approached_object', subject: e.kind,
          valence: Math.max(-1, Math.min(1, 0.3 - fear)), intensity: 0.4, gameId: this.activeGameId, offline: r.offline,
          reward: rewardFor('approached_object'), actions: [...r.active], context: buildContext(this.world, now),
        };
        this.ingest(exp);
      } else if ((e.stage === 'INVESTIGATED' || e.stage === 'INTERACTED') && !r.offline) {
        const key = `found:${e.kind}`;
        if (this.memory.hasDiscovery(key)) continue;
        const def = ITEMS[e.kind];
        const d: Discovery = {
          id: makeId('dis', this.config.rng), key, at: now, day: this.day(now), evidence: 1, subject: e.kind, icon: 'search',
          title: `✨ ${this.profile.name} descubrió ${def.label}`,
          text: e.stage === 'INVESTIGATED' ? `No se conformó con verla: se acercó y la investigó de cerca.` : `La probó con sus propias patas.`,
        };
        this.memory.addDiscovery(d);
        this.onDiscovery(d);
        this.events.emit('discovery', d);
      }
    }
  }

  // Primera visita a un lugar: se OBSERVA qué hace durante un rato y se convierte en recuerdo
  private observeVisit(r: StepResult, onsets: readonly Action[], now: number): void {
    const w = this.world;
    if (w.firstVisit && !this.visit) {
      this.visit = { location: w.firstVisit.location, startTick: r.tick, start: now, offline: r.offline, arrive: { x: w.pet.x, y: w.pet.y }, ticks: 0, maxDist: 0, onsets: {}, seen: [] };
      w.firstVisit = null;
    }
    const v = this.visit;
    if (!v) return;
    if (w.location === v.location) {
      v.ticks++;
      v.maxDist = Math.max(v.maxDist, w.distance(w.pet, v.arrive));
      for (const a of onsets) v.onsets[a] = (v.onsets[a] ?? 0) + 1;
    }
    if (v.ticks >= FIRST_VISIT_TICKS || w.location !== v.location) this.closeVisit(v, now);
  }

  private closeVisit(v: VisitObservation, now: number): void {
    this.visit = null;
    const n = (a: Action) => v.onsets[a] ?? 0;
    const place = LOCATIONS[v.location];
    const fear = n('GET_SCARED') + n('HIDE') + n('MOVE_AWAY');
    const explore = n('EXPLORE') + n('INVESTIGATE') + n('LOOK_AT_OBJECT');
    const play = n('PLAY') + n('RUN') + n('PICK_UP_OBJECT');
    const close = n('APPROACH') + n('FOLLOW_PLAYER');
    const lines: string[] = [];
    if (v.maxDist < 0.2) lines.push(`Se quedó cerca de la entrada, observando.`);
    else if (explore >= 3) lines.push(`Exploró ${v.maxDist > 0.6 ? 'hasta la otra punta' : 'los alrededores'}, olfateándolo todo.`);
    else lines.push(`Dio unos pasos para conocer el sitio.`);
    if (fear >= 2) lines.push(`Algo le dio miedo y buscó refugio.`);
    else if (fear === 1) lines.push(`Se sobresaltó una vez, pero siguió.`);
    if (play >= 2) lines.push(`Hasta se animó a jugar.`);
    if (close >= 2) lines.push(`No se separó mucho de ti.`);
    const seen = v.seen.filter((k) => ITEMS[k].type !== 'bed' && ITEMS[k].type !== 'food' && ITEMS[k].type !== 'water').slice(0, 3);
    if (seen.length) lines.push(`Vio por primera vez ${seen.map((k) => ITEMS[k].label).join(', ').replace(/, ([^,]*)$/, ' y $1')}.`);
    const valence = Math.max(-1, Math.min(1, (explore + play) * 0.1 - fear * 0.25));
    const exp = this.recordExperience('first_visit', null, valence, 0.8, null, v.offline);
    const info = clockInfo(v.start);
    const when = info.timeOfDay === 'MORNING' || info.timeOfDay === 'DAWN' ? 'mañana' : info.timeOfDay === 'NIGHT' ? 'noche' : 'tarde';
    const m = makeMoment({
      now, day: this.day(v.start), kind: 'first_time', keyMoment: true, icon: v.location === 'park' ? 'explore' : 'spa',
      title: `${place.emoji} Primera ${when} en ${place.label}`,
      story: `${v.offline ? 'Pasó mientras no estabas. ' : ''}${lines.join(' ')}`,
      tags: ['#PrimeraVez', '#Explorar'], experienceIds: [exp.id],
    });
    this.addMoment(m);
    this.growth.addMilestone(v.location === 'park' ? 'FIRST_PARK' : 'FIRST_OUTING', v.start, this.day(v.start), v.location, m.id);
  }

  gardenDoorOpen(): boolean {
    const exit = exitBetween('room', 'garden');
    return !!exit && this.world.isDoorOpen(exit, 'room');
  }

  // Abrir/cerrar la puerta del jardín: cambia el mundo; salir o no lo decide la mascota
  setGardenDoor(open: boolean): boolean {
    return this.world.setDoor('room', 'garden', open);
  }

  // ¿Su cuerpo ya puede estar allí? (restricción física/de producto, sin "niveles")
  canBeIn(loc: LocationId): boolean {
    return LOCATIONS[loc].available && this.world.capability(loc);
  }

  /*
   * Salir juntos (el jugador la lleva): transición INTENCIONAL entre escenas, como sacar al
   * perro de paseo. Lo que haga allí sigue siendo cosa suya.
   */
  goOuting(loc: LocationId): boolean {
    if (!this.canBeIn(loc) || this.world.location === loc || this.activeGame) return false;
    this.world.setClock(this.now());
    // Salir al jardín juntos es salir por la puerta: queda abierta (si no, no podría volver sola)
    if (loc === 'garden') this.setGardenDoor(true);
    const ok = this.world.changeLocation(loc, undefined, 'outing');
    if (ok) this.world.setPlayerPresent(true);
    return ok;
  }

  places(): PlaceSummary[] {
    const k = this.world.knowledge, name = this.profile.name;
    return (['room', 'garden', 'park', 'forest', 'beach'] as LocationId[]).map((id) => {
      const def = LOCATIONS[id], mem = k.location(id), visited = mem?.firstVisitAt != null;
      const can = this.canBeIn(id);
      let hint: string | null = null;
      if (!def.available) hint = 'Algún día…';
      else if (!can) hint = `${name} aún es pequeño para ${id === 'park' ? 'ir tan lejos' : 'salir'}`;
      else if (!visited) hint = `${name} parece listo para conocer ${def.label}`;
      return {
        id, name: def.name, emoji: def.emoji, here: this.world.location === id, visited, available: def.available && PLAYABLE_LOCATIONS.includes(id),
        familiarity: familiarityWord(k.locationFamiliarity(id), visited), canBeThere: can, readyHint: hint,
      };
    });
  }

  objectDiscoveries(): ObjectDiscoverySummary[] {
    const k = this.world.knowledge;
    const out: ObjectDiscoverySummary[] = [];
    for (const [kind, m] of Object.entries(k.state.objects) as [ItemKind, NonNullable<(typeof k.state.objects)[ItemKind]>][]) {
      const def = ITEMS[kind];
      if (!def || def.type === 'bed' || def.type === 'food' || def.type === 'water' || def.type === 'hideout') continue;
      out.push({
        kind, name: def.name, emoji: def.emoji, stage: m.stage, stageWord: STAGE_WORD[m.stage], familiarity: familiarityWord(k.familiarity(kind), true),
        firstSeenDay: this.day(m.firstSeenAt),
      });
    }
    return out.sort((a, b) => KNOWLEDGE_STAGES.indexOf(b.stage) - KNOWLEDGE_STAGES.indexOf(a.stage));
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

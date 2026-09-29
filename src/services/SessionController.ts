/*
 * SESSION CONTROLLER (capa de plataforma)
 * ---------------------------------------
 * Une el dominio (GameSession, TickEngine) con Expo:
 *
 *   arranque   → openStorage → SaveGameStore.load (migración + recuperación)
 *   activo     → TickEngine (3 ticks/s) · snapshots a los stores (≤ 4 Hz)
 *   background → se detiene el cerebro, se guarda lastActiveAt, audio en pausa
 *   vuelta     → OfflineSimulation(now − lastActiveAt) → "Mientras no estabas"
 *   autosave   → cada ~20 s de juego, al ir a background y tras hitos
 *
 * Los componentes React llaman a estos métodos; nunca tocan la simulación
 * para decidir comportamiento.
 */
import { AppState, type AppStateStatus } from 'react-native';

import type { GameId } from '@/core/games/catalog';
import { evaluatePreference, trainWithObject, type PreferenceReport } from '@/core/learning/experiments';
import { createLivingPet, DAY_MS, freeRun, liveDays, supply, type FreeRunReport } from '@/core/routines/experiments';
import { interpretRoutines, routineHeadline, type RoutineCard } from '@/core/routines/RoutineInterpreter';
import { RealWorldClock } from '@/core/time/WorldClock';
import { seededRng } from '@/core/random';
import type { GameCommand } from '@/core/games/MiniGame';
import type { Moment } from '@/core/memory/types';
import type { SettingsData, SpeciesKey } from '@/core/persistence/SaveGame';
import type { SaveGameStore } from '@/core/persistence/SaveGameStore';
import { GameSession, type WorldInteraction } from '@/core/session/GameSession';
import { simulateAway } from '@/core/simulation/OfflineSimulation';
import { TickEngine } from '@/core/simulation/TickEngine';
import type { ItemKind } from '@/core/world/Items';
import {
  awayStore, devStore, discoveryStore, growthStore, gameStore, learningStore, memoryStore, petStore, pushToast, sessionStore, settingsStore,
} from '@/state/stores';

import { assetsFor } from '@/render3d/EnvironmentAssetInfo';
import { AudioManager } from './AudioManager';
import { environmentAssets } from './environmentAssets';
import { Mixer } from './audio/Mixer';
import { PetVoiceBridge } from './audio/PetVoiceBridge';
import { playWorldSounds, setAmbience } from './WorldAudio';
import type { LocationId } from '@/core/world/Locations';
import { LOCATIONS } from '@/core/world/Locations';
import type { SoundKind } from '@/core/world/Sound';
import type { WeatherState } from '@/core/world/Environment';
import type { StepResult } from '@/core/simulation/Simulation';
import { haptic, setHapticsEnabled } from './haptics';
import { captureToDocuments } from './snapshots';
import { openStorage } from './storage';

const AUTOSAVE_TICKS = 60; // ~20 s a 3 ticks/s
const PUBLISH_MS = 250;
const CAPTURE_KINDS: ReadonlySet<Moment['kind']> = new Set(['first_time', 'game', 'discovery']);

export interface RoutineLabPet {
  name: string;
  headline: string;
  cards: RoutineCard[];
  freeRun: FreeRunReport;
}

class SessionControllerImpl {
  // La hora del mundo es la del teléfono (en desarrollo: × velocidad y saltos)
  readonly clock = new RealWorldClock();
  private session: GameSession | null = null;
  private store: SaveGameStore | null = null;
  private engine: TickEngine | null = null;
  private unsubs: (() => void)[] = [];
  private lastActiveAt = Date.now();
  private lastPublish = 0;
  private ticksSinceSave = 0;
  private saving: Promise<void> | null = null;
  private appState: AppStateStatus = AppState.currentState;
  private appSub: { remove(): void } | null = null;
  private reconciling = false;
  private lastLearningPublish = 0;
  private booted = false;

  get current(): GameSession | null {
    return this.session;
  }

  // ---------- Arranque ----------
  async boot(): Promise<void> {
    if (this.booted) return;
    this.booted = true;
    await AudioManager.init();
    try {
      const { store, persistent } = await openStorage();
      this.store = store;
      sessionStore.set((s) => ({ ...s, persistent }));
      const res = await store.load();
      if (res.status === 'empty') {
        sessionStore.set((s) => ({ ...s, status: 'onboarding' }));
      } else if (res.status === 'corrupt') {
        sessionStore.set((s) => ({ ...s, status: 'onboarding', notice: 'No pudimos leer la partida guardada. Guardamos una copia por seguridad y empezamos de nuevo.' }));
      } else {
        const { session, weights } = GameSession.fromSave(res.save, { clock: this.clock });
        if (weights.ignored.length) console.warn('[save] pesos ignorados', weights.ignored);
        this.applySettings(res.save.settings);
        this.attach(session);
        sessionStore.set((s) => ({
          ...s, status: 'ready',
          notice: res.status === 'recovered' ? 'Recuperamos tu partida desde la copia de seguridad.' : null,
        }));
        await this.reconcile(res.save.lastActiveAt);
      }
    } catch (e) {
      console.error('[boot]', e);
      sessionStore.set((s) => ({ ...s, status: 'error', error: e instanceof Error ? e.message : String(e) }));
    }
    this.appSub = AppState.addEventListener('change', (next) => this.onAppState(next));
  }

  async adopt(input: { name: string; species: SpeciesKey }): Promise<void> {
    const session = GameSession.create(input, { clock: this.clock });
    this.attach(session);
    sessionStore.set((s) => ({ ...s, status: 'ready', notice: null }));
    await this.save();
  }

  private attach(session: GameSession): void {
    this.detach();
    this.session = session;
    this.lastActiveAt = Date.now();
    // v9: el escenario del lugar actual se carga en segundo plano antes de que la escena lo pida
    void environmentAssets.preload(assetsFor(session.world.location));
    const ev = session.events;
    this.unsubs.push(
      ev.on('tick', (r) => this.onTick(r)),
      ev.on('moment', (m) => this.onMoment(m)),
      ev.on('discovery', (d) => {
        memoryStore.set((v) => v + 1);
        discoveryStore.set({ discovery: d, momentId: null });
        haptic('discovery');
        AudioManager.play('discovery');
      }),
      ev.on('learning', () => {
        const now = Date.now();
        if (now - this.lastLearningPublish > 1000) { this.lastLearningPublish = now; learningStore.set((v) => v + 1); }
      }),
      ev.on('experience', (e) => {
        if (e.offline) return;
        // La VOZ la decide el dominio (VocalizationSystem → PetVoiceBridge); aquí solo el háptico
        if (e.kind === 'petted') haptic('pet');
        else if (e.kind === 'mystery_opened') haptic('object'); // el "clac" de la caja lo reproduce WorldAudio (es un sonido del mundo)
      }),
      ev.on('changed', () => memoryStore.set((v) => v + 1)),
      ev.on('gameEnded', () => { gameStore.set(null); void this.save(); }),
      ev.on('growth', (g) => {
        // v7: crecer abre el mundo (sin niveles): "parece listo para conocer el jardín"
        const ready = session.places().find((p) => p.canBeThere && !p.visited && p.available);
        if (ready) setTimeout(() => pushToast({ kind: 'info', title: `${ready.emoji} ${ready.readyHint ?? ''}`, text: 'Mira en Lugares. Lo que haga allí será cosa suya.' }), 4000);
        growthStore.set(g);
        petStore.set(session.snapshot());
        memoryStore.set((v) => v + 1);
        haptic('discovery');
        void this.save(); // la transición termina guardada
      }),
    );
    PetVoiceBridge.attach(session);
    const cfg = session.config.simulation;
    this.engine = new TickEngine({ ticksPerSecond: cfg.baseTicksPerSecond, onTick: () => this.tickOnce() });
    this.engine.setSpeed(devStore.get().speed);
    session.setPlayerPresent(this.appState === 'active');
    petStore.set(session.snapshot());
    memoryStore.set((v) => v + 1);
    if (devStore.get().running && this.appState === 'active') this.engine.start();
    setAmbience(session.world.location);
  }

  private detach(): void {
    PetVoiceBridge.detach();
    this.engine?.stop();
    this.engine = null;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.session = null;
  }

  // ---------- Ticks ----------
  private tickOnce(): void {
    if (this.reconciling) return;
    try {
      this.session?.tick();
    } catch (e) {
      // Un error de simulación no debe tumbar la app ni corromper el save
      console.error('[tick]', e);
      this.engine?.stop();
      devStore.set((d) => ({ ...d, running: false }));
      pushToast({ kind: 'info', title: 'Cerebro en pausa', text: 'Ocurrió un error en la simulación. Tu partida está a salvo.' });
    }
  }

  private onTick(r: StepResult): void {
    const s = this.session;
    if (!s) return;
    // Mundo vivo: lo que suena se oye (para el jugador) y, si cambió de lugar, cambia el ambiente
    playWorldSounds(r);
    const moved = r.events.find((e) => e.type === 'LOCATION_CHANGED');
    if (moved && !r.offline) {
      setAmbience(s.world.location);
      if (moved.detail.endsWith(':walked')) pushToast({ kind: 'info', title: `${LOCATIONS[s.world.location].emoji} ${s.profile.name} salió ${toPlace(s.world.location)}`, text: 'Nadie se lo dijo: la puerta estaba abierta y quiso ir.' });
      memoryStore.set((v) => v + 1);
    }
    if (s.activeGameId) gameStore.set(s.gameView());
    const now = Date.now();
    if (now - this.lastPublish >= PUBLISH_MS) {
      this.lastPublish = now;
      petStore.set(s.snapshot());
    }
    if (++this.ticksSinceSave >= AUTOSAVE_TICKS) void this.save();
  }

  private onMoment(m: Moment): void {
    memoryStore.set((v) => v + 1);
    const pending = discoveryStore.get();
    if (m.kind === 'discovery' && pending && pending.discovery.title === m.title) {
      discoveryStore.set({ ...pending, momentId: m.id }); // la tarjeta de descubrimiento ya lo anuncia
    } else if (m.kind !== 'captured') {
      pushToast({ kind: 'moment', title: 'Nuevo recuerdo', text: m.title });
      if (m.keyMoment) haptic('memory');
    }
    if (CAPTURE_KINDS.has(m.kind)) {
      void captureToDocuments(m.id).then((uri) => { if (uri) this.session?.attachSnapshot(m.id, uri); });
    }
  }

  // ---------- Ciclo de vida ----------
  private onAppState(next: AppStateStatus): void {
    const prev = this.appState;
    this.appState = next;
    if (prev === 'active' && next !== 'active') this.goBackground();
    else if (prev !== 'active' && next === 'active') void this.goForeground();
  }

  private goBackground(): void {
    this.engine?.stop();
    // El paseo por el parque termina al irte: volvéis juntos a casa (no se queda sola allí)
    if (this.session?.world.location === 'park') this.session.goOuting('room');
    AudioManager.suspend();
    PetVoiceBridge.suspend();
    this.lastActiveAt = Date.now();
    this.session?.setPlayerPresent(false);
    void this.save();
  }

  private async goForeground(): Promise<void> {
    AudioManager.resume();
    PetVoiceBridge.resume(); // lo que "dijo" offline no suena: el dominio solo lo contó
    await this.reconcile(this.lastActiveAt);
    this.session?.setPlayerPresent(true);
    if (devStore.get().running) this.engine?.start();
  }

  // "Mientras no estabas": el cerebro real corre offline con el tiempo comprimido
  private async reconcile(lastActiveAt: number): Promise<void> {
    const s = this.session;
    if (!s) return;
    const elapsed = Date.now() - lastActiveAt;
    this.reconciling = true;
    try {
      const report = await simulateAway(s, elapsed);
      if (report) {
        awayStore.set(report);
        petStore.set(s.snapshot());
        memoryStore.set((v) => v + 1);
        await this.save();
      }
    } catch (e) {
      console.error('[offline]', e);
    } finally {
      this.reconciling = false;
      this.lastActiveAt = Date.now();
    }
  }

  // ---------- Guardado ----------
  async save(): Promise<void> {
    const s = this.session, store = this.store;
    if (!s || !store) return;
    this.ticksSinceSave = 0;
    if (this.saving) await this.saving;
    const doc = s.toSave(settingsStore.get(), this.appState === 'active' ? Date.now() : this.lastActiveAt);
    this.saving = store.save(doc).catch((e) => console.error('[save]', e)).finally(() => { this.saving = null; });
    await this.saving;
  }

  // ---------- Acciones del jugador (solo mundo) ----------
  interact(kind: WorldInteraction): void {
    this.session?.interact(kind);
    if (kind === 'food' || kind === 'water' || kind === 'toy' || kind === 'novel' || kind === 'treat') haptic('object');
    AudioManager.play('uiTap');
  }

  petDirect(): void {
    this.session?.petDirect();
  }

  placeItem(kind: ItemKind): boolean {
    const ok = this.session?.placeItem(kind) ?? false;
    if (ok) { haptic('object'); memoryStore.set((v) => v + 1); }
    return ok;
  }

  storeItem(kind: ItemKind): void {
    this.session?.storeItem(kind);
    memoryStore.set((v) => v + 1);
  }

  throwObject(id: number, vx: number, vy: number): void {
    if (!this.session) return;
    if (this.session.activeGameId === 'fetch') this.session.gameInput({ type: 'throw', vx, vy });
    else this.session.world.throwObject(id, vx, vy);
    AudioManager.play('ballThrow');
  }

  moveObject(id: number, x: number, y: number): void {
    this.session?.world.moveObject(id, x, y);
  }

  endMoveObject(id: number): void {
    this.session?.world.endMoveObject(id);
  }

  startGame(id: GameId): boolean {
    const ok = this.session?.startGame(id) ?? false;
    if (ok) gameStore.set(this.session?.gameView() ?? null);
    return ok;
  }

  gameInput(cmd: GameCommand): void {
    const s = this.session;
    if (!s) return;
    s.gameInput(cmd);
    gameStore.set(s.gameView());
    if (cmd.type === 'pet') haptic('pet');
    else if (cmd.type !== 'toggle_item') AudioManager.play('uiTap');
  }

  endGame(): void {
    this.session?.endGame();
  }

  async captureMoment(): Promise<Moment | null> {
    const s = this.session;
    if (!s) return null;
    const m = s.captureMoment(null);
    haptic('memory');
    const uri = await captureToDocuments(m.id);
    if (uri) s.attachSnapshot(m.id, uri);
    void this.save();
    return m;
  }

  toggleFavorite(id: string): void {
    this.session?.toggleFavorite(id);
    haptic('select');
    void this.save();
  }

  // ---------- Ajustes ----------
  updateSettings(patch: Partial<SettingsData>): void {
    const next = { ...settingsStore.get(), ...patch };
    this.applySettings(next);
    void this.save();
  }

  private applySettings(s: SettingsData): void {
    settingsStore.set(s);
    Mixer.configure({ master: s.masterVolume, pet: s.petVolume, ambient: s.ambientVolume, music: s.musicVolume, ui: s.uiVolume, muted: s.muted });
    AudioManager.setMuted(s.muted);
    setHapticsEnabled(s.haptics);
  }

  // ---------- Herramientas de desarrollo ----------
  setRunning(running: boolean): void {
    devStore.set((d) => ({ ...d, running }));
    if (running && this.appState === 'active') this.engine?.start();
    else this.engine?.stop();
  }

  step(): void {
    this.setRunning(false);
    this.engine?.step();
    const s = this.session;
    if (s) petStore.set(s.snapshot());
  }

  setSpeed(speed: number): void {
    devStore.set((d) => ({ ...d, speed }));
    this.engine?.setSpeed(speed);
  }

  async exportSave(): Promise<string | null> {
    await this.save();
    return this.store ? this.store.exportRaw() : null;
  }

  async importSave(json: string): Promise<void> {
    if (!this.store) throw new Error('Almacenamiento no disponible');
    const save = await this.store.importRaw(json);
    const { session } = GameSession.fromSave(save, { clock: this.clock });
    this.applySettings(save.settings);
    this.attach(session);
    sessionStore.set((s) => ({ ...s, status: 'ready', notice: 'Partida importada.' }));
  }

  async resetAll(): Promise<void> {
    this.detach();
    await this.store?.clear();
    petStore.set(null);
    gameStore.set(null);
    awayStore.set(null);
    sessionStore.set((s) => ({ ...s, status: 'onboarding', notice: null }));
  }

  // ---------- Aprendizaje ----------
  // ❤️ Recompensar: el aprendizaje ocurre en el core; aquí solo la respuesta sensorial
  rewardPlayer(): boolean {
    const s = this.session;
    if (!s || !s.rewardable()) return false;
    s.rewardPlayer();
    haptic('pet'); // su respuesta sonora (HAPPY) la decide el dominio al registrar el premio
    petStore.set(s.snapshot());
    learningStore.set((v) => v + 1);
    return true;
  }

  saveDiscoveryMemory(): void {
    const d = discoveryStore.get();
    if (d?.momentId) {
      const m = this.session?.memory.moment(d.momentId);
      if (m && !m.favorite) this.session?.toggleFavorite(d.momentId);
      haptic('memory');
      void this.save();
    }
    discoveryStore.set(null);
  }

  dismissDiscovery(): void {
    discoveryStore.set(null);
  }

  setLearningEnabled(on: boolean): void {
    if (this.session) this.session.plasticity.enabled = on;
    learningStore.set((v) => v + 1);
  }

  setLearningRate(rate: number): void {
    if (this.session) this.session.plasticity.learningRate = Math.max(0, Math.min(0.5, rate));
    learningStore.set((v) => v + 1);
  }

  injectReward(r: number): void {
    this.session?.injectReward(r);
    learningStore.set((v) => v + 1);
  }

  resetLearnedWeights(): void {
    this.session?.resetLearnedWeights();
    learningStore.set((v) => v + 1);
    void this.save();
  }

  exportBrain(includeMemory = true): string | null {
    return this.session ? JSON.stringify(this.session.exportBrain(includeMemory)) : null;
  }

  importBrain(json: string): void {
    if (!this.session) throw new Error('No hay mascota');
    this.session.importBrain(JSON.parse(json) as unknown);
    learningStore.set((v) => v + 1);
    void this.save();
  }

  // Experimento local (no toca a la mascota real): dos copias recién nacidas con el mismo cerebro,
  // una juega con la pelota y otra con el peluche; después se mide qué prefieren.
  async runLearningSimulation(episodes = 60, onProgress?: (msg: string) => void): Promise<{ base: PreferenceReport; ball: PreferenceReport; teddy: PreferenceReport }> {
    const yieldFn = () => new Promise<void>((r) => setTimeout(r, 0));
    const mk = () => GameSession.create({ name: 'Lab', species: 'dog' }, { rng: seededRng(11), lifeStage: 'YOUNG' });
    const base = mk(), A = mk(), B = mk();
    onProgress?.('Entrenando con la pelota…');
    await trainWithObject(A, 'ball', episodes, 60, yieldFn);
    onProgress?.('Entrenando con el peluche…');
    await trainWithObject(B, 'teddy', episodes, 60, yieldFn);
    onProgress?.('Evaluando…');
    const [e0, eA, eB] = [await evaluatePreference(base, ['ball', 'teddy'], 24, 45, 1, yieldFn), await evaluatePreference(A, ['ball', 'teddy'], 24, 45, 1, yieldFn), await evaluatePreference(B, ['ball', 'teddy'], 24, 45, 1, yieldFn)];
    return { base: e0, ball: eA, teddy: eB };
  }

  // ---------- Rutinas (desarrollo) ----------
  private publish(): void {
    const s = this.session;
    if (s) petStore.set(s.snapshot());
    memoryStore.set((v) => v + 1);
  }

  advanceClock(ms: number): void {
    this.clock.advance(ms);
    this.publish();
  }

  setClockSpeed(speed: number): void {
    this.clock.setSpeed(speed);
    devStore.set((d) => ({ ...d, clockSpeed: speed }));
  }

  setLamp(on: boolean): void {
    this.session?.world.setLight(on);
    this.publish();
  }

  setPlayerPresent(present: boolean): void {
    this.session?.setPlayerPresent(present);
    this.publish();
  }

  /*
   * Avance rápido de la mascota REAL: vive `days` días de mundo a 1 minuto por tick
   * (fisiología 'day'), con comida y agua automáticas y nadie más. Sus episodios cuentan
   * como experiencia real (a diferencia de la simulación offline comprimida).
   */
  async fastForwardDays(days: number, onProgress?: (msg: string) => void): Promise<void> {
    const s = this.session;
    if (!s) return;
    const wasRunning = devStore.get().running;
    this.engine?.stop();
    this.reconciling = true;
    s.setPhysiology('day');
    const t0 = this.clock.now();
    try {
      for (let i = 0; i < days * 1440; i++) {
        s.setTimeOverride(t0 + (i + 1) * 60_000);
        if (i % 360 === 0) supply(s);
        s.tick();
        if (i % 1440 === 1439) {
          onProgress?.(`Día ${Math.round((i + 1) / 1440)} de ${days}…`);
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }
    } finally {
      s.setTimeOverride(null);
      s.setPhysiology('app');
      this.clock.advance(days * DAY_MS);
      this.reconciling = false;
      if (wasRunning && this.appState === 'active') this.engine?.start();
    }
    this.publish();
    learningStore.set((v) => v + 1);
    await this.save();
  }

  // Experimento local: Milo (días regulares) y Luna (días irregulares) nacen con el mismo cerebro
  async runRoutineLab(days = 30, onProgress?: (msg: string) => void): Promise<{ milo: RoutineLabPet; luna: RoutineLabPet }> {
    const yieldFn = () => new Promise<void>((r) => setTimeout(r, 0));
    const run = async (name: string, regime: 'consistent' | 'irregular'): Promise<RoutineLabPet> => {
      const { session, clock } = createLivingPet(name, 11);
      let d = 0;
      await liveDays(session, clock, { regime, days, seed: 7 }, async () => { onProgress?.(`${name}: día ${++d} de ${days}…`); await yieldFn(); });
      const habits = session.habits(clock.now());
      onProgress?.(`${name}: prueba en el mismo contexto…`);
      return { name, headline: routineHeadline(habits, name), cards: interpretRoutines(habits, name), freeRun: await freeRun(session, 4, 21, yieldFn) };
    };
    return { milo: await run('Milo', 'consistent'), luna: await run('Luna', 'irregular') };
  }

  // ---------- Crecimiento (desarrollo) ----------
  devGrowth(action: 'progress' | 'add' | 'age' | 'eligible' | 'trigger', value = 0): void {
    const s = this.session;
    if (!s) return;
    if (action === 'progress') s.devSetDevelopmentProgress(value);
    else if (action === 'add') s.devAddDevelopment(value);
    else if (action === 'age') s.devSatisfyAge();
    else if (action === 'eligible') { s.devSatisfyAge(); s.devSetDevelopmentProgress(1); }
    else if (action === 'trigger') s.transition();
    this.publish();
    learningStore.set((v) => v + 1);
  }

  setGrowthPreview(v: number | null): void {
    devStore.set((d) => ({ ...d, growthPreview: v }));
  }

  dismissGrowth(): void {
    growthStore.set(null);
  }

  clearNotice(): void {
    sessionStore.set((s) => ({ ...s, notice: null }));
  }

  // ---------- Mundo vivo (jugador: solo cambia el mundo) ----------
  setGardenDoor(open: boolean): boolean {
    const ok = this.session?.setGardenDoor(open) ?? false;
    if (ok) { haptic('select'); AudioManager.play('creak'); }
    this.publish();
    return ok;
  }

  // Salir juntos (paseo): transición intencional; lo que haga allí lo decide su cerebro
  goOuting(loc: LocationId): boolean {
    const s = this.session;
    if (!s) return false;
    const ok = s.goOuting(loc);
    if (ok) { setAmbience(s.world.location); haptic('select'); void this.save(); }
    this.publish();
    return ok;
  }

  // ---------- World Inspector (solo desarrollo) ----------
  devSpawn(kind: ItemKind, at?: { x: number; y: number }): number | null {
    const w = this.session?.world;
    if (!w) return null;
    const pet = w.pet;
    const p = at ?? { x: Math.max(0.1, Math.min(0.9, pet.x + Math.cos(pet.orientation) * 0.2)), y: Math.max(0.1, Math.min(0.95, pet.y + Math.sin(pet.orientation) * 0.2)) };
    const o = w.placeItem(kind, p);
    this.publish();
    return o.id;
  }

  devRemove(id: number): void {
    this.session?.world.removeObject(id);
    this.publish();
  }

  devMove(id: number, x: number, y: number): void {
    this.session?.world.moveObject(id, x, y);
    this.session?.world.endMoveObject(id);
    this.publish();
  }

  devRollBall(): void {
    const w = this.session?.world;
    if (!w) return;
    const ball = w.objects.find((o) => o.kind === 'ball') ?? w.placeItem('ball', { x: 0.15, y: 0.7 });
    w.push(ball.id, 0.04, (Math.random() - 0.5) * 0.02);
  }

  devSound(kind: SoundKind, behind = true): void {
    const w = this.session?.world;
    if (!w) return;
    const pet = w.pet, a = pet.orientation + (behind ? Math.PI : 0);
    const x = Math.max(0.03, Math.min(0.97, pet.x + Math.cos(a) * 0.3)), y = Math.max(0.03, Math.min(0.97, pet.y + Math.sin(a) * 0.3));
    w.emitSound({ kind, intensity: kind === 'noise' ? 1 : 0.5, x, y, loud: kind === 'noise' });
  }

  devDropLeaf(): void {
    const w = this.session?.world;
    if (!w) return;
    w.ambient.script([{ at: w.tick + 1, type: 'LEAF_FELL', x: Math.max(0.1, Math.min(0.9, w.pet.x + 0.15)), y: Math.max(0.1, Math.min(0.9, w.pet.y + 0.15)) }]);
  }

  devSetHour(hour: number): void {
    // Salto de reloj de desarrollo: la próxima hora pedida del día actual del mundo
    const now = this.clock.now(), d = new Date(now);
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0, 0).getTime();
    this.clock.advance(target > now ? target - now : target + DAY_MS - now);
    this.publish();
  }

  devSetWeather(w: WeatherState): void {
    this.session?.world.setWeather(w);
    this.publish();
  }

  devSetLocation(loc: LocationId): void {
    const s = this.session;
    if (!s) return;
    s.world.changeLocation(loc, undefined, 'dev');
    setAmbience(loc);
    this.publish();
  }

  // Solo desarrollo: mover a la mascota a mano (en producción nunca se la mueve)
  devTeleport(x: number, y: number): void {
    const p = this.session?.world.pet;
    if (!p || !__DEV__) return;
    p.x = x; p.y = y;
    this.publish();
  }

  devAmbientRate(scale: number): void {
    const w = this.session?.world;
    if (w) w.ambient.config.rateScale = Math.max(0, scale);
  }

  devSpawnMany(n: number): void {
    const w = this.session?.world;
    if (!w) return;
    const kinds: ItemKind[] = ['ball', 'teddy', 'duck', 'rope', 'leaf', 'feather', 'shell', 'yoyo', 'gift', 'crystal'];
    this.session!.config.world.maxNovelObjects = Math.max(this.session!.config.world.maxNovelObjects, n + 4);
    for (let i = 0; i < n; i++) w.placeItem(kinds[i % kinds.length], { x: 0.08 + Math.random() * 0.84, y: 0.1 + Math.random() * 0.85 });
    this.publish();
  }

  // Tiempo real de un tick de simulación (para el medidor de rendimiento)
  measureTick(n = 30): number {
    const s = this.session;
    if (!s) return 0;
    const clone = GameSession.clone(s);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) clone.tick();
    return (performance.now() - t0) / n;
  }
}

function toPlace(l: LocationId): string {
  const lb = LOCATIONS[l].label;
  return lb.startsWith('el ') ? `al ${lb.slice(3)}` : `a ${lb}`;
}

export const SessionController = new SessionControllerImpl();

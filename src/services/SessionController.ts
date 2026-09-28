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
import type { GameCommand } from '@/core/games/MiniGame';
import type { Moment } from '@/core/memory/types';
import type { SettingsData, SpeciesKey } from '@/core/persistence/SaveGame';
import type { SaveGameStore } from '@/core/persistence/SaveGameStore';
import { GameSession, type WorldInteraction } from '@/core/session/GameSession';
import { simulateAway } from '@/core/simulation/OfflineSimulation';
import { TickEngine } from '@/core/simulation/TickEngine';
import type { ItemKind } from '@/core/world/Items';
import {
  awayStore, devStore, gameStore, memoryStore, petStore, pushToast, sessionStore, settingsStore,
} from '@/state/stores';

import { AudioManager } from './AudioManager';
import { haptic, setHapticsEnabled } from './haptics';
import { captureToDocuments } from './snapshots';
import { openStorage } from './storage';

const AUTOSAVE_TICKS = 60; // ~20 s a 3 ticks/s
const PUBLISH_MS = 250;
const CAPTURE_KINDS: ReadonlySet<Moment['kind']> = new Set(['first_time', 'game', 'discovery']);

class SessionControllerImpl {
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
        const { session, weights } = GameSession.fromSave(res.save);
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
    const session = GameSession.create(input);
    this.attach(session);
    sessionStore.set((s) => ({ ...s, status: 'ready', notice: null }));
    await this.save();
  }

  private attach(session: GameSession): void {
    this.detach();
    this.session = session;
    this.lastActiveAt = Date.now();
    const ev = session.events;
    this.unsubs.push(
      ev.on('tick', () => this.onTick()),
      ev.on('moment', (m) => this.onMoment(m)),
      ev.on('discovery', (d) => {
        memoryStore.set((v) => v + 1);
        pushToast({ kind: 'discovery', title: 'Nuevo descubrimiento', text: d.title });
        haptic('discovery');
        AudioManager.play('discovery');
      }),
      ev.on('experience', (e) => {
        if (e.offline) return;
        if (e.kind === 'petted') { haptic('pet'); AudioManager.play('petHappy'); }
        else if (e.kind === 'scared') AudioManager.play('petWhimper');
        else if (e.kind === 'greeted') AudioManager.play('petBark');
        else if (e.kind === 'mystery_opened') { AudioManager.play('boxOpen'); haptic('object'); }
      }),
      ev.on('changed', () => memoryStore.set((v) => v + 1)),
      ev.on('gameEnded', () => { gameStore.set(null); void this.save(); }),
    );
    const cfg = session.config.simulation;
    this.engine = new TickEngine({ ticksPerSecond: cfg.baseTicksPerSecond, onTick: () => this.tickOnce() });
    this.engine.setSpeed(devStore.get().speed);
    session.setPlayerPresent(this.appState === 'active');
    petStore.set(session.snapshot());
    memoryStore.set((v) => v + 1);
    if (devStore.get().running && this.appState === 'active') this.engine.start();
    AudioManager.startLoop('ambientRoom');
  }

  private detach(): void {
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

  private onTick(): void {
    const s = this.session;
    if (!s) return;
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
    if (m.kind !== 'captured') {
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
    AudioManager.suspend();
    this.lastActiveAt = Date.now();
    this.session?.setPlayerPresent(false);
    void this.save();
  }

  private async goForeground(): Promise<void> {
    AudioManager.resume();
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
    AudioManager.setMuted(s.muted);
    AudioManager.setVolume('music', s.musicVolume);
    AudioManager.setVolume('effects', s.effectsVolume);
    AudioManager.setVolume('pet', s.effectsVolume);
    AudioManager.setVolume('ui', s.effectsVolume * 0.6);
    AudioManager.setVolume('ambient', s.musicVolume * 0.6);
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
    const { session } = GameSession.fromSave(save);
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

  clearNotice(): void {
    sessionStore.set((s) => ({ ...s, notice: null }));
  }
}

export const SessionController = new SessionControllerImpl();

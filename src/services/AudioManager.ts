/*
 * AUDIO MANAGER
 * -------------
 * Categorías: music · ambient · pet · effects · ui. Cada una con volumen;
 * mute global; ciclo de vida ligado a AppState (en background todo se pausa
 * y los bucles se reanudan al volver). Los sonidos son WAV sintetizados
 * (scripts/generate-sounds.js); `music` está preparada pero sin pista aún.
 *
 * Todo fallo de audio se traga: el audio nunca rompe el juego.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

export type AudioCategory = 'music' | 'ambient' | 'pet' | 'effects' | 'ui';

const SOUNDS = {
  uiTap: { src: require('@/assets/audio/ui-tap.wav') as number, category: 'ui' },
  petHappy: { src: require('@/assets/audio/pet-happy.wav') as number, category: 'pet' },
  petBark: { src: require('@/assets/audio/pet-bark.wav') as number, category: 'pet' },
  petWhimper: { src: require('@/assets/audio/pet-whimper.wav') as number, category: 'pet' },
  discovery: { src: require('@/assets/audio/discovery.wav') as number, category: 'effects' },
  ballThrow: { src: require('@/assets/audio/ball-throw.wav') as number, category: 'effects' },
  boxOpen: { src: require('@/assets/audio/box-open.wav') as number, category: 'effects' },
  ambientRoom: { src: require('@/assets/audio/ambient-room.wav') as number, category: 'ambient' },
} as const satisfies Record<string, { src: number; category: AudioCategory }>;

export type SoundName = keyof typeof SOUNDS;

class AudioManagerImpl {
  private players = new Map<SoundName, AudioPlayer>();
  private volumes: Record<AudioCategory, number> = { music: 0.5, ambient: 0.35, pet: 0.8, effects: 0.8, ui: 0.5 };
  private muted = false;
  private loops = new Set<SoundName>();
  private suspended = false;
  private ready = false;

  async init(): Promise<void> {
    if (this.ready) return;
    this.ready = true;
    try {
      // Respeta el interruptor de silencio (iOS) y convive con la música del usuario
      await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false });
    } catch (e) {
      console.warn('[audio] modo no disponible', e);
    }
  }

  setVolume(category: AudioCategory, v: number): void {
    this.volumes[category] = Math.max(0, Math.min(1, v));
    this.players.forEach((p, name) => { if (SOUNDS[name].category === category) p.volume = this.effective(name); });
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.players.forEach((p, name) => { p.volume = this.effective(name); });
    if (m) this.loops.forEach((n) => this.players.get(n)?.pause());
    else if (!this.suspended) this.loops.forEach((n) => this.players.get(n)?.play());
  }

  get isMuted(): boolean {
    return this.muted;
  }

  play(name: SoundName): void {
    if (this.muted || this.suspended) return;
    try {
      const p = this.player(name);
      p.volume = this.effective(name);
      void p.seekTo(0).then(() => p.play()).catch(() => {});
    } catch (e) {
      console.warn('[audio] no se pudo reproducir', name, e);
    }
  }

  startLoop(name: SoundName): void {
    this.loops.add(name);
    if (this.muted || this.suspended) return;
    try {
      const p = this.player(name);
      p.loop = true;
      p.volume = this.effective(name);
      p.play();
    } catch (e) {
      console.warn('[audio] bucle no disponible', name, e);
    }
  }

  stopLoop(name: SoundName): void {
    this.loops.delete(name);
    this.players.get(name)?.pause();
  }

  // AppState: background → todo en pausa; active → se reanudan los bucles
  suspend(): void {
    this.suspended = true;
    this.players.forEach((p) => p.pause());
  }

  resume(): void {
    this.suspended = false;
    if (!this.muted) this.loops.forEach((n) => this.players.get(n)?.play());
  }

  release(): void {
    this.players.forEach((p) => p.remove());
    this.players.clear();
    this.loops.clear();
  }

  private effective(name: SoundName): number {
    return this.muted ? 0 : this.volumes[SOUNDS[name].category];
  }

  private player(name: SoundName): AudioPlayer {
    let p = this.players.get(name);
    if (!p) {
      p = createAudioPlayer(SOUNDS[name].src);
      this.players.set(name, p);
    }
    return p;
  }
}

export const AudioManager = new AudioManagerImpl();

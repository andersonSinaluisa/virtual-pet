/*
 * AUDIO MANAGER
 * -------------
 * Categorías: music · ambient · pet · effects · ui → volúmenes del Mixer
 * (v8: MUSIC · AMBIENCE · VOCAL · AMBIENCE · UI, × master, con ducking del
 * ambiente cuando la mascota vocaliza). Ciclo de vida ligado a AppState.
 * Los sonidos del mundo/UI son WAV sintetizados (scripts/generate-sounds.js).
 * La VOZ de la mascota ya no pasa por aquí: services/audio/PetAudioManager
 * (grabaciones reales con licencia, docs/audio-licenses.md).
 *
 * Todo fallo de audio se traga: el audio nunca rompe el juego.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import type { AudioCategory as MixCategory } from '@/core/audio/types';

import { Mixer } from './audio/Mixer';

export type AudioCategory = 'music' | 'ambient' | 'pet' | 'effects' | 'ui';

const SOUNDS = {
  uiTap: { src: require('@/assets/audio/ui-tap.wav') as number, category: 'ui' },
  discovery: { src: require('@/assets/audio/discovery.wav') as number, category: 'effects' },
  ballThrow: { src: require('@/assets/audio/ball-throw.wav') as number, category: 'effects' },
  boxOpen: { src: require('@/assets/audio/box-open.wav') as number, category: 'effects' },
  ambientRoom: { src: require('@/assets/audio/ambient-room.wav') as number, category: 'ambient' },
  // v7: mundo vivo (ambiente por lugar y sonidos del mundo)
  ambientGarden: { src: require('@/assets/audio/ambient-garden.wav') as number, category: 'ambient' },
  ambientPark: { src: require('@/assets/audio/ambient-park.wav') as number, category: 'ambient' },
  leafRustle: { src: require('@/assets/audio/leaf-rustle.wav') as number, category: 'effects' },
  thud: { src: require('@/assets/audio/thud.wav') as number, category: 'effects' },
  bird: { src: require('@/assets/audio/bird.wav') as number, category: 'ambient' },
  outside: { src: require('@/assets/audio/outside.wav') as number, category: 'ambient' },
  creak: { src: require('@/assets/audio/creak.wav') as number, category: 'effects' },
} as const satisfies Record<string, { src: number; category: AudioCategory }>;

export type SoundName = keyof typeof SOUNDS;


const MIX: Record<AudioCategory, MixCategory> = { music: 'MUSIC', ambient: 'AMBIENCE', pet: 'VOCAL', effects: 'AMBIENCE', ui: 'UI' };

class AudioManagerImpl {
  private players = new Map<SoundName, AudioPlayer>();
  private muted = false;
  private loops = new Set<SoundName>();
  private suspended = false;
  private ready = false;

  async init(): Promise<void> {
    if (this.ready) return;
    this.ready = true;
    // Volúmenes/ducking del mezclador → reproductores vivos (bucles de ambiente incluidos)
    Mixer.subscribe(() => this.players.forEach((p, name) => { p.volume = this.effective(name); }));
    try {
      // Respeta el interruptor de silencio (iOS) y convive con la música del usuario
      await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false });
    } catch (e) {
      console.warn('[audio] modo no disponible', e);
    }
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
    const cat = SOUNDS[name].category;
    return this.muted ? 0 : Mixer.gain(MIX[cat]) * (cat === 'ambient' ? Mixer.duckFactor('ambience') : 1);
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

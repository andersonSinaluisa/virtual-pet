/*
 * PET AUDIO MANAGER (plataforma) — reproduce; nunca decide
 * --------------------------------------------------------
 *   dominio (VocalizationSystem) → VocalizationEvent { assetId, gain, rate } ─┐
 *   dominio (capas)              → { purr | pant | teethPurr | sleep: nivel } ─┼→ aquí
 *   FoleySystem                  → pasos, aterrizajes...                      ─┘
 *
 * Responsabilidades: cargar (una vez por asset), precargar lo común, reproducir
 * one-shots, bucles con fundido (ContinuousLayer), parar, volumen/mute por
 * categoría (Mixer), ducking, atenuación por distancia y liberar memoria.
 * NO contiene lógica de comportamiento: no sabe por qué maúlla un gato.
 *
 * expo-audio (SDK 57): createAudioPlayer, volume, loop, setPlaybackRate(rate) con
 * shouldCorrectPitch=false (el tono cambia con la velocidad: voz propia), seekTo,
 * play/pause, replace, remove, preload(). No hay panorama estéreo: la "posición"
 * se expresa solo como atenuación por distancia.
 */
import { createAudioPlayer, preload, type AudioPlayer } from 'expo-audio';

import { getAsset } from '@/core/audio/petAudioManifest';
import type { AudioCategory } from '@/core/audio/types';

import { Mixer } from './Mixer';
import { PET_AUDIO_FILES } from './petAudioFiles.generated';

const MAX_PLAYERS = 36; // one-shots vivos a la vez (LRU): el resto se libera
const RETRIGGER_MS = 80; // el mismo asset dos veces en 80 ms es un eco, no un sonido nuevo

interface Slot {
  player: AudioPlayer;
  lastUsed: number;
  lastStart: number;
}

export function resolvePetAudio(id: string): number | undefined {
  return PET_AUDIO_FILES[id];
}

class PetAudioManagerImpl {
  private slots = new Map<string, Slot>();
  private suspended = false;
  private preloaded = new Set<string>();

  // Precarga (sin crear reproductores) lo que va a sonar pronto: las intenciones comunes de SU especie
  preload(ids: readonly string[]): void {
    for (const id of ids) {
      const src = PET_AUDIO_FILES[id];
      if (src === undefined || this.preloaded.has(id)) continue;
      this.preloaded.add(id);
      preload(src).catch(() => this.preloaded.delete(id));
    }
  }

  /**
   * One-shot. `gain` 0..1 (del dominio), `rate` voz propia × etapa, `distance` 0 (pegado a
   * la cámara) .. 1 (fondo del lugar): atenúa hasta −6 dB.
   */
  play(id: string, opts: { gain?: number; rate?: number; category?: AudioCategory; distance?: number } = {}): boolean {
    if (this.suspended || Mixer.isMuted) return false;
    const src = PET_AUDIO_FILES[id];
    if (src === undefined) { console.warn('[audio] asset desconocido', id); return false; }
    const cat: AudioCategory = opts.category ?? (getAsset(id)?.kind === 'foley' ? 'FOLEY' : 'VOCAL');
    const att = 1 - 0.5 * Math.max(0, Math.min(1, opts.distance ?? 0));
    const vol = Math.max(0, Math.min(1, (opts.gain ?? 1) * att)) * Mixer.gain(cat);
    if (vol < 0.01) return false;
    try {
      const now = Date.now();
      const slot = this.slot(id, src, now);
      if (now - slot.lastStart < RETRIGGER_MS) return false;
      slot.lastStart = now;
      const p = slot.player;
      p.volume = vol;
      p.shouldCorrectPitch = false;
      p.setPlaybackRate(Math.max(0.5, Math.min(2, opts.rate ?? 1)));
      void p.seekTo(0).then(() => p.play()).catch(() => {});
      if (cat === 'VOCAL') Mixer.duck((getAsset(id)?.durationMs ?? 600) + 200);
      return true;
    } catch (e) {
      console.warn('[audio] no se pudo reproducir', id, e);
      return false;
    }
  }

  stop(id: string): void {
    this.slots.get(id)?.player.pause();
  }

  stopAll(): void {
    this.slots.forEach((s) => s.player.pause());
  }

  suspend(): void {
    this.suspended = true;
    this.stopAll();
  }

  resume(): void {
    this.suspended = false;
  }

  // Cambio de mascota / salir de la app: libera todos los reproductores
  release(): void {
    this.slots.forEach((s) => s.player.remove());
    this.slots.clear();
  }

  get loadedCount(): number {
    return this.slots.size;
  }

  private slot(id: string, src: number, now: number): Slot {
    let s = this.slots.get(id);
    if (!s) {
      if (this.slots.size >= MAX_PLAYERS) this.evict();
      s = { player: createAudioPlayer(src), lastUsed: now, lastStart: 0 };
      this.slots.set(id, s);
    }
    s.lastUsed = now;
    return s;
  }

  private evict(): void {
    let oldest: string | null = null, t = Infinity;
    for (const [id, s] of this.slots) if (s.lastUsed < t && !s.player.playing) { t = s.lastUsed; oldest = id; }
    if (oldest) { this.slots.get(oldest)!.player.remove(); this.slots.delete(oldest); }
  }
}

export const PetAudioManager = new PetAudioManagerImpl();

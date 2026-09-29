/*
 * CONTINUOUS LAYER — un bucle que entra y sale con fundidos, sin clics ni reinicios
 * -------------------------------------------------------------------------------
 * El dominio dice "nivel objetivo" (0..1) y qué bucle; aquí se funde hacia él a la
 * velocidad de su LayerSpec (fadeIn / fadeOut) y se modula suavemente el volumen
 * (el ronroneo "respira", la respiración dormida sube y baja).
 *
 *  - El bucle NUNCA se reinicia mientras suena: si cambia la causa, cambia el volumen.
 *  - Solo se cambia de archivo cuando la capa está en silencio.
 *  - En silencio más de un momento se pausa (no gasta batería).
 *  - Los WAV de capa están preparados con crossfade (scripts/audio): el salto del bucle no se oye.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import type { LayerSpec } from '@/core/audio/SpeciesVocalizationProfile';
import type { AudioCategory } from '@/core/audio/types';

import { Mixer } from './Mixer';

export interface Modulation {
  hz: number; // frecuencia de la modulación
  depth: number; // 0..1 (proporción del volumen)
}

const STEP_MS = 50;

export class ContinuousLayer {
  private player: AudioPlayer | null = null;
  private assetId: string | null = null;
  private level = 0; // nivel actual (antes del mezclador)
  private target = 0;
  private spec: LayerSpec | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private silentFor = 0;
  private phase = Math.random() * Math.PI * 2;
  private suspended = false;

  constructor(readonly name: string, private readonly resolve: (id: string) => number | undefined, private modulation: Modulation = { hz: 0, depth: 0 }, private readonly category: AudioCategory = 'VOCAL') {}

  get currentLevel(): number {
    return this.level;
  }

  get currentAsset(): string | null {
    return this.assetId;
  }

  setModulation(m: Modulation): void {
    this.modulation = m;
  }

  // Lo llama el puente de audio en cada tick con el estado que decidió el dominio
  setTarget(assetId: string | null, level: number, spec: LayerSpec | null): void {
    this.spec = spec ?? this.spec;
    this.target = assetId ? Math.max(0, Math.min(1, level)) : 0;
    if (assetId && assetId !== this.assetId && this.level < 0.01) this.load(assetId);
    if (this.target > 0 && !this.timer) this.start();
  }

  suspend(): void {
    this.suspended = true;
    this.player?.pause();
  }

  resume(): void {
    this.suspended = false;
    if (this.level > 0.01) this.player?.play();
  }

  release(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.player?.remove();
    this.player = null;
    this.assetId = null;
    this.level = 0;
  }

  private load(assetId: string): void {
    const src = this.resolve(assetId);
    if (src === undefined) return;
    try {
      if (!this.player) {
        this.player = createAudioPlayer(src);
        this.player.loop = true;
        this.player.volume = 0;
      } else {
        this.player.pause();
        this.player.replace(src);
        this.player.loop = true;
      }
      this.assetId = assetId;
    } catch (e) {
      console.warn('[audio] capa no disponible', this.name, e);
    }
  }

  private start(): void {
    this.timer = setInterval(() => this.step(), STEP_MS);
  }

  private step(): void {
    const spec = this.spec;
    const p = this.player;
    if (!p || !spec) return;
    // Fundido lineal hacia el objetivo con la velocidad de la especie (sin saltos → sin clics)
    const up = STEP_MS / Math.max(1, spec.fadeInMs), down = STEP_MS / Math.max(1, spec.fadeOutMs);
    const d = this.target - this.level;
    this.level += d > 0 ? Math.min(d, up) : Math.max(d, -down);
    this.phase += (2 * Math.PI * this.modulation.hz * STEP_MS) / 1000;
    const mod = 1 - this.modulation.depth * 0.5 * (1 + Math.sin(this.phase));
    const vol = this.level * mod * Mixer.gain(this.category) * (this.category === 'VOCAL' ? Mixer.duckFactor('layer') : 1);
    try {
      p.volume = vol;
      if (this.level > 0.005 && !p.playing && !this.suspended && !Mixer.isMuted) p.play();
    } catch { /* el audio nunca rompe el juego */ }
    if (this.level <= 0.005 && this.target === 0) {
      this.silentFor += STEP_MS;
      if (this.silentFor > 800) {
        p.pause();
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.silentFor = 0;
      }
    } else this.silentFor = 0;
  }
}

/*
 * Controladores con nombre propio (la misma mecánica, distinto carácter):
 *   PurrController       ronroneo: modulación lenta 0.3 Hz ±12 % (respira)
 *   PantController       jadeo: la grabación ya tiene su ritmo; sin modulación
 *   SleepAudioController respiración/ronquido dormido: 0.17 Hz ±30 % (ciclo de respiración lento)
 *   BreathingAudio       = SleepAudioController a nivel bajo cuando descansa despierto
 */
export const PurrController = (resolve: (id: string) => number | undefined) => new ContinuousLayer('purr', resolve, { hz: 0.3, depth: 0.12 });
export const PantController = (resolve: (id: string) => number | undefined) => new ContinuousLayer('pant', resolve, { hz: 0, depth: 0 });
export const TeethPurrController = (resolve: (id: string) => number | undefined) => new ContinuousLayer('teethPurr', resolve, { hz: 0.2, depth: 0.2 });
export const SleepAudioController = (resolve: (id: string) => number | undefined) => new ContinuousLayer('sleep', resolve, { hz: 0.17, depth: 0.3 });

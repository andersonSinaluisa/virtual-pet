/*
 * MIXER — volúmenes por categoría, mute y ducking (plataforma)
 * ------------------------------------------------------------
 *   VOCAL     voz de la mascota (one-shots y capas: ronroneo, jadeo, sueño)
 *   FOLEY     su cuerpo: pasos, aterrizajes, rascarse, beber
 *   AMBIENCE  ambiente del lugar y sonidos del mundo
 *   UI        botones
 *   MUSIC     música (preparada)
 *
 * ganancia final = master × categoría × ducking. Prioridades de mezcla: cuando la
 * mascota vocaliza, el ambiente baja un poco (−35 %) y sus propias capas continuas
 * también (−45 %), para que el maullido se entienda sin subir el volumen general.
 */
import type { AudioCategory } from '@/core/audio/types';

type Listener = () => void;

class MixerImpl {
  private master = 1;
  private volumes: Record<AudioCategory, number> = { VOCAL: 0.85, FOLEY: 0.7, AMBIENCE: 0.5, UI: 0.6, MUSIC: 0.5 };
  private muted = false;
  private duckUntil = 0;
  private listeners = new Set<Listener>();
  private duckTimer: ReturnType<typeof setTimeout> | null = null;

  configure(v: { master: number; pet: number; ambient: number; music: number; ui: number; muted: boolean }): void {
    this.master = clamp(v.master);
    this.volumes = { VOCAL: clamp(v.pet), FOLEY: clamp(v.pet * 0.8), AMBIENCE: clamp(v.ambient), UI: clamp(v.ui), MUSIC: clamp(v.music) };
    this.muted = v.muted;
    this.listeners.forEach((l) => l());
  }

  get isMuted(): boolean {
    return this.muted;
  }

  // Ganancia de una categoría (sin ducking): para one-shots
  gain(cat: AudioCategory): number {
    return this.muted ? 0 : this.master * this.volumes[cat];
  }

  // Un one-shot de voz empieza: el ambiente y las capas bajan durante `ms`
  duck(ms: number): void {
    const was = Date.now() <= this.duckUntil;
    this.duckUntil = Math.max(this.duckUntil, Date.now() + ms);
    if (!was) this.listeners.forEach((l) => l());
    if (this.duckTimer) clearTimeout(this.duckTimer);
    this.duckTimer = setTimeout(() => this.listeners.forEach((l) => l()), this.duckUntil - Date.now() + 20);
  }

  duckFactor(kind: 'ambience' | 'layer'): number {
    if (Date.now() > this.duckUntil) return 1;
    return kind === 'ambience' ? 0.65 : 0.55;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

const clamp = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

export const Mixer = new MixerImpl();

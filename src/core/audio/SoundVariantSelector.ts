/*
 * SOUND VARIANT SELECTOR — elegir QUÉ grabación suena (sin repetir en bucle)
 * -------------------------------------------------------------------------
 * Selección aleatoria ponderada con penalización del historial reciente:
 *
 *   peso = 1 × (preferida por su voz ? 1.6 : 1) × penalización(historial)
 *   penalización: la última ×0.02 · entre las 3 últimas ×0.3 · entre las 6 últimas ×0.65
 *
 * El historial es por ESPECIE (compartido entre intenciones: el gruñidito del oso sirve
 * para saludar y para agradecer una caricia, y no debe sonar tres veces seguidas).
 * Con una sola variante no hay más remedio
 * que repetirla (el validador avisa de las intenciones con menos de 3).
 */
import type { Rng } from '../random';
import type { PetAudioAsset, VocalizationIntent } from './types';

const HISTORY = 8;

export class SoundVariantSelector {
  private history = new Map<string, string[]>();

  constructor(private readonly rng: Rng) {}

  weightOf(id: string, key: string, preferred: ReadonlySet<string>): number {
    const h = this.history.get(key) ?? [];
    const pos = h.lastIndexOf(id);
    const age = pos < 0 ? Infinity : h.length - 1 - pos; // 0 = la última
    const recent = age === 0 ? 0.02 : age < 3 ? 0.3 : age < 6 ? 0.65 : 1;
    return (preferred.has(id) ? 1.6 : 1) * recent;
  }

  pick(variants: readonly PetAudioAsset[], species: string, _intent: VocalizationIntent, preferred: ReadonlySet<string> = new Set()): PetAudioAsset | null {
    if (!variants.length) return null;
    const key = species;
    const weights = variants.map((v) => this.weightOf(v.id, key, preferred));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.rng() * total;
    let chosen = variants[variants.length - 1];
    for (let i = 0; i < variants.length; i++) {
      r -= weights[i];
      if (r <= 0) { chosen = variants[i]; break; }
    }
    this.remember(key, chosen.id);
    return chosen;
  }

  // "Siguiente variante" del Audio Lab: la menos reciente, sin azar
  next(variants: readonly PetAudioAsset[], species: string, intent: VocalizationIntent): PetAudioAsset | null {
    if (!variants.length) return null;
    const key = `${species}:${intent}`;
    const h = this.history.get(key) ?? [];
    const last = h[h.length - 1];
    const i = variants.findIndex((v) => v.id === last);
    const chosen = variants[(i + 1) % variants.length];
    this.remember(key, chosen.id);
    return chosen;
  }

  private remember(key: string, id: string): void {
    const h = this.history.get(key) ?? [];
    h.push(id);
    if (h.length > HISTORY) h.shift();
    this.history.set(key, h);
  }
}

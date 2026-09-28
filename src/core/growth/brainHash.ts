/*
 * Huella de los pesos del cerebro (para comprobar que crecer NO lo cambia).
 * FNV-1a sobre los pesos redondeados a 1e-9 y ordenados por nombre.
 */
import type { BrainWeightsData } from '../brain/BrainConfig';

export function weightsHash(w: BrainWeightsData): string {
  const text = JSON.stringify(w, (_k, v: unknown) => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v));
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0') + `:${text.length}`;
}

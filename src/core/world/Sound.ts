/*
 * ESTÍMULOS SONOROS (dominio)
 * ---------------------------
 * Un SoundStimulus es un hecho físico del mundo: algo sonó en (x, y) con una
 * intensidad en la fuente. NO es reproducción de audio: la capa de audio
 * (services/AudioManager) puede reproducir algo parecido para el jugador,
 * pero la mascota percibe el estímulo a través de WorldSensorSystem
 * (atenuado por la distancia, sin necesidad de verlo).
 *
 *   AUDIO PLAYBACK  ≠  SOUND STIMULUS
 */
import type { Point } from '../simulation/Pet';

export const SOUND_KINDS = ['noise', 'thud', 'rustle', 'bird', 'outside', 'creak', 'boxOpen', 'wind', 'voice'] as const;
export type SoundKind = (typeof SOUND_KINDS)[number];

export interface SoundStimulus extends Point {
  id: number;
  kind: SoundKind;
  intensity: number; // 0..1 en la fuente
  loud: boolean; // estallido brusco (el reflejo de sobresalto lo percibe `loudSound`)
  age: number; // ticks desde que sonó
  sourceObjectId: number | null; // si lo produjo un objeto (una caja que cruje, una pelota que cae)
  origin?: string | null; // si viene de OTRA ubicación (se oye por una puerta abierta): su LocationId
}

// Cada tick la intensidad cae (los sonidos son transitorios); por debajo del mínimo se olvida
export const SOUND_DECAY = 0.8;
export const SOUND_MIN = 0.02;

// Atenuación con la distancia (unidades de habitación). Suave: en la habitación casi todo se oye.
export function soundAttenuation(distance: number, reference = 1): number {
  return 1 / (1 + (distance / reference) ** 2);
}

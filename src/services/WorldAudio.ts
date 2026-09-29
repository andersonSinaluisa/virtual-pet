/*
 * WORLD AUDIO — reproducción para el JUGADOR de lo que suena en el mundo
 * ---------------------------------------------------------------------
 *   SoundStimulus (dominio)  → lo percibe la mascota (atenuado, con dirección)
 *   WorldAudio (plataforma)  → lo oye la persona (este archivo)
 *
 * Están separados a propósito: silenciar la app no deja sorda a la mascota,
 * y reproducir un sonido nunca crea un estímulo.
 */
import type { StepResult } from '@/core/simulation/Simulation';
import type { LocationId } from '@/core/world/Locations';
import { LOCATIONS } from '@/core/world/Locations';
import type { SoundKind } from '@/core/world/Sound';

import { AudioManager, type SoundName } from './AudioManager';

const STIMULUS_AUDIO: Record<SoundKind, SoundName | null> = {
  noise: null, // el ruido fuerte lo produce el propio botón (ya suena)
  thud: 'thud',
  rustle: 'leafRustle',
  bird: 'bird',
  outside: 'outside',
  creak: 'creak',
  boxOpen: 'boxOpen',
  wind: 'leafRustle',
  voice: null,
};

const AMBIENCE: Record<NonNullable<(typeof LOCATIONS)['room']['sensoryProfile']['ambience']>, SoundName> = {
  room: 'ambientRoom', garden: 'ambientGarden', park: 'ambientPark',
};

let current: SoundName | null = null;

export function setAmbience(loc: LocationId): void {
  const a = LOCATIONS[loc].sensoryProfile.ambience;
  const next = a ? AMBIENCE[a] : null;
  if (next === current) return;
  if (current) AudioManager.stopLoop(current);
  current = next;
  if (next) AudioManager.startLoop(next);
}

// Los sonidos que ocurrieron este tick en el mundo (no los offline: nadie estaba escuchando)
export function playWorldSounds(r: StepResult): void {
  if (r.offline) return;
  for (const e of r.events) {
    if (e.type !== 'SOUND_OCCURRED' && e.type !== 'LOUD_SOUND') continue;
    const name = STIMULUS_AUDIO[e.detail as SoundKind];
    if (name) AudioManager.play(name);
  }
}

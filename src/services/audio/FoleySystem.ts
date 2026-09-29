/*
 * FOLEY SYSTEM — el cuerpo de la mascota (separado de su voz)
 * ----------------------------------------------------------
 * Pasos sincronizados con la animación (contacto del pie en PetAnimator), con la
 * superficie del lugar (habitación → suelo, jardín → hierba, parque → tierra) y el
 * peso de la especie: el oso pisa grave y fuerte, el gato y el conejo casi no se oyen.
 * También: aterrizaje tras un salto, rascarse, moverse en la cama y beber.
 *
 * Categoría FOLEY del Mixer. Nunca crea estímulos del mundo (eso es del dominio).
 */
import { foleyVariants } from '@/core/audio/petAudioManifest';
import type { LayerSpec } from '@/core/audio/SpeciesVocalizationProfile';
import type { FoleyKind } from '@/core/audio/types';
import type { SpeciesKey } from '@/core/persistence/SaveGame';
import type { LocationId } from '@/core/world/Locations';

import { ContinuousLayer } from './ContinuousLayer';
import { PetAudioManager, resolvePetAudio } from './PetAudioManager';

const WEIGHT: Record<SpeciesKey, { gain: number; rate: number }> = {
  dog: { gain: 0.55, rate: 1 },
  cat: { gain: 0.28, rate: 1.15 },
  bear: { gain: 0.85, rate: 0.8 },
  bunny: { gain: 0.22, rate: 1.2 },
};

const SURFACE: Record<LocationId, FoleyKind> = { room: 'step_floor', garden: 'step_grass', park: 'step_dirt', forest: 'step_dirt', beach: 'step_dirt' };
const DRINK_SPEC: LayerSpec = { intent: 'RELAXED', fadeInMs: 250, fadeOutMs: 400, maxGain: 0.6, rampMs: 1, holdMs: 0 };

class FoleySystemImpl {
  private last = new Map<FoleyKind, string>();
  private lastStep = 0;
  private drink = new ContinuousLayer('drink', resolvePetAudio, { hz: 0, depth: 0 }, 'FOLEY');

  private pick(kind: FoleyKind): string | null {
    const vs = foleyVariants(kind).filter((a) => !a.loop);
    if (!vs.length) return null;
    const prev = this.last.get(kind);
    const pool = vs.length > 1 ? vs.filter((v) => v.id !== prev) : vs;
    const id = pool[Math.floor(Math.random() * pool.length)].id;
    this.last.set(kind, id);
    return id;
  }

  // Contacto de un pie con el suelo (lo emite el animador según la fase del paso)
  step(species: SpeciesKey, location: LocationId, run: boolean, distance: number): void {
    const now = Date.now();
    if (now - this.lastStep < 110) return; // cuatro patas: no suenan todas
    this.lastStep = now;
    const id = this.pick(SURFACE[location] ?? 'step_floor');
    if (!id) return;
    const w = WEIGHT[species];
    const jitter = 1 + (Math.random() - 0.5) * 0.08;
    PetAudioManager.play(id, { gain: w.gain * (run ? 1.2 : 0.9) * jitter, rate: w.rate * jitter, category: 'FOLEY', distance });
  }

  land(species: SpeciesKey, distance: number): void {
    const id = this.pick('land');
    if (id) PetAudioManager.play(id, { gain: WEIGHT[species].gain * 1.2, rate: WEIGHT[species].rate, category: 'FOLEY', distance });
  }

  scratch(species: SpeciesKey, distance: number): void {
    const id = this.pick('scratch');
    if (id) PetAudioManager.play(id, { gain: 0.5, rate: WEIGHT[species].rate, category: 'FOLEY', distance });
  }

  body(species: SpeciesKey, distance: number): void {
    const id = this.pick('body');
    if (id) PetAudioManager.play(id, { gain: 0.35, rate: WEIGHT[species].rate, category: 'FOLEY', distance });
  }

  // Beber: bucle mientras dure la acción DRINK (con fundido corto)
  setDrinking(on: boolean): void {
    const loop = foleyVariants('drink')[0];
    this.drink.setTarget(on && loop ? loop.id : null, on ? DRINK_SPEC.maxGain : 0, DRINK_SPEC);
  }

  suspend(): void { this.drink.suspend(); }
  resume(): void { this.drink.resume(); }
  release(): void { this.drink.release(); }
}

export const FoleySystem = new FoleySystemImpl();

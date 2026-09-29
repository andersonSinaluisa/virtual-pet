/*
 * PUENTE SESIÓN → AUDIO (plataforma)
 * ---------------------------------
 *   GameSession 'vocalization'  → PetAudioManager.play (con atenuación por distancia)
 *                               → reacción breve en la cara/cabeza (la lee PetScene)
 *   GameSession 'audioLayers'   → ronroneo / jadeo / ronroneo dental / sueño (fundidos)
 *                               → pulsos hápticos suaves mientras ronronea (no constantes)
 *   tick                        → beber (foley) mientras DRINK esté activa
 *
 * Offline: el dominio no emite vocalizaciones (solo cuenta intenciones), así que
 * al volver NO suena nada de lo que "dijo" mientras no estabas.
 */
import { layerAssets, vocalVariants, audioSpecies } from '@/core/audio/petAudioManifest';
import type { LayerId } from '@/core/audio/SpeciesVocalizationProfile';
import type { LayerState, VocalizationEvent } from '@/core/audio/VocalizationSystem';
import type { VocalizationIntent } from '@/core/audio/types';
import type { SpeciesKey } from '@/core/persistence/SaveGame';
import type { GameSession } from '@/core/session/GameSession';

import { haptic } from '../haptics';
import { ContinuousLayer, PantController, PurrController, SleepAudioController, TeethPurrController } from './ContinuousLayer';
import { FoleySystem } from './FoleySystem';
import { PetAudioManager, resolvePetAudio } from './PetAudioManager';

// Lo que la escena necesita para reaccionar a la voz (boca, cabeza, orejas, ojos)
export interface VoiceReaction {
  intent: VocalizationIntent | null;
  until: number; // ms (Date.now) hasta el que dura la reacción del one-shot
  purr: number; // nivel actual del ronroneo (gato: ojos entornados)
  pant: number;
  teethPurr: number; // conejo: orejas relajadas
}

const PRELOAD: VocalizationIntent[] = ['GREETING', 'AFFECTION', 'CURIOUS', 'PLAYFUL', 'ATTENTION'];
const PURR_PULSE_MS = 1500;
const PURR_MAX_PULSES = 5;

class PetVoiceBridgeImpl {
  private unsubs: (() => void)[] = [];
  private layers: Record<LayerId, ContinuousLayer> = {
    purr: PurrController(resolvePetAudio), pant: PantController(resolvePetAudio),
    teethPurr: TeethPurrController(resolvePetAudio), sleep: SleepAudioController(resolvePetAudio),
  };
  private reaction: VoiceReaction = { intent: null, until: 0, purr: 0, pant: 0, teethPurr: 0 };
  private purrPulses = 0;
  private lastPulse = 0;
  private session: GameSession | null = null;
  lastEvent: VocalizationEvent | null = null;

  attach(session: GameSession): void {
    this.detach();
    this.session = session;
    this.preloadFor(session.profile.species);
    const ev = session.events;
    this.unsubs.push(
      ev.on('vocalization', (e) => this.onVocal(e)),
      ev.on('audioLayers', (l) => this.onLayers(l)),
      ev.on('tick', (r) => { if (!r.offline) FoleySystem.setDrinking(r.active.includes('DRINK') && !session.world.pet.asleep); }),
    );
  }

  detach(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    for (const l of Object.values(this.layers)) l.setTarget(null, 0, null);
    FoleySystem.setDrinking(false);
    this.session = null;
  }

  get current(): VoiceReaction {
    return this.reaction;
  }

  // Distancia a la cámara: el fondo del lugar (y = 0) suena ~6 dB más bajo que el frente
  distance(): number {
    const y = this.session?.world.pet.y ?? 0.6;
    return Math.max(0, Math.min(1, 1 - y));
  }

  private preloadFor(species: SpeciesKey): void {
    const sp = audioSpecies(species);
    const ids = PRELOAD.flatMap((i) => vocalVariants(sp, i).map((a) => a.id));
    ids.push(...layerAssets(sp, 'AFFECTION').map((a) => a.id));
    PetAudioManager.preload(ids);
  }

  private onVocal(e: VocalizationEvent): void {
    if (!e.assetId) return;
    this.lastEvent = e;
    const ok = PetAudioManager.play(e.assetId, { gain: e.gain, rate: e.rate, category: 'VOCAL', distance: this.distance() });
    if (ok) this.reaction = { ...this.reaction, intent: e.intent, until: Date.now() + 700 };
  }

  private onLayers(l: Record<LayerId, LayerState>): void {
    for (const id of Object.keys(this.layers) as LayerId[]) this.layers[id].setTarget(l[id].assetId, l[id].level, l[id].spec);
    const purr = this.layers.purr.currentLevel;
    this.reaction = { ...this.reaction, purr, pant: this.layers.pant.currentLevel, teethPurr: this.layers.teethPurr.currentLevel };
    // Hápticos del ronroneo: unos pocos pulsos suaves al empezar, no una vibración continua
    const now = Date.now();
    if (l.purr.level > 0.35) {
      if (this.purrPulses < PURR_MAX_PULSES && now - this.lastPulse > PURR_PULSE_MS) { haptic('purr'); this.purrPulses++; this.lastPulse = now; }
    } else if (l.purr.level === 0) this.purrPulses = 0;
  }

  // Vista previa fuera del juego (elegir especie en el onboarding): un saludo real de esa especie
  preview(species: SpeciesKey, intent: VocalizationIntent = 'GREETING'): void {
    const vs = vocalVariants(audioSpecies(species), intent);
    if (vs.length) PetAudioManager.play(vs[Math.floor(Math.random() * vs.length)].id, { gain: 0.75, category: 'VOCAL' });
  }

  suspend(): void {
    Object.values(this.layers).forEach((l) => l.suspend());
    FoleySystem.suspend();
    PetAudioManager.suspend();
  }

  resume(): void {
    PetAudioManager.resume();
    Object.values(this.layers).forEach((l) => l.resume());
    FoleySystem.resume();
  }

  release(): void {
    this.detach();
    Object.values(this.layers).forEach((l) => l.release());
    FoleySystem.release();
    PetAudioManager.release();
  }
}

export const PetVoiceBridge = new PetVoiceBridgeImpl();

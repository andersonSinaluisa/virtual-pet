/*
 * VOCALIZATION SYSTEM — de lo que HACE la mascota a lo que QUIERE EXPRESAR
 * -----------------------------------------------------------------------
 *
 *   SNN → acciones (onsets) · estado (energía, miedo, afecto...) · contexto
 *     │   (caricia, vuelves a casa, ruido fuerte, caja misteriosa...)
 *     ▼
 *   VocalizationIntent  (GREETING, AFFECTION, CURIOUS, SCARED...)  + intensidad 0..1
 *     ▼
 *   SpeciesVocalizationProfile  (probabilidad · cooldown · volumen · capas)
 *     ▼   × personalidad (solo frecuencia/intensidad) × voz propia
 *   SoundVariantSelector  (variante ponderada, sin repeticiones)
 *     ▼
 *   VocalizationEvent  → la plataforma (PetAudioManager) lo reproduce
 *
 * Reglas:
 *  - La SNN NO reproduce archivos ni aprende de audio: aquí solo se INTERPRETA lo que ya hizo.
 *  - El silencio es una respuesta válida (probabilidad, cooldowns, techo por minuto).
 *  - Offline no se genera audio: solo se cuentan las intenciones (nadie estaba escuchando).
 *  - Se registra intención/contexto/respuesta (metadatos para depurar; la SNN no los usa).
 *  - Opcional: cada vocalización puede convertirse en un estímulo del mundo ('voice')
 *    para futuras mascotas; desactivado por defecto (la mascota no se asusta de sí misma).
 */
import type { Action } from '../brain/Actions';
import type { TraitKey } from '../discovery/Personality';
import type { LifeStage } from '../growth/LifeStage';
import type { Experience } from '../memory/types';
import type { SpeciesKey } from '../persistence/SaveGame';
import type { Rng } from '../random';
import { clamp01 } from '../random';
import type { StepEvent } from '../simulation/Simulation';
import { audioSpecies, layerAssets, vocalVariants } from './petAudioManifest';
import { STAGE_RATE, STAGE_VOLUME, type PetVoiceProfile } from './PetVoiceProfile';
import { SoundVariantSelector } from './SoundVariantSelector';
import { INTENT_PRIORITY, SPECIES_PROFILES, type LayerId, type LayerSpec, type SpeciesVocalizationProfile } from './SpeciesVocalizationProfile';
import type { VocalizationIntent } from './types';

export interface VocalStats {
  energy: number;
  fatigue: number;
  affection: number;
  fear: number;
  boredom: number;
}

// Contexto del momento (lo arma GameSession; aquí no se lee el mundo directamente)
export interface VocalContext {
  nowMs: number;
  species: SpeciesKey;
  stage: LifeStage;
  asleep: boolean;
  stats: VocalStats;
  speed: number; // 1 caminar, >1 correr
  playerPresent: boolean;
  petting: boolean; // la mano del jugador está sobre la mascota ahora
  familiarity: number; // 0..1 cuánto conoce al jugador (días juntos, caricias)
  traits: Partial<Record<TraitKey, number>>; // 0..1
  offline: boolean;
}

export interface VocalStepInput {
  tick: number;
  onsets: readonly Action[];
  active: readonly Action[];
  events: readonly Pick<StepEvent, 'type' | 'detail'>[];
}

export interface IntentCandidate {
  intent: VocalizationIntent;
  intensity: number;
  trigger: string; // qué lo causó (para el registro y el Audio Lab)
  direct?: boolean; // respuesta a algo que hizo el JUGADOR (caricia, volver): no espera al cooldown global
}

export interface VocalizationEvent {
  seq: number;
  atMs: number;
  tick: number;
  species: SpeciesKey;
  intent: VocalizationIntent;
  trigger: string;
  intensity: number;
  assetId: string | null; // null = silencio elegido (probabilidad)
  gain: number; // 0..1 (antes del mezclador)
  rate: number; // playbackRate (voz propia × etapa)
  stimulus: number; // intensidad si se emitiera como estímulo del mundo
}

export interface LayerState {
  assetId: string | null;
  level: number; // objetivo 0..1 (la plataforma funde hacia él)
  spec: LayerSpec | null;
}

export interface VocalLogEntry {
  atMs: number;
  intent: VocalizationIntent;
  trigger: string;
  response: string; // assetId | 'silence' | 'cooldown' | 'rate-limit' | 'no-asset'
  energy: number;
  fear: number;
  affection: number;
}

export interface VocalizationConfig {
  emitWorldStimulus: boolean;
}

const LOG_SIZE = 200;
const LONG_ABSENCE_MS = 3 * 3_600_000;
const MID_ABSENCE_MS = 30 * 60_000;

const trait = (ctx: VocalContext, k: TraitKey) => ctx.traits[k] ?? 0.5;

/*
 * Personalidad → FRECUENCIA e INTENSIDAD (nunca qué sonido ni si es "bueno").
 * Con rasgos neutros (0.5) el multiplicador es 1.
 */
export function personalityFactor(intent: VocalizationIntent, ctx: VocalContext): number {
  switch (intent) {
    case 'GREETING': case 'ATTENTION': case 'AFFECTION': case 'HAPPY':
      return 0.6 + 0.8 * trait(ctx, 'sociable');
    case 'PLAYFUL': case 'EXCITED':
      return 0.6 + 0.8 * trait(ctx, 'playful');
    case 'CURIOUS':
      return 0.6 + 0.8 * trait(ctx, 'curious');
    case 'RELAXED': case 'SLEEPY':
      return 0.8 + 0.4 * trait(ctx, 'calm');
    case 'SCARED': case 'ALERT': case 'UNCOMFORTABLE':
      return 0.7 + 0.6 * trait(ctx, 'soundSensitive');
    default:
      return 1;
  }
}

export class VocalizationSystem {
  readonly selector: SoundVariantSelector;
  readonly profile: SpeciesVocalizationProfile;
  readonly log: VocalLogEntry[] = [];
  readonly offlineTally: Partial<Record<VocalizationIntent, number>> = {};
  readonly counts: Partial<Record<VocalizationIntent, { played: number; silent: number; blocked: number }>> = {};
  config: VocalizationConfig = { emitWorldStimulus: false };
  voice: PetVoiceProfile;

  private seq = 0;
  private lastAny = -Infinity;
  private lastByIntent = new Map<VocalizationIntent, number>();
  private recent: number[] = []; // instantes de one-shots audibles (techo por minuto)
  private pending: IntentCandidate[] = [];
  private layers = new Map<LayerId, { assetId: string | null; since: number; lastCause: number; cause: number; chanceOk: boolean }>();
  private lastPresentAt: number;
  private lastPlayOrRun = -Infinity;
  private preferred: Set<string>;

  constructor(readonly species: SpeciesKey, voice: PetVoiceProfile, private readonly rng: Rng, now = 0) {
    this.profile = SPECIES_PROFILES[audioSpecies(species)];
    this.selector = new SoundVariantSelector(rng);
    this.voice = voice;
    this.preferred = new Set(voice.preferredVariants);
    this.lastPresentAt = now;
  }

  setVoice(v: PetVoiceProfile): void {
    this.voice = v;
    this.preferred = new Set(v.preferredVariants);
  }

  // Experiencias (del grabador o del jugador): se convierten en intenciones en el próximo update
  noteExperience(e: Experience, ctx: VocalContext): void {
    const c = this.fromExperience(e, ctx);
    if (c) this.pending.push(c);
  }

  private fromExperience(e: Experience, ctx: VocalContext): IntentCandidate | null {
    const { energy, fear, affection } = ctx.stats;
    switch (e.kind) {
      case 'petted': return { intent: 'AFFECTION', intensity: clamp01(0.35 + 0.5 * affection - 0.4 * fear), trigger: 'caricia', direct: true };
      case 'fetch_returned': return { intent: energy > 0.55 ? 'EXCITED' : 'HAPPY', intensity: clamp01(0.4 + 0.5 * energy), trigger: 'trae la pelota' };
      case 'fetch_chased': case 'played': return { intent: 'PLAYFUL', intensity: clamp01(0.3 + 0.6 * energy), trigger: e.subject ? `juega (${e.subject})` : 'juega' };
      case 'investigated': case 'approached_object':
        return { intent: 'CURIOUS', intensity: e.subject === 'mysteryBox' ? 0.75 : 0.45, trigger: e.subject ? `investiga ${e.subject}` : 'investiga' };
      case 'mystery_opened': return { intent: energy > 0.5 ? 'EXCITED' : 'CURIOUS', intensity: 0.7, trigger: 'abre la caja misteriosa' };
      case 'first_visit': return { intent: 'CURIOUS', intensity: 0.6, trigger: 'lugar nuevo' };
      case 'player_rewarded': return { intent: 'HAPPY', intensity: clamp01(0.4 + 0.4 * affection), trigger: 'premio', direct: true };
      case 'scared': return { intent: 'SCARED', intensity: clamp01(0.3 + 0.4 * e.intensity), trigger: e.subject ? `susto (${e.subject})` : 'susto' };
      default: return null;
    }
  }

  // Intenciones que salen de las acciones que la SNN acaba de iniciar y de los eventos del mundo
  candidates(ctx: VocalContext, input: VocalStepInput): IntentCandidate[] {
    const out: IntentCandidate[] = [];
    const { energy, fatigue, affection, fear, boredom } = ctx.stats;
    for (const a of input.onsets) {
      switch (a) {
        case 'ASK_ATTENTION': out.push({ intent: 'ATTENTION', intensity: clamp01(0.4 + 0.3 * boredom + 0.3 * affection), trigger: 'pide atención' }); break;
        case 'GREET': if (ctx.playerPresent) out.push(this.greeting(ctx, 'saluda')); break;
        case 'CRY': out.push({ intent: 'UNCOMFORTABLE', intensity: clamp01(0.3 + 0.3 * fear), trigger: 'llora' }); break;
        case 'GET_SCARED': out.push({ intent: 'SCARED', intensity: clamp01(0.25 + 0.45 * fear), trigger: 'se asusta' }); break;
        case 'HIDE': case 'MOVE_AWAY': if (fear > 0.3) out.push({ intent: 'UNCOMFORTABLE', intensity: clamp01(0.2 + 0.4 * fear), trigger: a === 'HIDE' ? 'se esconde' : 'se aleja' }); break;
        case 'INVESTIGATE': out.push({ intent: 'CURIOUS', intensity: 0.45, trigger: 'investiga' }); break;
        case 'PLAY': out.push({ intent: 'PLAYFUL', intensity: clamp01(0.3 + 0.6 * energy), trigger: 'juega' }); break;
        case 'DANCE': case 'SMILE': if (energy > 0.4) out.push({ intent: 'HAPPY', intensity: clamp01(0.3 + 0.4 * affection), trigger: a === 'DANCE' ? 'baila' : 'sonríe' }); break;
        case 'REST':
          if (fatigue > 0.72) out.push({ intent: 'SLEEPY', intensity: clamp01(fatigue), trigger: 'cansancio' });
          else if (affection > 0.45 && fear < 0.2) out.push({ intent: 'RELAXED', intensity: 0.4, trigger: 'descansa a gusto' });
          break;
        case 'SLEEP': if (fatigue > 0.5) out.push({ intent: 'SLEEPY', intensity: clamp01(fatigue), trigger: 'se va a dormir' }); break;
        case 'MAKE_SOUND':
          // La SNN decidió hacer ruiditos: el TIPO lo da su estado, no una regla por objeto
          if (fear > 0.4) out.push({ intent: 'UNCOMFORTABLE', intensity: clamp01(fear), trigger: 'ruiditos (miedo)' });
          else if (energy > 0.6 && boredom > 0.4) out.push({ intent: 'PLAYFUL', intensity: energy, trigger: 'ruiditos (ganas de jugar)' });
          else if (affection > 0.5) out.push({ intent: 'HAPPY', intensity: affection, trigger: 'ruiditos (contento)' });
          else out.push({ intent: 'CURIOUS', intensity: 0.4, trigger: 'ruiditos' });
          break;
        default: break;
      }
    }
    for (const e of input.events) {
      if (e.type === 'PLAYER_ENTERED') out.push({ ...this.greeting(ctx, 'vuelves a casa'), direct: true });
      else if (e.type === 'LOUD_SOUND' && !ctx.asleep) out.push({ intent: fear > 0.35 ? 'SCARED' : 'ALERT', intensity: clamp01(0.35 + 0.4 * fear), trigger: 'ruido fuerte' });
    }
    return out;
  }

  // GREETING según personalidad, familiaridad, energía y cuánto tiempo estuviste fuera
  greeting(ctx: VocalContext, trigger: string): IntentCandidate {
    const absent = Math.max(0, ctx.nowMs - this.lastPresentAt);
    const { energy } = ctx.stats;
    let intensity = 0.35 + 0.35 * trait(ctx, 'sociable') + 0.2 * ctx.familiarity;
    if (absent > MID_ABSENCE_MS) intensity += 0.15 + 0.1 * trait(ctx, 'attached');
    if (energy < 0.25) intensity *= 0.6; // cansado: saludo suave
    const excited = absent > LONG_ABSENCE_MS && energy > 0.45 && this.profile.sets.EXCITED;
    return { intent: excited ? 'EXCITED' : 'GREETING', intensity: clamp01(intensity), trigger: absent > MID_ABSENCE_MS ? `${trigger} tras ${Math.round(absent / 60000)} min` : trigger };
  }

  update(ctx: VocalContext, input: VocalStepInput): { events: VocalizationEvent[]; layers: Record<LayerId, LayerState> } {
    const now = ctx.nowMs;
    if (input.onsets.includes('PLAY') || input.onsets.includes('RUN') || ctx.speed > 1.2) this.lastPlayOrRun = now;
    const cands = [...this.pending, ...this.candidates(ctx, input)];
    this.pending = [];
    if (ctx.playerPresent) this.lastPresentAt = now;

    const events: VocalizationEvent[] = [];
    if (cands.length) {
      // Una sola vocalización por tick: la intención más urgente (las demás se registran como bloqueadas)
      // (lo que responde al jugador va antes que lo espontáneo de la misma urgencia)
      cands.sort((a, b) => Number(!!b.direct) - Number(!!a.direct) || INTENT_PRIORITY[b.intent] - INTENT_PRIORITY[a.intent] || b.intensity - a.intensity);
      const [top, ...rest] = cands;
      const ev = this.resolve(top, ctx, input.tick);
      if (ev) events.push(ev);
      for (const c of rest) this.count(c.intent, 'blocked');
    }
    return { events, layers: this.updateLayers(ctx) };
  }

  // Aplica silencio / cooldowns / probabilidad y elige la variante
  resolve(c: IntentCandidate, ctx: VocalContext, tick: number, force = false): VocalizationEvent | null {
    const now = ctx.nowMs;
    if (ctx.offline) {
      this.offlineTally[c.intent] = (this.offlineTally[c.intent] ?? 0) + 1;
      return null;
    }
    if (ctx.asleep && !force) return this.logOnly(c, ctx, 'asleep');
    const set = this.profile.sets[c.intent];
    if (!set) return this.logOnly(c, ctx, 'no-asset');
    if (!force) {
      if (now - (this.lastByIntent.get(c.intent) ?? -Infinity) < set.cooldownMs) return this.logOnly(c, ctx, 'cooldown');
      // Lo que responde al jugador solo evita pisar el sonido anterior (0.9 s); lo espontáneo espera el cooldown global
      if (now - this.lastAny < (c.direct ? 900 : this.profile.globalCooldownMs)) return this.logOnly(c, ctx, 'cooldown');
      this.recent = this.recent.filter((t) => now - t < 60_000);
      if (this.recent.length >= this.profile.maxPerMinute) return this.logOnly(c, ctx, 'rate-limit');
    }
    // El cooldown de la intención corre aunque elija callar: si no, lo intentaría en cada tick
    this.lastByIntent.set(c.intent, now);
    const p = Math.min(0.97, set.probability * personalityFactor(c.intent, ctx) * this.voice.vocalizationFrequency);
    const sp = audioSpecies(this.species);
    const variants = vocalVariants(sp, c.intent, ctx.stage);
    const speak = force || this.rng() < p;
    const asset = speak ? this.selector.pick(variants, sp, c.intent, this.preferred) : null;
    const response = asset ? asset.id : speak ? 'no-asset' : 'silence';
    this.pushLog(c, ctx, response);
    this.count(c.intent, asset ? 'played' : 'silent');
    if (!asset) return null;
    this.lastAny = now;
    this.recent.push(now);
    const [g0, g1] = set.gain;
    const intensity = clamp01(c.intensity * (0.85 + 0.3 * personalityFactor(c.intent, ctx) / 1.4));
    const gain = clamp01((g0 + (g1 - g0) * intensity) * this.voice.volume * STAGE_VOLUME[ctx.stage]);
    const jitter = 1 + (this.rng() - 0.5) * 0.03; // ±1.5 %: dos maullidos iguales nunca suenan idénticos
    const rate = this.voice.pitch * STAGE_RATE[ctx.stage] * jitter;
    return {
      seq: ++this.seq, atMs: now, tick, species: this.species, intent: c.intent, trigger: c.trigger, intensity,
      assetId: asset.id, gain, rate, stimulus: this.config.emitWorldStimulus ? gain * 0.5 : 0,
    };
  }

  // ---------- Capas continuas ----------
  private updateLayers(ctx: VocalContext): Record<LayerId, LayerState> {
    const now = ctx.nowMs;
    const out = {} as Record<LayerId, LayerState>;
    const specs = this.profile.layers;
    const sp = audioSpecies(this.species);
    const causes: Record<LayerId, number> = { purr: 0, pant: 0, teethPurr: 0, sleep: 0 };
    if (!ctx.offline) {
      const pet = this.profile.pettingLayer;
      if (pet && ctx.petting && !ctx.asleep && ctx.stats.fear < 0.5) causes[pet] = 1;
      // Perro: también jadea un rato después de jugar/correr (si le queda energía para ello)
      if (sp === 'dog' && !ctx.asleep && now - this.lastPlayOrRun < 5000) causes.pant = Math.max(causes.pant, 0.7);
      // Gato relajado junto a ti: ronroneo bajito
      if (sp === 'cat' && !ctx.asleep && ctx.playerPresent && ctx.stats.affection > 0.6 && ctx.stats.fear < 0.15 && ctx.stats.energy < 0.5) causes.purr = Math.max(causes.purr, 0.35);
      if (ctx.asleep) causes.sleep = 1;
    }
    for (const id of ['purr', 'pant', 'teethPurr', 'sleep'] as LayerId[]) {
      const spec = specs[id];
      if (!spec) { out[id] = { assetId: null, level: 0, spec: null }; continue; }
      let st = this.layers.get(id);
      const cause = causes[id];
      if (cause > 0) {
        if (!st || (now - st.lastCause > spec.holdMs + spec.fadeOutMs)) {
          // Nueva activación: se elige el bucle una vez (no cambia a mitad) y, en el conejo, si ocurre
          const assets = layerAssets(sp, spec.intent);
          const pick = assets.length ? assets[Math.floor(this.rng() * assets.length)] : null;
          const chanceOk = id !== this.profile.pettingLayer || this.rng() < this.profile.pettingLayerChance;
          st = { assetId: pick?.id ?? null, since: now, lastCause: now, cause, chanceOk };
          this.layers.set(id, st);
        }
        st.lastCause = now;
        st.cause = cause;
      }
      if (!st) { out[id] = { assetId: null, level: 0, spec }; continue; }
      const active = now - st.lastCause <= spec.holdMs;
      const ramp = clamp01((now - st.since) / Math.max(1, spec.rampMs));
      const level = active && st.chanceOk ? spec.maxGain * ramp * st.cause : 0;
      out[id] = { assetId: st.assetId, level, spec };
      if (!active && now - st.lastCause > spec.holdMs + spec.fadeOutMs) this.layers.delete(id);
    }
    return out;
  }

  // ---------- Registro ----------
  private logOnly(c: IntentCandidate, ctx: VocalContext, response: string): null {
    this.pushLog(c, ctx, response);
    this.count(c.intent, 'blocked');
    return null;
  }

  private pushLog(c: IntentCandidate, ctx: VocalContext, response: string): void {
    this.log.push({ atMs: ctx.nowMs, intent: c.intent, trigger: c.trigger, response, energy: ctx.stats.energy, fear: ctx.stats.fear, affection: ctx.stats.affection });
    if (this.log.length > LOG_SIZE) this.log.shift();
  }

  private count(intent: VocalizationIntent, k: 'played' | 'silent' | 'blocked'): void {
    const c = (this.counts[intent] ??= { played: 0, silent: 0, blocked: 0 });
    c[k]++;
  }

  // Audio Lab: fuerza una intención (sin probabilidad ni cooldowns)
  force(intent: VocalizationIntent, ctx: VocalContext, intensity = 0.7): VocalizationEvent | null {
    return this.resolve({ intent, intensity, trigger: 'Audio Lab' }, { ...ctx, asleep: false }, 0, true);
  }

  drainOfflineTally(): Partial<Record<VocalizationIntent, number>> {
    const t = { ...this.offlineTally };
    for (const k of Object.keys(this.offlineTally) as VocalizationIntent[]) delete this.offlineTally[k];
    return t;
  }
}

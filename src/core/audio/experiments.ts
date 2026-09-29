/*
 * EXPERIMENTOS DE AUDIO (sin plataforma): ¿cuánto "habla" cada mascota en una
 * sesión real? Simulación completa (SNN, mundo, memoria), 3 ticks/s, con un
 * jugador que va y viene, acaricia, lanza la pelota, hace un ruido y trae la
 * caja misteriosa. Solo se MIDE lo que el VocalizationSystem decidió.
 */
import type { SpeciesKey } from '../persistence/SaveGame';
import { seededRng } from '../random';
import { GameSession } from '../session/GameSession';
import type { LayerId } from './SpeciesVocalizationProfile';
import type { LayerState, VocalizationEvent } from './VocalizationSystem';
import type { VocalizationIntent } from './types';

export interface AudioSimReport {
  species: SpeciesKey;
  minutes: number;
  events: VocalizationEvent[];
  total: number;
  perMinute: number;
  maxInAnyMinute: number;
  byIntent: Partial<Record<VocalizationIntent, number>>;
  silences: number; // intenciones que eligieron callar (probabilidad)
  blocked: number; // intenciones frenadas por cooldown / techo por minuto / dormida
  immediateRepeats: number; // mismo asset dos veces seguidas
  overlaps: number; // dos one-shots a < 400 ms
  distinctAssets: number;
  layerSeconds: Record<LayerId, number>;
  pettingSessions: number;
  greetingsOffered: number;
}

export interface AudioSimOptions {
  minutes?: number;
  seed?: number;
  traits?: Partial<Record<string, number>>; // fuerza rasgos (dos gatos: sociable vs reservado)
  name?: string;
}

const T0 = 1_700_000_000_000 + 9 * 3_600_000;

export function createAudioPet(species: SpeciesKey, opts: AudioSimOptions = {}): { s: GameSession; clock: { t: number } } {
  const clock = { t: T0 };
  const s = GameSession.create({ name: opts.name ?? 'Milo', species }, { rng: seededRng(opts.seed ?? 7), now: () => clock.t, lifeStage: 'YOUNG' });
  if (opts.traits) {
    const forced = opts.traits;
    const orig = s.vocalContext.bind(s);
    s.vocalContext = (now: number, offline = false) => {
      const c = orig(now, offline);
      return { ...c, traits: { ...c.traits, ...forced } };
    };
  }
  return { s, clock };
}

export function simulateAudioSession(species: SpeciesKey, opts: AudioSimOptions = {}): AudioSimReport {
  const minutes = opts.minutes ?? 30;
  const { s, clock } = createAudioPet(species, opts);
  const events: VocalizationEvent[] = [];
  const layerSeconds: Record<LayerId, number> = { purr: 0, pant: 0, teethPurr: 0, sleep: 0 };
  let layers: Record<LayerId, LayerState> | null = null;
  s.events.on('vocalization', (e) => events.push(e));
  s.events.on('audioLayers', (l) => { layers = l; });
  s.setPlayerPresent(true);
  s.placeItem('ball');
  const ticks = minutes * 60 * 3;
  let pettingSessions = 0, greetingsOffered = 0;
  for (let i = 0; i < ticks; i++) {
    clock.t += 333;
    const sec = Math.floor(i / 3);
    // Guion del jugador (igual para todas las especies)
    if (i % 3 === 0) {
      if (sec % 300 === 150) s.setPlayerPresent(false); // sale 40 s cada 5 min
      if (sec % 300 === 190) { s.setPlayerPresent(true); greetingsOffered++; }
      const inPet = sec % 120 >= 20 && sec % 120 < 28 && s.world.player.present; // caricia de 8 s cada 2 min
      if (inPet) { if (sec % 120 === 20) pettingSessions++; s.petDirect(); }
      if (sec % 90 === 60 && s.world.player.present) {
        const ball = s.world.objects.find((o) => o.kind === 'ball');
        if (ball) s.world.throwObject(ball.id, 0.03, -0.01);
      }
      if (sec === 7 * 60 || sec === 22 * 60) s.interact('noise');
      if (sec === 10 * 60) s.placeItem('mysteryBox');
    }
    s.tick();
    if (layers) for (const k of Object.keys(layerSeconds) as LayerId[]) if ((layers as Record<LayerId, LayerState>)[k].level > 0.02) layerSeconds[k] += 1 / 3;
  }
  const byIntent: AudioSimReport['byIntent'] = {};
  for (const e of events) byIntent[e.intent] = (byIntent[e.intent] ?? 0) + 1;
  let immediateRepeats = 0, overlaps = 0, maxInAnyMinute = 0;
  for (let i = 1; i < events.length; i++) {
    if (events[i].assetId === events[i - 1].assetId) immediateRepeats++;
    if (events[i].atMs - events[i - 1].atMs < 400) overlaps++;
  }
  for (let i = 0; i < events.length; i++) {
    let n = 0;
    for (let j = i; j < events.length && events[j].atMs - events[i].atMs < 60_000; j++) n++;
    maxInAnyMinute = Math.max(maxInAnyMinute, n);
  }
  const counts = Object.values(s.vocal.counts);
  return {
    species, minutes, events, total: events.length, perMinute: events.length / minutes, maxInAnyMinute, byIntent,
    silences: counts.reduce((n, c) => n + (c?.silent ?? 0), 0), blocked: counts.reduce((n, c) => n + (c?.blocked ?? 0), 0),
    immediateRepeats, overlaps, distinctAssets: new Set(events.map((e) => e.assetId)).size, layerSeconds, pettingSessions, greetingsOffered,
  };
}

// Respuesta inmediata a una caricia de `seconds` (criterio de éxito: cuatro respuestas distintas)
export interface PettingProbe {
  species: SpeciesKey;
  events: VocalizationEvent[];
  layerTrace: { t: number; layer: LayerId | null; asset: string | null; level: number }[];
}

export function probePetting(species: SpeciesKey, seconds = 6, seed = 3): PettingProbe {
  const { s, clock } = createAudioPet(species, { seed });
  s.setPlayerPresent(true);
  // Un rato tranquilo para que no arranque en medio de otra cosa
  for (let i = 0; i < 30; i++) { clock.t += 333; s.tick(); }
  const events: VocalizationEvent[] = [];
  const layerTrace: PettingProbe['layerTrace'] = [];
  s.events.on('vocalization', (e) => events.push(e));
  s.events.on('audioLayers', (l) => {
    const top = (Object.entries(l) as [LayerId, LayerState][]).filter(([k]) => k !== 'sleep').sort((a, b) => b[1].level - a[1].level)[0];
    layerTrace.push({ t: clock.t, layer: top && top[1].level > 0 ? top[0] : null, asset: top?.[1].assetId ?? null, level: top?.[1].level ?? 0 });
  });
  const ticks = seconds * 3;
  for (let i = 0; i < ticks + 30; i++) {
    clock.t += 333;
    if (i < ticks) s.petDirect();
    s.tick();
  }
  return { species, events, layerTrace };
}

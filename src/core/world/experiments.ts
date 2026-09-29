/*
 * EXPERIMENTOS DEL MUNDO VIVO (tests, herramientas de desarrollo y
 * docs/living-world-results.md)
 *
 * Aquí solo actúa el MUNDO o el JUGADOR: colocar una caja, lanzar la pelota,
 * hacer ruido, abrir la puerta, salir de paseo. Nunca se le dice a la mascota
 * qué hacer. Las mediciones se hacen sobre CLONES con el aprendizaje
 * congelado (medir no cambia el cerebro).
 */
import type { Action } from '../brain/Actions';
import { type PresetKey } from '../brain/BrainConfig';
import type { LifeStage } from '../growth/LifeStage';
import { seededRng } from '../random';
import { GameSession } from '../session/GameSession';
import type { PetStat } from '../simulation/SimConfig';
import type { World, WorldObject } from '../simulation/World';
import { SimulationClock } from '../time/WorldClock';
import type { ItemKind } from './Items';
import type { LocationId } from './Locations';
import type { ObjectPercept } from './Perception';

export type YieldFn = () => Promise<void>;
const noYield: YieldFn = async () => {};

export const APP_TICK_MS = 333;

// Un día fijo a las `hour` (hora local): experimentos reproducibles
export function worldTime(hour = 11, day = 5): number {
  return new Date(2026, 0, day, hour, 0, 0, 0).getTime();
}

export interface LabPet {
  session: GameSession;
  clock: SimulationClock;
}

// Mascota de laboratorio: reloj de simulación a ritmo de app (333 ms de mundo por tick)
export function labPet(name: string, seed: number, opts: { preset?: PresetKey; stage?: LifeStage; hour?: number } = {}): LabPet {
  const clock = new SimulationClock(worldTime(opts.hour ?? 11), APP_TICK_MS);
  const session = GameSession.create({ name, species: name === 'Luna' ? 'cat' : 'dog', preset: opts.preset }, { rng: seededRng(seed), clock, lifeStage: opts.stage ?? 'YOUNG' });
  session.setPlayerPresent(true);
  return { session, clock };
}

const CALM: Record<PetStat, number> = { hunger: 0.25, thirst: 0.25, fatigue: 0.2, boredom: 0.5, affection: 0.7, energy: 0.75, fear: 0, curiosity: 0.35 };

export function calm(s: GameSession): void {
  for (const [k, v] of Object.entries(CALM) as [PetStat, number][]) s.setPetStat(k, v);
}

export function clearLoose(w: World): void {
  for (const o of w.objects.filter((x) => !x.fixed)) w.removeObject(o.id);
}

export function place(w: World, kind: ItemKind, at: { x: number; y: number }): WorldObject {
  return w.placeItem(kind, at);
}

// ------------------------------------------------------------------
// PRUEBA A — percepción espacial (sin omnisciencia)
// ------------------------------------------------------------------
export interface PerceptionCase {
  label: string;
  at: { x: number; y: number };
  percept: ObjectPercept;
  seesBall: number; // lo que llega de verdad a la SNN
}

export function perceptionProbe(seed = 1, dark = false): PerceptionCase[] {
  const { session: s } = labPet('Milo', seed, { hour: dark ? 23 : 11 });
  const w = s.world, pet = w.pet;
  const cases: [string, { x: number; y: number }][] = [
    ['delante · cerca', { x: 0.5, y: 0.65 }],
    ['delante · lejos', { x: 0.5, y: 0.98 }],
    ['detrás · cerca (bigotes/olfato)', { x: 0.5, y: 0.42 }],
    ['detrás · lejos', { x: 0.5, y: 0.1 }],
    ['al lado (periferia)', { x: 0.85, y: 0.5 }],
  ];
  const out: PerceptionCase[] = [];
  w.setClock(s.clock.now()); // la luz del momento (de noche se ve peor)
  for (const [label, at] of cases) {
    clearLoose(w);
    pet.x = 0.5; pet.y = 0.5; pet.orientation = Math.PI / 2; pet.asleep = false;
    const ball = place(w, 'ball', at);
    ball.novelty = 0;
    const p = w.perceive();
    out.push({ label, at, percept: w.percepts.find((x) => x.id === ball.id) as ObjectPercept, seesBall: p.seesBall });
  }
  return out;
}

// Oído: un sonido detrás (fuera del FOV) se oye y orienta la atención
export function hearingProbe(seed = 1): { heard: number; direction: number; behind: boolean; attention: string | null; lookedWithin: number | null } {
  const { session: s } = labPet('Milo', seed);
  const w = s.world, pet = w.pet;
  clearLoose(w); calm(s);
  pet.x = 0.5; pet.y = 0.5; pet.orientation = Math.PI / 2;
  const ball = w.dropItem('ball', { x: 0.5, y: 0.2 }); // cae DETRÁS
  s.tick();
  const h = w.heard.find((x) => x.kind === 'thud') ?? w.heard[0];
  const att = w.attentionTarget ? (w.attentionTarget.type === 'sound' ? `sonido:${h?.kind}` : `objeto:${w.getObject(w.attentionTarget.id)?.kind}`) : null;
  let looked: number | null = null;
  for (let t = 1; t <= 30 && looked === null; t++) {
    s.tick();
    const p = w.percepts.find((x) => x.id === ball.id);
    if (p?.inFov && p.vision > 0.2) looked = t;
  }
  return { heard: h?.heard ?? 0, direction: h?.direction ?? 0, behind: h?.behind ?? false, attention: att, lookedWithin: looked };
}

// ------------------------------------------------------------------
// PRUEBA B — novedad y familiaridad (memoria de exposición)
// ------------------------------------------------------------------
export interface NoveltyPoint { exposure: number; novelty: number; familiarity: number; stage: string }

export function noveltyCurve(s: GameSession, kind: ItemKind, exposures = 20, ticks = 60): NoveltyPoint[] {
  const w = s.world, k = w.knowledge;
  const out: NoveltyPoint[] = [{ exposure: 0, novelty: k.novelty(kind, w.nowMs), familiarity: k.familiarity(kind), stage: k.object(kind)?.stage ?? '—' }];
  for (let e = 1; e <= exposures; e++) {
    clearLoose(w); calm(s);
    w.pet.x = 0.5; w.pet.y = 0.5; w.pet.orientation = Math.PI / 2;
    place(w, kind, { x: 0.55, y: 0.72 });
    for (let t = 0; t < ticks; t++) s.tick();
    clearLoose(w);
    // un rato sin verlo: el siguiente avistamiento es otro encuentro
    for (let t = 0; t < 300; t++) s.tick();
    out.push({ exposure: e, novelty: k.novelty(kind, w.nowMs), familiarity: k.familiarity(kind), stage: k.object(kind)?.stage ?? '—' });
  }
  return out;
}

// ------------------------------------------------------------------
// CAJA MISTERIOSA — un ensayo (vertical slice)
// ------------------------------------------------------------------
export interface BoxTrial {
  perceivedAt: number | null; // tick en que la percibió
  firstAction: Action | null; // primera acción que empezó tras percibirla (LOOK, INVESTIGATE, MOVE_AWAY…)
  lookedAt: number | null;
  approachedAt: number | null; // < 0.15
  minDistance: number;
  nearTicks: number; // ticks a < 0.2 de la caja
  investigateTicks: number;
  fearOnsets: number; // GET_SCARED + HIDE + MOVE_AWAY
  opened: boolean;
  noveltyAtStart: number;
  familiarityAtStart: number;
  onsets: Partial<Record<Action, number>>;
}

const FEAR: ReadonlySet<Action> = new Set<Action>(['GET_SCARED', 'HIDE', 'MOVE_AWAY']);

export interface BoxTrialOptions {
  ticks?: number;
  at?: { x: number; y: number };
  // Historia aversiva: si la mascota se acerca a la caja, suena un golpe fuerte (el mundo, no la mascota)
  aversive?: boolean;
  aversiveRange?: number;
  keepBox?: boolean;
}

export function boxTrial(s: GameSession, opts: BoxTrialOptions = {}): BoxTrial {
  const w = s.world, pet = w.pet;
  clearLoose(w); calm(s);
  pet.x = 0.5; pet.y = 0.45; pet.orientation = Math.PI / 2; pet.carrying = null;
  const k = w.knowledge;
  const tr: BoxTrial = {
    perceivedAt: null, firstAction: null, lookedAt: null, approachedAt: null, minDistance: Infinity, nearTicks: 0, investigateTicks: 0,
    fearOnsets: 0, opened: false, noveltyAtStart: k.novelty('mysteryBox', w.nowMs), familiarityAtStart: k.familiarity('mysteryBox'), onsets: {},
  };
  const box = place(w, 'mysteryBox', opts.at ?? { x: 0.5, y: 0.78 });
  let lastNoise = -99;
  const N = opts.ticks ?? 90;
  for (let t = 0; t < N; t++) {
    const prev = new Set(s.sim.last.active);
    const r = s.tick();
    const d = w.distance(pet, box);
    const p = w.percepts.find((x) => x.id === box.id);
    if (tr.perceivedAt === null && p?.perceived) tr.perceivedAt = t;
    for (const a of r.active) if (!prev.has(a)) {
      tr.onsets[a] = (tr.onsets[a] ?? 0) + 1;
      if (FEAR.has(a)) tr.fearOnsets++;
      if (tr.perceivedAt !== null && tr.firstAction === null && a !== 'WALK' && a !== 'SMILE') tr.firstAction = a;
    }
    if (tr.lookedAt === null && r.focusObjectId === box.id && r.active.includes('LOOK_AT_OBJECT')) tr.lookedAt = t;
    if (tr.approachedAt === null && d < 0.15) tr.approachedAt = t;
    tr.minDistance = Math.min(tr.minDistance, d);
    if (d < 0.2) tr.nearTicks++;
    if (r.active.includes('INVESTIGATE') && r.focusObjectId === box.id && d < 0.12) tr.investigateTicks++;
    if (box.state !== 'closed') tr.opened = true;
    if (opts.aversive && d < (opts.aversiveRange ?? 0.3) && t - lastNoise > 25) {
      w.emitSound({ kind: 'noise', intensity: 1, x: box.x, y: box.y, loud: true, sourceObjectId: box.id });
      lastNoise = t;
    }
  }
  if (!opts.keepBox) clearLoose(w);
  return tr;
}

// Historia: `n` ensayos con la caja (positivos: nada malo pasa; aversivos: un golpe si se acerca)
export async function boxHistory(s: GameSession, n: number, aversive: boolean, yieldFn: YieldFn = noYield): Promise<BoxTrial[]> {
  const out: BoxTrial[] = [];
  for (let i = 0; i < n; i++) {
    out.push(boxTrial(s, { aversive, ticks: 150 }));
    for (let t = 0; t < 30; t++) s.tick(); // pausa entre ensayos
    if (i % 5 === 4) await yieldFn();
  }
  return out;
}

export interface BoxTendency {
  trials: number;
  approachRate: number; // fracción de ensayos en que llegó a < 0.15
  meanMinDistance: number;
  meanNearTicks: number;
  meanInvestigate: number;
  fearRate: number; // fracción de ensayos con alguna reacción de miedo
  openRate: number;
  firstActions: Partial<Record<Action, number>>;
}

// Medición sobre un CLON congelado (no aprende mientras se mide)
export async function measureBoxTendency(source: GameSession, trials = 12, seed = 7, opts: BoxTrialOptions = {}, yieldFn: YieldFn = noYield, setup?: (s: GameSession) => void): Promise<BoxTendency> {
  const s = GameSession.clone(source, { rng: seededRng(seed), clock: new SimulationClock(source.clock.now(), APP_TICK_MS) });
  s.setEvaluation(true);
  s.setPlayerPresent(true);
  setup?.(s);
  const res: BoxTrial[] = [];
  for (let i = 0; i < trials; i++) {
    res.push(boxTrial(s, opts));
    for (let t = 0; t < 20; t++) s.tick();
    if (i % 5 === 4) await yieldFn();
  }
  const mean = (f: (t: BoxTrial) => number) => res.reduce((a, t) => a + f(t), 0) / res.length;
  const first: Partial<Record<Action, number>> = {};
  for (const t of res) if (t.firstAction) first[t.firstAction] = (first[t.firstAction] ?? 0) + 1;
  return {
    trials, approachRate: mean((t) => (t.approachedAt !== null ? 1 : 0)), meanMinDistance: mean((t) => t.minDistance),
    meanNearTicks: mean((t) => t.nearTicks), meanInvestigate: mean((t) => t.investigateTicks), fearRate: mean((t) => (t.fearOnsets > 0 ? 1 : 0)),
    openRate: mean((t) => (t.opened ? 1 : 0)), firstActions: first,
  };
}

// ------------------------------------------------------------------
// ESCENA COMPARTIDA: 📦 arriba, ⚽ izquierda, 🧸 derecha, la mascota abajo
// ------------------------------------------------------------------
export interface SceneOutcome {
  firstReach: ItemKind | null;
  engagement: Record<string, number>; // ticks con foco + investigar/jugar cerca
  fearOnsets: number;
  onsets: Partial<Record<Action, number>>;
}

export async function sharedScene(source: GameSession, trials = 12, ticks = 90, seed = 3, yieldFn: YieldFn = noYield): Promise<SceneOutcome[]> {
  const s = GameSession.clone(source, { rng: seededRng(seed), clock: new SimulationClock(source.clock.now(), APP_TICK_MS) });
  s.setEvaluation(true);
  s.setPlayerPresent(true);
  const w = s.world, pet = w.pet;
  const out: SceneOutcome[] = [];
  for (let i = 0; i < trials; i++) {
    clearLoose(w); calm(s);
    pet.x = 0.5; pet.y = 0.42; pet.orientation = Math.PI / 2; pet.carrying = null;
    const objs = [place(w, 'mysteryBox', { x: 0.5, y: 0.82 }), place(w, 'ball', { x: 0.25, y: 0.62 }), place(w, 'teddy', { x: 0.75, y: 0.62 })];
    const o: SceneOutcome = { firstReach: null, engagement: { mysteryBox: 0, ball: 0, teddy: 0 }, fearOnsets: 0, onsets: {} };
    for (let t = 0; t < ticks; t++) {
      const prev = new Set(s.sim.last.active);
      const r = s.tick();
      for (const a of r.active) if (!prev.has(a)) { o.onsets[a] = (o.onsets[a] ?? 0) + 1; if (FEAR.has(a)) o.fearOnsets++; }
      const focus = w.getObject(r.focusObjectId);
      if (focus && focus.kind in o.engagement) o.engagement[focus.kind] += 1;
      for (const obj of objs) {
        const near = w.distance(pet, obj) < 0.12;
        if (near && !o.firstReach) o.firstReach = obj.kind;
        if (near && r.active.some((a) => a === 'INVESTIGATE' || a === 'PLAY' || a === 'PICK_UP_OBJECT')) o.engagement[obj.kind] += 2;
      }
    }
    out.push(o);
    for (let t = 0; t < 15; t++) s.tick();
    if (i % 4 === 3) await yieldFn();
  }
  return out;
}

export function summarizeScene(r: SceneOutcome[]): { firstReach: Record<string, number>; engagementShare: Record<string, number>; fearRate: number } {
  const first: Record<string, number> = { mysteryBox: 0, ball: 0, teddy: 0, none: 0 };
  const eng: Record<string, number> = { mysteryBox: 0, ball: 0, teddy: 0 };
  let fear = 0;
  for (const o of r) {
    first[o.firstReach ?? 'none']++;
    for (const k of Object.keys(eng)) eng[k] += o.engagement[k];
    if (o.fearOnsets > 0) fear++;
  }
  const total = Object.values(eng).reduce((a, b) => a + b, 0) || 1;
  return { firstReach: first, engagementShare: Object.fromEntries(Object.entries(eng).map(([k, v]) => [k, v / total])), fearRate: fear / r.length };
}

// ------------------------------------------------------------------
// PRUEBA E — movimiento: pelota quieta vs rodando
// ------------------------------------------------------------------
export interface MovementTrial {
  objectMoving: number; // media de la señal que llega a la SNN en los primeros ticks
  lookOnsets: number; // ensayos en que empezó a MIRARLA en los primeros 12 ticks
  engageOnsets: number; // ensayos en que empezó a investigar/jugar/recogerla en los primeros 25 ticks
  focusTicks: number;
}

export async function movementComparison(source: GameSession, trials = 16, seed = 5): Promise<{ stationary: MovementTrial; rolling: MovementTrial }> {
  const run = (rolling: boolean): MovementTrial => {
    const s = GameSession.clone(source, { rng: seededRng(seed), clock: new SimulationClock(source.clock.now(), APP_TICK_MS) });
    s.setEvaluation(true);
    s.setPlayerPresent(true);
    const w = s.world, pet = w.pet;
    const acc: MovementTrial = { objectMoving: 0, lookOnsets: 0, engageOnsets: 0, focusTicks: 0 };
    for (let i = 0; i < trials; i++) {
      clearLoose(w); calm(s);
      pet.x = 0.5; pet.y = 0.4; pet.orientation = Math.PI / 2; pet.carrying = null;
      const ball = place(w, 'ball', { x: rolling ? 0.2 : 0.5, y: 0.75 });
      ball.novelty = 0;
      if (rolling) w.push(ball.id, 0.035, 0);
      let moving = 0, looked = false, engaged = false;
      for (let t = 0; t < 40; t++) {
        const prev = new Set(s.sim.last.active);
        const r = s.tick();
        if (t < 8) moving += r.perception.objectMoving / 8;
        if (r.focusObjectId === ball.id) acc.focusTicks++;
        for (const a of r.active) if (!prev.has(a)) {
          if (a === 'LOOK_AT_OBJECT' && t < 12 && r.focusObjectId === ball.id) looked = true;
          if ((a === 'INVESTIGATE' || a === 'PLAY' || a === 'PICK_UP_OBJECT') && t < 25) engaged = true;
        }
      }
      if (looked) acc.lookOnsets++;
      if (engaged) acc.engageOnsets++;
      acc.objectMoving += moving / trials;
      for (let t = 0; t < 10; t++) s.tick();
    }
    return acc;
  };
  return { stationary: run(false), rolling: run(true) };
}

// ------------------------------------------------------------------
// PRUEBA D — cambio de contexto (día + habitación familiar vs noche + lugar desconocido)
// ------------------------------------------------------------------
export async function contextComparison(source: GameSession, trials = 10, seed = 9): Promise<{ dayRoom: BoxTendency; nightPark: BoxTendency }> {
  const dayRoom = await measureBoxTendency(source, trials, seed);
  const night = GameSession.clone(source, { rng: seededRng(seed), clock: new SimulationClock(worldTime(23), APP_TICK_MS) });
  const nightPark = await measureBoxTendency(night, trials, seed, { at: { x: 0.5, y: 0.78 } }, noYield, (s) => {
    s.world.capability = () => true;
    s.world.changeLocation('park', { x: 0.5, y: 0.45 }, 'dev');
  });
  return { dayRoom, nightPark };
}

// ------------------------------------------------------------------
// PRIMERA VISITA (jardín / parque)
// ------------------------------------------------------------------
export interface VisitReport {
  location: LocationId;
  momentTitle: string | null;
  momentStory: string | null;
  onsets: Partial<Record<Action, number>>;
  maxDistance: number;
  newThingsSeen: ItemKind[];
}

export function firstVisit(s: GameSession, loc: LocationId, ticks = 200): VisitReport {
  const w = s.world;
  const ok = s.goOuting(loc);
  if (!ok) throw new Error(`No puede ir a ${loc}`);
  const arrive = { x: w.pet.x, y: w.pet.y };
  const onsets: Partial<Record<Action, number>> = {};
  let maxD = 0;
  const before = new Set(Object.keys(w.knowledge.state.objects));
  for (let t = 0; t < ticks; t++) {
    const prev = new Set(s.sim.last.active);
    const r = s.tick();
    for (const a of r.active) if (!prev.has(a)) onsets[a] = (onsets[a] ?? 0) + 1;
    if (w.location === loc) maxD = Math.max(maxD, w.distance(w.pet, arrive));
  }
  const m = s.memory.moments.find((x) => x.title.includes('Primera') && x.title.includes(loc === 'park' ? 'parque' : 'jardín')) ?? null;
  return {
    location: loc, momentTitle: m?.title ?? null, momentStory: m?.story ?? null, onsets, maxDistance: maxD,
    newThingsSeen: (Object.keys(w.knowledge.state.objects) as ItemKind[]).filter((k) => !before.has(k)),
  };
}

// ------------------------------------------------------------------
// PRUEBA G — rendimiento de la simulación (Node; el FPS de render se mide en dispositivo)
// ------------------------------------------------------------------
export interface PerfRow { objects: number; stepMs: number; perceiveMs: number; p95StepMs: number }

export function perfBenchmark(counts = [10, 25, 50], ticks = 600, seed = 2): PerfRow[] {
  const kinds: ItemKind[] = ['ball', 'teddy', 'duck', 'rope', 'leaf', 'feather', 'shell', 'yoyo', 'gift', 'crystal'];
  const rows: PerfRow[] = [];
  for (const n of counts) {
    const { session: s } = labPet('Perf', seed);
    const w = s.world;
    s.config.world.maxNovelObjects = 999;
    w.ambient.config.enabled = false;
    clearLoose(w);
    const rng = seededRng(n);
    for (let i = 0; i < n; i++) w.placeItem(kinds[i % kinds.length], { x: 0.05 + rng() * 0.9, y: 0.1 + rng() * 0.85 });
    for (let t = 0; t < 60; t++) s.tick(); // calentamiento
    const times: number[] = [];
    let perceive = 0;
    for (let t = 0; t < ticks; t++) {
      const a = performance.now();
      s.tick();
      times.push(performance.now() - a);
      const b = performance.now();
      w.perceive();
      perceive += performance.now() - b;
    }
    times.sort((x, y) => x - y);
    rows.push({ objects: w.objects.length, stepMs: times.reduce((x, y) => x + y, 0) / ticks, perceiveMs: perceive / ticks, p95StepMs: times[Math.floor(ticks * 0.95)] });
  }
  return rows;
}

// ------------------------------------------------------------------
// EXPLICAR UN EPISODIO: percibió → neuronas/circuitos → acción → experiencia → aprendió
// ------------------------------------------------------------------
export interface EpisodeExplanation {
  pet: string;
  perceived: { signal: number; meters: number; angle: number; novelty: number; familiarity: number; inFov: boolean } | null;
  snnInputs: { key: string; value: number; current: number }[];
  decision: { action: Action; sensors: { key: string; value: number }[]; circuits: string[]; pathway: { key: string; initial: number; current: number }[] } | null;
  actions: Action[];
  experiences: { kind: string; subject: string | null; valence: number; reward: number }[];
  learned: { source: string; reward: number; top: { key: string; delta: number }[] }[];
}

const BOX_INPUTS = ['seesBox', 'newObjectDetected', 'familiarObject', 'interestingObjectVisible', 'objectMoving', 'soundHeard', 'unfamiliarPlace', 'fear', 'curiosity'];
const BOX_ACTIONS: ReadonlySet<Action> = new Set<Action>(['LOOK_AT_OBJECT', 'INVESTIGATE', 'MOVE_AWAY', 'GET_SCARED', 'HIDE', 'PICK_UP_OBJECT', 'PLAY']);

// Un episodio REAL (con aprendizaje activo) en la escena 📦 ⚽ 🧸: qué pasó y por qué
export function explainBoxEpisode(s: GameSession, ticks = 120): EpisodeExplanation {
  const w = s.world, pet = w.pet;
  clearLoose(w); calm(s);
  pet.x = 0.5; pet.y = 0.42; pet.orientation = Math.PI / 2; pet.carrying = null;
  const box = place(w, 'mysteryBox', { x: 0.5, y: 0.82 });
  place(w, 'ball', { x: 0.25, y: 0.62 }); place(w, 'teddy', { x: 0.75, y: 0.62 });
  const exps0 = s.memory.experiences.length, log0 = s.plasticity.log[0];
  const out: EpisodeExplanation = { pet: s.profile.name, perceived: null, snnInputs: [], decision: null, actions: [], experiences: [], learned: [] };
  const decisions0 = new Set(s.decisions.map((d) => d.id));
  for (let t = 0; t < ticks; t++) {
    const prev = new Set(s.sim.last.active);
    const r = s.tick();
    const p = w.percepts.find((x) => x.id === box.id);
    if (!out.perceived && p?.perceived) {
      out.perceived = { signal: p.signal, meters: p.meters, angle: p.angle, novelty: p.novelty, familiarity: p.familiarity, inFov: p.inFov };
      out.snnInputs = s.sim.sensors.lastReadings.filter((x) => BOX_INPUTS.includes(x.key)).map((x) => ({ key: x.key, value: x.value, current: x.current }));
    }
    for (const a of r.active) if (!prev.has(a)) out.actions.push(a);
    if (!out.decision) {
      const d = s.decisions.find((x) => !decisions0.has(x.id) && BOX_ACTIONS.has(x.action) && x.subject === 'mysteryBox');
      if (d) out.decision = { action: d.action, sensors: d.sensors.map((x) => ({ key: x.key, value: x.value })), circuits: d.chain.circuits.map((c) => c.key), pathway: d.pathway.map((x) => ({ key: x.key, initial: x.initial, current: x.current })) };
    }
  }
  out.experiences = s.memory.experiences.slice(exps0).map((e) => ({ kind: e.kind, subject: e.subject, valence: e.valence, reward: e.reward }));
  const idx = log0 ? s.plasticity.log.indexOf(log0) : s.plasticity.log.length;
  out.learned = s.plasticity.log.slice(0, idx < 0 ? s.plasticity.log.length : idx).reverse().map((ev) => ({ source: ev.source, reward: ev.reward, top: ev.changes.slice(0, 3).map((c) => ({ key: c.key, delta: c.delta })) }));
  clearLoose(w);
  return out;
}

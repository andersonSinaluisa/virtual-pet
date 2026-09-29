/*
 * EXPERIMENTOS DE APRENDIZAJE (reutilizados por tests, herramientas de
 * desarrollo y docs/learning-results.md)
 *
 * Nada aquí elige por la mascota: el "jugador" solo coloca objetos, llama y
 * pulsa ❤️ Recompensar cuando la mascota YA hizo algo con el objeto. La
 * evaluación se hace sobre un CLON con el aprendizaje congelado.
 */
import type { Action } from '../brain/Actions';
import { OBJECT_CHANNELS } from '../brain/BrainConfig';
import { seededRng } from '../random';
import { GameSession } from '../session/GameSession';
import type { PetStat } from '../simulation/SimConfig';
import type { ItemKind } from '../world/Items';

// v9: la evaluación ocurre SIEMPRE a mediodía (antes heredaba la hora real de la máquina:
// de noche, a oscuras, la misma mascota puntuaba distinto). Reloj fijo sin depender del módulo de tiempo.
function evalClock(source: GameSession): { now: () => number } {
  const d = new Date(source.clock.now());
  d.setHours(12, 0, 0, 0);
  const t = d.getTime();
  return { now: () => t };
}

export type YieldFn = () => Promise<void>;
const noYield: YieldFn = async () => {};

const BASELINE: Record<PetStat, number> = { hunger: 0.3, thirst: 0.3, fatigue: 0.25, boredom: 0.6, affection: 0.6, energy: 0.7, fear: 0, curiosity: 0.4 };
const ENGAGE: ReadonlySet<Action> = new Set<Action>(['INVESTIGATE', 'PLAY', 'PICK_UP_OBJECT', 'LOOK_AT_OBJECT']);

function clearLooseObjects(s: GameSession): void {
  for (const o of s.world.objects.filter((x) => !x.fixed)) s.world.removeObject(o.id);
}

function resetNeeds(s: GameSession): void {
  for (const [k, v] of Object.entries(BASELINE) as [PetStat, number][]) s.setPetStat(k, v);
}

function engagedWith(s: GameSession, kind: ItemKind): boolean {
  const w = s.world;
  const target = w.getObject(w.pet.carrying) ?? w.getObject(w.focusObjectId);
  return target?.kind === kind && s.sim.last.active.some((a) => ENGAGE.has(a));
}

export interface TrainingReport {
  kind: ItemKind;
  episodes: number;
  ticks: number;
  playerRewards: number;
  learningEvents: number;
}

// Entrena "jugando" con un objeto: lo coloca, y si la mascota se implica con él, la recompensa.
export async function trainWithObject(s: GameSession, kind: ItemKind, episodes = 150, ticksPerEpisode = 60, yieldFn: YieldFn = noYield): Promise<TrainingReport> {
  const rng = s.config.rng;
  let rewards = 0, ticks = 0;
  const events0 = s.plasticity.experiencesApplied;
  s.setPlayerPresent(true);
  for (let ep = 0; ep < episodes; ep++) {
    clearLooseObjects(s);
    s.world.addFood(); s.world.addWater(); // un buen cuidador
    resetNeeds(s);
    const a = rng() * Math.PI * 2, d = 0.18 + rng() * 0.12, pet = s.world.pet;
    s.world.placeItem(kind, { x: Math.max(0.1, Math.min(0.9, pet.x + Math.cos(a) * d)), y: Math.max(0.2, Math.min(0.9, pet.y + Math.sin(a) * d)) });
    for (let t = 0; t < ticksPerEpisode; t++) {
      s.tick(); ticks++;
      if (s.rewardable() && engagedWith(s, kind) && s.rewardPlayer()) rewards++;
    }
    if (ep % 10 === 9) await yieldFn();
  }
  clearLooseObjects(s);
  return { kind, episodes, ticks, playerRewards: rewards, learningEvents: s.plasticity.experiencesApplied - events0 };
}

export interface ObjectEngagement {
  focus: number;
  investigate: number;
  play: number;
  picks: number;
  firstReach: number;
  score: number; // focus + 2·investigate + 2·play + 5·picks
}

export interface PreferenceReport {
  kinds: [ItemKind, ItemKind];
  trials: number;
  ticksPerTrial: number;
  engagement: Record<string, ObjectEngagement>;
  share: number; // score(a) / (score(a) + score(b))
  attention: Record<string, number>; // actividad media de la neurona de atención
}

// Coloca a y b a la misma distancia (alternando lados) y mide la implicación con cada uno.
export async function evaluatePreference(source: GameSession, kinds: [ItemKind, ItemKind], trials = 40, ticksPerTrial = 45, seed = 1, yieldFn: YieldFn = noYield): Promise<PreferenceReport> {
  const s = GameSession.clone(source, { rng: seededRng(seed), clock: evalClock(source) });
  s.setEvaluation(true); // medir no debe cambiar el cerebro
  s.setPlayerPresent(true);
  const empty = (): ObjectEngagement => ({ focus: 0, investigate: 0, play: 0, picks: 0, firstReach: 0, score: 0 });
  const eng: Record<string, ObjectEngagement> = { [kinds[0]]: empty(), [kinds[1]]: empty() };
  const attn: Record<string, number> = { [kinds[0]]: 0, [kinds[1]]: 0 };
  let samples = 0;

  for (let t = 0; t < trials; t++) {
    clearLooseObjects(s);
    resetNeeds(s);
    const pet = s.world.pet;
    pet.x = 0.5; pet.y = 0.5; pet.carrying = null;
    // v7 (hay campo de visión): la mascota empieza mirando hacia delante, con los dos objetos a la vista
    pet.orientation = Math.PI / 2;
    const [left, right] = t % 2 === 0 ? kinds : [kinds[1], kinds[0]];
    const objs = [s.world.placeItem(left, { x: 0.32, y: 0.66 }), s.world.placeItem(right, { x: 0.68, y: 0.66 })];
    objs.forEach((o) => { o.novelty = 0.5; });
    let reached: ItemKind | null = null, prevCarry: number | null = null;
    for (let k = 0; k < ticksPerTrial; k++) {
      const r = s.tick();
      const A = new Set(r.active);
      const focus = s.world.getObject(r.focusObjectId);
      const carried = s.world.getObject(pet.carrying);
      for (const kind of kinds) {
        const e = eng[kind];
        if (focus?.kind === kind) e.focus++;
        if (A.has('INVESTIGATE') && focus?.kind === kind) e.investigate++;
        const near = s.world.objects.some((o) => o.kind === kind && s.world.distance(pet, o) < 0.12);
        if (A.has('PLAY') && (carried?.kind === kind || near)) e.play++;
        if (!reached && near) { reached = kind; e.firstReach++; }
        const ch = OBJECT_CHANNELS.find((c) => c.kind === kind);
        if (ch) attn[kind] += s.sim.attention[ch.kind] ?? 0;
      }
      if (pet.carrying !== null && pet.carrying !== prevCarry && carried && kinds.includes(carried.kind)) eng[carried.kind].picks++;
      prevCarry = pet.carrying;
      samples++;
    }
    if (t % 10 === 9) await yieldFn();
  }
  for (const k of kinds) {
    const e = eng[k];
    e.score = e.focus + 2 * e.investigate + 2 * e.play + 5 * e.picks;
    attn[k] /= Math.max(1, samples);
  }
  const total = eng[kinds[0]].score + eng[kinds[1]].score;
  return { kinds, trials, ticksPerTrial, engagement: eng, share: total ? eng[kinds[0]].score / total : 0.5, attention: attn };
}

export interface CallReport {
  trials: number;
  responses: number; // APPROACH o FOLLOW_PLAYER empezó ≤ 10 ticks tras la llamada (o el mismo momento, en el control)
  meanApproach: number; // distancia media recorrida hacia el jugador en 15 ticks (unidades de mundo)
  arrivals: number; // llegó junto al jugador (< 0.2) dentro de la ventana
}

// "Ven aquí" medido: desde posiciones equivalentes. call = false → control sin llamar
// (¿aprendió la LLAMADA o solo a acercarse?)
export async function evaluateCall(source: GameSession, trials = 40, window = 40, seed = 3, yieldFn: YieldFn = noYield, call = true): Promise<CallReport> {
  const s = GameSession.clone(source, { rng: seededRng(seed), clock: evalClock(source) });
  s.setEvaluation(true);
  s.setPlayerPresent(true);
  let responses = 0, arrivals = 0, approach = 0;
  for (let t = 0; t < trials; t++) {
    clearLooseObjects(s);
    resetNeeds(s);
    const pet = s.world.pet;
    pet.x = t % 2 ? 0.25 : 0.75; pet.y = 0.5; pet.carrying = null;
    for (let k = 0; k < 8; k++) s.tick();
    const d0 = s.world.distance(pet, s.world.player);
    if (call) s.world.callPet(1);
    let responded = false, arrived = false, d15 = d0;
    for (let k = 0; k < window; k++) {
      const prev = new Set(s.sim.last.active);
      const r = s.tick();
      if (k < 10 && r.active.some((a) => (a === 'APPROACH' || a === 'FOLLOW_PLAYER') && !prev.has(a))) responded = true;
      if (k === 14) d15 = s.world.distance(pet, s.world.player);
      if (!arrived && s.world.distance(pet, s.world.player) < 0.2) arrived = true;
    }
    if (responded) responses++;
    if (arrived) arrivals++;
    approach += d0 - d15;
    if (t % 10 === 9) await yieldFn();
  }
  return { trials, responses, meanApproach: approach / trials, arrivals };
}

// Entrena la llamada: llamar y, si empieza a venir, recompensar (como haría el jugador en "Ven aquí")
export async function trainCall(s: GameSession, episodes = 80, window = 40, yieldFn: YieldFn = noYield): Promise<{ episodes: number; rewards: number }> {
  s.setPlayerPresent(true);
  let rewards = 0;
  s.startGame('come-here');
  for (let ep = 0; ep < episodes; ep++) {
    clearLooseObjects(s);
    resetNeeds(s);
    const pet = s.world.pet;
    pet.x = ep % 2 ? 0.25 : 0.75; pet.y = 0.5;
    for (let k = 0; k < 5; k++) s.tick();
    s.gameInput({ type: 'call' });
    for (let k = 0; k < window; k++) {
      s.tick();
      // El ❤️ aparece tras APPROACH/FOLLOW: el jugador recompensa que venga
      const r = s.rewardable();
      if ((r === 'APPROACH' || r === 'FOLLOW_PLAYER') && s.rewardPlayer()) { rewards++; break; }
    }
    if (ep % 10 === 9) await yieldFn();
  }
  s.endGame();
  return { episodes, rewards };
}

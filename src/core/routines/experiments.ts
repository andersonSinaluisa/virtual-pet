/*
 * EXPERIMENTOS DE RUTINAS (tests, herramientas de desarrollo y docs/routine-results.md)
 *
 * Aquí solo actúa el CUIDADOR (entra, sale, pone comida, deja un juguete,
 * apaga o enciende la lámpara, hace ruido). Nunca se le dice a la mascota
 * qué hacer ni cuándo dormir: la hora solo llega como contexto sensorial.
 *
 *   consistent  cuidador con horario estable: día con compañía, noches oscuras y tranquilas
 *   irregular   el mismo cuidado total, repartido al azar a cualquier hora (luces y ruidos de noche)
 *
 * La evaluación se hace sobre CLONES congelados, en el MISMO contexto para
 * ambas mascotas (misma hora, luz, necesidades y posición).
 */
import type { Action } from '../brain/Actions';
import { seededRng, type Rng } from '../random';
import { GameSession, GREETING } from '../session/GameSession';
import type { PetStat } from '../simulation/SimConfig';
import { SimulationClock, clockInfo } from '../time/WorldClock';
import { circularStats, mainSleeps } from './HabitDetector';
import type { ItemKind } from '../world/Items';

export type YieldFn = () => Promise<void>;
const noYield: YieldFn = async () => {};

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
export const TICKS_PER_DAY = 1440; // SimulationClock a 1 minuto de mundo por tick

// Medianoche local de un día fijo (los experimentos son reproducibles)
export function localMidnight(y = 2026, m = 0, d = 5): number {
  return new Date(y, m, d, 0, 0, 0, 0).getTime();
}

export type Regime = 'consistent' | 'irregular' | 'neutral';

export interface LivingOptions {
  regime: Regime;
  days: number;
  seed?: number;
  // drift: a partir de este día (del experimento) la cama se mueve a otra zona
  moveBedOnDay?: number;
  bedAt?: { x: number; y: number };
  bedLaterAt?: { x: number; y: number };
  toy?: ItemKind;
}

export interface LivingReport {
  days: number;
  ticks: number;
  asleepTicks: number;
  nightAsleepTicks: number; // 22:00–06:00
  sleepEpisodes: number;
}

const isNight = (minute: number) => minute >= 22 * 60 || minute < 6 * 60;

function clearLoose(s: GameSession): void {
  for (const o of s.world.objects.filter((x) => !x.fixed)) s.world.removeObject(o.id);
}

// Mantenimiento: comida y agua suficientes (ninguna mascota pasa hambre por el horario)
export function supply(s: GameSession): void {
  const w = s.world;
  if ((w.foodSources()[0]?.amount ?? 0) < 0.6) w.addFood();
  if ((w.firstOfType('water')?.amount ?? 0) < 0.6) w.addWater();
}

// Una sesión de juego del cuidador (~25 min de mundo): deja el juguete cerca, llama, acaricia
export const SESSION_MINUTES = 25;
export const SESSIONS_PER_DAY = 8;
function engage(s: GameSession, rng: Rng, toy: ItemKind, k: number): void {
  const w = s.world;
  if (k === 0) supply(s);
  if (k % 8 === 0 && !w.objects.some((o) => o.kind === toy)) {
    const a = rng() * Math.PI * 2;
    w.placeItem(toy, { x: Math.max(0.1, Math.min(0.9, w.pet.x + Math.cos(a) * 0.2)), y: Math.max(0.25, Math.min(0.9, w.pet.y + Math.sin(a) * 0.2)) });
  }
  if (k % 6 === 3) w.callPet(1);
  if (k % 10 === 5) s.petDirect();
}

// Minutos del día en que empieza cada sesión
function sessionStarts(regime: Regime, rng: Rng): number[] {
  if (regime === 'neutral') return [];
  if (regime === 'consistent') return [8, 10, 12, 13.5, 15, 17, 19, 20.5].map((h) => Math.round(h * 60));
  // irregular: la misma cantidad de sesiones, a cualquier hora (también de madrugada)
  return Array.from({ length: SESSIONS_PER_DAY }, () => Math.floor(rng() * (1440 - SESSION_MINUTES))).sort((a, b) => a - b);
}

/*
 * Vive `days` días de mundo. Ambos regímenes reciben el MISMO cuidado total
 * (8 sesiones de juego al día, comida y agua); cambia CUÁNDO.
 *   consistent  el jugador está de 07:00 a 21:30, sesiones de día, noches oscuras y en calma
 *   irregular   sesiones a horas al azar; de noche el jugador enciende la lámpara al llegar
 *               (y a veces la deja encendida); ruidos ocasionales a cualquier hora
 */
export async function liveDays(s: GameSession, clock: SimulationClock, o: LivingOptions, yieldFn: YieldFn = noYield, observe?: (minute: number, day: number) => void): Promise<LivingReport> {
  const rng = seededRng(o.seed ?? 11);
  const toy = o.toy ?? 'ball';
  const w = s.world;
  const bed = w.firstOfType('bed');
  if (bed && o.bedAt) { bed.x = o.bedAt.x; bed.y = o.bedAt.y; }
  let asleep = 0, nightAsleep = 0, ticks = 0, episodes = 0, wasAsleep = w.pet.asleep;

  for (let d = 0; d < o.days; d++) {
    if (o.moveBedOnDay !== undefined && d === o.moveBedOnDay && bed && o.bedLaterAt) { bed.x = o.bedLaterAt.x; bed.y = o.bedLaterAt.y; }
    const starts = sessionStarts(o.regime, rng);
    let lampLeftOn = false;
    for (let t = 0; t < TICKS_PER_DAY; t++) {
      const minute = clockInfo(clock.now()).minuteOfDay;
      const inSession = starts.find((m) => minute >= m && minute < m + SESSION_MINUTES);
      if (o.regime === 'neutral') {
        // Mundo neutro (evaluación): nadie, lámpara apagada, comedero automático; solo cambia la luz natural
        if (w.player.present) s.setPlayerPresent(false);
        if (w.lightOn) w.setLight(false);
        if (minute % 360 === 0) supply(s);
      } else if (o.regime === 'consistent') {
        const present = minute >= 7 * 60 && minute < 21 * 60 + 30;
        if (present !== w.player.present) s.setPlayerPresent(present);
        if (w.lightOn) w.setLight(false);
        if (minute === 7 * 60 || minute === 21 * 60 + 20) supply(s);
        if (minute === 21 * 60 + 25) clearLoose(s); // recoge los juguetes antes de irse
      } else {
        const present = inSession !== undefined;
        if (present !== w.player.present) {
          s.setPlayerPresent(present);
          if (present && isNight(minute)) w.setLight(true);
          if (!present) { lampLeftOn = rng() < 0.4; if (!lampLeftOn) w.setLight(false); clearLoose(s); }
        }
        if (lampLeftOn && minute % 60 === 0 && rng() < 0.3) { lampLeftOn = false; if (!w.player.present) w.setLight(false); }
        if (minute % 360 === 0) supply(s); // comedero automático
        if (rng() < 0.0015) w.makeNoise(); // ~2 ruidos al día, a cualquier hora
      }
      if (inSession !== undefined) engage(s, rng, toy, minute - inSession);
      s.tick();
      ticks++;
      if (w.pet.asleep) { asleep++; if (isNight(minute)) nightAsleep++; }
      if (w.pet.asleep && !wasAsleep) episodes++;
      wasAsleep = w.pet.asleep;
      observe?.(minute, d);
    }
    await yieldFn();
  }
  return { days: o.days, ticks, asleepTicks: asleep, nightAsleepTicks: nightAsleep, sleepEpisodes: episodes };
}

const PROBE_NEEDS: Record<PetStat, number> = { hunger: 0.25, thirst: 0.25, fatigue: 0.55, boredom: 0.4, affection: 0.6, energy: 0.5, fear: 0, curiosity: 0.3 };
const RESTING: ReadonlySet<Action> = new Set<Action>(['REST', 'SLEEP']);

export interface ContextProbe {
  minute: number;
  lamp: boolean;
  trials: number;
  restShare: number; // fracción de ticks con REST/SLEEP activos
  asleepShare: number; // fracción dormida de verdad (en la cama)
  sleepLatency: number; // ticks hasta el primer SLEEP/REST (media; ventana si nunca)
  fell: number; // pruebas en las que llegó a dormir en la cama
}

export interface ProbeOptions {
  minute: number;
  lamp?: boolean;
  trials?: number;
  window?: number;
  seed?: number;
  needs?: Partial<Record<PetStat, number>>;
  novelObject?: ItemKind; // prueba de interrupción: algo nuevo y emocionante
}

/*
 * Mismo contexto para cualquier mascota: hora, luz, necesidades y posición.
 * Mide si TIENDE a descansar/dormir. Aprendizaje congelado, sobre un clon.
 */
export async function probeContext(source: GameSession, p: ProbeOptions, yieldFn: YieldFn = noYield): Promise<ContextProbe & { novelEngaged: number }> {
  const trials = p.trials ?? 20, window = p.window ?? 60;
  const base = localMidnight(2026, 2, 1);
  const clock = new SimulationClock(base);
  const s = GameSession.clone(source, { rng: seededRng(p.seed ?? 5), clock, physiology: 'day' });
  s.setEvaluation(true);
  s.setPlayerPresent(false);
  let rest = 0, asleep = 0, latency = 0, fell = 0, novelEngaged = 0;
  for (let t = 0; t < trials; t++) {
    clock.set(base + t * DAY_MS + p.minute * 60_000);
    clearLoose(s);
    s.world.addFood(); s.world.addWater();
    s.world.setLight(p.lamp ?? false);
    for (const [k, v] of Object.entries({ ...PROBE_NEEDS, ...p.needs }) as [PetStat, number][]) s.setPetStat(k, v);
    const pet = s.world.pet;
    pet.x = t % 2 ? 0.4 : 0.6; pet.y = 0.6; pet.carrying = null; pet.asleep = false;
    const novel = p.novelObject ? s.world.placeItem(p.novelObject, { x: pet.x + (t % 2 ? 0.15 : -0.15), y: 0.55 }) : null;
    let first = -1, fellHere = false, engaged = false;
    for (let k = 0; k < window; k++) {
      const r = s.tick();
      const resting = r.active.some((a) => RESTING.has(a));
      if (resting) { rest++; if (first < 0) first = k; }
      if (pet.asleep) { asleep++; fellHere = true; }
      if (novel && (r.focusObjectId === novel.id || pet.carrying === novel.id) && r.active.some((a) => a === 'INVESTIGATE' || a === 'PLAY' || a === 'PICK_UP_OBJECT' || a === 'LOOK_AT_OBJECT')) engaged = true;
    }
    latency += first < 0 ? window : first;
    if (fellHere) fell++;
    if (engaged) novelEngaged++;
    if (t % 5 === 4) await yieldFn();
  }
  const n = trials * window;
  return { minute: p.minute, lamp: p.lamp ?? false, trials, restShare: rest / n, asleepShare: asleep / n, sleepLatency: latency / trials, fell, novelEngaged };
}

// Respuesta al volver el jugador, en un contexto idéntico (la mascota lleva un rato sola)
export interface ReturnProbe {
  trials: number;
  greeted: number; // empieza APPROACH/GREET/FOLLOW ≤ 20 ticks, o llega a < 0.2 (empieza lejos)
  meanLatency: number;
}

export async function probeReturn(source: GameSession, minute = 18 * 60, trials = 20, seed = 9, yieldFn: YieldFn = noYield): Promise<ReturnProbe> {
  const base = localMidnight(2026, 2, 1);
  const clock = new SimulationClock(base);
  const s = GameSession.clone(source, { rng: seededRng(seed), clock, physiology: 'day' });
  s.setEvaluation(true);
  let greeted = 0, lat = 0;
  for (let t = 0; t < trials; t++) {
    clock.set(base + t * DAY_MS + minute * 60_000);
    clearLoose(s);
    s.world.addFood(); s.world.addWater(); s.world.setLight(false);
    for (const [k, v] of Object.entries(PROBE_NEEDS) as [PetStat, number][]) s.setPetStat(k, v);
    s.setPetStat('fatigue', 0.25);
    const pet = s.world.pet;
    pet.x = t % 2 ? 0.25 : 0.6; pet.y = 0.45; pet.asleep = false;
    s.setPlayerPresent(false);
    for (let k = 0; k < 10; k++) s.tick();
    s.setPlayerPresent(true);
    let got = -1;
    for (let k = 0; k < 20 && got < 0; k++) {
      const prev = new Set(s.sim.last.active);
      const r = s.tick();
      if (r.active.some((a) => !prev.has(a) && GREETING.has(a)) || s.world.distance(pet, s.world.player) < 0.2) got = k;
    }
    if (got >= 0) { greeted++; lat += got; } else lat += 20;
    if (t % 5 === 4) await yieldFn();
  }
  return { trials, greeted, meanLatency: lat / trials };
}

// Crea una mascota lista para vivir con un reloj de simulación que empieza a las 07:00
export function createLivingPet(name: string, seed: number, start = localMidnight() + 7 * HOUR_MS): { session: GameSession; clock: SimulationClock } {
  const clock = new SimulationClock(start);
  // Etapa YOUNG = el comportamiento de referencia medido antes del crecimiento (multiplicadores 1, sin límites)
  const session = GameSession.create({ name, species: 'dog' }, { rng: seededRng(seed), clock, physiology: 'day', lifeStage: 'YOUNG' });
  return { session, clock };
}

export interface FreeRunReport {
  days: number;
  nightShare: number; // fracción del sueño que cae entre 22:00 y 06:00
  asleepShare: number; // fracción del tiempo dormido
  onsetR: number; // consistencia (0..1) de la hora de inicio del sueño principal
  onsetMeanMinute: number;
  selectivity: number; // (noche − día) / (noche + día) de descanso en sondas idénticas
}

/*
 * PRUEBA DE MISMO CONTEXTO: un clon congelado vive `days` días en un mundo
 * neutro idéntico para todas las mascotas. Cualquier diferencia de horario
 * viene de lo que su cerebro aprendió, no de su entorno ni del detector.
 */
export async function freeRun(source: GameSession, days = 4, seed = 21, yieldFn: YieldFn = noYield): Promise<FreeRunReport> {
  const clock = new SimulationClock(localMidnight(2026, 3, 1) + 12 * HOUR_MS);
  const s = GameSession.clone(source, { rng: seededRng(seed), clock, physiology: 'day' });
  s.setEvaluation(true);
  s.clearRoutineEvidence();
  for (const [k, v] of Object.entries(PROBE_NEEDS) as [PetStat, number][]) s.setPetStat(k, v);
  s.setPetStat('fatigue', 0.3);
  let night = 0, total = 0;
  const rep = await liveDays(s, clock, { regime: 'neutral', days, seed }, yieldFn, (minute) => {
    if (!s.world.pet.asleep) return;
    total++;
    if (isNight(minute)) night++;
  });
  const mains = mainSleeps(s.memory.episodes);
  const st = circularStats(mains.map((e) => ({ item: e, w: 1 })));
  const n = await probeContext(source, { minute: 23 * 60, needs: { fatigue: 0.4 }, seed }, yieldFn);
  const d = await probeContext(source, { minute: 14 * 60, needs: { fatigue: 0.4 }, seed }, yieldFn);
  return {
    days, nightShare: total ? night / total : 0, asleepShare: rep.asleepTicks / rep.ticks, onsetR: st.r, onsetMeanMinute: st.mean,
    selectivity: n.restShare + d.restShare > 0 ? (n.restShare - d.restShare) / (n.restShare + d.restShare) : 0,
  };
}

/*
 * REGRESOS DEL JUGADOR
 *   consistent  se va a las 09:00 y vuelve hacia las 18:00; si la mascota sale a recibirlo, la
 *               saluda (❤️ Recompensar: la consecuencia de acercarse)
 *   irregular   la misma cantidad de tiempo fuera, repartida en 3 salidas a horas al azar; al volver
 *               no le hace caso
 */
export async function liveReturns(s: GameSession, clock: SimulationClock, regime: 'consistent' | 'irregular', days: number, seed = 13, yieldFn: YieldFn = noYield): Promise<{ returns: number; rewarded: number }> {
  const rng = seededRng(seed);
  const w = s.world;
  let returns = 0, rewarded = 0;
  for (let d = 0; d < days; d++) {
    let away: [number, number][];
    if (regime === 'consistent') {
      const back = 18 * 60 + Math.floor(rng() * 20) - 10;
      away = [[9 * 60, back]];
    } else {
      away = [];
      const total = 9 * 60, parts = 3;
      for (let i = 0; i < parts; i++) {
        const start = Math.floor(rng() * (1440 - total / parts));
        away.push([start, start + total / parts]);
      }
    }
    let greetWindow = 0;
    for (let t = 0; t < TICKS_PER_DAY; t++) {
      const minute = clockInfo(clock.now()).minuteOfDay;
      const present = !away.some(([a, b]) => minute >= a && minute < b);
      if (present !== w.player.present) {
        s.setPlayerPresent(present);
        if (present) { returns++; greetWindow = regime === 'consistent' ? 20 : 0; }
      }
      if (w.lightOn) w.setLight(false);
      if (minute % 360 === 0) supply(s);
      s.tick();
      if (greetWindow > 0) {
        greetWindow--;
        const r = s.rewardable();
        if ((r === 'APPROACH' || r === 'GREET' || r === 'FOLLOW_PLAYER') && s.rewardPlayer()) { rewarded++; greetWindow = 0; }
      }
    }
    await yieldFn();
  }
  return { returns, rewarded };
}

export const ROOM_SPOTS = {
  rincon: { x: 0.12, y: 0.82 },
  ventana: { x: 0.5, y: 0.12 },
  puerta: { x: 0.15, y: 0.18 },
} as const;

/*
 * EXPERIENCE RECORDER
 * -------------------
 * Observa cada tick (lo que la red YA decidió y lo que pasó en el mundo) y
 * convierte los INICIOS de conducta en experiencias con valencia.
 * Mantiene el estado de corto plazo (ShortTermState): acciones activas del
 * tick anterior, qué llevaba, si estaba dormida, eventos recientes.
 *
 * No registra cada tick (sería ruido): solo transiciones.
 *
 * v2: EPISODIOS CON RESULTADO. Comer, beber, descansar y jugar se registran
 * al TERMINAR el episodio que la red eligió, con una recompensa natural que
 * sale del resultado (cuánto bajó la necesidad), no de una regla de decisión.
 */
import type { Action } from '../brain/Actions';
import { needOutcome, rewardFor } from '../learning/RewardModel';
import type { PetStat } from '../simulation/SimConfig';
import type { StepResult } from '../simulation/Simulation';
import type { World, WorldEventType } from '../simulation/World';
import { roomArea } from '../routines/areas';
import { clockInfo } from '../time/WorldClock';
import type { EpisodeKind, EpisodeRecord, Experience, ExperienceContext, ExperienceKind, SubjectKey } from './types';

export interface ShortTermState {
  active: ReadonlySet<Action>;
  carrying: number | null;
  asleep: boolean;
  touching: boolean;
  recentEvents: { tick: number; type: WorldEventType; detail: string }[];
}

export interface RecordContext {
  now: number; // ms del reloj del mundo
  day: number; // día de vida de la mascota
}

// Contexto compacto de una experiencia (v3): sin snapshots del mundo
export function buildContext(world: World, now: number): ExperienceContext {
  const pet = world.pet, info = clockInfo(now);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const objects = world.objects
    .filter((o) => !o.fixed && world.distance(pet, o) < 0.3)
    .sort((a, b) => world.distance(pet, a) - world.distance(pet, b))
    .slice(0, 3).map((o) => o.kind);
  return {
    minuteOfDay: Math.round(info.minuteOfDay), day: info.day, light: r2(world.lightLevel),
    area: roomArea(pet), zone: world.currentZone(), objects, playerPresent: world.player.present,
    fatigue: r2(pet.fatigue), hunger: r2(pet.hunger), energy: r2(pet.energy), boredom: r2(pet.boredom),
  };
}

interface OpenEpisode {
  kind: EpisodeKind;
  start: number;
  minuteOfDay: number;
  day: number;
  area: string;
  light: number;
  activityBefore: number;
  subjects: Map<string, number>;
}

const RESTFUL: ReadonlySet<Action> = new Set<Action>(['SLEEP', 'REST']);

type EpisodeName = 'eat' | 'drink' | 'rest' | 'play';
const EPISODES: { name: EpisodeName; actions: Action[]; need: PetStat; kind: ExperienceKind; failPenalty: boolean }[] = [
  { name: 'eat', actions: ['EAT'], need: 'hunger', kind: 'ate', failPenalty: true },
  { name: 'drink', actions: ['DRINK'], need: 'thirst', kind: 'drank', failPenalty: true },
  { name: 'rest', actions: ['REST', 'SLEEP'], need: 'fatigue', kind: 'rested', failPenalty: false },
  { name: 'play', actions: ['PLAY'], need: 'boredom', kind: 'played', failPenalty: false },
];

interface Episode {
  start: number; // valor de la necesidad al empezar
  subjects: Map<SubjectKey, number>;
  failed: boolean; // se observó "plato vacío" / "no hay agua"
  actions: Set<Action>;
  record: OpenEpisode;
  ticks: number;
}

// v5: un descanso largo (una noche) se valora por tramos de una hora: así la consecuencia
// (recuperarse) se asocia al contexto en el que ocurre, no solo al momento de despertar
const REST_CHUNK = 60;
// Descansar sin estar cansado no resuelve nada: el alivio solo cuenta por encima de este cansancio
const SLEEP_GAP = 45; // minutos despierto que aún cuentan como la misma noche
const TIRED_FROM = 0.25, TIRED_SPAN = 0.35;
const tiredness = (fatigue: number) => Math.max(0, Math.min(1, (fatigue - TIRED_FROM) / TIRED_SPAN));

let counter = 0;
function expId(now: number): string {
  counter = (counter + 1) % 1e6;
  return `exp_${now.toString(36)}_${counter.toString(36)}`;
}

export class ExperienceRecorder {
  private prevActive = new Set<Action>();
  private prevCarrying: number | null = null;
  private prevAsleep = false;
  private prevTouching = false;
  private recent: ShortTermState['recentEvents'] = [];
  private episodes = new Map<EpisodeName, Episode>();
  private sleeping: OpenEpisode | null = null;
  private awakeTicks = 0;
  private lastAsleepAt = 0;
  private exploring: OpenEpisode | null = null;

  shortTerm(): ShortTermState {
    return { active: this.prevActive, carrying: this.prevCarrying, asleep: this.prevAsleep, touching: this.prevTouching, recentEvents: this.recent };
  }

  reset(): void {
    this.prevActive = new Set();
    this.prevCarrying = null;
    this.prevAsleep = false;
    this.prevTouching = false;
    this.recent = [];
    this.episodes.clear();
    this.sleeping = null;
    this.exploring = null;
  }

  private open(kind: EpisodeKind, world: World, now: number): OpenEpisode {
    const info = clockInfo(now);
    return {
      kind, start: now, minuteOfDay: Math.round(info.minuteOfDay), day: info.day, area: roomArea(world.pet),
      light: Math.round(world.lightLevel * 100) / 100, activityBefore: Math.round(world.recentActivity * 100) / 100, subjects: new Map(),
    };
  }

  private close(o: OpenEpisode, now: number, offline: boolean, subject: string | null = null): EpisodeRecord {
    const top = subject ?? [...o.subjects.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { kind: o.kind, start: o.start, end: now, minuteOfDay: o.minuteOfDay, day: o.day, area: o.area, light: o.light, activityBefore: o.activityBefore, subject: top, offline };
  }

  // Devuelve las acciones que acaban de empezar y las experiencias nuevas
  observe(result: StepResult, world: World, ctx: RecordContext): { onsets: Action[]; experiences: Experience[]; episodes: EpisodeRecord[] } {
    const pet = world.pet;
    for (const e of result.events) this.recent.push({ tick: result.tick, type: e.type, detail: e.detail });
    this.recent = this.recent.filter((e) => result.tick - e.tick <= 12);

    const onsets = result.active.filter((a) => !this.prevActive.has(a));
    const out: Experience[] = [];
    const episodes: EpisodeRecord[] = [];
    const context = buildContext(world, ctx.now);
    const add = (kind: ExperienceKind, subject: SubjectKey | null, valence: number, intensity: number, outcome?: number, actions: readonly Action[] = result.active) => {
      out.push({
        id: expId(ctx.now), at: ctx.now, day: ctx.day, tick: result.tick, kind, subject,
        valence: Math.max(-1, Math.min(1, valence)), intensity: Math.max(0, Math.min(1, intensity)),
        gameId: null, offline: result.offline, reward: rewardFor(kind, outcome), actions: [...actions], context,
      });
    };
    const focus = world.getObject(result.focusObjectId);
    const playerHere = world.player.present;
    const fear = pet.fear;

    for (const a of onsets) {
      switch (a) {
        case 'INVESTIGATE':
          if (focus) add('investigated', focus.kind, 0.4 - fear * 0.8, 0.5);
          break;
        case 'GET_SCARED':
          add('scared', this.fearCause(focus?.kind ?? null), -0.7, 0.8);
          break;
        case 'HIDE':
          add('hid', this.fearCause(focus?.kind ?? null), -0.4, 0.6);
          break;
        case 'CRY': add('cried', null, -0.6, 0.6); break;
        case 'DANCE': add('danced', null, 0.7, 0.6); break;
        case 'GREET': if (playerHere) add('greeted', 'player', 0.6, 0.5); break;
        case 'APPROACH': if (playerHere) add('approached', 'player', 0.4, 0.4); break;
        case 'FOLLOW_PLAYER': if (playerHere) add('followed', 'player', 0.4, 0.4); break;
        case 'ASK_ATTENTION': add('asked_attention', playerHere ? 'player' : null, -0.1, 0.4); break;
        default: break;
      }
    }

    // Episodios con resultado (comer, beber, descansar, jugar)
    const A = new Set(result.active);
    for (const ep of EPISODES) {
      const on = ep.actions.some((a) => A.has(a));
      let cur = this.episodes.get(ep.name);
      if (on && !cur) {
        cur = { start: pet[ep.need], subjects: new Map(), failed: false, actions: new Set(), ticks: 0, record: this.open(ep.name === 'rest' ? 'rest' : ep.name === 'play' ? 'play' : 'eat', world, ctx.now) };
        this.episodes.set(ep.name, cur);
      }
      if (on && cur) {
        ep.actions.forEach((a) => { if (A.has(a)) cur?.actions.add(a); });
        const status = ep.actions.map((a) => result.status[a] ?? '').join(' ');
        if (/vacío|no hay/.test(status)) cur.failed = true;
        const subject = this.episodeSubject(ep.name, world);
        if (subject) cur.subjects.set(subject, (cur.subjects.get(subject) ?? 0) + 1);
        if (++cur.ticks >= REST_CHUNK && ep.name === 'rest') {
          const outcome = Math.max(0, needOutcome(cur.start, pet.fatigue)) * tiredness(cur.start);
          add(ep.kind, null, outcome, Math.min(1, outcome + 0.3), outcome, [...cur.actions]);
          cur.start = pet.fatigue; cur.ticks = 0; cur.actions.clear();
        }
      }
      if (!on && cur) {
        this.episodes.delete(ep.name);
        let outcome = needOutcome(cur.start, pet[ep.need]);
        if (outcome < 0 && !(ep.failPenalty && cur.failed)) outcome = 0; // sin evidencia de fracaso: neutro
        if (ep.name === 'rest') outcome = Math.max(0, outcome) * tiredness(cur.start);
        const subject = [...cur.subjects.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        // v5: el episodio se registra SIEMPRE (también si no resolvió nada): el resultado
        // neutro, comparado con lo habitual, es lo que evita reforzar dormir descansado
        add(ep.kind, subject, outcome, Math.min(1, Math.abs(outcome) + 0.3), outcome, [...cur.actions]);
        if (ep.name !== 'drink') episodes.push(this.close(cur.record, ctx.now, result.offline, subject));
      }
    }

    // Sueño real (dormido en la cama) y exploración: episodios para los hábitos
    // Despertares de unos minutos no parten el sueño en varios episodios
    if (pet.asleep) {
      if (!this.sleeping) this.sleeping = this.open('sleep', world, ctx.now);
      this.awakeTicks = 0;
      this.lastAsleepAt = ctx.now;
    } else if (this.sleeping && ++this.awakeTicks >= SLEEP_GAP) {
      episodes.push(this.close(this.sleeping, this.lastAsleepAt, result.offline, 'bed'));
      this.sleeping = null;
    }
    const exploring = A.has('EXPLORE');
    if (exploring && !this.exploring) this.exploring = this.open('explore', world, ctx.now);
    if (!exploring && this.exploring) { episodes.push(this.close(this.exploring, ctx.now, result.offline)); this.exploring = null; }

    // Transiciones físicas
    if (pet.carrying !== null && pet.carrying !== this.prevCarrying) {
      const obj = world.getObject(pet.carrying);
      if (obj) add('picked_up', obj.kind, 0.5 - fear * 0.4, 0.6);
    }
    if (pet.asleep && !this.prevAsleep) add('slept', 'bed', 0.3, 0.3);
    const touching = world.player.touchTicks > 0;
    if (touching && !this.prevTouching) add('petted', 'player', 0.8 - fear, 0.7);

    this.prevActive = new Set(result.active);
    this.prevCarrying = pet.carrying;
    this.prevAsleep = pet.asleep;
    this.prevTouching = touching;
    return { onsets, experiences: out, episodes };
  }

  // Con qué objeto concreto se está satisfaciendo la necesidad
  private episodeSubject(name: EpisodeName, world: World): SubjectKey | null {
    const pet = world.pet;
    if (name === 'drink') return 'water';
    if (name === 'rest') return pet.asleep ? 'bed' : null;
    if (name === 'eat') {
      const f = world.nearest(world.foodSources());
      return f && world.distance(pet, f) < 0.12 ? f.kind : null;
    }
    const carried = world.getObject(pet.carrying);
    if (carried) return carried.kind;
    const near = world.nearest(world.objects.filter((o) => o.pickable));
    return near && world.distance(pet, near) < 0.12 ? near.kind : null;
  }

  // ¿Qué lo asustó? El evento reciente más probable (física, no interpretación del cerebro)
  private fearCause(focusKind: SubjectKey | null): SubjectKey | null {
    for (let i = this.recent.length - 1; i >= 0; i--) {
      const e = this.recent[i];
      if (e.type === 'LOUD_SOUND') return 'loudSound';
      if (e.type === 'LIGHT_OFF') return 'darkness';
      if (e.type === 'NEW_OBJECT') return focusKind;
    }
    return null;
  }

  static isActiveInDark(active: readonly Action[]): boolean {
    return active.some((a) => !RESTFUL.has(a));
  }
}

/*
 * EXPERIENCE RECORDER
 * -------------------
 * Observa cada tick (lo que la red YA decidió y lo que pasó en el mundo) y
 * convierte los INICIOS de conducta en experiencias con valencia.
 * Mantiene el estado de corto plazo (ShortTermState): acciones activas del
 * tick anterior, qué llevaba, si estaba dormida, eventos recientes.
 *
 * No registra cada tick (sería ruido): solo transiciones.
 */
import type { Action } from '../brain/Actions';
import type { StepResult } from '../simulation/Simulation';
import type { World, WorldEventType } from '../simulation/World';
import type { Experience, ExperienceKind, SubjectKey } from './types';

export interface ShortTermState {
  active: ReadonlySet<Action>;
  carrying: number | null;
  asleep: boolean;
  touching: boolean;
  recentEvents: { tick: number; type: WorldEventType; detail: string }[];
}

export interface RecordContext {
  now: number;
  day: number;
}

const RESTFUL: ReadonlySet<Action> = new Set<Action>(['SLEEP', 'REST']);

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

  shortTerm(): ShortTermState {
    return { active: this.prevActive, carrying: this.prevCarrying, asleep: this.prevAsleep, touching: this.prevTouching, recentEvents: this.recent };
  }

  reset(): void {
    this.prevActive = new Set();
    this.prevCarrying = null;
    this.prevAsleep = false;
    this.prevTouching = false;
    this.recent = [];
  }

  // Devuelve las acciones que acaban de empezar y las experiencias nuevas
  observe(result: StepResult, world: World, ctx: RecordContext): { onsets: Action[]; experiences: Experience[] } {
    const pet = world.pet;
    for (const e of result.events) this.recent.push({ tick: result.tick, type: e.type, detail: e.detail });
    this.recent = this.recent.filter((e) => result.tick - e.tick <= 12);

    const onsets = result.active.filter((a) => !this.prevActive.has(a));
    const out: Experience[] = [];
    const add = (kind: ExperienceKind, subject: SubjectKey | null, valence: number, intensity: number) => {
      out.push({
        id: expId(ctx.now), at: ctx.now, day: ctx.day, tick: result.tick, kind, subject,
        valence: Math.max(-1, Math.min(1, valence)), intensity: Math.max(0, Math.min(1, intensity)),
        gameId: null, offline: result.offline,
      });
    };
    const focus = world.getObject(result.focusObjectId);
    const playerHere = world.player.present;
    const fear = pet.fear;

    for (const a of onsets) {
      switch (a) {
        case 'PLAY': {
          const toy = world.getObject(pet.carrying) ?? world.nearest(world.toys());
          add('played', toy ? toy.kind : null, 0.6 - fear * 0.5, 0.6);
          break;
        }
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
        case 'EAT': {
          const food = world.nearest(world.foodSources());
          add('ate', food ? food.kind : 'bowl', 0.4, 0.4);
          break;
        }
        case 'DRINK': add('drank', 'water', 0.3, 0.3); break;
        default: break;
      }
    }

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
    return { onsets, experiences: out };
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

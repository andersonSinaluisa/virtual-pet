/*
 * ACTION SYSTEM: ejecuta acciones YA decididas por la red
 * -------------------------------------------------------
 * Cada spike de salida activa (o renueva) su acción durante `hold` ticks.
 * Mientras está activa, su "handler" hace lo que la acción significa
 * físicamente: pedir movimiento al MovementSystem, cambiar la expresión
 * o modificar el mundo (comer reduce la comida del plato, etc.).
 *
 * Los `if` de aquí comprueban POSIBILIDAD física (¿hay comida? ¿estoy
 * al lado?), nunca DESEO (¿tengo hambre?). El deseo lo expresó la red.
 */
import { ACTION_INFO, ACTION_LIST, type Action } from '../brain/Actions';
import type { FiredAction } from './ActionTranslator';
import type { MoveIntent, MovementSystem } from './MovementSystem';
import type { Pet, Point } from './Pet';
import type { SimConfig } from './SimConfig';
import type { Player, World, WorldObject } from './World';

interface ActionContext {
  world: World;
  pet: Pet;
  player: Player;
  intents: MoveIntent[];
  focus: WorldObject | null;
}

type Handler = (ctx: ActionContext) => string;

// Lugar al que mira/va cuando no estás (la puerta, al fondo a la izquierda)
const DOOR: Point = { x: 0.08, y: 0.06 };

export class ActionSystem {
  hold: Partial<Record<Action, number>> = {}; // acción → ticks restantes
  status: Partial<Record<Action, string>> = {}; // acción → lo que está pasando físicamente
  carryTimer = 0;
  private readonly handlers: Record<Action, Handler>;

  constructor(private readonly config: SimConfig) {
    this.handlers = this.createHandlers();
  }

  reset(): void {
    this.hold = {};
    this.status = {};
    this.carryTimer = 0;
  }

  trigger(actions: readonly FiredAction[]): void {
    for (const { action } of actions) this.hold[action] = ACTION_INFO[action].hold;
  }

  get active(): Action[] {
    return ACTION_LIST.filter((a) => (this.hold[a] ?? 0) > 0);
  }

  execute(world: World, movement: MovementSystem): Action[] {
    const pet = world.pet;
    const ctx: ActionContext = { world, pet, player: world.player, intents: [], focus: world.getObject(world.focusObjectId) };
    this.status = {};
    pet.lookTarget = null;
    pet.hidden = false;
    pet.asleep = false;

    const active = this.active;
    for (const action of active) this.status[action] = this.handlers[action](ctx);
    for (const action of active) this.hold[action] = (this.hold[action] ?? 0) - 1;

    // Soltar lo que lleva un rato después de dejar de "querer" recogerlo.
    if (pet.carrying !== null) {
      if ((this.hold.PICK_UP_OBJECT ?? 0) > 0) this.carryTimer = 20;
      else if (--this.carryTimer <= 0) pet.carrying = null;
    }

    movement.apply(world, ctx.intents);
    return active;
  }

  exportState(): { hold: Partial<Record<Action, number>>; carryTimer: number } {
    return { hold: { ...this.hold }, carryTimer: this.carryTimer };
  }

  importState(s: { hold?: Partial<Record<Action, number>>; carryTimer?: number }): void {
    this.hold = {};
    for (const a of ACTION_LIST) {
      const v = s.hold?.[a];
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) this.hold[a] = Math.min(v, ACTION_INFO[a].hold);
    }
    this.carryTimer = typeof s.carryTimer === 'number' && Number.isFinite(s.carryTimer) ? s.carryTimer : 0;
  }

  // ---- Utilidades ----
  private near(world: World, a: Point, b: Point | null, d: number): boolean {
    return !!b && world.distance(a, b) < d;
  }

  private playerNear(ctx: ActionContext, d = 0.3): boolean {
    return ctx.player.present && ctx.world.distance(ctx.pet, ctx.player) < d;
  }

  private createHandlers(): Record<Action, Handler> {
    const cfg = this.config;
    const rng = cfg.rng;
    return {
      EAT: (ctx) => {
        // La fuente de comida más cercana (plato o galletita); si no hay, el plato vacío
        const food = ctx.world.nearest(ctx.world.foodSources()) ?? ctx.world.firstOfType('food');
        if (!food) return 'no hay comida';
        ctx.intents.push({ kind: 'seek', target: food, speed: 0.8, stop: 0.07 });
        if (!this.near(ctx.world, ctx.pet, food, 0.1)) return food.type === 'treat' ? 'va por la galletita' : 'va al plato';
        if (food.amount <= 0) return 'plato vacío';
        food.amount = Math.max(0, food.amount - 0.04);
        ctx.pet.change('hunger', -0.05);
        ctx.pet.change('energy', 0.005);
        return food.type === 'treat' ? 'come la galletita' : 'come';
      },
      DRINK: (ctx) => {
        const water = ctx.world.firstOfType('water');
        if (!water) return 'no hay agua';
        ctx.intents.push({ kind: 'seek', target: water, speed: 0.8, stop: 0.07 });
        if (!this.near(ctx.world, ctx.pet, water, 0.1)) return 'va al agua';
        if (water.amount <= 0) return 'no hay agua';
        water.amount = Math.max(0, water.amount - 0.05);
        ctx.pet.change('thirst', -0.06);
        return 'bebe';
      },
      SLEEP: (ctx) => {
        const bed = ctx.world.firstOfType('bed');
        const inBed = this.near(ctx.world, ctx.pet, bed, 0.08);
        if (bed) ctx.intents.push(inBed ? { kind: 'brake', factor: 0 } : { kind: 'seek', target: bed, speed: 0.6, stop: 0.05 });
        ctx.pet.asleep = inBed;
        ctx.pet.change('fatigue', inBed ? -0.02 : -0.006);
        ctx.pet.change('energy', inBed ? 0.02 : 0.008);
        return inBed ? 'duerme en la cama' : 'va a la cama';
      },
      REST: (ctx) => {
        ctx.intents.push({ kind: 'brake', factor: cfg.movement.restMultiplier });
        ctx.pet.change('fatigue', -0.003);
        ctx.pet.change('energy', 0.012);
        return 'descansa';
      },
      PLAY: (ctx) => {
        const toy = ctx.world.getObject(ctx.pet.carrying) ?? ctx.world.nearest(ctx.world.toys());
        if (!toy) { ctx.pet.change('boredom', -0.01); return 'juega sola'; }
        if (toy.id !== ctx.pet.carrying) ctx.intents.push({ kind: 'seek', target: toy, speed: 0.9, stop: 0.07 });
        if (!this.near(ctx.world, ctx.pet, toy, 0.1)) return 'va al juguete';
        if (toy.id !== ctx.pet.carrying) {
          // empujar la pelota
          toy.x = Math.max(0.05, Math.min(0.95, toy.x + (rng() - 0.5) * 0.12));
          toy.y = Math.max(0.2, Math.min(0.98, toy.y + (rng() - 0.5) * 0.12));
        }
        ctx.pet.change('boredom', -0.04);
        ctx.pet.change('energy', -0.008);
        ctx.pet.change('fatigue', 0.003);
        if (this.playerNear(ctx)) ctx.pet.change('affection', 0.008);
        return `juega con ${toy.label}`;
      },
      EXPLORE: (ctx) => {
        const w = ctx.world;
        if (!w.exploreTarget || w.distance(ctx.pet, w.exploreTarget) < 0.05) {
          w.exploreTarget = { x: 0.1 + rng() * 0.8, y: 0.1 + rng() * 0.85 };
        }
        ctx.intents.push({ kind: 'seek', target: w.exploreTarget, speed: 0.7, stop: 0.02 });
        ctx.pet.change('boredom', -0.012);
        ctx.pet.change('curiosity', -0.004);
        return 'explora';
      },
      WALK: (ctx) => {
        ctx.intents.push({ kind: 'wander', speed: 0.5 });
        ctx.pet.change('boredom', -0.004);
        return 'camina';
      },
      RUN: (ctx) => {
        ctx.intents.push({ kind: 'boost', factor: cfg.movement.runMultiplier });
        ctx.intents.push({ kind: 'wander', speed: 0.35 });
        ctx.pet.change('energy', -0.01);
        ctx.pet.change('boredom', -0.006);
        return 'corre';
      },
      ASK_ATTENTION: (ctx) => {
        ctx.pet.lookTarget = ctx.player.present ? ctx.player : DOOR;
        return ctx.player.present ? 'te mira y te llama' : 'mira hacia la puerta';
      },
      APPROACH: (ctx) => {
        const target = ctx.player.present ? ctx.player : DOOR;
        ctx.intents.push({ kind: 'seek', target, speed: 0.9, stop: 0.12 });
        ctx.pet.lookTarget = target;
        return ctx.player.present ? 'se acerca a ti' : 'va hacia la puerta';
      },
      MOVE_AWAY: (ctx) => {
        const threat: Point | null = ctx.world.sound.level > 0.05 ? ctx.world.sound : ctx.player.present ? ctx.player : null;
        if (!threat) { ctx.intents.push({ kind: 'wander', speed: 0.6 }); return 'se aparta'; }
        ctx.intents.push({ kind: 'flee', from: threat, speed: 1 });
        return threat === ctx.world.sound ? 'se aleja del ruido' : 'se aleja de ti';
      },
      GREET: (ctx) => {
        if (ctx.player.present) ctx.pet.lookTarget = ctx.player;
        if (this.playerNear(ctx)) ctx.pet.change('affection', 0.006);
        return ctx.player.present ? 'te saluda' : 'saluda al aire';
      },
      FOLLOW_PLAYER: (ctx) => {
        if (!ctx.player.present) return 'te busca';
        ctx.intents.push({ kind: 'seek', target: ctx.player, speed: 1, stop: 0.16 });
        return 'te sigue';
      },
      SMILE: (ctx) => {
        if (this.playerNear(ctx)) ctx.pet.change('affection', 0.003);
        return 'sonríe';
      },
      CRY: (ctx) => {
        ctx.pet.change('fear', -0.004);
        return 'llora';
      },
      MAKE_SOUND: () => 'hace ruiditos',
      DANCE: (ctx) => {
        ctx.intents.push({ kind: 'brake', factor: 0.3 });
        ctx.pet.change('boredom', -0.02);
        ctx.pet.change('energy', -0.006);
        if (this.playerNear(ctx)) ctx.pet.change('affection', 0.004);
        return 'baila';
      },
      LOOK_AT_OBJECT: (ctx) => {
        if (!ctx.focus) return 'mira alrededor';
        ctx.pet.lookTarget = ctx.focus;
        ctx.focus.novelty = Math.max(0, ctx.focus.novelty - 0.02);
        ctx.pet.change('curiosity', -0.003);
        return `mira ${ctx.focus.label}`;
      },
      INVESTIGATE: (ctx) => {
        const obj = ctx.focus;
        if (!obj) return 'busca algo que investigar';
        ctx.pet.lookTarget = obj;
        ctx.intents.push({ kind: 'seek', target: obj, speed: 0.35, stop: 0.08 });
        if (!this.near(ctx.world, ctx.pet, obj, 0.11)) return `se acerca a ${obj.label}`;
        obj.novelty = Math.max(0, obj.novelty - 0.08);
        obj.interest = Math.max(0.05, obj.interest - 0.02); // habituación
        obj.investigation += 1;
        ctx.pet.change('curiosity', -0.02);
        ctx.pet.change('boredom', -0.01);
        return `investiga ${obj.label}`;
      },
      PICK_UP_OBJECT: (ctx) => {
        if (ctx.pet.carrying !== null) return 'lleva ' + (ctx.world.getObject(ctx.pet.carrying)?.label ?? 'algo');
        const obj = ctx.focus && ctx.focus.pickable ? ctx.focus : ctx.world.nearest(ctx.world.objects.filter((o) => o.pickable));
        if (!obj) return 'no hay nada que recoger';
        ctx.intents.push({ kind: 'seek', target: obj, speed: 0.6, stop: 0.06 });
        if (!this.near(ctx.world, ctx.pet, obj, 0.09)) return `va por ${obj.label}`;
        ctx.pet.carrying = obj.id;
        obj.vx = obj.vy = 0;
        this.carryTimer = 20;
        ctx.pet.change('boredom', -0.01);
        return `recoge ${obj.label}`;
      },
      GET_SCARED: (ctx) => {
        ctx.pet.change('energy', -0.003);
        return 'se asusta';
      },
      HIDE: (ctx) => {
        const spot = ctx.world.firstOfType('hideout');
        if (!spot) return 'busca dónde esconderse';
        ctx.intents.push({ kind: 'seek', target: spot, speed: 1.1, stop: 0.03 });
        if (!this.near(ctx.world, ctx.pet, spot, 0.06)) return 'corre a esconderse';
        ctx.pet.hidden = true;
        ctx.pet.change('fear', -0.03);
        return 'escondida en la tienda';
      },
    };
  }
}

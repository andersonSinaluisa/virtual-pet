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
 *
 * v7 (mundo vivo): los objetivos los elige TargetResolver (affordances +
 * percepción + atención + memoria, nunca `objects[0]`) y el camino
 * PetNavigationSystem (rodeos, salidas a otra ubicación).
 */
import { ACTION_INFO, ACTION_LIST, type Action } from '../brain/Actions';
import type { FiredAction } from './ActionTranslator';
import type { MoveIntent, MovementSystem } from './MovementSystem';
import type { Pet, Point } from './Pet';
import type { SimConfig } from './SimConfig';
import type { Player, World, WorldObject } from './World';
import type { ResolvedTarget } from '../world/Attention';
import { affords } from '../world/Items';
import { LOCATIONS, type LocationId } from '../world/Locations';
import type { NavGoal, NavStep } from '../world/Navigation';

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

const SLEEP_RECOVERY = 0.0045;
// Ticks de investigación de cerca con los que la caja cede y se abre (igual que el minijuego)
export const BOX_OPENS_AT = 8; // fracción de la presión de sueño que se recupera por minuto dormido en la cama

// Tasa de disparo con ventana de ~20 ticks (las salidas de necesidad disparan cada 12–28 ticks)
const DRIVE_DECAY = 0.95;
// v8: conductas de necesidad con histéresis sobre la tasa (medido: docs/network-tuning.md)
const NEED_DRIVE: Partial<Record<Action, { start: number; keep: number }>> = {
  EAT: { start: 1.6, keep: 0.6 },
  DRINK: { start: 1.6, keep: 0.6 },
};

export class ActionSystem {
  hold: Partial<Record<Action, number>> = {}; // acción → ticks restantes
  status: Partial<Record<Action, string>> = {}; // acción → lo que está pasando físicamente
  carryTimer = 0;
  private playingWith: number | null = null;
  private readonly handlers: Record<Action, Handler>;

  constructor(private readonly config: SimConfig) {
    this.handlers = this.createHandlers();
  }

  reset(): void {
    for (const a of Object.keys(this.drive) as Action[]) delete this.drive[a];
    this.hold = {};
    this.status = {};
    this.carryTimer = 0;
  }

  // v6 (crecimiento): ¿puede FÍSICAMENTE? La SNN ya decidió; si el cuerpo aún no puede,
  // se ejecuta su forma posible (RUN → WALK) o nada. No hay consecuencia de lo que no ocurrió.
  gate: ((action: Action) => Action | null) | null = null;

  // v8: MOTIVACIÓN por tasa de disparo (código de tasa): cuánto insiste la SNN en cada acción
  // en los últimos ticks. El cuerpo va hacia el destino de la acción que más insiste, no hacia
  // el de la última que disparó (con "la más reciente", la pelota secuestraba el camino al agua).
  readonly drive: Partial<Record<Action, number>> = {};

  trigger(actions: readonly FiredAction[]): void {
    for (const a of Object.keys(this.drive) as Action[]) {
      const v = (this.drive[a] ?? 0) * DRIVE_DECAY;
      if (v < 0.01) delete this.drive[a]; else this.drive[a] = v;
    }
    for (const { action } of actions) {
      const doable = this.gate ? this.gate(action) : action;
      if (!doable) continue;
      this.drive[doable] = (this.drive[doable] ?? 0) + 1;
      if (NEED_DRIVE[doable]) continue; // las conductas de necesidad se gobiernan por su tasa (abajo)
      this.hold[doable] = Math.max(this.hold[doable] ?? 0, ACTION_INFO[doable].hold);
    }
    // Comer/beber: EMPEZAR pide insistencia (tasa alta = necesidad real, no un spike suelto);
    // SEGUIR basta con que la tasa no caiga; al saciarse la tasa baja y se detiene sola
    for (const a of Object.keys(NEED_DRIVE) as Action[]) {
      const { start, keep } = NEED_DRIVE[a]!, d = this.drive[a] ?? 0;
      const engaged = (this.hold[a] ?? 0) > 0;
      if ((!engaged && d >= start) || (engaged && d >= keep)) this.hold[a] = Math.max(this.hold[a] ?? 0, 2);
    }
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
    // Una caja ocupada deja de estarlo si la mascota ya no se esconde dentro
    for (const o of world.objects) if (o.state === 'occupied') o.state = 'open';

    const active = this.active;
    for (const action of active) {
      const from = ctx.intents.length;
      this.status[action] = this.handlers[action](ctx);
      // prioridad de movimiento: la motivación (tasa de disparo) de la acción; desempata la más reciente
      for (let i = from; i < ctx.intents.length; i++) {
        const it = ctx.intents[i];
        if (it.kind === 'seek' && it.priority === undefined) it.priority = (this.drive[action] ?? 0) + 0.01 * (this.hold[action] ?? 0) / ACTION_INFO[action].hold;
      }
    }
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

  // Ir a un sitio: NavigationSystem resuelve el camino (rodeos, salidas); aquí solo se pide ir
  private go(ctx: ActionContext, goal: NavGoal, speed: number, priority?: number): NavStep {
    const step = ctx.world.navigation.plan(goal);
    if (step.reachable) ctx.intents.push({ kind: 'seek', target: step.waypoint, speed, stop: step.stop, exitId: step.exitId, priority });
    return step;
  }

  private here(ctx: ActionContext, p: Point, stop: number): NavGoal {
    return { location: ctx.world.location, point: p, stop };
  }

  // Recurso resuelto (plato, agua, cama): aquí o en otro lugar conocido y alcanzable
  private goResource(ctx: ActionContext, r: ResolvedTarget, speed: number, stop: number): NavStep {
    return this.go(ctx, { location: r.location, point: r.point, stop }, speed);
  }

  // Salida hacia la que mira cuando no estás (la puerta de casa / del jardín)
  private door(world: World): Point {
    return world.def.interactionPoints.exits[0]?.at ?? DOOR;
  }

  private createHandlers(): Record<Action, Handler> {
    const cfg = this.config;
    const rng = cfg.rng;
    return {
      EAT: (ctx) => {
        // La fuente de comida CONOCIDA más cercana (plato o galletita); si no hay, el plato vacío
        const r = ctx.world.resolver.resource('canEat', (o) => o.amount > 0) ?? ctx.world.resolver.resource('canEat');
        if (!r) return 'no hay comida';
        this.goResource(ctx, r, 0.8, 0.07);
        const food = r.object;
        if (!food) return 'vuelve a casa a comer';
        if (!this.near(ctx.world, ctx.pet, food, 0.1)) return food.type === 'treat' ? 'va por la galletita' : 'va al plato';
        if (food.amount <= 0) { food.state = 'empty'; return 'plato vacío'; }
        food.amount = Math.max(0, food.amount - 0.04);
        food.state = food.amount > 0 ? 'available' : 'empty';
        ctx.pet.change('hunger', -0.05);
        ctx.pet.change('energy', 0.005);
        return food.type === 'treat' ? 'come la galletita' : 'come';
      },
      DRINK: (ctx) => {
        const r = ctx.world.resolver.resource('canDrink');
        if (!r) return 'no hay agua';
        this.goResource(ctx, r, 0.8, 0.07);
        const water = r.object;
        if (!water) return 'vuelve a casa a beber';
        if (!this.near(ctx.world, ctx.pet, water, 0.1)) return 'va al agua';
        if (water.amount <= 0) return 'no hay agua';
        water.amount = Math.max(0, water.amount - 0.05);
        ctx.pet.change('thirst', -0.06);
        return 'bebe';
      },
      SLEEP: (ctx) => {
        const r = ctx.world.resolver.resource('canSleep');
        const bed = r?.object ?? null;
        const inBed = this.near(ctx.world, ctx.pet, bed, 0.1);
        const settled = this.near(ctx.world, ctx.pet, bed, 0.04);
        // v5: se acomoda en el centro de la cama (antes se quedaba en el borde y "despertaba" a cada paso)
        if (bed) {
          if (settled) ctx.intents.push({ kind: 'brake', factor: 0 });
          else this.go(ctx, this.here(ctx, bed, 0.02), inBed ? 0.3 : 0.6);
        } else if (r) this.goResource(ctx, r, 0.6, 0.02); // la cama está en casa
        ctx.pet.asleep = inBed;
        // v5: el sueño recupera de forma gradual (antes −0.02: siestas de 50 ticks, ~6 % del tiempo dormido;
        // con un día de 1440 ticks ese ciclo nunca podía sincronizarse con la noche). Dormido en la cama
        // ~16 h despierto : 6–8 h dormido; fuera de la cama descansa peor.
        // Presión de sueño con caída exponencial (modelo de dos procesos): al principio de la noche baja
        // deprisa y al final despacio → el final del sueño es "ligero" y ahí el contexto (oscuridad,
        // lo aprendido sobre la hora) inclina entre seguir durmiendo o despertar.
        const f = ctx.pet.fatigue;
        ctx.pet.change('fatigue', inBed ? -(SLEEP_RECOVERY * f + 0.0004) : -(SLEEP_RECOVERY * 0.5 * f + 0.0002));
        ctx.pet.change('energy', inBed ? 0.006 : 0.003);
        return inBed ? 'duerme en la cama' : bed ? 'va a la cama' : 'vuelve a casa a dormir';
      },
      REST: (ctx) => {
        // v5: si a la vez quiere DORMIR, no frena: así puede llegar a la cama (antes se quedaba a medio camino)
        if (!((this.hold.SLEEP ?? 0) > 0)) ctx.intents.push({ kind: 'brake', factor: cfg.movement.restMultiplier });
        // v5: tumbarse despierto repone energía pero apenas quita el sueño (antes −0.003: sustituía a dormir)
        ctx.pet.change('fatigue', -0.0012);
        ctx.pet.change('energy', 0.012);
        return 'descansa';
      },
      PLAY: (ctx) => {
        // Juega con lo que lleva; si no, con lo que se PUEDE jugar que atiende o percibe mejor (TargetResolver, no objects[0])
        const w = ctx.world;
        const toy = w.getObject(ctx.pet.carrying) ?? (ctx.focus && affords(ctx.focus.kind, 'canPlay') && w.resolver.known(ctx.focus) ? ctx.focus : null) ?? w.resolver.best('canPlay');
        if (!toy) { ctx.pet.change('boredom', -0.01); this.playingWith = null; return 'juega sola'; }
        if (toy.id !== ctx.pet.carrying) this.go(ctx, this.here(ctx, toy, 0.07), 0.9);
        if (!this.near(w, ctx.pet, toy, 0.1)) return 'va al juguete';
        if (toy.id !== ctx.pet.carrying && affords(toy.kind, 'canPush')) {
          // v7: la empuja con la pata/hocico (impulso físico): la pelota RUEDA; el peluche apenas se mueve
          const a = Math.atan2(toy.y - ctx.pet.y, toy.x - ctx.pet.x) + (rng() - 0.5) * 1.2;
          const f = 0.012 + rng() * 0.012;
          w.push(toy.id, Math.cos(a) * f, Math.sin(a) * f);
        }
        if (this.playingWith !== toy.id) { this.playingWith = toy.id; w.knowledge.interact(toy.kind, w.nowMs); }
        ctx.pet.change('boredom', -0.04);
        ctx.pet.change('energy', -0.008);
        ctx.pet.change('fatigue', 0.003);
        if (this.playerNear(ctx)) ctx.pet.change('affection', 0.008);
        return `juega con ${toy.label}`;
      },
      EXPLORE: (ctx) => {
        const w = ctx.world;
        const reached = w.exploreTarget && w.exploreGoal?.location === w.location && w.distance(ctx.pet, w.exploreTarget) < 0.05;
        const stale = w.exploreGoal && w.exploreGoal.location !== w.location && !w.canReach(w.exploreGoal.location);
        if (!w.exploreTarget || reached || stale || (w.exploreGoal && w.exploreGoal.location !== w.location && w.exploreGoal.exitId === null)) {
          const pick = w.resolver.explore(rng);
          w.exploreTarget = pick.point;
          w.exploreGoal = { location: pick.exitId ? pick.location : w.location, exitId: pick.exitId };
        }
        const goal = w.exploreGoal as { location: LocationId; exitId: string | null };
        // Una salida: ir a ella (cruzarla es el paso final). Si no, un punto del lugar.
        const step = goal.exitId ? this.go(ctx, { location: goal.location, point: LOCATIONS[goal.location].spawnPoints.pet, stop: 0.02 }, 0.7) : this.go(ctx, this.here(ctx, w.exploreTarget as Point, 0.02), 0.7);
        if (!step.reachable) w.exploreTarget = null;
        ctx.pet.change('boredom', -0.012);
        ctx.pet.change('curiosity', -0.004);
        return goal.exitId ? `va hacia ${LOCATIONS[goal.location].label}` : 'explora';
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
        ctx.pet.lookTarget = ctx.player.present ? ctx.player : this.door(ctx.world);
        return ctx.player.present ? 'te mira y te llama' : 'mira hacia la puerta';
      },
      APPROACH: (ctx) => {
        const target = ctx.player.present ? ctx.player : this.door(ctx.world);
        this.go(ctx, this.here(ctx, target, 0.12), 0.9);
        ctx.pet.lookTarget = target;
        return ctx.player.present ? 'se acerca a ti' : 'va hacia la puerta';
      },
      MOVE_AWAY: (ctx) => {
        const threat = ctx.world.resolver.threat();
        if (!threat) { ctx.intents.push({ kind: 'wander', speed: 0.6 }); return 'se aparta'; }
        ctx.intents.push({ kind: 'flee', from: threat, speed: 1 });
        if (threat === ctx.player) return 'se aleja de ti';
        return 'kind' in threat && 'heard' in threat ? 'se aleja del ruido' : `se aleja de ${(threat as WorldObject).label ?? 'eso'}`;
      },
      GREET: (ctx) => {
        if (ctx.player.present) ctx.pet.lookTarget = ctx.player;
        if (this.playerNear(ctx)) ctx.pet.change('affection', 0.006);
        return ctx.player.present ? 'te saluda' : 'saluda al aire';
      },
      FOLLOW_PLAYER: (ctx) => {
        if (!ctx.player.present) return 'te busca';
        this.go(ctx, this.here(ctx, ctx.player, 0.16), 1);
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
        const t = ctx.world.attentionTarget;
        if (!ctx.focus && t?.type === 'sound') { ctx.pet.lookTarget = { x: t.x, y: t.y }; return 'mira hacia el ruido'; }
        if (!ctx.focus) {
          // Sin nada concreto: gira la cabeza a un lado y a otro (así lo que había detrás puede entrar en su campo de visión)
          const a = ctx.pet.orientation + (rng() < 0.5 ? -1 : 1) * (0.8 + rng() * 0.8);
          const w = ctx.world;
          ctx.pet.lookTarget = { x: ctx.pet.x + Math.cos(a) * 0.3 / w.scaleX, y: ctx.pet.y + Math.sin(a) * 0.3 / (w.scaleY / 0.8) };
          return 'mira alrededor';
        }
        ctx.pet.lookTarget = ctx.focus;
        ctx.focus.novelty = Math.max(0, ctx.focus.novelty - 0.02);
        ctx.pet.change('curiosity', -0.003);
        return `mira ${ctx.focus.label}`;
      },
      INVESTIGATE: (ctx) => {
        const w = ctx.world, obj = ctx.focus, t = w.attentionTarget;
        if (!obj && t?.type === 'sound') {
          // Va a ver qué fue ese ruido. Si sonó FUERA (se oyó por la puerta abierta), el origen está al otro lado
          ctx.pet.lookTarget = { x: t.x, y: t.y };
          const snd = w.sounds.find((x) => x.id === t.soundId);
          const origin = snd?.origin as LocationId | null | undefined;
          if (origin && origin !== w.location && w.canReach(origin)) {
            this.go(ctx, { location: origin, point: LOCATIONS[origin].spawnPoints.pet, stop: 0.05 }, 0.45);
            return `va a ver qué suena en ${LOCATIONS[origin].label}`;
          }
          this.go(ctx, this.here(ctx, t, 0.08), 0.4);
          return 'va a ver qué ha sonado';
        }
        if (!obj) return 'busca algo que investigar';
        ctx.pet.lookTarget = obj;
        this.go(ctx, this.here(ctx, obj, 0.08), 0.35);
        if (!this.near(w, ctx.pet, obj, 0.11)) return `se acerca a ${obj.label}`;
        obj.novelty = Math.max(0, obj.novelty - 0.08);
        obj.investigation += 1;
        w.knowledge.investigate(obj.kind, w.nowMs);
        ctx.pet.change('curiosity', -0.02);
        ctx.pet.change('boredom', -0.01);
        // La caja se abre a base de investigarla (física: la empuja con el hocico hasta que cede)
        if (obj.kind === 'mysteryBox' && obj.state === 'closed' && obj.investigation >= BOX_OPENS_AT) {
          const inside = w.openBox(obj);
          return inside ? `abre ${obj.label}: ¡dentro había ${inside.label}!` : `abre ${obj.label}`;
        }
        return `investiga ${obj.label}`;
      },
      PICK_UP_OBJECT: (ctx) => {
        if (ctx.pet.carrying !== null) return 'lleva ' + (ctx.world.getObject(ctx.pet.carrying)?.label ?? 'algo');
        const w = ctx.world;
        const obj = ctx.focus && affords(ctx.focus.kind, 'canCarry') && w.resolver.known(ctx.focus) ? ctx.focus : w.resolver.best('canCarry');
        if (!obj) return 'no hay nada que recoger';
        this.go(ctx, this.here(ctx, obj, 0.06), 0.6);
        if (!this.near(w, ctx.pet, obj, 0.09)) return `va por ${obj.label}`;
        ctx.pet.carrying = obj.id;
        obj.vx = obj.vy = 0;
        obj.state = 'stationary';
        this.carryTimer = 20;
        w.knowledge.interact(obj.kind, w.nowMs);
        ctx.pet.change('boredom', -0.01);
        return `recoge ${obj.label}`;
      },
      GET_SCARED: (ctx) => {
        ctx.pet.change('energy', -0.003);
        return 'se asusta';
      },
      HIDE: (ctx) => {
        // Un escondite CONOCIDO (la tienda, una caja abierta), no el de al lado del susto
        const w = ctx.world, threat = w.resolver.threat();
        const r = w.resolver.resource('canHide', (o) => (o.kind !== 'mysteryBox' || o.state === 'open' || o.state === 'occupied') && (!threat || w.distance(o, threat) > 0.15));
        if (!r) return 'busca dónde esconderse';
        this.goResource(ctx, r, 1.1, 0.03);
        const spot = r.object;
        if (!spot || !this.near(w, ctx.pet, spot, 0.06)) return 'corre a esconderse';
        ctx.pet.hidden = true;
        if (spot.kind === 'mysteryBox') spot.state = 'occupied';
        ctx.pet.change('fear', -0.03);
        return spot.kind === 'mysteryBox' ? 'escondida en la caja' : 'escondida en la tienda';
      },
    };
  }
}

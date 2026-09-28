/*
 * MUNDO
 * -----
 * Contiene a la mascota, al jugador y a los objetos, todos con posición x/y
 * en un suelo de 1×1 (y = 0 al fondo, y = 1 al frente, junto a la pantalla).
 *
 * El mundo calcula distancias y disponibilidad, pero NO decide nada:
 * perceive() convierte esa información en valores 0..1 que luego los
 * sensores inyectan en la red.
 *
 * Las interacciones del jugador modifican el mundo (poner comida, hacer
 * ruido, apagar la luz, lanzar la pelota, llamar...). Nunca llaman a
 * pet.eat() ni similares.
 *
 * Cambios respecto al prototipo (móvil), todos física/percepción:
 *  - el jugador vive delante de la pantalla (`playerHome`);
 *  - objetos lanzados con velocidad y fricción (Trae la pelota);
 *  - la llamada del jugador (`playerCalling`, evento transitorio);
 *  - "galletitas": fuentes de comida pequeñas junto al jugador;
 *  - contador de investigación por objeto (la caja misteriosa se abre).
 */
import type { SensorKey } from '../brain/BrainConfig';
import { clamp01 } from '../random';
import { ITEMS, NOVEL_KINDS, isItemKind, type ItemKind, type ObjectType } from '../world/Items';
import { Pet, type Point } from './Pet';
import type { SimConfig } from './SimConfig';

export interface WorldObject extends Point {
  id: number;
  type: ObjectType;
  kind: ItemKind;
  label: string;
  emoji: string;
  interest: number;
  novelty: number;
  pickable: boolean;
  fixed: boolean;
  amount: number;
  vx: number;
  vy: number;
  moved: boolean;
  investigation: number; // ticks de investigación de cerca acumulados
  tag: string | null; // p. ej. "game": se retira al terminar el minijuego
}

export interface Player extends Point {
  present: boolean;
  tx: number;
  ty: number;
  speed: number;
  touchTicks: number;
  wantsTouch: boolean;
  calling: number; // intensidad de la llamada (decae)
  returnHome: boolean; // tras acariciar, la mano vuelve a la pantalla
}

export type WorldEventType =
  | 'PLAYER_ENTERED' | 'PLAYER_LEFT' | 'PLAYER_CARESS' | 'PLAYER_PETTING' | 'PLAYER_CALL'
  | 'OBJECT_MOVED' | 'OBJECT_THROWN' | 'FOOD_PLACED' | 'WATER_PLACED' | 'TOY_PLACED' | 'TREAT_OFFERED'
  | 'NEW_OBJECT' | 'LOUD_SOUND' | 'LIGHT_ON' | 'LIGHT_OFF';

export interface WorldEvent {
  type: WorldEventType;
  sensor: SensorKey;
  detail: string;
}

export type Perception = Record<SensorKey, number>;

export interface WorldState {
  objects: WorldObject[];
  lightOn: boolean;
  nextId: number;
  tick: number;
}

type NewObject = Partial<WorldObject> & Pick<WorldObject, 'type' | 'kind' | 'x' | 'y'>;

export class World {
  readonly pet: Pet;
  objects: WorldObject[] = [];
  player!: Player;
  lightOn = true;
  sound = { level: 0, x: 0.5, y: 0.5 };
  tick = 0;
  events: WorldEvent[] = [];
  focusObjectId: number | null = null;
  exploreTarget: Point | null = null;
  private _nextId = 1;

  constructor(private readonly config: SimConfig) {
    this.pet = new Pet(config.pet);
    this.reset();
  }

  private get rng() {
    return this.config.rng;
  }

  reset(): void {
    const w = this.config.world;
    this.pet.reset();
    this._nextId = 1;
    this.objects = [];
    this.addObject({ type: 'bed', kind: 'bed', x: 0.15, y: 0.18, fixed: true });
    this.addObject({ type: 'food', kind: 'bowl', x: 0.78, y: 0.22, amount: w.initialFood, fixed: true });
    this.addObject({ type: 'water', kind: 'water', x: 0.93, y: 0.45, amount: w.initialWater, fixed: true });
    this.addObject({ type: 'hideout', kind: 'tent', x: 0.08, y: 0.78, fixed: true, interest: 0.1 });
    this.addObject({ type: 'toy', kind: 'ball', x: 0.6, y: 0.75, interest: 0.3, pickable: true });

    const home = w.playerHome;
    this.player = { present: false, x: home.x, y: home.y, tx: home.x, ty: home.y, speed: 0, touchTicks: 0, wantsTouch: false, calling: 0, returnHome: false };
    this.lightOn = true;
    this.sound = { level: 0, x: 0.5, y: 0.5 };
    this.tick = 0;
    this.events = [];
    this.focusObjectId = null;
    this.exploreTarget = null;
  }

  addObject(props: NewObject): WorldObject {
    const def = ITEMS[props.kind];
    const obj: WorldObject = {
      id: this._nextId++,
      label: def.label,
      emoji: def.emoji,
      interest: 0,
      novelty: 0,
      pickable: false,
      fixed: false,
      amount: 0,
      vx: 0,
      vy: 0,
      moved: false,
      investigation: 0,
      tag: null,
      ...props,
    };
    this.objects.push(obj);
    return obj;
  }

  getObject(id: number | null | undefined): WorldObject | null {
    if (id == null) return null;
    return this.objects.find((o) => o.id === id) ?? null;
  }

  firstOfType(type: ObjectType): WorldObject | null {
    return this.objects.find((o) => o.type === type) ?? null;
  }

  toys(): WorldObject[] {
    return this.objects.filter((o) => o.type === 'toy');
  }

  foodSources(): WorldObject[] {
    return this.objects.filter((o) => (o.type === 'food' || o.type === 'treat') && o.amount > 0);
  }

  distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, (a.y - b.y) * 0.8);
  }

  // Proximidad 0..1 (1 = pegado, 0 = lejos)
  proximity(a: Point, b: Point, range = 0.8): number {
    return Math.max(0, 1 - this.distance(a, b) / range);
  }

  nearest<T extends Point>(list: readonly T[], from: Point = this.pet): T | null {
    let best: T | null = null;
    let bestD = Infinity;
    for (const o of list) {
      const d = this.distance(from, o);
      if (d < bestD) { best = o; bestD = d; }
    }
    return best;
  }

  // ---------- Física: el tiempo pasa ----------
  update(timeScale = 1): void {
    const w = this.config.world, pc = this.config.pet, pet = this.pet, pl = this.player;
    this.tick++;
    pet.passTime(timeScale);

    // Jugador: se desplaza hacia su objetivo
    if (pl.present) {
      const dx = pl.tx - pl.x, dy = pl.ty - pl.y, d = Math.hypot(dx, dy);
      const step = Math.min(d, w.playerSpeed);
      if (d > 0.001) { pl.x += (dx / d) * step; pl.y += (dy / d) * step; }
      pl.speed = pl.speed * 0.5 + (step / w.playerSpeed) * 0.5;
      // Acariciar: solo llega a tocar si está al lado de la mascota
      if (pl.wantsTouch) {
        pl.tx = pet.x; pl.ty = pet.y;
        if (this.distance(pl, pet) < w.touchRange) { pl.touchTicks = w.touchTicks; pl.wantsTouch = false; }
      }
    } else pl.speed = 0;
    if (pl.touchTicks > 0) {
      pl.touchTicks--;
      pet.change('affection', pc.touchAffection);
      if (this.distance(pl, pet) > w.touchRange * 1.5) pl.touchTicks = 0;
      if (pl.touchTicks === 0 && pl.returnHome) this._handHome();
    }
    pl.calling *= w.callDecay;
    if (pl.calling < 0.02) pl.calling = 0;

    // Sonido y novedad se desvanecen
    pet.change('fear', this.sound.level * pc.soundFear);
    this.sound.level *= w.soundDecay;
    if (this.sound.level < 0.02) this.sound.level = 0;

    // Objetos lanzados: velocidad, rebote en las paredes, fricción
    for (const o of this.objects) {
      if (!o.vx && !o.vy) continue;
      if (o.id === pet.carrying) { o.vx = o.vy = 0; continue; }
      let nx = o.x + o.vx, ny = o.y + o.vy;
      if (nx < 0.03 || nx > 0.97) { o.vx = -o.vx; nx = Math.max(0.03, Math.min(0.97, nx)); }
      if (ny < 0.02 || ny > 0.98) { o.vy = -o.vy; ny = Math.max(0.02, Math.min(0.98, ny)); }
      o.x = nx; o.y = ny;
      o.vx *= w.throwFriction; o.vy *= w.throwFriction;
      if (Math.hypot(o.vx, o.vy) < 0.002) o.vx = o.vy = 0;
      o.novelty = Math.max(o.novelty, 0.35); // algo que se mueve llama la atención
    }

    let maxNovelty = 0;
    for (const o of this.objects) {
      o.novelty *= Math.pow(w.noveltyDecay, timeScale);
      if (o.novelty < 0.01) o.novelty = 0;
      maxNovelty = Math.max(maxNovelty, o.novelty);
    }
    pet.change('curiosity', (maxNovelty * pc.noveltyCuriosity + pet.boredom * pc.boredomCuriosity) * timeScale);
    if (!this.lightOn) pet.change('fear', pc.darknessFear * timeScale);

    // Las galletitas se acaban
    this.objects = this.objects.filter((o) => o.type !== 'treat' || o.amount > 0);

    // Lo que lleva en la boca va con ella
    const carried = this.getObject(pet.carrying);
    if (carried) { carried.x = pet.x; carried.y = pet.y; }
    else pet.carrying = null;
  }

  // ---------- Percepción: mundo → valores 0..1 (todavía sin neuronas) ----------
  perceive(): Perception {
    const pet = this.pet, pl = this.player, w = this.config.world;
    const visibility = this.lightOn ? 1 : 0.45;
    const avail = (o: WorldObject | null) => (o ? 0.4 + 0.6 * this.proximity(pet, o) : 0);

    const food = this.nearest(this.foodSources());
    const water = this.firstOfType('water');
    const toy = this.nearest(this.toys().filter((t) => t.id !== pet.carrying));

    // Objeto percibido: el más llamativo (novedad + interés), atenuado por distancia y luz.
    let focus: WorldObject | null = null, salience = 0;
    for (const o of this.objects) {
      if (o.fixed && o.type !== 'hideout') continue;
      const s = (o.novelty + o.interest * 0.6) * visibility * (0.4 + 0.6 * this.proximity(pet, o));
      if (s > salience) { salience = s; focus = o; }
    }
    this.focusObjectId = focus && salience > 0.05 ? focus.id : null;

    const maxNovelty = this.objects.reduce((m, o) => Math.max(m, o.novelty), 0);

    return {
      hunger: pet.hunger,
      thirst: pet.thirst,
      fatigue: pet.fatigue,
      boredom: pet.boredom,
      affectionNeed: 1 - pet.affection,
      energy: pet.energy,
      fear: pet.fear,
      curiosity: pet.curiosity,
      playerNear: pl.present ? clamp01(1 - this.distance(pet, pl) / w.nearRange) : 0,
      playerTouching: pl.touchTicks > 0 ? 1 : 0,
      playerMoving: pl.present ? clamp01(pl.speed) : 0,
      foodAvailable: avail(food),
      waterAvailable: water && water.amount > 0 ? avail(water) : 0,
      bedAvailable: avail(this.firstOfType('bed')),
      toyAvailable: avail(toy),
      interestingObjectVisible: clamp01(salience),
      hidingPlaceAvailable: avail(this.firstOfType('hideout')),
      darkness: this.lightOn ? 0 : 1,
      loudSound: clamp01(this.sound.level),
      newObjectDetected: clamp01(maxNovelty * (this.lightOn ? 1 : 0.6)),
      playerCalling: pl.present ? clamp01(pl.calling) : 0,
    };
  }

  // ---------- Interacciones del jugador (solo cambian el mundo) ----------
  private _event(type: WorldEventType, sensor: SensorKey, detail = ''): void {
    this.events.push({ type, sensor, detail });
  }

  setPlayerPresent(present: boolean): void {
    const pl = this.player;
    if (pl.present === present) return;
    pl.present = present;
    const home = this.config.world.playerHome;
    if (present) {
      pl.x = pl.tx = home.x; pl.y = pl.ty = home.y; pl.speed = 0;
      this._event('PLAYER_ENTERED', 'playerNear');
    } else {
      pl.touchTicks = 0; pl.wantsTouch = false; pl.calling = 0;
      this._event('PLAYER_LEFT', 'playerNear');
    }
  }

  togglePlayer(): void {
    this.setPlayerPresent(!this.player.present);
  }

  movePlayerTo(x: number, y: number): void {
    if (!this.player.present) return;
    this.player.tx = Math.max(0.02, Math.min(0.98, x));
    this.player.ty = Math.max(0, Math.min(1, y));
    this.player.wantsTouch = false;
  }

  caress(): void {
    if (!this.player.present) this.setPlayerPresent(true);
    this.player.wantsTouch = true;
    this._event('PLAYER_CARESS', 'playerTouching');
  }

  // Acariciar directamente con el dedo: la mano del jugador está sobre la mascota
  petDirect(): void {
    if (!this.player.present) this.setPlayerPresent(true);
    const pl = this.player, pet = this.pet;
    pl.x = pl.tx = Math.max(0.02, Math.min(0.98, pet.x + 0.06));
    pl.y = pl.ty = Math.max(0, Math.min(1, pet.y + 0.05));
    if (pl.touchTicks === 0) this._event('PLAYER_PETTING', 'playerTouching');
    pl.touchTicks = this.config.world.touchTicks;
    pl.wantsTouch = false;
    pl.returnHome = true;
  }

  private _handHome(): void {
    const pl = this.player, home = this.config.world.playerHome;
    pl.x = pl.tx = home.x; pl.y = pl.ty = home.y;
    pl.returnHome = false;
  }

  // "¡Milo, aquí!": un estímulo auditivo que el cerebro puede atender o no.
  callPet(intensity = 1): void {
    if (!this.player.present) this.setPlayerPresent(true);
    this.player.calling = Math.max(this.player.calling, clamp01(intensity));
    this._event('PLAYER_CALL', 'playerCalling');
  }

  // Arrastrar un objeto con el dedo
  moveObject(id: number, x: number, y: number): void {
    const o = this.getObject(id);
    if (!o || o.fixed || o.id === this.pet.carrying) return;
    o.x = Math.max(0.03, Math.min(0.97, x));
    o.y = Math.max(0.02, Math.min(0.98, y));
    o.vx = o.vy = 0;
    if (!o.moved) { o.moved = true; this._event('OBJECT_MOVED', 'interestingObjectVisible', o.label); }
    o.novelty = Math.max(o.novelty, 0.3);
  }

  endMoveObject(id: number): void {
    const o = this.getObject(id);
    if (o) o.moved = false;
  }

  // Soltar un objeto con velocidad (unidades de mundo por tick)
  throwObject(id: number, vx: number, vy: number): boolean {
    const o = this.getObject(id);
    if (!o || o.fixed || o.id === this.pet.carrying) return false;
    const max = this.config.world.maxThrowSpeed;
    const m = Math.hypot(vx, vy);
    const k = m > max ? max / m : 1;
    o.vx = vx * k; o.vy = vy * k;
    o.moved = false;
    o.novelty = Math.max(o.novelty, 0.6);
    this._event('OBJECT_THROWN', 'toyAvailable', o.label);
    return true;
  }

  addFood(): void {
    const f = this.firstOfType('food');
    if (!f) return;
    f.amount = Math.min(this.config.world.maxFood, f.amount + 1);
    this._event('FOOD_PLACED', 'foodAvailable');
  }

  addWater(): void {
    const w = this.firstOfType('water');
    if (!w) return;
    w.amount = 1;
    this._event('WATER_PLACED', 'waterAvailable');
  }

  // Una galletita delante del jugador: comida pequeña, cerca de ti
  offerTreat(): WorldObject {
    if (!this.player.present) this.setPlayerPresent(true);
    this.objects = this.objects.filter((o) => o.type !== 'treat');
    const pl = this.player;
    const treat = this.addObject({
      type: 'treat', kind: 'treat', x: Math.max(0.1, Math.min(0.9, pl.x)), y: Math.max(0.2, Math.min(0.92, pl.y - 0.1)),
      amount: this.config.world.treatAmount, interest: ITEMS.treat.interest, novelty: 0.4,
    });
    this._event('TREAT_OFFERED', 'foodAvailable');
    return treat;
  }

  // Mismo comportamiento que el prototipo: primero un peluche, luego pelotas
  placeToy(): void {
    const hasTeddy = this.objects.some((o) => o.kind === 'teddy');
    const pos = this._placeNear(this.player.present ? this.player : { x: 0.5, y: 0.6 });
    const toy = hasTeddy
      ? this.toys().find((t) => t.id !== this.pet.carrying) ?? this.addObject({ type: 'toy', kind: 'ball', interest: 0.3, pickable: true, ...pos })
      : this.addObject({ type: 'toy', kind: 'teddy', interest: 0.4, pickable: true, ...pos });
    Object.assign(toy, pos);
    toy.novelty = Math.max(toy.novelty, 0.5);
    this._event('TOY_PLACED', 'toyAvailable', toy.emoji);
  }

  // Colocar un objeto concreto (mochila, minijuegos)
  placeItem(kind: ItemKind, pos?: Point, tag: string | null = null): WorldObject {
    const def = ITEMS[kind];
    if (def.type === 'novel') this._limitNovel();
    const at = pos ?? this._placeNear(this.player.present ? this.player : { x: 0.5, y: 0.6 });
    const obj = this.addObject({
      type: def.type, kind, x: at.x, y: at.y, interest: def.interest, pickable: def.pickable,
      novelty: def.novelty ?? 0.5, tag,
    });
    if (def.type === 'novel') this._event('NEW_OBJECT', 'newObjectDetected', def.emoji);
    else this._event('TOY_PLACED', 'toyAvailable', def.emoji);
    return obj;
  }

  addNovelObject(kind?: ItemKind): WorldObject {
    const k = kind ?? NOVEL_KINDS[Math.floor(this.rng() * NOVEL_KINDS.length)];
    const pos = { x: 0.25 + this.rng() * 0.6, y: 0.3 + this.rng() * 0.6 };
    return this.placeItem(k, pos);
  }

  removeObject(id: number): void {
    if (this.pet.carrying === id) this.pet.carrying = null;
    this.objects = this.objects.filter((o) => o.id !== id);
  }

  removeTagged(tag: string): void {
    for (const o of this.objects.filter((x) => x.tag === tag)) this.removeObject(o.id);
  }

  makeNoise(): void {
    const src = this.player.present ? this.player : { x: 0.95, y: 0.1 };
    this.sound = { level: 1, x: src.x, y: src.y };
    this._event('LOUD_SOUND', 'loudSound');
  }

  toggleLight(): void {
    this.setLight(!this.lightOn);
  }

  setLight(on: boolean): void {
    if (this.lightOn === on) return;
    this.lightOn = on;
    this._event(on ? 'LIGHT_ON' : 'LIGHT_OFF', 'darkness');
  }

  drainEvents(): WorldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private _limitNovel(): void {
    const novel = this.objects.filter((o) => o.type === 'novel' && o.tag === null);
    if (novel.length >= this.config.world.maxNovelObjects) {
      const oldest = novel.find((o) => o.id !== this.pet.carrying);
      if (oldest) this.removeObject(oldest.id);
    }
  }

  private _placeNear(p: Point): Point {
    return {
      x: Math.max(0.1, Math.min(0.9, p.x + (this.rng() - 0.5) * 0.3)),
      y: Math.max(0.3, Math.min(0.9, p.y - 0.2 + (this.rng() - 0.5) * 0.1)),
    };
  }

  // ---------- Serialización ----------
  exportState(): WorldState {
    return { objects: this.objects.map((o) => ({ ...o })), lightOn: this.lightOn, nextId: this._nextId, tick: this.tick };
  }

  importState(s: WorldState): void {
    const valid = s.objects.filter((o) => isItemKind(o.kind) && Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.id));
    // Los objetos de un minijuego interrumpido no sobreviven al cierre
    this.objects = valid.filter((o) => o.tag === null).map((o) => ({ ...o, vx: 0, vy: 0, moved: false }));
    // El mundo siempre tiene sus muebles
    const need: [ObjectType, ItemKind, Point][] = [['bed', 'bed', { x: 0.15, y: 0.18 }], ['food', 'bowl', { x: 0.78, y: 0.22 }], ['water', 'water', { x: 0.93, y: 0.45 }], ['hideout', 'tent', { x: 0.08, y: 0.78 }]];
    this._nextId = Math.max(s.nextId || 1, ...this.objects.map((o) => o.id + 1));
    for (const [type, kind, p] of need) if (!this.firstOfType(type)) this.addObject({ type, kind, ...p, fixed: true });
    this.lightOn = s.lightOn !== false;
    this.tick = Number.isFinite(s.tick) ? s.tick : 0;
    if (this.pet.carrying !== null && !this.getObject(this.pet.carrying)) this.pet.carrying = null;
  }
}

/*
 * MUNDO (dominio, sin Three.js)
 * -----------------------------
 *   World
 *    ├── locations    ubicación actual + objetos guardados de las demás (Locations.ts)
 *    ├── entities     mascota y jugador
 *    ├── objects      objetos físicos con estado, affordances y propiedades sensoriales
 *    ├── environment  luz, actividad, ruido, clima, hora, novedad del lugar
 *    ├── events       WorldEventSystem: lo que acaba de pasar (cambios sensoriales, no acciones)
 *    └── pet          cuerpo de la mascota (orientación incluida: hay campo de visión)
 *
 * Posiciones x/y en un suelo normalizado 0..1 de la ubicación actual (y = 0 al
 * fondo, y = 1 al frente, junto a la pantalla). Las DISTANCIAS se miden en
 * unidades de habitación (la ubicación tiene su tamaño), así el parque es
 * más grande de verdad.
 *
 * El mundo calcula física y percepción, pero NO decide nada:
 *   MUNDO CAMBIA → perceive() (WorldSensorSystem, sin omnisciencia) → SNN →
 *   acción → el mundo responde → experiencia → memoria + aprendizaje.
 *
 * Las interacciones del jugador modifican el mundo (poner comida, lanzar la
 * pelota, colocar una caja, abrir la puerta del jardín…). Nunca llaman a
 * pet.eat() ni mueven a la mascota.
 *
 * Historia: v5 añadió la hora (WorldClock), la luz natural y las zonas; v7
 * (mundo vivo) añade ubicaciones, FOV, oído, novedad/familiaridad desde la
 * memoria, atención, física simplificada, sonidos como estímulos y
 * microeventos. Ver docs/living-world.md.
 */

import { PET_BODY_RADIUS, resolveCollision } from '../world/EnvironmentLayouts';
import { CLOCK_SENSORS, OBJECT_CHANNELS, ZONE_SENSORS, type SensorKey } from '../brain/BrainConfig';
import { clockInfo, clockPopulation, type TimeOfDay } from '../time/WorldClock';
import { clamp01, defaultRng, type Rng } from '../random';
import { AmbientEventDirector, type MicroEventRecord } from '../world/AmbientEventDirector';
import { AttentionSystem, TargetResolver, routeCrossable, type AttentionTarget } from '../world/Attention';
import { ambientActivityIn, initialEnvironment, lightIn, type EnvironmentSave, type EnvironmentState, type WeatherState } from '../world/Environment';
import { ExplorationMemory } from '../world/ExplorationMemory';
import { ITEMS, NOVEL_KINDS, affords, isItemKind, type ItemKind, type ObjectType } from '../world/Items';
import { LOCATIONS, exitBetween, isLocationId, type ExitDef, type LocationId, type ZoneSensorKey } from '../world/Locations';
import { PetNavigationSystem } from '../world/Navigation';
import { METERS_PER_UNIT, WorldSensorSystem, type HeardSound, type ObjectPercept, type PerceiveInput, type SpatialFrame } from '../world/Perception';
import { SOUND_MIN, soundAttenuation, type SoundKind, type SoundStimulus } from '../world/Sound';
import { Pet, type Point } from './Pet';
import type { SimConfig } from './SimConfig';

const RETURN_DECAY = 0.95;
const ACTIVITY_EMA = 0.03;
const APPROACH_RANGE = 0.15;
const BUMP_DECAY = 0.97;

export type ObjectState = 'stationary' | 'rolling' | 'closed' | 'open' | 'occupied' | 'available' | 'empty' | 'drifting';

// Radio físico de los objetos al chocar con muebles (metros)
const OBJECT_RADIUS = 0.12;

export interface WorldObject extends Point {
  id: number;
  type: ObjectType;
  kind: ItemKind;
  label: string;
  emoji: string;
  interest: number; // saliencia física (ITEMS.sensory.visual); la habituación va a la memoria
  novelty: number; // TRANSITORIO: "acaba de aparecer / moverse" (decae en segundos)
  pickable: boolean;
  fixed: boolean;
  amount: number;
  vx: number;
  vy: number;
  moved: boolean;
  investigation: number; // ticks de investigación de cerca acumulados
  tag: string | null; // p. ej. "game": se retira al terminar el minijuego
  // v7
  state: ObjectState;
  age: number; // ticks desde que apareció
  content: ItemKind | null; // la caja misteriosa guarda algo dentro
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
  returned: number; // v5: "acabas de volver" (1 al entrar, decae)
  lastSeenAt: number; // v5: hora del mundo en que estuvo presente por última vez
}

export type WorldEventType =
  | 'PLAYER_ENTERED' | 'PLAYER_LEFT' | 'PLAYER_CARESS' | 'PLAYER_PETTING' | 'PLAYER_CALL'
  | 'OBJECT_MOVED' | 'OBJECT_THROWN' | 'FOOD_PLACED' | 'WATER_PLACED' | 'TOY_PLACED' | 'TREAT_OFFERED'
  | 'NEW_OBJECT' | 'LOUD_SOUND' | 'LIGHT_ON' | 'LIGHT_OFF'
  // v7 (mundo vivo)
  | 'OBJECT_APPEARED' | 'OBJECT_REMOVED' | 'OBJECT_OPENED' | 'SOUND_OCCURRED' | 'LIGHT_CHANGED'
  | 'LEAF_FELL' | 'BUTTERFLY_APPEARED' | 'FEATHER_FELL' | 'WIND_GUST' | 'CLOUD_PASSED'
  | 'LOCATION_CHANGED' | 'DOOR_OPENED' | 'DOOR_CLOSED';

export interface WorldEvent {
  type: WorldEventType;
  sensor: SensorKey;
  detail: string;
}

export type Perception = Record<SensorKey, number>;

export interface WorldState {
  objects: WorldObject[];
  lightOn: boolean; // lámpara
  nextId: number;
  tick: number;
  // v7
  location?: LocationId;
  stash?: Partial<Record<LocationId, WorldObject[]>>;
  doors?: Record<string, boolean>;
  environment?: EnvironmentSave;
}

export type ZoneKey = ZoneSensorKey;

type NewObject = Partial<WorldObject> & Pick<WorldObject, 'type' | 'kind' | 'x' | 'y'>;

// v5: atenuación sensorial durante el sueño (ojos cerrados / interocepción amortiguada)
const SLEEP_SENSING = { eyes: 0.15, body: 0.6 } as const;

// Una puerta compartida por dos salidas (room>garden y garden>room)
export function doorKey(exit: ExitDef, from: LocationId): string {
  return [from, exit.to].sort().join('-');
}

export class World {
  readonly pet: Pet;
  objects: WorldObject[] = [];
  player!: Player;
  lightOn = true;
  tick = 0;
  events: WorldEvent[] = [];
  focusObjectId: number | null = null;
  exploreTarget: Point | null = null;
  exploreGoal: { location: LocationId; exitId: string | null } | null = null;
  // Atención por tipo de objeto, calculada por la Simulation a partir de los
  // spikes recientes de las neuronas de atención (v4). Solo sesga el FOCO.
  attention: Partial<Record<ItemKind, number>> = {};
  // v7: sesgo de arriba abajo por asociación aprendida (lo calcula la Simulation desde los pesos)
  topDown: Partial<Record<ItemKind, number>> = {};
  // v5: tiempo y contexto
  clockMs = 0;
  daylight = 1; // sin reloj (tests unitarios antiguos): siempre de día
  private clockSignal: number[] = [0, 0, 0, 0, 0, 0];
  recentActivity = 0;
  private _nextId = 1;

  // ---- v7: mundo vivo ----
  location: LocationId = 'room';
  private stash: Partial<Record<LocationId, WorldObject[]>> = {};
  doors: Record<string, boolean> = {};
  sounds: SoundStimulus[] = [];
  private _nextSoundId = 1;
  env: EnvironmentState = initialEnvironment('room');
  private activityBump = 0;
  knowledge: ExplorationMemory = new ExplorationMemory();
  readonly sensorSystem: WorldSensorSystem;
  readonly attentionSystem: AttentionSystem;
  readonly resolver: TargetResolver;
  readonly navigation: PetNavigationSystem;
  readonly ambient: AmbientEventDirector;
  percepts: ObjectPercept[] = [];
  heard: HeardSound[] = [];
  attentionTarget: AttentionTarget | null = null;
  lastPerceivedNovelty = 0;
  microEvents: MicroEventRecord[] = []; // de este tick (para depuración y la escena)
  // Capacidad física de estar en un lugar (la inyecta GameSession desde el crecimiento)
  capability: (loc: LocationId) => boolean = () => true;
  // Primera visita a un lugar pendiente de que GameSession la convierta en experiencia
  firstVisit: { location: LocationId; tick: number } | null = null;

  constructor(private readonly config: SimConfig) {
    this.pet = new Pet(config.pet);
    this.sensorSystem = new WorldSensorSystem({ ...config.perception });
    this.attentionSystem = new AttentionSystem({ gain: config.world.attentionGain, cap: config.world.attentionCap, topDownGain: 0.3, persistence: 0.08, soundWeight: 1.2, minScore: 0.05 });
    this.resolver = new TargetResolver(this);
    this.navigation = new PetNavigationSystem(this);
    this.ambient = new AmbientEventDirector(config.ambientRng ?? defaultRng, { ...config.ambient });
    this.reset();
  }

  private get rng(): Rng {
    return this.config.rng;
  }

  reset(): void {
    const w = this.config.world;
    this.pet.reset();
    this._nextId = 1;
    this.objects = [];
    this.location = 'room';
    this.stash = {};
    this.doors = {};
    this.sounds = [];
    this.furnish('room');
    // la pelota de siempre
    this.addObject({ type: 'toy', kind: 'ball', x: 0.6, y: 0.75, interest: 0.3, pickable: true });

    const home = w.playerHome;
    this.player = { present: false, x: home.x, y: home.y, tx: home.x, ty: home.y, speed: 0, touchTicks: 0, wantsTouch: false, calling: 0, returnHome: false, returned: 0, lastSeenAt: 0 };
    this.lightOn = false; // la lámpara empieza apagada: de día hay luz natural
    this.recentActivity = 0;
    this.tick = 0;
    this.events = [];
    this.focusObjectId = null;
    this.exploreTarget = null;
    this.exploreGoal = null;
    this.env = initialEnvironment('room');
    this.activityBump = 0;
    this.percepts = [];
    this.heard = [];
    this.attentionTarget = null;
    this.attentionSystem.reset();
    this.firstVisit = null;
  }

  // v9: el cuerpo de la mascota (radio físico en metros; lo escala el crecimiento)
  bodyScale = 1;
  get bodyRadius(): number { return PET_BODY_RADIUS * this.bodyScale; }

  // Un punto libre de muebles/árboles (los objetos no pueden quedar dentro del sofá)
  freePoint(p: Point, radius = OBJECT_RADIUS): Point {
    return resolveCollision(this.location, p, radius).point;
  }

  private furnish(loc: LocationId): void {
    for (const f of LOCATIONS[loc].furniture) {
      const def = ITEMS[f.kind];
      const at = resolveCollision(loc, f.at, OBJECT_RADIUS).point;
      this.addObject({
        type: def.type, kind: f.kind, x: at.x, y: at.y, fixed: f.fixed,
        amount: f.kind === 'bowl' ? this.config.world.initialFood : f.kind === 'water' ? this.config.world.initialWater : 0,
        interest: def.type === 'hideout' ? 0.1 : 0,
      });
    }
  }

  // ---------- Geometría del lugar actual ----------
  get def() {
    return LOCATIONS[this.location];
  }

  get scaleX(): number { return this.def.size.w; }
  get scaleY(): number { return this.def.size.h * 0.8; }

  get frame(): SpatialFrame {
    return { scaleX: this.scaleX, scaleY: this.scaleY, metersPerUnit: METERS_PER_UNIT, visualRange: this.def.sensoryProfile.visualRange };
  }

  // Milisegundos del mundo (sin reloj inyectado: a 3 ticks/s)
  get nowMs(): number {
    return this.clockMs > 0 ? this.clockMs : this.tick * 333;
  }

  // ---------- Tiempo y luz (v5) ----------
  setClock(ms: number): void {
    const info = clockInfo(ms);
    this.clockMs = ms;
    this.daylight = info.daylight;
    this.clockSignal = clockPopulation(info.timeSin, info.timeCos);
    this.env.timeOfDay = info.timeOfDay;
    if (this.player.present) this.player.lastSeenAt = ms;
  }

  // Luz real (0..1): dentro la del día o la lámpara (la mayor); fuera el cielo (menos nubes)
  get lightLevel(): number {
    return lightIn(this.def, this.daylight, this.lightOn, this.env.cloudCover);
  }

  // Compatibilidad: "el sonido" = el sonido fuerte más intenso ahora (para la escena y MOVE_AWAY)
  get sound(): { level: number; x: number; y: number } {
    let best: SoundStimulus | null = null;
    for (const s of this.sounds) if (s.loud && (!best || s.intensity > best.intensity)) best = s;
    return best ? { level: best.intensity, x: best.x, y: best.y } : { level: 0, x: 0.5, y: 0.5 };
  }

  // ---------- Zonas (contexto espacial, no conducta) ----------
  zoneCenter(z: ZoneKey): Point {
    const zone = this.def.zones.find((x) => x.sensor === z);
    if (!zone) return { x: -10, y: -10 };
    if (zone.followsKind) {
      const o = this.objects.find((x) => x.kind === zone.followsKind);
      if (o) return o;
    }
    return zone.center;
  }

  zoneValue(z: ZoneKey, p: Point = this.pet): number {
    let v = 0;
    for (const zone of this.def.zones) {
      if (zone.sensor !== z) continue;
      const c = zone.followsKind ? this.objects.find((x) => x.kind === zone.followsKind) ?? zone.center : zone.center;
      v = Math.max(v, clamp01(1 - this.distanceRaw(p, c) / zone.radius));
    }
    return v;
  }

  // Zona funcional (para contexto de experiencias y hábitos), o null
  currentZone(p: Point = this.pet): ZoneKey | null {
    let best: ZoneKey | null = null, v = 0.25;
    for (const z of ['bed', 'food', 'play', 'window'] as const) {
      const x = this.zoneValue(z, p);
      if (x > v) { v = x; best = z; }
    }
    return best;
  }

  // Zona semántica del lugar (BED_ZONE, LAWN, POND...)
  zoneAt(p: Point = this.pet): string | null {
    let best: string | null = null, v = 0.25;
    for (const zone of this.def.zones) {
      const c = zone.followsKind ? this.objects.find((x) => x.kind === zone.followsKind) ?? zone.center : zone.center;
      const x = clamp01(1 - this.distanceRaw(p, c) / zone.radius);
      if (x > v) { v = x; best = zone.key; }
    }
    return best;
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
      state: 'stationary',
      age: 0,
      content: null,
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
    return this.objects.filter((o) => affords(o.kind, 'canEat') && o.amount > 0);
  }

  // Distancia en unidades de habitación (la ubicación tiene su tamaño)
  distance(a: Point, b: Point): number {
    return Math.hypot((a.x - b.x) * this.scaleX, (a.y - b.y) * this.scaleY);
  }

  // Normalizada (zonas: radio relativo al lugar)
  distanceRaw(a: Point, b: Point): number {
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

  // ---------- Ubicaciones ----------
  otherLocations(): [LocationId, WorldObject[]][] {
    return (Object.entries(this.stash) as [LocationId, WorldObject[]][]).filter(([id]) => id !== this.location);
  }

  objectsIn(loc: LocationId): readonly WorldObject[] {
    return loc === this.location ? this.objects : this.stash[loc] ?? [];
  }

  isDoorOpen(exit: ExitDef, from: LocationId = this.location): boolean {
    return this.doors[doorKey(exit, from)] ?? exit.defaultOpen;
  }

  // ¿Puede la mascota cruzar ESTA salida sola ahora? (abierta · autónoma · su cuerpo puede estar allí)
  canCross(exitId: string): boolean {
    const exit = this.def.interactionPoints.exits.find((e) => e.id === exitId);
    if (!exit || !exit.autonomous) return false;
    const to = LOCATIONS[exit.to];
    return to.available && this.isDoorOpen(exit) && this.capability(exit.to);
  }

  canReach(loc: LocationId): boolean {
    return routeCrossable(this, this.location, loc);
  }

  // Jugador: abrir/cerrar la puerta del jardín (cambia el MUNDO; salir o no lo decide la mascota)
  setDoor(a: LocationId, b: LocationId, open: boolean): boolean {
    const exit = exitBetween(a, b);
    if (!exit) return false;
    const key = doorKey(exit, a);
    if ((this.doors[key] ?? exit.defaultOpen) === open) return true;
    // No se cierra con la mascota fuera de casa: no puede quedarse sin poder volver
    if (!open && this.location !== 'room' && LOCATIONS[this.location].group === 'home' && (a === this.location || b === this.location)) return false;
    this.doors[key] = open;
    this._event(open ? 'DOOR_OPENED' : 'DOOR_CLOSED', 'interestingObjectVisible', key);
    // La puerta hace ruido al abrirse
    if (a === this.location || b === this.location) {
      const e = exitBetween(this.location, a === this.location ? b : a);
      if (e) this.emitSound({ kind: 'creak', intensity: 0.3, x: e.at.x, y: e.at.y, loud: false });
    }
    return true;
  }

  /*
   * Cambio de ubicación (transición INTENCIONAL entre escenas): la mascota cruzó una
   * salida o el jugador salió de paseo con ella. Los objetos del lugar que deja se
   * guardan tal cual; lo que lleva en la boca va con ella.
   */
  changeLocation(to: LocationId, arriveAt?: Point, reason: 'walked' | 'outing' | 'dev' = 'walked'): boolean {
    if (to === this.location || !LOCATIONS[to].available) return false;
    const carried = this.getObject(this.pet.carrying);
    const leaving = this.objects.filter((o) => o !== carried && o.tag === null);
    this.stash[this.location] = leaving.map((o) => ({ ...o, vx: 0, vy: 0, moved: false, state: o.state === 'rolling' ? 'stationary' : o.state }));
    const from = this.location;
    this.location = to;
    const stored = this.stash[to];
    delete this.stash[to];
    this.objects = stored ? stored.map((o) => ({ ...o })) : [];
    if (!stored) this.furnish(to);
    if (carried) this.objects.push(carried);
    const exit = exitBetween(from, to);
    const at = resolveCollision(to, arriveAt ?? exit?.arriveAt ?? LOCATIONS[to].spawnPoints.pet, this.bodyRadius).point;
    this.pet.x = at.x; this.pet.y = at.y; this.pet.vx = this.pet.vy = 0;
    // Entra mirando hacia dentro del lugar
    this.pet.orientation = Math.atan2((0.5 - at.y) * this.scaleY, (0.5 - at.x) * this.scaleX);
    this.pet.heading = null;
    if (carried) { carried.x = at.x; carried.y = at.y; }
    this.sounds = [];
    this.exploreTarget = null;
    this.exploreGoal = null;
    this.focusObjectId = null;
    this.attentionSystem.reset();
    this.env.locationId = to;
    const first = this.knowledge.enterLocation(to, this.nowMs);
    if (first) this.firstVisit = { location: to, tick: this.tick };
    this._event('LOCATION_CHANGED', 'unfamiliarPlace', `${from}>${to}:${reason}`);
    return true;
  }

  // ---------- Sonidos (estímulos, no audio) ----------
  emitSound(s: { kind: SoundKind; intensity: number; x: number; y: number; loud?: boolean; sourceObjectId?: number | null; origin?: LocationId | null }): SoundStimulus {
    const snd: SoundStimulus = { id: this._nextSoundId++, kind: s.kind, intensity: clamp01(s.intensity), x: s.x, y: s.y, loud: !!s.loud, age: 0, sourceObjectId: s.sourceObjectId ?? null, origin: s.origin ?? null };
    this.sounds.push(snd);
    if (this.sounds.length > 12) this.sounds.shift();
    this._event(snd.loud ? 'LOUD_SOUND' : 'SOUND_OCCURRED', snd.loud ? 'loudSound' : 'soundHeard', snd.kind);
    return snd;
  }

  // ---------- Física: el tiempo pasa ----------
  update(timeScale = 1): void {
    const w = this.config.world, pc = this.config.pet, pet = this.pet, pl = this.player;
    this.tick++;
    pet.passTime(timeScale);

    // Microeventos ambientales (antes de la física: una hoja cae y luego se posa)
    this.microEvents = this.ambient.update({
      tick: this.tick, location: this.location, daylight: this.daylight, fear: pet.fear, asleep: pet.asleep, bounds: this.def.navigationBounds,
    });
    for (const ev of this.microEvents) this.applyMicroEvent(ev);
    this.throughOpenDoors();

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
    pl.returned *= RETURN_DECAY;
    if (pl.returned < 0.02) pl.returned = 0;
    // Actividad reciente: media móvil del movimiento (el cuerpo "recuerda" el esfuerzo)
    this.recentActivity += (clamp01(pet.speed / 1.5) - this.recentActivity) * ACTIVITY_EMA * timeScale;

    // Sonidos: el sobresalto depende de lo fuerte que LLEGA (no de lo fuerte que sonó en la fuente)
    let startle = 0;
    for (const s of this.sounds) if (s.loud) startle = Math.max(startle, s.intensity * soundAttenuation(this.distance(pet, s), this.config.perception.hearingReference));
    pet.change('fear', startle * pc.soundFear);
    for (const s of this.sounds) { s.age++; s.intensity *= w.soundDecay; }
    this.sounds = this.sounds.filter((s) => s.intensity >= SOUND_MIN);

    this.physics();

    for (const o of this.objects) {
      o.novelty *= Math.pow(w.noveltyDecay, timeScale);
      if (o.novelty < 0.01) o.novelty = 0;
    }
    // Lo nuevo (según SU memoria) y el aburrimiento despiertan la curiosidad (dinámica, no decisión)
    pet.change('curiosity', (this.lastPerceivedNovelty * pc.noveltyCuriosity + pet.boredom * pc.boredomCuriosity) * timeScale);
    pet.change('fear', pc.darknessFear * (1 - this.lightLevel) * timeScale);

    // Las galletitas se acaban; las entidades ambientales se van (la hoja se la lleva el viento, la mariposa se va)
    this.objects = this.objects.filter((o) => {
      if (o.type === 'treat' && o.amount <= 0) return false;
      const life = ITEMS[o.kind].lifetimeTicks;
      if (life && o.age > life && o.id !== pet.carrying) { this._event('OBJECT_REMOVED', 'interestingObjectVisible', o.kind); return false; }
      return true;
    });

    // Lo que lleva en la boca va con ella
    const carried = this.getObject(pet.carrying);
    if (carried) { carried.x = pet.x; carried.y = pet.y; carried.vx = carried.vy = 0; }
    else pet.carrying = null;

    // Ambiente
    this.activityBump *= BUMP_DECAY;
    this.env.wind *= 0.9;
    this.env.cloudCover *= 0.995;
    if (this.env.cloudCover < 0.02) this.env.cloudCover = 0;
    this.updateEnvironment();
    this.knowledge.stay(this.location, this.zoneAt(), this.nowMs, timeScale);
  }

  private updateEnvironment(): void {
    const env = this.env, heardNoise = this.heard.reduce((m, h) => Math.max(m, h.heard), 0);
    env.locationId = this.location;
    env.light = this.lightLevel;
    env.ambientActivity = ambientActivityIn(this.def, this.daylight, this.activityBump, env.wind);
    env.noiseLevel = clamp01(this.def.sensoryProfile.baseNoise * (0.4 + 0.6 * this.daylight) + heardNoise);
    env.novelty = 1 - this.knowledge.locationFamiliarity(this.location);
    env.weatherState = env.cloudCover > 0.3 ? 'cloudy' : env.wind > 0.3 ? 'breezy' : env.weatherState === 'cloudy' || env.weatherState === 'breezy' ? 'clear' : env.weatherState;
  }

  // Física simplificada: impulso → velocidad → rozamiento (del objeto × suelo) → parada; rebote con ruido
  private physics(): void {
    const w = this.config.world, pet = this.pet, b = this.def.navigationBounds, ground = this.def.sensoryProfile.groundFriction;
    for (const o of this.objects) {
      o.age++;
      if (o.kind === 'butterfly') { this.flutter(o); continue; }
      if (!o.vx && !o.vy) { if (o.state === 'rolling') o.state = 'stationary'; continue; }
      if (o.id === pet.carrying) { o.vx = o.vy = 0; continue; }
      let nx = o.x + o.vx / this.scaleX, ny = o.y + o.vy / (this.scaleY / 0.8);
      const speed = Math.hypot(o.vx, o.vy);
      let bounced = false;
      if (nx < b.minX || nx > b.maxX) { o.vx = -o.vx; nx = Math.max(b.minX, Math.min(b.maxX, nx)); bounced = true; }
      if (ny < b.minY + 0.02 || ny > b.maxY - 0.02) { o.vy = -o.vy; ny = Math.max(b.minY + 0.02, Math.min(b.maxY - 0.02, ny)); bounced = true; }
      // v9: los objetos rebotan en los muebles y árboles (no atraviesan el sofá)
      const solid = resolveCollision(this.location, { x: nx, y: ny }, OBJECT_RADIUS);
      if (solid.hit) { nx = solid.point.x; ny = solid.point.y; o.vx = -o.vx * 0.6; o.vy = -o.vy * 0.6; bounced = true; }
      o.x = nx; o.y = ny;
      const f = (ITEMS[o.kind].friction ?? w.throwFriction) * (o.vx || o.vy ? ground : 1);
      o.vx *= Math.min(0.97, f); o.vy *= Math.min(0.97, f);
      o.state = 'rolling';
      if (Math.hypot(o.vx, o.vy) < 0.002) { o.vx = o.vy = 0; o.state = 'stationary'; }
      o.novelty = Math.max(o.novelty, 0.35); // algo que se mueve llama la atención
      if (bounced && speed > 0.015) this.emitSound({ kind: 'thud', intensity: ITEMS[o.kind].sensory.sound * Math.min(1, speed / 0.05), x: o.x, y: o.y, sourceObjectId: o.id });
    }
  }

  // La mariposa: vuelo errático con el rng del ambiente (no gasta el de la simulación)
  private flutter(o: WorldObject): void {
    const r = () => this.ambient.random() - 0.5;
    o.vx = Math.max(-0.02, Math.min(0.02, o.vx * 0.8 + r() * 0.012));
    o.vy = Math.max(-0.02, Math.min(0.02, o.vy * 0.8 + r() * 0.012));
    const b = this.def.navigationBounds;
    o.x = Math.max(b.minX, Math.min(b.maxX, o.x + o.vx));
    o.y = Math.max(b.minY + 0.05, Math.min(b.maxY - 0.05, o.y + o.vy));
    o.state = 'drifting';
  }

  // Por una puerta abierta se cuela lo de fuera: algún pájaro, hojas, la brisa (física, no una invitación)
  private throughOpenDoors(): void {
    if (this.def.sensoryProfile.shelter < 0.5) return;
    for (const e of this.def.interactionPoints.exits) {
      if (!this.isDoorOpen(e) || LOCATIONS[e.to].sensoryProfile.shelter >= 0.5) continue;
      const outside = LOCATIONS[e.to].sensoryProfile;
      if (this.ambient.random() < (outside.baseActivity * (0.3 + 0.7 * this.daylight)) / 400) {
        this.emitSound({ kind: this.ambient.random() < 0.6 ? 'bird' : 'rustle', intensity: 0.3, x: e.at.x, y: e.at.y, origin: e.to });
        this.activityBump = Math.min(0.6, this.activityBump + 0.05);
      }
    }
  }

  private applyMicroEvent(ev: MicroEventRecord): void {
    const bump = (v: number) => { this.activityBump = Math.min(0.6, this.activityBump + v); };
    switch (ev.type) {
      case 'LEAF_FELL': {
        const leaf = this.spawnAmbient('leaf', ev);
        this.emitSound({ kind: 'rustle', intensity: 0.2, x: ev.x, y: ev.y, sourceObjectId: leaf.id });
        this._event('LEAF_FELL', 'objectMoving', 'hoja');
        bump(0.1);
        break;
      }
      case 'FEATHER_FELL': {
        this.spawnAmbient('feather', ev);
        this._event('FEATHER_FELL', 'objectMoving', 'pluma');
        bump(0.05);
        break;
      }
      case 'BUTTERFLY': {
        if (this.objects.some((o) => o.kind === 'butterfly')) break; // una a la vez
        const bf = this.spawnAmbient('butterfly', ev);
        bf.vx = 0.01;
        this._event('BUTTERFLY_APPEARED', 'objectMoving', 'mariposa');
        bump(0.15);
        break;
      }
      case 'BIRD_SONG': {
        const b = this.def.navigationBounds;
        this.emitSound({ kind: 'bird', intensity: 0.25, x: ev.x, y: this.location === 'room' ? 0.02 : b.minY + 0.02 });
        bump(0.08);
        break;
      }
      case 'SOUND_OUTSIDE': {
        // Por la ventana (dentro) o a lo lejos (fuera)
        const at = this.def.interactionPoints.window ?? { x: ev.x, y: 0.02 };
        this.emitSound({ kind: 'outside', intensity: this.location === 'room' ? 0.3 : 0.4, x: at.x, y: at.y });
        bump(0.1);
        break;
      }
      case 'WIND_GUST': {
        if (this.def.sensoryProfile.shelter >= 0.5) break;
        this.env.wind = 1;
        this.emitSound({ kind: 'wind', intensity: 0.2, x: ev.x, y: ev.y });
        // El viento mueve lo ligero que esté suelto (física, no decisión)
        for (const o of this.objects) {
          if (o.fixed || o.id === this.pet.carrying || o.kind === 'butterfly') continue;
          const light = o.kind === 'leaf' || o.kind === 'feather' ? 0.02 : affords(o.kind, 'canRoll') ? 0.008 : 0;
          if (light) { o.vx += light; o.vy += (this.ambient.random() - 0.5) * light; }
        }
        this._event('WIND_GUST', 'ambientActivity', 'viento');
        bump(0.12);
        break;
      }
      case 'CLOUD': {
        if (this.def.sensoryProfile.shelter >= 0.5) break;
        this.env.cloudCover = 1;
        this._event('CLOUD_PASSED', 'lightLevel', 'nube');
        this._event('LIGHT_CHANGED', 'lightLevel', 'nube');
        break;
      }
      case 'CREAK': {
        const box = this.objects.find((o) => o.kind === 'mysteryBox');
        const at = box ?? ev;
        this.emitSound({ kind: 'creak', intensity: 0.35, x: at.x, y: at.y, sourceObjectId: box?.id ?? null });
        break;
      }
    }
  }

  private spawnAmbient(kind: ItemKind, at: Point): WorldObject {
    // Sin amontonar: como mucho 4 hojas/plumas sueltas (la más vieja se la lleva el viento)
    const loose = this.objects.filter((o) => o.kind === kind && o.id !== this.pet.carrying);
    if (loose.length >= 4) this.removeObject(loose[0].id);
    const def = ITEMS[kind];
    const o = this.addObject({ type: def.type, kind, x: at.x, y: at.y, interest: def.interest, pickable: def.pickable, novelty: 0.5, state: 'drifting' });
    this._event('OBJECT_APPEARED', 'newObjectDetected', kind);
    return o;
  }

  // ---------- Percepción: mundo → valores 0..1 (todavía sin neuronas) ----------
  private perceiveInput(): PerceiveInput {
    const pet = this.pet, k = this.knowledge, now = this.nowMs;
    return {
      pet, orientation: pet.orientation, frame: this.frame, light: this.lightLevel,
      eyes: pet.asleep ? SLEEP_SENSING.eyes : 1, body: pet.asleep ? SLEEP_SENSING.body : 1,
      distance: (a, b) => this.distance(a, b), novelty: (kind) => k.novelty(kind, now), familiarity: (kind) => k.familiarity(kind),
      soundNovelty: (kind) => k.soundNovelty(kind),
    };
  }

  // Percepción detallada de un objeto (Sensor Debug), sin efectos
  perceptFor(id: number): ObjectPercept | null {
    const o = this.getObject(id);
    return o ? this.sensorSystem.perceiveObject(o, this.perceiveInput()) : null;
  }

  perceive(): Perception {
    const pet = this.pet, pl = this.player, w = this.config.world;
    const light = this.lightLevel;
    const input = this.perceiveInput();
    const now = this.nowMs;
    const eyes = input.eyes, body = input.body;
    const visibility = 0.45 + 0.55 * light;

    // ---- Vista (FOV + distancia + luz) y memoria de exposición ----
    this.percepts = this.objects.filter((o) => o.id !== pet.carrying).map((o) => this.sensorSystem.perceiveObject(o, input));
    let noveltySignal = 0, moving = 0;
    for (const p of this.percepts) {
      if (!p.perceived) continue;
      this.knowledge.see(p.kind, p.signal, now);
      if (p.distance < APPROACH_RANGE) this.knowledge.advance(p.kind, 'APPROACHED', now);
      const o = this.getObject(p.id);
      if (o && !o.fixed) noveltySignal = Math.max(noveltySignal, p.signal * Math.max(p.transient, p.novelty));
      moving = Math.max(moving, p.signal * p.movement);
    }
    this.lastPerceivedNovelty = noveltySignal;

    // ---- Oído (fuera del FOV también) ----
    this.heard = this.sounds.map((s) => this.sensorSystem.hear(s, input));
    let loud = 0, soft = 0, soundNov = 0;
    for (const h of this.heard) {
      if (h.age === 0 && h.heard > 0.03) this.knowledge.hear(h.kind, now);
      if (h.loud) loud = Math.max(loud, h.heard);
      else if (h.heard > soft) { soft = h.heard; soundNov = h.heard * h.novelty; }
    }

    // ---- Atención: sobre qué estímulo se actúa (fuerza percibida + atención de la red) ----
    this.attentionTarget = this.attentionSystem.update(this.percepts, this.heard, this.objects, this.attention, visibility, this.topDown);
    const t = this.attentionTarget;
    this.focusObjectId = t ? (t.type === 'object' ? t.id : t.sourceObjectId && this.getObject(t.sourceObjectId) ? t.sourceObjectId : null) : null;
    let salience = 0;
    for (const p of this.percepts) {
      const o = this.getObject(p.id);
      if (p.perceived && o && !(o.fixed && o.type !== 'hideout')) salience = Math.max(salience, p.salience);
    }
    const focusPercept = this.focusObjectId !== null ? this.percepts.find((p) => p.id === this.focusObjectId) : undefined;

    // ---- Recursos: su plato/cama/escondite los CONOCE aunque no los vea; lo nuevo solo si lo percibe ----
    const known = (o: WorldObject | null): number => {
      if (!o) return 0;
      const p = this.percepts.find((x) => x.id === o.id);
      const seen = p?.perceived ? p.signal : 0;
      const remembered = this.knowledge.familiarity(o.kind) * (0.4 + 0.6 * this.proximity(pet, o));
      return clamp01(Math.max(seen, remembered));
    };
    const food = this.nearest(this.foodSources());
    const water = this.firstOfType('water');
    const toyPercepts = this.percepts.filter((p) => p.perceived && ITEMS[p.kind].type === 'toy');
    const toySignal = toyPercepts.reduce((m, p) => Math.max(m, p.signal), 0);

    const perception: Perception = {
      hunger: pet.hunger * body,
      thirst: pet.thirst * body,
      fatigue: pet.fatigue,
      boredom: pet.boredom * body,
      affectionNeed: (1 - pet.affection) * body,
      energy: pet.energy,
      fear: pet.fear,
      curiosity: pet.curiosity * body,
      playerNear: pl.present ? clamp01(1 - this.distance(pet, pl) / w.nearRange) * eyes : 0,
      playerTouching: pl.touchTicks > 0 ? 1 : 0,
      playerMoving: pl.present ? clamp01(pl.speed) * eyes : 0,
      foodAvailable: known(food) * eyes,
      waterAvailable: water && water.amount > 0 ? known(water) * eyes : 0,
      bedAvailable: known(this.firstOfType('bed')),
      toyAvailable: toySignal,
      interestingObjectVisible: clamp01(salience),
      hidingPlaceAvailable: known(this.firstOfType('hideout')) * eyes,
      darkness: 1 - light,
      loudSound: clamp01(loud),
      newObjectDetected: clamp01(noveltySignal * (0.6 + 0.4 * light)),
      playerCalling: pl.present ? clamp01(pl.calling) : 0,
      ...this.objectPerception(),
      ...this.contextPerception(light),
      // v7: mundo vivo
      objectMoving: clamp01(moving),
      soundHeard: clamp01(soft),
      soundNovelty: clamp01(soundNov),
      familiarObject: focusPercept && focusPercept.perceived ? clamp01(focusPercept.familiarity * focusPercept.signal) : 0,
      unfamiliarPlace: clamp01(this.env.novelty) * (pet.asleep ? SLEEP_SENSING.body : 1),
      openSpace: this.def.sensoryProfile.openness * eyes,
      ambientActivity: clamp01(this.env.ambientActivity) * body,
    };
    if (pet.asleep) perception.playerReturned *= SLEEP_SENSING.eyes;
    return perception;
  }

  // v5: hora (código de población), luz, lugar, "acabas de volver", actividad reciente
  private contextPerception(light: number): Record<(typeof CLOCK_SENSORS)[number] | (typeof ZONE_SENSORS)[number] | 'lightLevel' | 'playerReturned' | 'recentActivity', number> {
    const [time00, time04, time08, time12, time16, time20] = this.clockSignal;
    return {
      time00, time04, time08, time12, time16, time20,
      lightLevel: light,
      zoneBed: this.zoneValue('bed'), zoneFood: this.zoneValue('food'), zonePlay: this.zoneValue('play'), zoneWindow: this.zoneValue('window'),
      playerReturned: this.player.present ? clamp01(this.player.returned) : 0,
      recentActivity: clamp01(this.recentActivity),
    };
  }

  // Estímulos identificables: cuánto PERCIBE cada objeto concreto (1 si lo lleva en la boca). Sin omnisciencia.
  private objectPerception(): Record<(typeof OBJECT_CHANNELS)[number]['sensor'], number> {
    const pet = this.pet;
    const out = {} as Record<(typeof OBJECT_CHANNELS)[number]['sensor'], number>;
    for (const ch of OBJECT_CHANNELS) {
      const list = this.objects.filter((o) => o.kind === ch.kind);
      if (list.some((o) => o.id === pet.carrying)) { out[ch.sensor] = 1; continue; }
      let best = 0;
      for (const o of list) {
        const p = this.percepts.find((x) => x.id === o.id);
        if (p) best = Math.max(best, p.signal);
      }
      out[ch.sensor] = clamp01(best);
    }
    return out;
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
      pl.returned = 1;
      pl.lastSeenAt = this.clockMs;
      this._event('PLAYER_ENTERED', 'playerReturned');
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
    if (!o || o.fixed || !ITEMS[o.kind].movable || o.id === this.pet.carrying) return;
    const free = this.freePoint({ x: Math.max(0.03, Math.min(0.97, x)), y: Math.max(0.02, Math.min(0.98, y)) });
    o.x = free.x; o.y = free.y;
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
    if (!o || o.fixed || !ITEMS[o.kind].movable || o.id === this.pet.carrying) return false;
    const max = this.config.world.maxThrowSpeed;
    const m = Math.hypot(vx, vy);
    const k = m > max ? max / m : 1;
    o.vx = vx * k; o.vy = vy * k;
    o.moved = false;
    o.state = 'rolling';
    o.novelty = Math.max(o.novelty, 0.6);
    this._event('OBJECT_THROWN', 'toyAvailable', o.label);
    return true;
  }

  // Impulso físico (la mascota empuja la pelota, el viento, herramientas)
  push(id: number, ix: number, iy: number): void {
    const o = this.getObject(id);
    if (!o || o.fixed || !ITEMS[o.kind].movable || o.id === this.pet.carrying) return;
    o.vx += ix; o.vy += iy;
    o.state = 'rolling';
  }

  addFood(): void {
    const f = this.firstOfType('food');
    if (!f) return;
    f.amount = Math.min(this.config.world.maxFood, f.amount + 1);
    f.state = 'available';
    this._event('FOOD_PLACED', 'foodAvailable');
  }

  addWater(): void {
    const w = this.firstOfType('water');
    if (!w) return;
    w.amount = 1;
    w.state = 'available';
    this._event('WATER_PLACED', 'waterAvailable');
  }

  // Una galletita delante del jugador: comida pequeña, cerca de ti
  offerTreat(): WorldObject {
    if (!this.player.present) this.setPlayerPresent(true);
    this.objects = this.objects.filter((o) => o.type !== 'treat');
    const pl = this.player;
    const treat = this.addObject({
      type: 'treat', kind: 'treat', x: Math.max(0.1, Math.min(0.9, pl.x)), y: Math.max(0.2, Math.min(0.92, pl.y - 0.1)),
      amount: this.config.world.treatAmount, interest: ITEMS.treat.interest, novelty: 0.4, state: 'available',
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

  /*
   * Colocar un objeto concreto (mochila, minijuegos, herramientas). Todos producen la
   * MISMA señal transitoria de "apareció algo" (0.5): lo que lo hace nuevo o conocido
   * para la mascota es su memoria, no el tipo.
   */
  placeItem(kind: ItemKind, pos?: Point, tag: string | null = null): WorldObject {
    const def = ITEMS[kind];
    if (def.type === 'novel') this._limitNovel();
    const at = this.freePoint(pos ?? this._placeNear(this.player.present ? this.player : { x: 0.5, y: 0.6 }));
    const obj = this.addObject({
      type: def.type, kind, x: at.x, y: at.y, interest: def.interest, pickable: def.pickable, novelty: 0.5, tag,
      state: kind === 'mysteryBox' ? 'closed' : 'stationary',
    });
    if (kind === 'mysteryBox') obj.content = NOVEL_KINDS[Math.floor(this.rng() * NOVEL_KINDS.length)];
    this._event('OBJECT_APPEARED', 'newObjectDetected', def.emoji);
    if (def.type === 'novel') this._event('NEW_OBJECT', 'newObjectDetected', def.emoji);
    else this._event('TOY_PLACED', 'toyAvailable', def.emoji);
    return obj;
  }

  // Un objeto cae al suelo (herramienta: "algo cae detrás de Milo"): aparece y suena donde cae
  dropItem(kind: ItemKind, at: Point): WorldObject {
    const o = this.placeItem(kind, at);
    this.emitSound({ kind: 'thud', intensity: Math.max(0.25, ITEMS[kind].sensory.sound), x: at.x, y: at.y, sourceObjectId: o.id });
    return o;
  }

  addNovelObject(kind?: ItemKind): WorldObject {
    const k = kind ?? NOVEL_KINDS[Math.floor(this.rng() * NOVEL_KINDS.length)];
    const pos = { x: 0.25 + this.rng() * 0.6, y: 0.3 + this.rng() * 0.6 };
    return this.placeItem(k, pos);
  }

  /*
   * La caja se abre a base de investigarla de cerca (física, no decisión). Devuelve
   * el objeto que había dentro (se queda en el mundo) o null si no se abrió.
   */
  openBox(box: WorldObject): WorldObject | null {
    if (box.kind !== 'mysteryBox' || box.state !== 'closed') return null;
    box.state = 'open';
    box.novelty = Math.max(box.novelty, 0.4);
    const kind = box.content; // se conserva: "lo que había dentro" (el objeto ya está fuera)
    this.emitSound({ kind: 'boxOpen', intensity: 0.3, x: box.x, y: box.y, sourceObjectId: box.id });
    this._event('OBJECT_OPENED', 'newObjectDetected', kind ?? 'vacía');
    if (!kind) return null;
    const b = this.def.navigationBounds;
    return this.placeItem(kind, { x: Math.max(b.minX, Math.min(b.maxX, box.x + 0.06)), y: Math.max(b.minY + 0.05, Math.min(b.maxY - 0.02, box.y + 0.05)) });
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
    this.emitSound({ kind: 'noise', intensity: 1, x: src.x, y: src.y, loud: true });
  }

  toggleLight(): void {
    this.setLight(!this.lightOn);
  }

  setLight(on: boolean): void {
    if (this.lightOn === on) return;
    this.lightOn = on;
    this._event(on ? 'LIGHT_ON' : 'LIGHT_OFF', 'darkness');
    this._event('LIGHT_CHANGED', 'lightLevel', on ? 'lámpara' : 'oscuridad');
  }

  setWeather(state: WeatherState): void {
    this.env.weatherState = state;
    this.env.cloudCover = state === 'cloudy' ? 1 : 0;
    this.env.wind = state === 'breezy' ? 1 : 0;
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
    const clean = (list: readonly WorldObject[]) => list.map((o) => ({ ...o }));
    const stash: Partial<Record<LocationId, WorldObject[]>> = {};
    for (const [id, list] of this.otherLocations()) stash[id] = clean(list);
    return {
      objects: clean(this.objects), lightOn: this.lightOn, nextId: this._nextId, tick: this.tick,
      location: this.location, stash, doors: { ...this.doors },
      environment: { weatherState: this.env.weatherState, cloudCover: this.env.cloudCover },
    };
  }

  importState(s: WorldState): void {
    const valid = (list: unknown): WorldObject[] => (Array.isArray(list) ? list : [])
      .filter((o): o is WorldObject => !!o && isItemKind(o.kind) && Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.id))
      // Los objetos de un minijuego interrumpido no sobreviven al cierre
      .filter((o) => o.tag === null || o.tag === undefined)
      .map((o) => {
        const def = ITEMS[o.kind];
        const state: ObjectState = o.state ?? (o.kind === 'mysteryBox' ? 'closed' : 'stationary');
        return { ...o, tag: null, vx: 0, vy: 0, moved: false, age: Number.isFinite(o.age) ? o.age : 0, content: isItemKind(o.content) ? o.content : null, type: def.type, state: state === 'rolling' ? 'stationary' : state };
      });
    const loc = isLocationId(s.location) && LOCATIONS[s.location].available ? s.location : 'room';
    this.location = loc;
    // v9: si un mueble nuevo del escenario ocupa el sitio de un objeto guardado, el objeto se aparta
    this.objects = valid(s.objects).map((o) => ({ ...o, ...resolveCollision(loc, o, OBJECT_RADIUS).point }));
    this.stash = {};
    if (s.stash && typeof s.stash === 'object') {
      for (const [id, list] of Object.entries(s.stash)) if (isLocationId(id) && id !== loc) this.stash[id] = valid(list);
    }
    const all = [...this.objects, ...Object.values(this.stash).flat()];
    this._nextId = Math.max(s.nextId || 1, ...all.map((o) => o.id + 1));
    // El lugar actual siempre tiene sus muebles (la habitación: cama, plato, agua, tienda)
    for (const f of LOCATIONS[loc].furniture) {
      if (!this.objects.some((o) => o.kind === f.kind)) {
        const def = ITEMS[f.kind];
        this.addObject({ type: def.type, kind: f.kind, x: f.at.x, y: f.at.y, fixed: f.fixed, interest: def.type === 'hideout' ? 0.1 : 0 });
      }
    }
    if (loc !== 'room' && this.stash.room) {
      for (const f of LOCATIONS.room.furniture) {
        if (!this.stash.room.some((o) => o.kind === f.kind)) {
          const def = ITEMS[f.kind];
          this.stash.room.push({ id: this._nextId++, type: def.type, kind: f.kind, x: f.at.x, y: f.at.y, fixed: f.fixed, label: def.label, emoji: def.emoji, interest: 0, novelty: 0, pickable: false, amount: 0, vx: 0, vy: 0, moved: false, investigation: 0, tag: null, state: 'stationary', age: 0, content: null });
        }
      }
    }
    this.doors = {};
    if (s.doors && typeof s.doors === 'object') for (const [k, v] of Object.entries(s.doors)) if (typeof v === 'boolean') this.doors[k] = v;
    this.lightOn = s.lightOn === true;
    this.tick = Number.isFinite(s.tick) ? s.tick : 0;
    const env = s.environment;
    this.env = initialEnvironment(loc);
    if (env && (env.weatherState === 'clear' || env.weatherState === 'cloudy' || env.weatherState === 'breezy')) this.env.weatherState = env.weatherState;
    if (env && Number.isFinite(env.cloudCover)) this.env.cloudCover = clamp01(env.cloudCover);
    if (this.pet.carrying !== null && !this.getObject(this.pet.carrying)) this.pet.carrying = null;
  }
}

export type { TimeOfDay };

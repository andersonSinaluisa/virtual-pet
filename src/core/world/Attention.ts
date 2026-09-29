/*
 * ATTENTION + TARGET RESOLVER
 * ---------------------------
 * La red puede producir varias señales a la vez (algo rueda, apareció una
 * caja, llegaste tú). La mascota no puede actuar sobre todo a la vez:
 *
 *   AttentionSystem  elige SOBRE QUÉ ESTÍMULO se está actuando (un objeto
 *                    percibido o un sonido oído). Compiten:
 *                      · la fuerza del estímulo (saliencia percibida)
 *                      · la atención que la RED dedica a cada tipo de objeto
 *                        (EMA de spikes de sus neuronas de atención, plásticas)
 *                      · un poco de persistencia para no parpadear
 *                    No decide QUÉ HACER con él: eso lo expresó la SNN.
 *
 *   TargetResolver   traduce una intención ya decidida (JUGAR, RECOGER,
 *                    ESCONDERSE, EXPLORAR, ALEJARSE...) en un objetivo
 *                    concreto usando señales del cerebro y del contexto:
 *                    fuerza percibida, atención, distancia, novedad,
 *                    familiaridad. Nunca `objects[0]`.
 */
import type { Point } from '../simulation/Pet';
import type { World, WorldObject } from '../simulation/World';
import { affords, type Affordance, type ItemKind } from './Items';
import { LOCATIONS, type LocationId, locationRoute } from './Locations';
import type { HeardSound, ObjectPercept } from './Perception';

export type AttentionTarget =
  | { type: 'object'; id: number; kind: ItemKind; x: number; y: number; score: number }
  | { type: 'sound'; soundId: number; sourceObjectId: number | null; x: number; y: number; score: number };

export interface AttentionConfig {
  gain: number; // cuánto pesa la atención neuronal (antes world.attentionGain)
  topDownGain: number; // cuánto pesa la asociación aprendida con el motivo activo
  cap: number;
  persistence: number; // bonificación para el objetivo actual (histéresis)
  soundWeight: number;
  minScore: number;
}

export interface AttentionCandidate {
  label: string;
  score: number;
  target: AttentionTarget;
}

export class AttentionSystem {
  current: AttentionTarget | null = null;
  candidates: AttentionCandidate[] = []; // depuración: por qué ganó el que ganó

  constructor(public config: AttentionConfig) {}

  reset(): void {
    this.current = null;
    this.candidates = [];
  }

  update(percepts: readonly ObjectPercept[], heard: readonly HeardSound[], objects: readonly WorldObject[], neural: Partial<Record<ItemKind, number>>, visibility: number, topDown: Partial<Record<ItemKind, number>> = {}): AttentionTarget | null {
    const cfg = this.config;
    const cands: AttentionCandidate[] = [];
    for (const p of percepts) {
      if (!p.perceived) continue;
      const o = objects.find((x) => x.id === p.id);
      if (!o || (o.fixed && o.type !== 'hideout')) continue; // los muebles de siempre no "llaman"
      const neuralBias = (cfg.gain * Math.min(cfg.cap, neural[p.kind] ?? 0) + cfg.topDownGain * (topDown[p.kind] ?? 0)) * visibility * Math.min(1, p.signal * 2);
      const keep = this.current?.type === 'object' && this.current.id === p.id ? cfg.persistence : 0;
      const score = p.salience + neuralBias + keep;
      cands.push({ label: `${p.kind}#${p.id}`, score, target: { type: 'object', id: p.id, kind: p.kind, x: o.x, y: o.y, score } });
    }
    for (const h of heard) {
      if (h.heard < 0.06 || h.age > 6) continue;
      // Un sonido fresco (sobre todo nuevo) tira de la orientación; se desvanece en pocos ticks
      const score = cfg.soundWeight * h.heard * (0.5 + 0.5 * h.novelty) * Math.pow(0.7, h.age);
      cands.push({ label: `sonido:${h.kind}`, score, target: { type: 'sound', soundId: h.id, sourceObjectId: h.sourceObjectId, x: h.x, y: h.y, score } });
    }
    cands.sort((a, b) => b.score - a.score);
    this.candidates = cands.slice(0, 6);
    const best = cands[0];
    this.current = best && best.score > cfg.minScore ? best.target : null;
    return this.current;
  }
}

// ---------------- Target resolver ----------------

export interface ResolvedTarget {
  object: WorldObject | null; // en la ubicación actual
  location: LocationId; // dónde está (puede ser otra ubicación conocida)
  point: Point;
  remote: WorldObject | null; // objeto conocido en otra ubicación
}

const perceptOf = (world: World, id: number): ObjectPercept | undefined => world.percepts.find((p) => p.id === id);

export class TargetResolver {
  constructor(private readonly world: World) {}

  // ¿La mascota sabe que está ahí? (lo percibe ahora, o es un objeto familiar de este sitio: su plato, su cama)
  known(o: WorldObject): boolean {
    const p = perceptOf(this.world, o.id);
    if (p?.perceived) return true;
    return this.world.knowledge.familiarity(o.kind) > 0.3 && (o.fixed || this.world.knowledge.locationFamiliarity(this.world.location) > 0.3);
  }

  private score(o: WorldObject, attentionBonus = true): number {
    const w = this.world;
    const p = perceptOf(w, o.id);
    const signal = p?.signal ?? 0;
    const neural = w.attention[o.kind] ?? 0;
    const learned = w.topDown[o.kind] ?? 0; // asociación aprendida con el motivo activo
    const attended = attentionBonus && w.focusObjectId === o.id ? 0.6 : 0;
    const d = w.distance(w.pet, o);
    return signal + 0.15 * Math.min(4, neural) + 0.3 * learned + attended - 0.35 * d + 0.1 * (p?.novelty ?? 0);
  }

  // Objeto del lugar actual con una affordance (jugar, recoger, inspeccionar)
  best(aff: Affordance, filter: (o: WorldObject) => boolean = () => true): WorldObject | null {
    const w = this.world;
    let best: WorldObject | null = null, bestS = -Infinity;
    for (const o of w.objects) {
      if (!affords(o.kind, aff) || !filter(o) || !this.known(o)) continue;
      const s = this.score(o);
      if (s > bestS) { bestS = s; best = o; }
    }
    return best;
  }

  // Recursos (comida, agua, cama, escondite): el más cercano CONOCIDO; si aquí no hay, el conocido de otro lugar alcanzable
  resource(aff: Affordance, filter: (o: WorldObject) => boolean = () => true): ResolvedTarget | null {
    const w = this.world;
    let best: WorldObject | null = null, bestD = Infinity;
    for (const o of w.objects) {
      if (!affords(o.kind, aff) || !filter(o) || !this.known(o)) continue;
      const d = w.distance(w.pet, o) - (o.fixed ? 0.02 : 0);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (best) return { object: best, location: w.location, point: best, remote: null };
    // Otro lugar: lo recuerda (familiar) y hay camino que puede recorrer sola
    for (const [loc, list] of w.otherLocations()) {
      if (!w.canReach(loc)) continue;
      const o = list.find((x) => affords(x.kind, aff) && filter(x) && w.knowledge.familiarity(x.kind) > 0.3);
      if (o) return { object: null, location: loc, point: o, remote: o };
    }
    return null;
  }

  // Alejarse de: el sonido más fuerte reciente > lo que estaba mirando (si está cerca) > el jugador
  threat(): Point | null {
    const w = this.world;
    const loud = w.heard.filter((h) => h.age <= 4 && h.heard > 0.05).sort((a, b) => b.heard - a.heard)[0];
    if (loud) return loud;
    const focus = w.getObject(w.focusObjectId);
    if (focus && w.distance(w.pet, focus) < 0.6) return focus;
    return w.player.present ? w.player : null;
  }

  /*
   * Dónde explorar: puntos del lugar ponderados por lo POCO que conoce cada zona, y las
   * salidas que puede cruzar sola, ponderadas por lo desconocido que es el otro lado.
   * Elección estocástica (softmax) con el rng de la simulación: explorar no es ir siempre
   * al mismo sitio, pero lo nuevo tira más.
   */
  explore(rng: () => number): { point: Point; location: LocationId; exitId: string | null } {
    const w = this.world, loc = LOCATIONS[w.location], k = w.knowledge;
    const opts: { point: Point; location: LocationId; exitId: string | null; weight: number }[] = [];
    const b = loc.navigationBounds;
    for (let i = 0; i < 3; i++) {
      // v9: un punto al que el cuerpo pueda llegar (no dentro del sofá ni pegado a la chimenea)
      const p = w.freePoint({ x: b.minX + 0.06 + rng() * (b.maxX - b.minX - 0.12), y: b.minY + 0.08 + rng() * (b.maxY - b.minY - 0.16) }, w.bodyRadius + 0.08);
      const zone = w.zoneAt(p);
      const unknown = zone ? 1 - k.zoneFamiliarity(w.location, zone) : 0.5;
      opts.push({ point: p, location: w.location, exitId: null, weight: 1 + unknown });
    }
    for (const e of loc.interactionPoints.exits) {
      if (!w.canCross(e.id)) continue;
      const unknown = 1 - k.locationFamiliarity(e.to);
      // Lo desconocido del otro lado tira más; y si ya está junto a la puerta (o algo acaba de sonar allí), más a mano
      const near = Math.max(0, 1 - w.distance(w.pet, e.at) / 0.4);
      const heardThere = w.heard.some((h) => h.age <= 20 && Math.hypot(h.x - e.at.x, h.y - e.at.y) < 0.1) ? 1 : 0;
      opts.push({ point: e.at, location: e.to, exitId: e.id, weight: 0.4 + 1.6 * unknown + 1.5 * near + heardThere });
    }
    const total = opts.reduce((s, o) => s + o.weight, 0);
    let r = rng() * total;
    for (const o of opts) { r -= o.weight; if (r <= 0) return o; }
    return opts[0];
  }
}

// ¿Hay camino desde `from` hasta `to` que la mascota pueda recorrer sola ahora?
export function routeCrossable(world: World, from: LocationId, to: LocationId): boolean {
  const route = locationRoute(from, to);
  if (!route) return false;
  for (let i = 0; i < route.length - 1; i++) {
    const exit = LOCATIONS[route[i]].interactionPoints.exits.find((e) => e.to === route[i + 1]);
    if (!exit || !world.canCross(exit.id)) return false;
  }
  return true;
}

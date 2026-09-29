/*
 * ESCENARIOS 2.0 — no basta con que se vean bonitos: la mascota debe poder
 * vivir en ellos. Pipeline de assets, presupuesto, capa semántica, navegación
 * con colisión real (bebé y adulto), puntos de interacción, percepción,
 * día/noche sincronizado con el sensor y simulación offline.
 * Métricas publicadas en docs/environment-results.md.
 */
import { describe, expect, it } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stageConfig } from '@/core/growth/GrowthConfig';
import { seededRng } from '@/core/random';
import { GameSession } from '@/core/session/GameSession';
import { simulateAway } from '@/core/simulation/OfflineSimulation';
import { daylightAt, SimulationClock, TestClock } from '@/core/time/WorldClock';
import { ENVIRONMENT_LAYOUTS, insideSolid, locationSolids, PET_BODY_RADIUS, toMeters } from '@/core/world/EnvironmentLayouts';
import { lightIn } from '@/core/world/Environment';
import { LOCATIONS, type LocationId } from '@/core/world/Locations';

import { assetsFor, ENV_PACKS } from '../EnvironmentAssetInfo';
import { EnvironmentAssetManager } from '../EnvironmentAssetManager';
import { buildEnvironmentGLB } from '../EnvironmentBuilder';
import { lightingAt } from '../EnvironmentLighting';

const ROOT = join(__dirname, '../../../assets/environments');
const bytes = async (id: string) => { const b = readFileSync(join(ROOT, `${id}.glb`)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const PLACES: LocationId[] = ['room', 'garden', 'park'];
const T0 = new Date(2026, 0, 5, 10).getTime();

// Presupuesto móvil del ENTORNO (sin la mascota ni los objetos): docs/environment-results.md
const BUDGET = { meshes: 60, triangles: 12_000 };

function pet(loc: LocationId, stage: 'BABY' | 'ADULT', seed = 3) {
  const clock = new TestClock(T0);
  const s = GameSession.create({ name: 'Milo', species: 'dog' }, { rng: seededRng(seed), clock, lifeStage: stage });
  if (loc !== 'room') s.world.changeLocation(loc, undefined, 'dev');
  return { s, clock };
}

// Camina con la navegación y el movimiento reales (sin SNN: aquí se prueba el CUERPO en el escenario)
function walkTo(s: GameSession, target: { x: number; y: number }, maxTicks = 400): { reached: boolean; ticks: number; insideTicks: number; stuck: boolean } {
  const w = s.world, loc = w.location;
  let insideTicks = 0, still = 0;
  for (let t = 0; t < maxTicks; t++) {
    const step = w.navigation.plan({ location: loc, point: target, stop: 0.02 });
    const before = { x: w.pet.x, y: w.pet.y };
    s.sim.movement.apply(w, [{ kind: 'seek', target: step.waypoint, speed: 1, stop: step.stop }]);
    if (insideSolid(loc, w.pet, w.bodyRadius * 0.85)) insideTicks++;
    const moved = Math.hypot(w.pet.x - before.x, w.pet.y - before.y);
    still = moved < 1e-4 ? still + 1 : 0;
    const goal = w.freePoint(target, w.bodyRadius);
    if (w.distance(w.pet, goal) < 0.05) return { reached: true, ticks: t, insideTicks, stuck: false };
    if (still > 40) return { reached: false, ticks: t, insideTicks, stuck: true };
  }
  return { reached: false, ticks: maxTicks, insideTicks, stuck: false };
}

describe('Pipeline de assets (licencias y carga)', () => {
  it('cada asset usado existe, es GLB válido y su pack tiene licencia CC0 documentada', async () => {
    const m = new EnvironmentAssetManager(bytes);
    for (const loc of PLACES) {
      const ids = assetsFor(loc);
      expect(ids.length).toBeGreaterThan(5);
      await m.preload(ids);
      for (const id of ids) {
        expect(existsSync(join(ROOT, `${id}.glb`))).toBe(true);
        expect(m.get(id)).not.toBeNull();
      }
    }
    expect(m.errors).toEqual([]);
    for (const p of Object.values(ENV_PACKS)) expect(p.license).toBe('CC0 1.0');
    expect(existsSync(join(ROOT, 'home/LICENSE-quaternius-ultimate-house-interior.txt'))).toBe(true);
    expect(existsSync(join(ROOT, 'outdoor/LICENSE-kenney-nature-kit.txt'))).toBe(true);
  });

  it('escala coherente: el sofá mide lo que su huella física (1 unidad three ≈ 1 m)', async () => {
    const m = new EnvironmentAssetManager(bytes);
    const sofa = (await m.load('home/couch_medium')).size;
    const fp = ENVIRONMENT_LAYOUTS.room!.props.find((p) => p.id === 'sofa')!.footprint as { w: number; d: number };
    expect(Math.abs(sofa.x - fp.w)).toBeLessThan(0.1);
    expect(Math.abs(sofa.z - fp.d)).toBeLessThan(0.1);
    // Una puerta ~1.6 m, una silla de juguete; la mascota adulta mide ~1.2 u
    expect((await m.load('home/door')).size.y).toBeGreaterThan(1.4);
  });
});

describe('Construcción y presupuesto móvil', () => {
  it.each(PLACES)('%s: se construye con GLB, dentro de presupuesto y con vínculos semánticos', async (loc) => {
    const m = new EnvironmentAssetManager(bytes);
    for (const q of ['low', 'medium', 'high'] as const) {
      const env = await buildEnvironmentGLB(loc, m, q);
      expect(env.stats.source).toBe('glb');
      expect(env.stats.skipped).toEqual([]);
      expect(env.stats.meshes).toBeLessThanOrEqual(BUDGET.meshes);
      expect(env.stats.triangles).toBeLessThanOrEqual(BUDGET.triangles);
    }
    const env = await buildEnvironmentGLB(loc, m, 'medium');
    // Puertas/verja vinculadas a salidas REALES del dominio
    for (const d of env.doors) expect(LOCATIONS[loc].interactionPoints.exits.some((e) => e.id === d.exitId)).toBe(true);
    if (loc === 'room') {
      expect(env.windowMats.length).toBeGreaterThan(0); // la ventana muestra el cielo del WorldClock
      expect(env.lampShades.length).toBeGreaterThan(0); // la lámpara del mundo enciende la del escenario
      expect(env.doors.map((d) => d.exitId)).toEqual(['room>garden']);
    }
  });
});

describe('Capa semántica ↔ dominio', () => {
  it.each(PLACES)('%s: los muebles no tapan spawn, salidas, ventana, zonas ni objetos fijos', (loc) => {
    const def = LOCATIONS[loc], r = PET_BODY_RADIUS * 0.6;
    const keyPoints = [def.spawnPoints.pet, ...def.spawnPoints.objects, ...def.interactionPoints.exits.map((e) => e.at), ...(def.interactionPoints.window ? [def.interactionPoints.window] : []), ...def.furniture.map((f) => f.at), ...(ENVIRONMENT_LAYOUTS[loc]?.petSpawns ?? [])];
    for (const p of keyPoints) expect(insideSolid(loc, p, r)?.id ?? null).toBeNull();
    // La decoración NO es estímulo: solo los WorldObject llegan a la percepción
    const { s } = pet(loc, 'ADULT');
    s.tick();
    for (const pc of s.world.percepts) expect(s.world.getObject(pc.id)).not.toBeNull();
    expect(s.world.percepts.length).toBeLessThanOrEqual(s.world.objects.length);
  });
});

describe('Navegación y colisión (bebé y adulto)', () => {
  it.each(PLACES.flatMap((loc) => (['BABY', 'ADULT'] as const).map((st) => [loc, st] as const)))('%s · %s: 40 destinos al azar sin atravesar muebles ni quedarse atascado', (loc, stage) => {
    const { s } = pet(loc, stage, 5);
    const rng = seededRng(17);
    const b = LOCATIONS[loc].navigationBounds;
    expect(s.world.bodyRadius).toBeCloseTo(PET_BODY_RADIUS * stageConfig(stage).visual.scale * s.growth.state.modifiers.size, 5);
    let reached = 0, inside = 0, stuck = 0;
    for (let i = 0; i < 40; i++) {
      const target = { x: b.minX + 0.03 + rng() * (b.maxX - b.minX - 0.06), y: b.minY + 0.03 + rng() * (b.maxY - b.minY - 0.06) };
      const r = walkTo(s, target, loc === 'park' ? 900 : 500);
      if (r.reached) reached++;
      if (r.stuck) stuck++;
      inside += r.insideTicks;
      expect(s.world.pet.x).toBeGreaterThanOrEqual(b.minX - 1e-9);
      expect(s.world.pet.x).toBeLessThanOrEqual(b.maxX + 1e-9);
    }
    expect(inside).toBe(0); // nunca dentro de un mueble/árbol/roca
    expect(reached).toBeGreaterThanOrEqual(36); // ≥ 90 %
    expect(stuck).toBeLessThanOrEqual(2);
  });

  it('llega a los puntos de interacción de la casa (cama, comida, agua, ventana, puerta)', () => {
    for (const stage of ['BABY', 'ADULT'] as const) {
      const { s } = pet('room', stage, 7);
      const w = s.world;
      const targets = [
        ...w.objects.filter((o) => o.fixed).map((o) => ({ label: o.kind, p: { x: o.x, y: o.y } })),
        { label: 'window', p: LOCATIONS.room.interactionPoints.window! },
        { label: 'door', p: LOCATIONS.room.interactionPoints.exits[0].at },
      ];
      for (const t of targets) {
        w.pet.x = 0.5; w.pet.y = 0.7;
        const r = walkTo(s, t.p, 500);
        expect({ t: t.label, stage, reached: r.reached }).toEqual({ t: t.label, stage, reached: true });
        expect(w.distance(w.pet, t.p)).toBeLessThan(0.12); // a distancia de interacción
      }
    }
  });

  it('una pelota lanzada rebota en el sofá en vez de atravesarlo', () => {
    const { s } = pet('room', 'ADULT');
    const w = s.world;
    const ball = w.placeItem('ball', { x: 0.7, y: 0.76 });
    w.throwObject(ball.id, 0.08, 0);
    for (let i = 0; i < 60; i++) { s.tick(); expect(insideSolid('room', ball, 0.06)?.id ?? null).toBeNull(); }
  });
});

describe('Percepción en HOME 2.0', () => {
  it('la pelota: visible delante, no a la espalda; distancia y ángulo correctos; novedad la primera vez', () => {
    const { s } = pet('room', 'ADULT', 9);
    const w = s.world;
    w.pet.x = 0.5; w.pet.y = 0.5; w.pet.orientation = Math.PI / 2; // mirando hacia la cámara (+y)
    const cases = [
      { at: { x: 0.5, y: 0.75 }, visible: true, angle: 0 },
      { at: { x: 0.7, y: 0.6 }, visible: true, angle: null },
      { at: { x: 0.5, y: 0.2 }, visible: false, angle: 180 }, // detrás (fuera del campo visual)
    ];
    for (const c of cases) {
      for (const o of w.objects.filter((x) => !x.fixed)) w.removeObject(o.id);
      const ball = w.placeItem('ball', c.at);
      w.pet.x = 0.5; w.pet.y = 0.5; w.pet.orientation = Math.PI / 2;
      w.perceive();
      const p = w.percepts.find((x) => x.id === ball.id)!;
      expect(p.inFov).toBe(c.visible);
      const a = toMeters('room', w.pet), bm = toMeters('room', ball);
      expect(Math.abs(p.meters - Math.hypot(bm.x - a.x, bm.z - a.z))).toBeLessThan(0.6);
      if (c.angle !== null) expect(Math.abs(Math.abs(p.angle) - c.angle)).toBeLessThan(10);
      expect(p.novelty).toBeGreaterThan(0);
    }
  });
});

describe('Día / noche sincronizado con el sensor', () => {
  it.each(['HOME', 'GARDEN', 'PARK'] as const)('%s: 24 h sin saltos y el brillo visual acompaña a lightLevel', (profile) => {
    const loc: LocationId = profile === 'HOME' ? 'room' : profile === 'GARDEN' ? 'garden' : 'park';
    let prev: number | null = null, maxJump = 0;
    const pairs: [number, number][] = [];
    for (let m = 0; m < 1440; m++) {
      const d = daylightAt(m);
      const L = lightingAt(profile, d, false, 0);
      if (prev !== null) maxJump = Math.max(maxJump, Math.abs(L.brightness - prev));
      prev = L.brightness;
      pairs.push([lightIn(LOCATIONS[loc], d, false, 0), L.brightness]);
    }
    expect(maxJump).toBeLessThan(0.03); // sin cambios bruscos minuto a minuto
    // Correlación visual ↔ sensor
    const mx = pairs.reduce((a, p) => a + p[0], 0) / pairs.length, my = pairs.reduce((a, p) => a + p[1], 0) / pairs.length;
    const cov = pairs.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
    const vx = pairs.reduce((a, p) => a + (p[0] - mx) ** 2, 0), vy = pairs.reduce((a, p) => a + (p[1] - my) ** 2, 0);
    expect(cov / Math.sqrt(vx * vy)).toBeGreaterThan(0.9);
  });

  it('HOME de noche: encender la lámpara sube el sensor Y la escena (cálida)', () => {
    const night = daylightAt(23 * 60);
    const off = lightingAt('HOME', night, false, 0), on = lightingAt('HOME', night, true, 0);
    expect(lightIn(LOCATIONS.room, night, true, 0)).toBeGreaterThan(lightIn(LOCATIONS.room, night, false, 0));
    expect(on.brightness).toBeGreaterThan(off.brightness);
    expect(on.lampPower).toBeGreaterThan(0);
    expect(on.hemiSky.r).toBeGreaterThan(on.hemiSky.b); // tono cálido
  });
});

describe('Offline en los nuevos escenarios', () => {
  it.each(PLACES)('%s: 6 h fuera sin atravesar muebles ni inventar objetos', async (loc) => {
    const clock = new SimulationClock(T0, 60_000);
    const s = GameSession.create({ name: 'Milo', species: 'dog' }, { rng: seededRng(21), clock, lifeStage: 'YOUNG' });
    if (loc !== 'room') s.world.changeLocation(loc, undefined, 'dev');
    const allowed = new Set([...LOCATIONS.room.availableObjects, ...LOCATIONS[loc].availableObjects, ...LOCATIONS.room.furniture.map((f) => f.kind), ...LOCATIONS.garden.availableObjects]);
    clock.advance(6 * 3_600_000);
    await simulateAway(s, 6 * 3_600_000, async () => {});
    const at = s.world.location;
    expect(insideSolid(at, s.world.pet, s.world.bodyRadius * 0.85)?.id ?? null).toBeNull();
    for (const o of s.world.objects) {
      expect(allowed.has(o.kind)).toBe(true);
      expect(insideSolid(at, o, 0.05)?.id ?? null).toBeNull();
    }
    expect(locationSolids(at).length).toBeGreaterThan(0);
  });
});

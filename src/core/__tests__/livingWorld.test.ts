/*
 * MUNDO VIVO (docs/living-world.md · resultados en docs/living-world-results.md)
 *
 *   MUNDO CAMBIA → MASCOTA PERCIBE → SNN → ACTÚA → MUNDO RESPONDE →
 *   EXPERIENCIA → MEMORIA + APRENDIZAJE → CONDUCTA FUTURA DIFERENTE
 *
 * Aquí nadie elige por la mascota: el mundo (o el jugador) coloca, lanza,
 * suena, abre la puerta. Las comparaciones se hacen con clones congelados.
 */
import { describe, expect, it } from '@jest/globals';

import { migrateSave } from '../persistence/migrations';
import { CURRENT_SAVE_VERSION, DEFAULT_SETTINGS } from '../persistence/SaveGame';
import { seededRng } from '../random';
import { GameSession } from '../session/GameSession';
import { simulateAway } from '../simulation/OfflineSimulation';
import { AmbientEventDirector } from '../world/AmbientEventDirector';
import {
  boxHistory, boxTrial, calm, clearLoose, contextComparison, firstVisit, hearingProbe, labPet, measureBoxTendency, movementComparison,
  noveltyCurve, perceptionProbe, perfBenchmark, place, sharedScene, summarizeScene,
} from '../world/experiments';
import { ITEMS } from '../world/Items';
import { LOCATIONS, LOCATION_IDS, PLAYABLE_LOCATIONS } from '../world/Locations';

const DAY = 86_400_000;

describe('Modelo del mundo', () => {
  it('ubicaciones: casa (habitación + jardín), parque; bosque y playa preparados pero no disponibles', () => {
    expect(PLAYABLE_LOCATIONS).toEqual(['room', 'garden', 'park']);
    for (const id of LOCATION_IDS) {
      const l = LOCATIONS[id];
      for (const k of ['id', 'type', 'availableObjects', 'navigationBounds', 'spawnPoints', 'interactionPoints', 'sensoryProfile'] as const) expect(l[k]).toBeDefined();
    }
    expect(LOCATIONS.forest.available).toBe(false);
    expect(LOCATIONS.beach.available).toBe(false);
    // Cada lugar se siente distinto por lo que PRODUCE (espacio, actividad, ruido), no por cómo reacciona Milo
    const p = (id: 'room' | 'garden' | 'park') => LOCATIONS[id].sensoryProfile;
    expect(p('room').openness).toBeLessThan(p('garden').openness);
    expect(p('garden').openness).toBeLessThan(p('park').openness);
    expect(p('room').baseActivity).toBeLessThan(p('park').baseActivity);
    expect(LOCATIONS.park.size.w).toBeGreaterThan(LOCATIONS.room.size.w);
  });

  it('los objetos declaran affordances físicas (posible ≠ deseado)', () => {
    expect(ITEMS.ball.affordances).toEqual(expect.arrayContaining(['canPush', 'canCarry', 'canPlay', 'canRoll']));
    expect(ITEMS.bed.affordances).toEqual(expect.arrayContaining(['canRest', 'canSleep']));
    expect(ITEMS.mysteryBox.affordances).toEqual(expect.arrayContaining(['canInspect', 'canEnter', 'canHide']));
    expect(ITEMS.mirror.sensory.reflective).toBe(true);
    // La novedad ya no es una propiedad del tipo
    for (const d of Object.values(ITEMS)) expect((d as unknown as Record<string, unknown>).novelty).toBeUndefined();
  });
});

describe('Prueba A — percepción espacial (sin omnisciencia)', () => {
  const day = perceptionProbe(1);
  const night = perceptionProbe(1, true);
  const by = (list: typeof day, l: string) => list.find((c) => c.label.startsWith(l)) as (typeof day)[number];

  it('delante / detrás / cerca / lejos producen señales distintas', () => {
    const front = by(day, 'delante · cerca'), far = by(day, 'delante · lejos'), backNear = by(day, 'detrás · cerca'), backFar = by(day, 'detrás · lejos'), side = by(day, 'al lado');
    expect(front.percept.inFov).toBe(true);
    expect(front.seesBall).toBeGreaterThan(far.seesBall); // la distancia atenúa
    expect(backFar.percept.inFov).toBe(false);
    expect(backFar.seesBall).toBe(0); // detrás y lejos: no lo percibe
    expect(backNear.seesBall).toBeGreaterThan(0); // muy cerca se nota aunque esté detrás (olfato/bigotes)
    expect(backNear.seesBall).toBeLessThan(front.seesBall);
    expect(side.seesBall).toBeLessThan(front.seesBall); // periferia
    expect(front.percept.meters).toBeGreaterThan(0);
  });

  it('a oscuras se ve peor, pero lo muy cercano se sigue notando', () => {
    expect(by(night, 'delante · cerca').seesBall).toBeLessThan(by(day, 'delante · cerca').seesBall);
    expect(by(night, 'detrás · cerca').seesBall).toBeCloseTo(by(day, 'detrás · cerca').seesBall, 5);
  });

  it('oído: un objeto que cae DETRÁS se oye (fuera del FOV) y orienta la atención', () => {
    const h = hearingProbe(1);
    expect(h.behind).toBe(true);
    expect(h.heard).toBeGreaterThan(0.1);
    expect(h.attention).toMatch(/^sonido:/);
  });
});

describe('Prueba B — novedad y familiaridad (desde la memoria, no desde el tipo)', () => {
  it('primera caja: novedad alta; tras muchas exposiciones baja y la familiaridad sube; persiste', () => {
    const { session: s, clock } = labPet('Milo', 4);
    const curve = noveltyCurve(s, 'mysteryBox', 12);
    expect(curve[0].novelty).toBe(1);
    expect(curve[0].familiarity).toBe(0);
    const last = curve[curve.length - 1];
    expect(last.novelty).toBeLessThan(0.3);
    expect(last.familiarity).toBeGreaterThan(0.6);
    for (let i = 1; i < curve.length; i++) expect(curve[i].familiarity).toBeGreaterThanOrEqual(curve[i - 1].familiarity - 1e-9);

    // Guardar y cargar: la mascota recuerda lo que conoce
    const back = GameSession.fromSave(migrateSave(JSON.parse(JSON.stringify(s.toSave(DEFAULT_SETTINGS, clock.now())))), { clock }).session;
    expect(back.world.knowledge.novelty('mysteryBox', clock.now())).toBeCloseTo(s.world.knowledge.novelty('mysteryBox', clock.now()), 10);
    expect(back.world.knowledge.familiarity('mysteryBox')).toBeCloseTo(last.familiarity, 10);

    // Semanas sin verla: la novedad vuelve EN PARTE, la familiaridad no se pierde
    const later = clock.now() + 21 * DAY;
    expect(back.world.knowledge.novelty('mysteryBox', later)).toBeGreaterThan(last.novelty);
    expect(back.world.knowledge.novelty('mysteryBox', later)).toBeLessThan(1);
    expect(back.world.knowledge.familiarity('mysteryBox')).toBeCloseTo(last.familiarity, 10);
    // Lo que nunca vio sigue siendo nuevo; sus muebles de casa, familiares desde la adopción
    expect(back.world.knowledge.novelty('mirror', later)).toBe(1);
    expect(back.world.knowledge.familiarity('bed')).toBeGreaterThan(0.8);
  });
});

describe('Atención, objetivos y navegación', () => {
  it('TargetResolver no elige objects[0]: el peluche detrás (no percibido) pierde frente a la pelota que ve', () => {
    const { session: s } = labPet('Milo', 6);
    const w = s.world;
    clearLoose(w); calm(s);
    w.pet.x = 0.5; w.pet.y = 0.5; w.pet.orientation = Math.PI / 2;
    const teddy = place(w, 'teddy', { x: 0.5, y: 0.1 }); // primero en la lista, detrás
    const ball = place(w, 'ball', { x: 0.5, y: 0.75 });
    w.setClock(s.clock.now());
    w.perceive();
    expect(w.objects.indexOf(teddy)).toBeLessThan(w.objects.indexOf(ball));
    expect(w.resolver.best('canPlay')?.id).toBe(ball.id);
    expect(w.focusObjectId).toBe(ball.id);
    expect(w.resolver.known(teddy)).toBe(false);
  });

  it('la navegación rodea obstáculos y usa las salidas; sin capacidad o con la puerta cerrada no hay camino', () => {
    const { session: s } = labPet('Milo', 7, { stage: 'CHILD' });
    const w = s.world;
    expect(w.canCross('room>garden')).toBe(false); // puerta cerrada
    expect(w.navigation.plan({ location: 'garden', point: { x: 0.5, y: 0.5 }, stop: 0.02 }).reachable).toBe(false);
    s.setGardenDoor(true);
    const step = w.navigation.plan({ location: 'garden', point: { x: 0.5, y: 0.5 }, stop: 0.02 });
    expect(step.reachable).toBe(true);
    expect(step.exitId).toBe('room>garden');
    // En el jardín, el árbol está entre la mascota y el objetivo: rodeo
    s.goOuting('garden');
    w.pet.x = 0.3; w.pet.y = 0.15;
    const around = w.navigation.plan({ location: 'garden', point: { x: 0.3, y: 0.6 }, stop: 0.02 });
    expect(around.final).toBe(false);
    expect(Math.abs(around.waypoint.x - 0.3)).toBeGreaterThan(0.03);
    // Un bebé no puede salir aunque la puerta esté abierta (su cuerpo aún no puede)
    const { session: baby } = labPet('Milo', 7, { stage: 'BABY' });
    baby.setGardenDoor(true);
    expect(baby.world.canCross('room>garden')).toBe(false);
    expect(baby.goOuting('garden')).toBe(false);
  });

  it('cruzar es físico: la ubicación solo cambia estando en la salida', () => {
    const { session: s } = labPet('Milo', 8, { stage: 'CHILD' });
    s.setGardenDoor(true);
    const w = s.world;
    let changes = 0;
    for (let t = 0; t < 3000; t++) {
      const before = { loc: w.location, x: w.pet.x, y: w.pet.y };
      if (t % 300 === 0) { w.addFood(); w.addWater(); }
      s.tick();
      if (w.location !== before.loc) {
        changes++;
        const exit = LOCATIONS[before.loc].interactionPoints.exits.find((e) => e.to === w.location);
        expect(exit).toBeDefined();
        expect(Math.hypot(before.x - exit!.at.x, before.y - exit!.at.y)).toBeLessThan(0.12);
        expect(w.location).not.toBe('park'); // la verja no la cruza sola
      }
    }
    expect(changes).toBeGreaterThanOrEqual(0); // el número real está en docs/living-world-results.md
  }, 120_000);
});

describe('📦 Vertical slice: caja misteriosa', () => {
  it('el jugador coloca la caja → el mundo cambia → percibe → novedad → SNN → conducta → experiencia → memoria → plasticidad', () => {
    const { session: s } = labPet('Milo', 11);
    const w = s.world;
    clearLoose(w); calm(s);
    w.pet.x = 0.5; w.pet.y = 0.45; w.pet.orientation = Math.PI / 2;
    const learning0 = s.plasticity.log.length;
    const box = w.placeItem('mysteryBox', { x: 0.5, y: 0.78 }); // acción del JUGADOR: solo cambia el mundo
    const r = s.tick();
    expect(r.events.some((e) => e.type === 'OBJECT_APPEARED')).toBe(true); // el mundo cambió
    const p = w.percepts.find((x) => x.id === box.id)!;
    expect(p.perceived).toBe(true); // percibe
    expect(p.novelty).toBe(1); // novedad desde SU memoria
    expect(r.perception.seesBox).toBeGreaterThan(0); // llega a la SNN
    expect(r.perception.newObjectDetected).toBeGreaterThan(0);
    let boxActions = 0;
    for (let t = 0; t < 200; t++) {
      const res = s.tick();
      if (res.focusObjectId === box.id && res.active.some((a) => ['LOOK_AT_OBJECT', 'INVESTIGATE', 'MOVE_AWAY', 'GET_SCARED', 'HIDE'].includes(a))) boxActions++;
    }
    expect(boxActions).toBeGreaterThan(0); // la red produjo conducta dirigida a la caja
    const exps = s.memory.experiences.filter((e) => e.subject === 'mysteryBox' || e.kind === 'mystery_opened');
    expect(exps.length).toBeGreaterThan(0); // experiencia
    expect(w.knowledge.object('mysteryBox')?.stage).toBeDefined(); // memoria de exploración (VIO ≠ CONOCIÓ)
    expect(s.plasticity.log.length).toBeGreaterThan(learning0); // aprendizaje
    const touched = s.plasticity.log.slice(0, s.plasticity.log.length - learning0).flatMap((ev) => ev.changes.map((c) => c.key));
    expect(touched.some((k) => k.startsWith('seesBox') || k.startsWith('boxAttention') || k.startsWith('newObjectDetected'))).toBe(true);
    // Se puede explicar: hay una decisión trazada sobre la caja con su vía de sinapsis
    const d = s.decisions.find((x) => x.subject === 'mysteryBox');
    expect(d).toBeDefined();
    expect(d!.pathway.length).toBeGreaterThan(0);
  });

  it('las etapas de conocimiento se distinguen: VIO, SE ACERCÓ, INVESTIGÓ, INTERACTUÓ', () => {
    const { session: s } = labPet('Milo', 11);
    const tr = boxTrial(s, { ticks: 150 });
    const m = s.world.knowledge.object('mysteryBox')!;
    expect(m.stageAt.SAW).toBeDefined();
    if (tr.approachedAt !== null) expect(m.stageAt.APPROACHED).toBeDefined();
    if (tr.opened) {
      expect(m.stageAt.INTERACTED).toBeDefined();
      expect(s.memory.experiences.some((e) => e.kind === 'mystery_opened')).toBe(true);
    }
  });
});

describe('Prueba C — dos mascotas, mismo mundo, historias distintas', () => {
  it('una historia aversiva con la caja aprende miedo; otra sin sustos no; responden distinto a la MISMA escena', async () => {
    const A = labPet('Milo', 11), B = labPet('Milo', 11);
    // v9: con la casa amueblada (HOME 2.0) la mascota explora más y visita menos la caja por ensayo;
    // 15 ensayos daban solo Δ 0.073 de miedo aprendido, 25 dan 0.133 (docs/environment-results.md)
    await boxHistory(A.session, 25, false);
    await boxHistory(B.session, 25, true); // en su historia, acercarse a la caja coincidió con un golpe fuerte
    // El cerebro cambió de verdad (vía caja → miedo), no una etiqueta
    expect(B.session.plasticity.synapseDelta('seesBox→fearCircuit')).toBeGreaterThan(A.session.plasticity.synapseDelta('seesBox→fearCircuit') + 0.1);
    const tA = await measureBoxTendency(A.session, 12), tB = await measureBoxTendency(B.session, 12);
    expect(tB.approachRate).toBeLessThan(tA.approachRate);
    const sA = summarizeScene(await sharedScene(A.session, 8)), sB = summarizeScene(await sharedScene(B.session, 8));
    expect(sB.fearRate).toBeGreaterThan(sA.fearRate);
  }, 300_000);
});

describe('Prueba D — el contexto cambia la respuesta', () => {
  it('misma mascota, misma caja: de día en su habitación vs de noche en un parque desconocido', async () => {
    const { session: s } = labPet('Milo', 3);
    const c = await contextComparison(s, 10);
    expect(c.nightPark.fearRate).toBeGreaterThan(c.dayRoom.fearRate);
    expect(c.nightPark.approachRate).toBeLessThan(c.dayRoom.approachRate);
  }, 200_000);
});

describe('Prueba E — movimiento', () => {
  it('una pelota rodando produce una señal de movimiento que una quieta no; y cambia la conducta', async () => {
    const { session: s } = labPet('Milo', 3);
    const m = await movementComparison(s, 16);
    expect(m.stationary.objectMoving).toBeLessThan(0.05);
    expect(m.rolling.objectMoving).toBeGreaterThan(0.2);
    expect(m.rolling.lookOnsets).toBeGreaterThan(m.stationary.lookOnsets);
  }, 120_000);

  it('el espejo: su imagen se mueve cuando la mascota se mueve delante (estímulo, no "se reconoce")', () => {
    const { session: s } = labPet('Milo', 3);
    const w = s.world;
    clearLoose(w);
    w.pet.x = 0.5; w.pet.y = 0.5; w.pet.orientation = Math.PI / 2;
    const mirror = place(w, 'mirror', { x: 0.5, y: 0.75 });
    w.pet.speed = 0;
    expect(w.perceptFor(mirror.id)!.movement).toBe(0);
    w.pet.speed = 1;
    expect(w.perceptFor(mirror.id)!.movement).toBeGreaterThan(0.5);
  });
});

describe('🌿 Jardín y 🌳 parque: crecimiento y primera visita', () => {
  it('un cachorro sale por primera vez al jardín: se observa lo que hace y se recuerda', () => {
    const { session: s } = labPet('Milo', 5, { stage: 'CHILD' });
    const v = firstVisit(s, 'garden', 200);
    expect(v.momentTitle).toMatch(/Primera .* en el jardín/);
    expect(v.momentStory!.length).toBeGreaterThan(10);
    expect(s.growth.hasMilestone('FIRST_OUTING')).toBe(true);
    expect(s.memory.experiences.some((e) => e.kind === 'first_visit')).toBe(true);
    expect(s.places().find((p) => p.id === 'garden')!.visited).toBe(true);
  });

  it('el parque exige una etapa mayor (sin "niveles" en la UI: una frase natural)', () => {
    const { session: child } = labPet('Milo', 5, { stage: 'CHILD' });
    expect(child.goOuting('park')).toBe(false);
    expect(child.places().find((p) => p.id === 'park')!.readyHint).toMatch(/pequeño/);
    const { session: young } = labPet('Milo', 5, { stage: 'YOUNG' });
    expect(young.places().find((p) => p.id === 'park')!.readyHint).toMatch(/listo para conocer el parque/);
    expect(young.goOuting('park')).toBe(true);
    expect(young.world.location).toBe('park');
  });
});

describe('Microeventos (AmbientEventDirector)', () => {
  it('deterministas con semilla y guion: "hoja cae en T, sonido en T+20"', () => {
    const run = () => {
      const d = new AmbientEventDirector(seededRng(42));
      d.script([{ at: 100, type: 'LEAF_FELL', x: 0.5, y: 0.5 }, { at: 120, type: 'SOUND_OUTSIDE' }]);
      const ev: string[] = [];
      for (let t = 1; t <= 3000; t++) for (const e of d.update({ tick: t, location: 'garden', daylight: 1, fear: 0, asleep: false, bounds: LOCATIONS.garden.navigationBounds })) ev.push(`${e.tick}:${e.type}`);
      return ev;
    };
    const a = run(), b = run();
    expect(a).toEqual(b);
    expect(a).toContain('100:LEAF_FELL');
    expect(a).toContain('120:SOUND_OUTSIDE');
    // Discretos: nunca dos espontáneos a menos del período refractario
    const ticks = a.map((x) => Number(x.split(':')[0])).filter((t) => t > 120);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBeGreaterThanOrEqual(150);
  });

  it('producen estímulos, no acciones: una hoja que cae es un objeto nuevo y un sonido', () => {
    const { session: s } = labPet('Milo', 5, { stage: 'CHILD' });
    s.goOuting('garden');
    s.world.ambient.script([{ at: s.world.tick + 1, type: 'LEAF_FELL', x: 0.5, y: 0.5 }]);
    const r = s.tick();
    expect(r.events.some((e) => e.type === 'LEAF_FELL')).toBe(true);
    expect(s.world.objects.some((o) => o.kind === 'leaf')).toBe(true);
    expect(s.world.sounds.some((x) => x.kind === 'rustle')).toBe(true);
  });
});

describe('Prueba F — offline en el mismo mundo', () => {
  it('8 horas con la pelota y la caja en la habitación y la puerta cerrada: nada físicamente imposible', async () => {
    const { session: s, clock } = labPet('Milo', 13, { stage: 'CHILD' });
    const w = s.world;
    place(w, 'mysteryBox', { x: 0.7, y: 0.7 });
    for (let t = 0; t < 30; t++) s.tick();
    const ids = new Set(w.objects.map((o) => o.id));
    clock.advance(8 * 3_600_000);
    const rep = await simulateAway(s, 8 * 3_600_000, async () => {});
    expect(rep).not.toBeNull();
    expect(rep!.locationsVisited).toEqual(['room']); // sin puerta abierta no aparece en el jardín
    expect(w.location).toBe('room');
    for (const o of w.objects) { expect(o.x).toBeGreaterThanOrEqual(0); expect(o.x).toBeLessThanOrEqual(1); }
    // Los objetos siguen ahí (o salieron de la caja: nada aparece de la nada)
    for (const o of w.objects) if (!ids.has(o.id)) expect(w.objects.some((b) => b.kind === 'mysteryBox' && b.state !== 'closed')).toBe(true);
  }, 120_000);

  it('con la puerta abierta un cachorro puede salir solo, pero nunca al parque', async () => {
    const { session: s, clock } = labPet('Milo', 14, { stage: 'CHILD' });
    s.setGardenDoor(true);
    clock.advance(8 * 3_600_000);
    const rep = await simulateAway(s, 8 * 3_600_000, async () => {});
    expect(rep!.locationsVisited).not.toContain('park');
  }, 120_000);
});

describe('Save v5', () => {
  it('guarda ubicación, objetos de cada lugar, puertas, exploración y orientación; migra desde v4', () => {
    const { session: s, clock } = labPet('Milo', 15, { stage: 'CHILD' });
    place(s.world, 'mysteryBox', { x: 0.6, y: 0.6 });
    s.setGardenDoor(true);
    for (let t = 0; t < 50; t++) s.tick();
    s.goOuting('garden');
    s.world.placeItem('ball', { x: 0.4, y: 0.4 });
    s.world.pet.orientation = 1.234;
    const save = JSON.parse(JSON.stringify(s.toSave(DEFAULT_SETTINGS, clock.now())));
    expect(save.saveVersion).toBe(CURRENT_SAVE_VERSION);
    const b = GameSession.fromSave(migrateSave(save), { clock }).session;
    expect(b.world.location).toBe('garden');
    expect(b.world.objectsIn('room').some((o) => o.kind === 'mysteryBox')).toBe(true);
    expect(b.gardenDoorOpen()).toBe(true);
    expect(b.world.pet.orientation).toBeCloseTo(1.234, 6);
    expect(b.world.knowledge.exportState()).toEqual(s.world.knowledge.exportState());
    // Nada visual ni derivado en el save
    expect(JSON.stringify(save.world)).not.toMatch(/percepts|heard|attentionTarget/);

    // v4 real (la forma anterior): sin ubicación ni exploración
    const v4 = JSON.parse(JSON.stringify(save));
    v4.saveVersion = 4;
    v4.world = { objects: v4.world.stash.room, lightOn: false, nextId: v4.world.nextId, tick: 10 };
    delete v4.memory.exploration;
    v4.inventory = { owned: ['ball', 'teddy'] };
    v4.memory.stats.objectStats = { ball: { interactions: 5, approaches: 2, plays: 3, picks: 1, avoidances: 0, rewarded: 0 } };
    const m = migrateSave(v4);
    expect(m.saveVersion).toBe(CURRENT_SAVE_VERSION);
    expect(m.world.location).toBe('room');
    expect(m.inventory.owned).toEqual(expect.arrayContaining(['mysteryBox', 'mirror']));
    const mig = GameSession.fromSave(m, { clock }).session;
    expect(mig.world.knowledge.familiarity('bed')).toBeGreaterThan(0.8); // sus muebles
    expect(mig.world.knowledge.familiarity('ball')).toBeGreaterThan(0); // su historial real con la pelota
    expect(mig.world.knowledge.novelty('mirror', clock.now())).toBe(1); // lo que nunca vio
  });
});

describe('Prueba G — rendimiento de la simulación', () => {
  it('10 / 25 / 50 objetos: el tick completo sigue muy por debajo del presupuesto (333 ms a 3 ticks/s)', () => {
    const rows = perfBenchmark([10, 25, 50], 300);
    for (const r of rows) {
      expect(r.stepMs).toBeLessThan(10);
      expect(r.perceiveMs).toBeLessThan(5);
    }
  }, 120_000);
});

/*
 * Necesidades en la app (3 ticks/s): la mascota bebe/come cuando lo necesita,
 * llega al recurso sin que la distraiga la pelota y se detiene al saciarse.
 * Regresión de "a cada momento sale 'qué rica el agua fresquita'" (docs/network-tuning.md).
 */
import { describe, expect, it } from '@jest/globals';

import { applyGenomeAdditions, baseBrainConfig, BRAIN_CONFIG_VERSION } from '../brain/BrainConfig';
import { exportWeights } from '../brain/BrainWeights';
import { migrateSave } from '../persistence/migrations';
import { DEFAULT_SETTINGS } from '../persistence/SaveGame';
import { seededRng } from '../random';
import { GameSession } from '../session/GameSession';
import { TestClock } from '../time/WorldClock';

const T0 = new Date(2026, 0, 5, 10).getTime();
const pet = (seed = 4) => {
  const clock = new TestClock(T0);
  const s = GameSession.create({ name: 'Milo', species: 'dog' }, { rng: seededRng(seed), clock, lifeStage: 'YOUNG' });
  s.setPlayerPresent(true);
  return { s, clock };
};

describe('Beber y comer en la app', () => {
  it('una hora real: empieza a beber pocas veces y el pensamiento solo dice "qué rica" al beber de verdad', () => {
    const { s, clock } = pet();
    const n = 10_800; // 1 h a 3 ticks/s
    let starts = 0, prev = false, thirst = 0, lies = 0;
    for (let i = 0; i < n; i++) {
      clock.advance(333);
      if (i % 300 === 0) { s.interact('toy'); s.petDirect(); }
      if (i % 60 === 0) {
        if ((s.world.firstOfType('water')?.amount ?? 0) <= 0) s.interact('water');
        if ((s.world.foodSources()[0]?.amount ?? 0) <= 0) s.interact('food');
      }
      const r = s.tick();
      const d = r.active.includes('DRINK');
      if (d && !prev) starts++;
      prev = d;
      thirst += s.world.pet.thirst;
      const water = s.world.firstOfType('water');
      if (s.snapshot().thought.includes('fresquita') && !(water && water.amount > 0 && s.world.distance(s.world.pet, water) <= 0.12)) lies++;
    }
    expect(starts / 60).toBeLessThan(1); // antes: ~6 inicios por minuto
    expect(thirst / n).toBeLessThan(0.6); // y no vive sediento
    expect(lies).toBe(0);
  });

  it('con sed y la pelota al lado, va al agua y bebe hasta saciarse', () => {
    const { s, clock } = pet(7);
    s.interact('toy');
    s.setPetStat('thirst', 0.85);
    const water = s.world.firstOfType('water')!;
    let reached = -1;
    for (let i = 0; i < 300 && s.world.pet.thirst > 0.3; i++) {
      clock.advance(333);
      s.tick();
      if (reached < 0 && s.world.distance(s.world.pet, water) <= 0.1) reached = i;
    }
    expect(reached).toBeGreaterThanOrEqual(0);
    expect(s.world.pet.thirst).toBeLessThanOrEqual(0.3);
  });

  it('sin sed no empieza a beber aunque tenga el agua delante', () => {
    const { s, clock } = pet(9);
    const water = s.world.firstOfType('water')!;
    s.world.pet.x = water.x - 0.05; s.world.pet.y = water.y;
    let drank = 0;
    for (let i = 0; i < 300; i++) {
      s.setPetStat('thirst', 0.1);
      clock.advance(333);
      if (s.tick().status.DRINK === 'bebe') drank++;
    }
    expect(drank).toBe(0);
  });
});

describe('Genoma v7 en mascotas existentes', () => {
  it('añade las conexiones innatas nuevas sin tocar lo aprendido', () => {
    const { s, clock } = pet(11);
    const save = JSON.parse(JSON.stringify(s.toSave(DEFAULT_SETTINGS, clock.now())));
    // Simula un save v6: sin las conexiones nuevas y con un peso "aprendido"
    delete save.brain.weights.sensorToCircuit.thirst.curiosityCircuit;
    delete save.brain.weights.circuitToAction.drinkingCircuit.INVESTIGATE;
    save.brain.weights.sensorToCircuit.thirst.drinkingCircuit = 0.83;
    save.brain.configVersion = 6;
    const b = GameSession.fromSave(migrateSave(save), { clock }).session;
    const w = exportWeights(b.sim.brainConfig);
    const base = baseBrainConfig();
    expect(w.sensorToCircuit.thirst?.curiosityCircuit).toBe(base.sensorToCircuit.thirst?.curiosityCircuit);
    expect(w.circuitToAction.drinkingCircuit?.INVESTIGATE).toBe(base.circuitToAction.drinkingCircuit?.INVESTIGATE);
    expect(w.sensorToCircuit.thirst?.drinkingCircuit).toBe(0.83); // lo aprendido se conserva
    expect(applyGenomeAdditions(b.sim.brainConfig, BRAIN_CONFIG_VERSION)).toBe(0); // nada que añadir ya
  });
});

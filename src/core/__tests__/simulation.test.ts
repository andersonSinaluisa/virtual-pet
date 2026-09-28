import { describe, expect, it } from '@jest/globals';

import { createBrainConfig } from '../brain/BrainConfig';
import { explainAction } from '../explain/CausalChain';
import { seededRng } from '../random';
import { createSimConfig, PET_STATS } from '../simulation/SimConfig';
import { Simulation } from '../simulation/Simulation';

function sim(seed = 7) {
  return new Simulation(createSimConfig({ rng: seededRng(seed) }), createBrainConfig());
}

describe('Pet state', () => {
  it('las necesidades derivan con el tiempo y se limitan a 0..1', () => {
    const s = sim();
    const pet = s.world.pet;
    const h0 = pet.hunger;
    pet.passTime();
    expect(pet.hunger).toBeCloseTo(h0 + 0.002);
    pet.change('hunger', 5);
    expect(pet.hunger).toBe(1);
    pet.change('hunger', -5);
    expect(pet.hunger).toBe(0);
    pet.change('hunger', Number.NaN);
    expect(pet.hunger).toBe(0);
  });

  it('timeScale comprime la deriva (offline)', () => {
    const a = sim().world.pet, b = sim().world.pet;
    for (let i = 0; i < 10; i++) a.passTime();
    b.passTime(10);
    expect(b.hunger).toBeCloseTo(a.hunger);
    expect(b.fear).toBeCloseTo(a.fear);
  });
});

describe('World perception', () => {
  it('todas las percepciones están en 0..1', () => {
    const s = sim();
    s.world.setPlayerPresent(true);
    s.world.makeNoise();
    s.world.addNovelObject();
    s.world.callPet(1);
    const p = s.world.perceive();
    for (const v of Object.values(p)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    expect(p.loudSound).toBe(1);
    expect(p.playerCalling).toBe(1);
  });

  it('un objeto lanzado se mueve, rebota y se frena por fricción', () => {
    const s = sim();
    const w = s.world;
    const ball = w.placeItem('ball', { x: 0.5, y: 0.5 }, 'game');
    expect(w.throwObject(ball.id, 1, 0)).toBe(true);
    expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(0.12); // limitado a maxThrowSpeed
    for (let i = 0; i < 60; i++) w.update();
    expect(ball.vx).toBe(0);
    expect(ball.x).toBeGreaterThanOrEqual(0.03);
    expect(ball.x).toBeLessThanOrEqual(0.97);
  });

  it('las galletitas se acaban y desaparecen', () => {
    const s = sim();
    const t = s.world.offerTreat();
    t.amount = 0;
    s.world.update();
    expect(s.world.getObject(t.id)).toBeNull();
  });
});

describe('Simulation loop', () => {
  it('ruido fuerte → sensor → circuito de miedo → GET_SCARED (con retardo de un tick por capa)', () => {
    const s = sim();
    for (let t = 0; t < 5; t++) s.step();
    s.world.makeNoise();
    const loud = s.brain.sensorKeyToNeuron.loudSound;
    const fear = s.brain.circuitKeyToNeuron.fearCircuit;
    const scared = s.brain.actionToOutputNeuron.GET_SCARED;
    const firstTick: Record<number, number> = {};
    for (let t = 0; t < 10; t++) {
      const r = s.step();
      for (const id of [loud, fear, scared]) if (r.spiked.includes(id) && firstTick[id] === undefined) firstTick[id] = r.tick;
    }
    expect(firstTick[scared]).toBeDefined();
    expect(firstTick[fear]).toBeGreaterThan(firstTick[loud]);
    expect(firstTick[scared]).toBeGreaterThan(firstTick[fear]);
  });

  it('la cadena causal del Brain View sale de la traza real', () => {
    const s = sim();
    for (let t = 0; t < 5; t++) s.step();
    s.world.makeNoise();
    const scared = s.brain.actionToOutputNeuron.GET_SCARED;
    // Se explica el PRIMER susto (los siguientes pueden venir del sensor interno `fear`)
    for (let t = 0; t < 10 && !s.step().spiked.includes(scared); t++);
    const chain = explainAction(s.brain, s.trace, 'GET_SCARED');
    expect(chain).not.toBeNull();
    expect(chain?.circuits[0].key).toBe('fearCircuit');
    expect(chain?.sensors.map((x) => x.key)).toContain('loudSound');
  });

  it('un spike de salida activa la acción durante `hold` ticks', () => {
    const s = sim();
    s.actionSystem.trigger([{ neuron: 0, action: 'DANCE' }]);
    let ticks = 0;
    for (let i = 0; i < 10 && s.actionSystem.active.includes('DANCE'); i++) { s.actionSystem.execute(s.world, s.movement); ticks++; }
    expect(ticks).toBe(6);
  });

  it('la mascota nunca se teletransporta (máx. velocidad de carrera por tick)', () => {
    const s = sim(3);
    s.world.setPlayerPresent(true);
    const cfg = s.config.movement;
    let prev = { x: s.world.pet.x, y: s.world.pet.y };
    for (let t = 0; t < 400; t++) {
      if (t % 40 === 5) s.world.callPet(1);
      if (t % 70 === 9) s.world.makeNoise();
      s.step();
      const d = Math.hypot(s.world.pet.x - prev.x, s.world.pet.y - prev.y);
      expect(d).toBeLessThanOrEqual(cfg.baseSpeed * cfg.runMultiplier + 1e-9);
      prev = { x: s.world.pet.x, y: s.world.pet.y };
    }
  });

  it('una llamada del jugador hace disparar el sensor playerCalling', () => {
    const s = sim();
    s.world.setPlayerPresent(true);
    s.world.callPet(1);
    const id = s.brain.sensorKeyToNeuron.playerCalling;
    let fired = false;
    for (let t = 0; t < 4; t++) fired = s.step().spiked.includes(id) || fired;
    expect(fired).toBe(true);
  });

  it('Force Sensor (desarrollo) fija la percepción durante N ticks', () => {
    const s = sim();
    s.forceSensor('hunger', 1, 3);
    expect(s.step().perception.hunger).toBe(1);
    s.step(); s.step();
    expect(s.step().perception.hunger).toBeLessThan(1);
  });

  it('el estado de la mascota sigue en 0..1 tras muchos ticks', () => {
    const s = sim(11);
    for (let t = 0; t < 1000; t++) s.step();
    for (const k of PET_STATS) { expect(s.world.pet[k]).toBeGreaterThanOrEqual(0); expect(s.world.pet[k]).toBeLessThanOrEqual(1); }
  });
});

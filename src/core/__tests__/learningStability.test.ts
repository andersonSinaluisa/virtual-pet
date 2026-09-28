/*
 * ESTABILIDAD DEL APRENDIZAJE PROLONGADO + MIGRACIÓN DE SAVES
 *
 *   100 000 ticks con estímulos variados y miles de experiencias con
 *   recompensa (positivas y negativas): sin NaN/Infinity, pesos dentro de
 *   límites, neuronas vivas, ninguna acción dominando, save/load exacto.
 */
import { describe, expect, it } from '@jest/globals';

import { ACTION_LIST, type Action } from '../brain/Actions';
import { denseWeights } from '../brain/BrainWeights';
import { migrateSave } from '../persistence/migrations';
import { DEFAULT_SETTINGS } from '../persistence/SaveGame';
import { seededRng } from '../random';
import { GameSession } from '../session/GameSession';

const T0 = 1_700_000_000_000;

describe('Estabilidad: 100k ticks aprendiendo', () => {
  it('no rompe el cerebro', () => {
    let now = T0;
    const s = GameSession.create({ name: 'Milo', species: 'dog' }, { rng: seededRng(99), now: () => (now += 333) });
    const rng = seededRng(7);
    s.setPlayerPresent(true);
    const plastic = new Set(s.plasticity.entries.map((e) => e.synapse));
    const fixedBefore = s.sim.network.synapses.filter((x) => !plastic.has(x)).map((x) => x.weight);
    const onsets: Partial<Record<Action, number>> = {};
    let injected = 0;
    const kinds = ['ball', 'teddy', 'rope', 'duck'] as const;

    for (let t = 1; t <= 100_000; t++) {
      // Mundo cambiante: objetos, comida, llamadas, ruidos, luz
      if (t % 400 === 0) { for (const o of s.world.objects.filter((x) => !x.fixed)) s.world.removeObject(o.id); s.world.placeItem(kinds[Math.floor(rng() * 4)]); }
      if (t % 300 === 0) { s.world.addFood(); s.world.addWater(); }
      const away = t % 10_000 < 4000 && t >= 10_000; // periodos sin jugador
      if (t % 250 === 0 && !away) s.world.callPet(1); // (llamar trae al jugador de vuelta)
      if (t % 1300 === 0) s.world.makeNoise();
      if (t % 5000 === 0) s.world.toggleLight();
      // El jugador va y viene (sin compañía la soledad debe poder activarse)
      if (t % 10_000 === 0) s.setPlayerPresent(false);
      if (t % 10_000 === 4000) s.setPlayerPresent(true);
      const prev = new Set(s.sim.last.active);
      const r = s.tick();
      for (const a of r.active) if (!prev.has(a)) onsets[a] = (onsets[a] ?? 0) + 1;
      // Miles de experiencias con recompensa del jugador y ruido de recompensa ±
      if (!away && s.rewardable() && rng() < 0.5) s.rewardPlayer();
      if (t % 13 === 0) { s.injectReward(rng() < 0.7 ? 0.5 + rng() * 0.5 : -(0.5 + rng() * 0.5)); injected++; }

      if (t % 5000 === 0) {
        for (const n of s.sim.network.neurons) expect(Number.isFinite(n.potential)).toBe(true);
        for (const e of s.plasticity.entries) {
          const w = e.synapse.weight;
          expect(Number.isFinite(w)).toBe(true);
          expect(w).toBeGreaterThanOrEqual(e.synapse.minWeight - 1e-9);
          expect(w).toBeLessThanOrEqual(e.synapse.maxWeight + 1e-9);
          expect(Number.isFinite(e.synapse.eligibility)).toBe(true);
        }
      }
    }

    expect(injected + s.plasticity.experiencesApplied).toBeGreaterThan(5000);
    // Las sinapsis no plásticas NO cambiaron
    expect(s.sim.network.synapses.filter((x) => !plastic.has(x)).map((x) => x.weight)).toEqual(fixedBefore);
    // Las salidas siguen vivas y ninguna domina
    const total = ACTION_LIST.reduce((n, a) => n + (onsets[a] ?? 0), 0);
    const alive = ACTION_LIST.filter((a) => (onsets[a] ?? 0) > 0);
    expect(alive.length).toBeGreaterThanOrEqual(18);
    const top = Math.max(...ACTION_LIST.map((a) => onsets[a] ?? 0));
    expect(top / total).toBeLessThan(0.3);
    // Todos los circuitos pueden disparar todavía
    for (const c of s.sim.brain.circuitLayer) expect(c.spikeCount).toBeGreaterThan(0);

    // Guardar y cargar conserva exactamente lo aprendido
    const loaded = GameSession.fromSave(migrateSave(JSON.parse(JSON.stringify(s.toSave(DEFAULT_SETTINGS, now)))), { rng: seededRng(1) }).session;
    expect(denseWeights(loaded.sim.brainConfig, 'sensorToCircuit')).toEqual(denseWeights(s.sim.brainConfig, 'sensorToCircuit'));
    expect(denseWeights(loaded.sim.brainConfig, 'circuitToAction')).toEqual(denseWeights(s.sim.brainConfig, 'circuitToAction'));
    expect(loaded.sim.network.synapses.map((x) => x.weight)).toEqual(s.sim.network.synapses.map((x) => x.weight));
    expect(loaded.plasticity.experiencesApplied).toBe(s.plasticity.experiencesApplied);
  }, 600_000);
});

describe('Migración de save v1 → v2', () => {
  it('una mascota existente no se pierde: sus pesos pasan a ser iniciales y actuales', () => {
    const s = GameSession.create({ name: 'Luna', species: 'cat', preset: 'curioso' }, { rng: seededRng(4) });
    s.setPlayerPresent(true);
    for (let i = 0; i < 200; i++) { if (i % 30 === 0) s.petDirect(); s.tick(); }
    // Construye un save v1 real (la forma anterior al aprendizaje)
    const v2 = JSON.parse(JSON.stringify(s.toSave(DEFAULT_SETTINGS, T0))) as Record<string, unknown> & { brain: Record<string, unknown>; memory: { experiences: Record<string, unknown>[] } };
    const v1: Record<string, unknown> = { ...v2, saveVersion: 1, brain: { ...v2.brain } };
    delete (v1.brain as Record<string, unknown>).initialWeights;
    delete v1.learning;
    (v1 as { memory: { experiences: Record<string, unknown>[] } }).memory = { ...v2.memory, experiences: v2.memory.experiences.map(({ reward: _r, actions: _a, ...e }) => e) };

    const migrated = migrateSave(v1);
    expect(migrated.saveVersion).toBe(4); // v1 → v2 → v3 → v4 en cadena
    expect(migrated.brain.initialWeights).toEqual(migrated.brain.weights);
    expect(migrated.learning.experiencesApplied).toBe(0);
    expect(migrated.memory.experiences.every((e) => e.reward === 0 && Array.isArray(e.actions))).toBe(true);
    const { session } = GameSession.fromSave(migrated);
    expect(session.profile.name).toBe('Luna');
    expect(session.memory.moments.length).toBe(s.memory.moments.length);
    expect(denseWeights(session.sim.brainConfig, 'sensorToCircuit')).toEqual(denseWeights(s.sim.brainConfig, 'sensorToCircuit'));
    expect(session.plasticity.entries.every((e) => e.synapse.weight === e.synapse.initialWeight)).toBe(true);
  });
});

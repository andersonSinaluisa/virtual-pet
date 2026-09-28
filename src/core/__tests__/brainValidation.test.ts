/*
 * VALIDACIÓN AUTOMÁTICA DE LA SNN
 * -------------------------------
 * Equivalente a tools/harness.js del prototipo, ampliado. Corre varios miles
 * de ticks en escenarios válidos del mundo y comprueba invariantes.
 * Los pesos NO se tocan para que esto pase: si falla, se documenta y se
 * revisa el genoma a propósito.
 *
 *   npm run validate:brain
 */
import { describe, expect, it } from '@jest/globals';

import { ACTION_LIST, type Action } from '../brain/Actions';
import { BRAIN_PRESETS, createBrainConfig, type PresetKey } from '../brain/BrainConfig';
import { exportWeights, importWeights } from '../brain/BrainWeights';
import { seededRng } from '../random';
import { createSimConfig } from '../simulation/SimConfig';
import { Simulation } from '../simulation/Simulation';

type Scenario = (s: Simulation, t: number) => void;

// Los mismos escenarios del arnés web + los estímulos móviles nuevos
const SCENARIOS: Record<string, Scenario> = {
  solo: () => {},
  player_moving: (s, t) => { if (t === 5) s.world.setPlayerPresent(true); if (t % 12 === 0) s.world.movePlayerTo(0.2 + s.config.rng() * 0.6, 0.2 + s.config.rng() * 0.7); },
  player_still_caress: (s, t) => { if (t === 5) s.world.setPlayerPresent(true); if (t === 8) s.world.movePlayerTo(s.world.pet.x, s.world.pet.y); if (t % 25 === 0) s.world.caress(); },
  petting: (s, t) => { if (t % 20 === 0) s.world.petDirect(); },
  loud_noises: (s, t) => { if (t % 60 === 10) s.world.makeNoise(); },
  new_objects: (s, t) => { if (t % 80 === 10) s.world.addNovelObject(); },
  dark: (s, t) => { if (t === 5) s.world.setLight(false); },
  toys_fed: (s, t) => { if (t % 50 === 1) { s.world.addFood(); s.world.addWater(); } if (t === 3) s.world.placeToy(); },
  calling: (s, t) => { if (t === 2) s.world.setPlayerPresent(true); if (t % 30 === 0) s.world.callPet(1); },
  fetch: (s, t) => {
    if (t === 2) s.world.setPlayerPresent(true);
    const ball = s.world.toys().find((o) => o.kind === 'ball');
    if (ball && t % 40 === 0) s.world.throwObject(ball.id, (s.config.rng() - 0.5) * 0.2, -0.1);
  },
  neglect: (s, t) => { if (t === 1) { const f = s.world.firstOfType('food'); if (f) f.amount = 0; const w = s.world.firstOfType('water'); if (w) w.amount = 0; } },
};

const TICKS = 600;

function run(preset: PresetKey, seed: number) {
  const counts: Partial<Record<Action, number>> = {};
  const problems: string[] = [];
  let maxAbs = 0;
  for (const [name, fn] of Object.entries(SCENARIOS)) {
    const s = new Simulation(createSimConfig({ rng: seededRng(seed) }), createBrainConfig(preset));
    for (let t = 1; t <= TICKS; t++) {
      fn(s, t);
      const r = s.step();
      r.actions.forEach((a) => { counts[a.action] = (counts[a.action] ?? 0) + 1; });
      for (const n of s.network.neurons) {
        if (!Number.isFinite(n.potential)) problems.push(`${name} t${t}: N${n.id} potencial ${n.potential}`);
        maxAbs = Math.max(maxAbs, Math.abs(n.potential));
      }
      for (const v of s.network.inputs) if (!Number.isFinite(v)) problems.push(`${name} t${t}: input no finito`);
      for (const [k, v] of Object.entries(r.perception)) if (!(v >= 0 && v <= 1)) problems.push(`${name} t${t}: percepción ${k}=${v}`);
    }
  }
  return { counts, problems, maxAbs };
}

describe('Validación SNN (miles de ticks)', () => {
  it.each(Object.keys(BRAIN_PRESETS) as PresetKey[])('%s: sin NaN, potenciales acotados, percepciones válidas', (preset) => {
    const { problems, maxAbs } = run(preset, 7);
    expect(problems.slice(0, 5)).toEqual([]);
    // Con |w| ≤ ~1.2 y fuga 0.9, el potencial no puede crecer sin límite
    expect(maxAbs).toBeLessThan(50);
  });

  it('las 22 acciones son alcanzables en algún escenario válido (genoma base)', () => {
    const total: Partial<Record<Action, number>> = {};
    for (const seed of [7, 13, 29]) {
      const { counts } = run('equilibrado', seed);
      for (const a of ACTION_LIST) total[a] = (total[a] ?? 0) + (counts[a] ?? 0);
    }
    const never = ACTION_LIST.filter((a) => !total[a]);
    expect(never).toEqual([]);
  });

  it('los pesos se serializan y restauran sin cambiar el comportamiento', () => {
    const a = new Simulation(createSimConfig({ rng: seededRng(3) }), createBrainConfig('miedoso'));
    const cfg = createBrainConfig();
    importWeights(cfg, JSON.parse(JSON.stringify(exportWeights(a.brainConfig))));
    const b = new Simulation(createSimConfig({ rng: seededRng(3) }), cfg);
    for (let t = 1; t <= 500; t++) {
      if (t % 60 === 10) { a.world.makeNoise(); b.world.makeNoise(); }
      expect(b.step().spiked).toEqual(a.step().spiked);
    }
  });

  it('es determinista con la misma semilla', () => {
    const mk = () => new Simulation(createSimConfig({ rng: seededRng(42) }), createBrainConfig());
    const a = mk(), b = mk();
    for (let t = 0; t < 300; t++) expect(b.step().spiked).toEqual(a.step().spiked);
  });
});

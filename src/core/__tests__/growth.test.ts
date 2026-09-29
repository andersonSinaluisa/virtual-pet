/*
 * CRECIMIENTO: identidad + cerebro + memoria + aprendizaje sobreviven.
 * Resultados medidos y discutidos en docs/growth-results.md.
 */
import { describe, expect, it } from '@jest/globals';

import { exportWeights } from '../brain/BrainWeights';
import { weightsHash } from '../growth/brainHash';
import { brainDistance, createBaby, liveUpbringing } from '../growth/experiments';
import { GROWTH_CONFIG, stageConfig } from '../growth/GrowthConfig';
import { GrowthSystem, getPlasticityMultiplier, newGrowthState } from '../growth/GrowthSystem';
import { LIFE_STAGES, stageIndex } from '../growth/LifeStage';
import { evaluatePreference, trainWithObject } from '../learning/experiments';
import { migrateSave } from '../persistence/migrations';
import { CURRENT_SAVE_VERSION, DEFAULT_SETTINGS } from '../persistence/SaveGame';
import { seededRng } from '../random';
import { detectHabits } from '../routines/HabitDetector';
import { liveDays } from '../routines/experiments';
import { GameSession } from '../session/GameSession';
import { simulateAway } from '../simulation/OfflineSimulation';
import { TestClock } from '../time/WorldClock';

const DAY = 86_400_000;
const T0 = new Date(2026, 0, 5, 9).getTime();
const hash = (s: GameSession) => weightsHash(exportWeights(s.sim.brainConfig));
const baby = (seed = 1, clock = new TestClock(T0)) => ({ s: GameSession.create({ name: 'Milo', species: 'dog' }, { rng: seededRng(seed), clock }), clock });

describe('GrowthSystem (desarrollo sin XP ni clics)', () => {
  it('rendimiento decreciente: repetir lo mismo aporta mucho menos que vivir cosas distintas', () => {
    const same = new GrowthSystem(newGrowthState('pet_x_a', T0));
    const varied = new GrowthSystem(newGrowthState('pet_x_a', T0));
    const kinds = Object.keys(GROWTH_CONFIG.experiencePoints);
    for (let i = 0; i < 40; i++) {
      same.noteExperience('played', 'ball', 1, T0 + i * 60_000, false);
      varied.noteExperience(kinds[i % kinds.length] as never, ['ball', 'teddy', 'duck', 'rope'][i % 4], 1, T0 + i * 60_000, false);
    }
    expect(same.state.development.points).toBeLessThan(varied.state.development.points * 0.6);
  });

  it('tope diario: un maratón no hace crecer en un día', () => {
    const g = new GrowthSystem(newGrowthState('pet_x_b', T0));
    const kinds = Object.keys(GROWTH_CONFIG.experiencePoints);
    for (let i = 0; i < 1000; i++) g.noteExperience(kinds[i % kinds.length] as never, `s${i}`, 1, T0 + i * 1000, false);
    expect(g.state.development.points).toBeLessThanOrEqual(GROWTH_CONFIG.dailyCap + 1e-9);
  });

  it('elegible solo con edad mínima Y desarrollo; un paso cada vez; el progreso vuelve a 0', () => {
    const g = new GrowthSystem(newGrowthState('pet_x_c', T0));
    g.state.development.points = stageConfig('BABY').developmentPoints;
    expect(g.eligibility(T0 + DAY / 2).eligible).toBe(false); // falta edad
    const later = T0 + g.minDurationMs() + 1;
    expect(g.eligibility(later).eligible).toBe(true);
    expect(g.advance(later, 3)).toEqual({ from: 'BABY', to: 'CHILD' });
    expect(g.progress).toBe(0);
    expect(g.eligibility(later + 365 * DAY).eligible).toBe(false); // edad de sobra, desarrollo no
  });

  it('plasticidad por etapa: todas aprenden, más de bebé', () => {
    const m = LIFE_STAGES.map(getPlasticityMultiplier);
    expect(m.every((x) => x > 0)).toBe(true);
    expect(m[0]).toBeGreaterThan(m[3]);
    expect([...m]).toEqual([...m].sort((a, b) => b - a));
  });

  it('la variación individual es pequeña y reproducible por semilla', () => {
    const a = createBaby('A', 7).session.growth.state.modifiers, b = createBaby('B', 7).session.growth.state.modifiers;
    expect(a).toEqual(b);
    for (const v of Object.values(a)) expect(Math.abs(v - 1)).toBeLessThanOrEqual(GROWTH_CONFIG.individualVariation + 1e-9);
  });
});

describe('Transición: MISMA mascota, MISMO cerebro', () => {
  it('los pesos aprendidos, la memoria y los hábitos se conservan', async () => {
    const { s, clock } = baby(2);
    s.setPlayerPresent(true);
    await trainWithObject(s, 'ball', 20, 40);
    for (let i = 0; i < 300; i++) { clock.advance(60_000); s.tick(); }
    const before = { hash: hash(s), exps: s.memory.experiences.length, moments: s.memory.moments.length, eps: s.memory.episodes.length, habits: detectHabits(s.memory.episodes, clock.now()) };
    const initial = s.plasticity.entries.map((e) => e.synapse.initialWeight);
    const babyExps = s.memory.experiences.filter((e) => e.lifeStage === 'BABY').length;
    expect(babyExps).toBe(before.exps);
    expect(s.plasticity.totalAbsDelta).toBeGreaterThan(0); // aprendió algo de bebé

    const ev = s.transition(clock.now());
    expect(ev?.from).toBe('BABY');
    expect(ev?.to).toBe('CHILD');
    expect(ev?.brainPreserved).toBe(true);
    expect(hash(s)).toBe(before.hash);
    expect(s.plasticity.entries.map((e) => e.synapse.initialWeight)).toEqual(initial); // no se "renace"
    expect(s.memory.experiences.length).toBe(before.exps);
    expect(s.memory.experiences.filter((e) => e.lifeStage === 'BABY').length).toBe(babyExps);
    expect(s.memory.moments.length).toBe(before.moments + 1); // + el recuerdo de crecer
    expect(s.memory.episodes.length).toBe(before.eps);
    expect(detectHabits(s.memory.episodes, clock.now())).toEqual(before.habits);
    expect(s.plasticity.stageMultiplier).toBe(getPlasticityMultiplier('CHILD'));
    // Lo nuevo se etiqueta con la nueva etapa
    for (let i = 0; i < 400; i++) { clock.advance(60_000); s.tick(); }
    expect(s.memory.experiences.slice(before.exps).every((e) => e.lifeStage === 'CHILD')).toBe(true);
  });

  it('transaccional: si algo falla, la etapa no queda a medias', () => {
    const { s, clock } = baby(3);
    const add = s.memory.addMoment.bind(s.memory);
    s.memory.addMoment = () => { throw new Error('disco lleno'); };
    expect(() => s.transition(clock.now())).toThrow('disco lleno');
    expect(s.growth.stage).toBe('BABY');
    expect(s.plasticity.stageMultiplier).toBe(getPlasticityMultiplier('BABY'));
    s.memory.addMoment = add;
    expect(s.transition(clock.now())?.to).toBe('CHILD');
  });

  it('no crece en mitad de un minijuego: queda pendiente y ocurre después', () => {
    const { s, clock } = baby(4);
    s.setPlayerPresent(true);
    s.devSatisfyAge();
    s.devSetDevelopmentProgress(1);
    s.startGame('come-here');
    for (let i = 0; i < 90; i++) { clock.advance(1000); s.tick(); }
    expect(s.growth.stage).toBe('BABY');
    expect(s.growth.state.pending?.to).toBe('CHILD');
    s.endGame();
    for (let i = 0; i < 600 && s.growth.stage === 'BABY'; i++) { clock.advance(1000); s.tick(); }
    expect(s.growth.stage).toBe('CHILD');
    expect(s.growth.state.pending).toBeNull();
  });
});

describe('Capacidades: ¿puede físicamente? (no ¿quiere?)', () => {
  it('un bebé no ejecuta RUN aunque la SNN lo pida; de joven sí puede', () => {
    const { s, clock } = baby(5);
    s.setPlayerPresent(true);
    for (let i = 0; i < 3000; i++) {
      if (i % 200 === 0) { s.interact('novel'); s.world.callPet(1); s.forceSensor('energy', 1, 30); s.forceSensor('boredom', 1, 30); }
      clock.advance(1000);
      const r = s.tick();
      expect(r.active).not.toContain('RUN');
      expect(r.active).not.toContain('DANCE');
    }
    expect(s.growth.canDo('RUN')).toBe(false);
    s.transition(); s.transition();
    expect(s.growth.stage).toBe('YOUNG');
    expect(s.growth.canDo('RUN') && s.growth.canDo('DANCE')).toBe(true);
  });
});

describe('Plasticidad según la etapa', () => {
  it('la misma experiencia cambia más los pesos de un bebé; el adulto también aprende', () => {
    const { s, clock } = baby(6);
    s.setPlayerPresent(true);
    for (let i = 0; i < 200; i++) { if (i % 40 === 0) s.interact('toy'); clock.advance(1000); s.tick(); }
    const deltas: Record<string, number> = {};
    for (const stage of ['BABY', 'ADULT'] as const) {
      const c = GameSession.clone(s, { rng: seededRng(1), clock: new TestClock(clock.now()) });
      for (let i = 0; i < 20; i++) c.tick(); // las trazas de elegibilidad no se guardan: se viven igual en ambos clones
      c.plasticity.stageMultiplier = getPlasticityMultiplier(stage);
      const w0 = c.plasticity.entries.map((e) => e.synapse.weight);
      c.injectReward(0.8);
      deltas[stage] = c.plasticity.entries.reduce((sum, e, i) => sum + Math.abs(e.synapse.weight - w0[i]), 0);
    }
    expect(deltas.ADULT).toBeGreaterThan(0);
    expect(deltas.BABY).toBeGreaterThan(deltas.ADULT * 1.5);
  });
});

describe('Offline: el tiempo pasa, el desarrollo tiene límites', () => {
  it('90 días fuera no convierten a un bebé en adulto', async () => {
    const { s, clock } = baby(7);
    clock.advance(90 * DAY);
    const rep = await simulateAway(s, 90 * DAY, async () => {});
    expect(s.growth.ageMs(clock.now())).toBeGreaterThanOrEqual(90 * DAY);
    expect(stageIndex(s.growth.stage)).toBe(0);
    expect(s.growth.state.development.points).toBeLessThanOrEqual(GROWTH_CONFIG.offlineMaxFractionPerAbsence * stageConfig('BABY').developmentPoints + 1e-9);
    expect(rep?.grewPending).toBe(false);
    for (let i = 0; i < 200; i++) { clock.advance(1000); s.tick(); }
    expect(s.growth.stage).toBe('BABY');
  });

  it('si ya tocaba crecer, offline queda pendiente y se vive al volver (un solo paso)', async () => {
    const { s, clock } = baby(8);
    s.devSatisfyAge();
    s.devSetDevelopmentProgress(1);
    clock.advance(30 * DAY);
    const rep = await simulateAway(s, 30 * DAY, async () => {});
    expect(rep?.grewPending).toBe(true);
    expect(s.growth.stage).toBe('BABY');
    const grew: string[] = [];
    s.events.on('growth', (g) => grew.push(`${g.from}->${g.to}`));
    for (let i = 0; i < 600 && !grew.length; i++) { clock.advance(1000); s.tick(); }
    expect(grew).toEqual(['BABY->CHILD']);
  });
});

describe('Save v4', () => {
  it('guarda y restaura el crecimiento completo', () => {
    const { s, clock } = baby(9);
    s.transition(clock.now());
    const save = JSON.parse(JSON.stringify(s.toSave(DEFAULT_SETTINGS, clock.now())));
    const b = GameSession.fromSave(migrateSave(save), { clock }).session;
    expect(b.growth.state).toEqual(s.growth.state);
    expect(b.plasticity.stageMultiplier).toBe(getPlasticityMultiplier('CHILD'));
    expect(hash(b)).toBe(hash(s));
  });

  it('una mascota antigua no pasa a adulta por antigüedad', () => {
    const { s, clock } = baby(10);
    const save = JSON.parse(JSON.stringify(s.toSave(DEFAULT_SETTINGS, clock.now())));
    const v3 = { ...save, saveVersion: 3, growth: { xp: 999 }, profile: { ...save.profile, adoptedAt: T0 - 400 * DAY } };
    const m = migrateSave(v3);
    expect(m.saveVersion).toBe(CURRENT_SAVE_VERSION); // v3 → v4 → v5 en cadena
    expect(m.growth.stage).toBe('BABY');
    expect(m.growth.stageStartedAt).toBe(save.savedAt);
    expect(m.growth.bornAt).toBe(T0 - 400 * DAY);
    const many = { ...v3, memory: { ...save.memory, experiences: Array.from({ length: 200 }, (_, i) => ({ ...save.memory.experiences[0] ?? {}, id: `e${i}` })) } };
    expect(migrateSave(many).growth.stage).toBe('CHILD'); // lo vivido cuenta, pero nunca más allá
  });
});

describe('Test fundamental: Milo y Luna (mismo cerebro, infancias distintas)', () => {
  it('crecen sin perder lo aprendido y de adultos siguen siendo distintos', async () => {
    const A = createBaby('Milo', 3), B = createBaby('Luna', 3);
    expect(brainDistance(A.session, B.session)).toBe(0);
    const ra = await liveUpbringing(A.session, A.clock, 'explorer', 30, 5);
    const rb = await liveUpbringing(B.session, B.clock, 'calm', 30, 5);
    for (const r of [ra, rb]) {
      expect(r.transitions.length).toBeGreaterThanOrEqual(1); // ambos pasan BABY → CHILD
      for (const t of r.transitions) {
        expect(t.brainPreserved).toBe(true); // crecer no toca el cerebro
        expect(stageIndex(t.to) - stageIndex(t.from)).toBe(1); // nunca se salta etapas
        expect(t.recap.length).toBeGreaterThan(0); // la celebración usa recuerdos reales
      }
    }
    expect(A.session.growth.stage).toBe('ADULT');
    // El registro de experiencias está acotado (rota), pero la infancia sigue resumida por sujeto
    expect(Object.keys(A.session.growth.state.subjects.BABY ?? {}).length).toBeGreaterThan(0);
    expect(A.session.memory.moments.filter((m) => m.lifeStage === 'BABY').length).toBeGreaterThan(0); // los recuerdos de bebé siguen
    expect(brainDistance(A.session, B.session)).toBeGreaterThan(0.5);
    const pa = await evaluatePreference(A.session, ['ball', 'teddy'], 30), pb = await evaluatePreference(B.session, ['ball', 'teddy'], 30);
    expect(pa.share).toBeGreaterThan(pb.share); // Milo creció con la pelota; Luna con el peluche
  }, 300_000);

  it('una rutina de bebé sigue en la historia al crecer', async () => {
    const { session: s, clock } = createBaby('Milo', 12);
    await liveDays(s, clock, { regime: 'consistent', days: 6, seed: 3 });
    const eps = s.memory.episodes.length;
    const before = detectHabits(s.memory.episodes, clock.now());
    if (s.growth.stage === 'BABY') s.transition(clock.now());
    expect(s.memory.episodes.length).toBe(eps);
    expect(detectHabits(s.memory.episodes, clock.now())).toEqual(before);
  }, 120_000);
});

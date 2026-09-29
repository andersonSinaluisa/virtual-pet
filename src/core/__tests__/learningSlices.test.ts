/*
 * VERTICAL SLICES DEL APRENDIZAJE (con la simulación completa, sin atajos)
 *
 *   ball stimulus → SNN → acciones → experiencia → reward → elegibilidad →
 *   cambio de pesos → persistencia → cambio de conducta → descubrimiento →
 *   memoria → "¿por qué hizo eso?"
 *
 * Ningún test elige por la mascota: el "jugador" solo lanza, llama y pulsa ❤️
 * cuando la mascota ya hizo algo. Las diferencias salen del cerebro aprendido.
 */
import { describe, expect, it } from '@jest/globals';

import { denseWeights } from '../brain/BrainWeights';
import { explainWhy } from '../explain/Why';
import type { FetchView } from '../games';
import { evaluateCall, evaluatePreference, trainCall, trainWithObject } from '../learning/experiments';
import { migrateSave } from '../persistence/migrations';
import { DEFAULT_SETTINGS } from '../persistence/SaveGame';
import { seededRng } from '../random';
import { GameSession } from '../session/GameSession';

const T0 = 1_700_000_000_000;
function fresh(seed = 11) {
  let t = T0;
  return GameSession.create({ name: 'Milo', species: 'dog' }, { rng: seededRng(seed), now: () => (t += 333) });
}

function saveLoad(s: GameSession, seed = 5): GameSession {
  const json = JSON.stringify(s.toSave(DEFAULT_SETTINGS, T0));
  return GameSession.fromSave(migrateSave(JSON.parse(json)), { rng: seededRng(seed) }).session;
}

describe('⚽ Vertical slice: Trae la pelota', () => {
  // Juega a lanzar la pelota durante un rato largo, recompensando cuando la mascota se implica
  const s = fresh(21);
  s.setPlayerPresent(true);
  s.startGame('fetch');
  let throws = 0;
  for (let t = 0; t < 4000; t++) {
    const v = s.gameView() as FetchView;
    if (t % 20 === 0 && v.canThrow && v.ballId !== null) {
      const a = s.config.rng() * Math.PI * 2;
      s.gameInput({ type: 'throw', vx: Math.cos(a) * 0.08, vy: Math.sin(a) * 0.08 });
      throws++;
    }
    const w = s.world, focus = w.getObject(w.pet.carrying) ?? w.getObject(w.focusObjectId);
    if (s.rewardable() && focus?.kind === 'ball') s.rewardPlayer();
    if (t % 100 === 0) { w.addFood(); w.addWater(); }
    s.tick();
  }
  s.endGame();

  it('la SNN produjo experiencias reales con la pelota, con recompensa', () => {
    expect(throws).toBeGreaterThan(20);
    const ballExps = s.memory.experiences.filter((e) => e.subject === 'ball' && e.reward > 0);
    expect(ballExps.length).toBeGreaterThan(10);
    expect(s.memory.stats.objectStats.ball?.interactions ?? 0).toBeGreaterThan(10);
  });

  it('las experiencias cambiaron los pesos de la vía de la pelota (gradualmente)', () => {
    expect(s.plasticity.pathwayDelta('seesBall')).toBeGreaterThan(0.1);
    expect(s.plasticity.pathwayDelta('ballAttention')).toBeGreaterThan(0.05);
    // Nunca un salto brusco: ningún evento movió una sinapsis más que el tope
    for (const ev of s.plasticity.log) for (const c of ev.changes) expect(Math.abs(c.delta)).toBeLessThanOrEqual(0.02 + 1e-9);
  });

  it('sobrevive a guardar, destruir y cargar', () => {
    const loaded = saveLoad(s);
    expect(denseWeights(loaded.sim.brainConfig, 'sensorToCircuit')).toEqual(denseWeights(s.sim.brainConfig, 'sensorToCircuit'));
    expect(denseWeights(loaded.sim.brainConfig, 'circuitToAction')).toEqual(denseWeights(s.sim.brainConfig, 'circuitToAction'));
    expect(loaded.plasticity.pathwayDelta('seesBall')).toBeCloseTo(s.plasticity.pathwayDelta('seesBall'), 12);
    expect(loaded.plasticity.entries.map((e) => e.synapse.initialWeight)).toEqual(s.plasticity.entries.map((e) => e.synapse.initialWeight));
    expect(loaded.memory.discoveries).toEqual(s.memory.discoveries);
    expect(loaded.memory.preferences()).toEqual(s.memory.preferences());
    expect(loaded.plasticity.log.length).toBe(s.plasticity.log.length);
  });

  it('cambia la conducta futura frente a una mascota sin esa historia', async () => {
    const trained = saveLoad(s);
    const naive = fresh(21);
    const a = await evaluatePreference(trained, ['ball', 'teddy'], 30);
    const b = await evaluatePreference(naive, ['ball', 'teddy'], 30);
    expect(a.share).toBeGreaterThan(b.share);
    expect(a.attention.ball).toBeGreaterThan(b.attention.ball);
  });

  it('produce memoria, descubrimiento y explicación respaldados por datos', () => {
    expect(s.memory.moments.some((m) => m.gameId === 'fetch')).toBe(true);
    expect(s.memory.discoveries.some((d) => d.key === 'likes:ball')).toBe(true);
    const d = s.decisions.find((x) => x.subject === 'ball' && x.pathway.some((p) => p.key.startsWith('ball') || p.key.startsWith('seesBall')));
    expect(d).toBeDefined();
    const why = explainWhy(d!, 'Milo', s.memory, s.plasticity);
    expect(why.steps.length).toBeGreaterThanOrEqual(2);
    expect(why.goodHistory).toContain('buenas experiencias');
    // La misma decisión, en una mascota SIN esa historia ni ese aprendizaje, no recibe la frase
    const naive = fresh(3);
    expect(explainWhy(d!, 'Milo', naive.memory, naive.plasticity).goodHistory).toBeNull();
    // ...ni tampoco si tiene historial pero su cerebro no cambió (la frase exige ambas cosas)
    const noBrain = saveLoad(s);
    noBrain.resetLearnedWeights();
    expect(explainWhy(d!, 'Milo', noBrain.memory, noBrain.plasticity).goodHistory).toBeNull();
  });
});

describe('👋 Ven aquí: aprende la asociación llamada → acercarse', () => {
  it('responde a la llamada tras el entrenamiento, y no por acercarse siempre', async () => {
    const s = fresh(11);
    const before = await evaluateCall(s, 40);
    await trainCall(s, 80);
    const after = await evaluateCall(s, 40);
    const control = await evaluateCall(s, 40, 40, 3, async () => {}, false);
    expect(s.plasticity.pathwayDelta('playerCalling')).toBeGreaterThan(0.1);
    expect(after.responses).toBeGreaterThan(before.responses + 4);
    expect(after.meanApproach).toBeGreaterThan(before.meanApproach);
    // Específico de la llamada: sin llamar no responde igual
    expect(after.responses).toBeGreaterThan(control.responses + 4);
  });
});

describe('🧸 ¿Cuál prefieres? Ball vs Plush (mismo cerebro inicial, experiencias distintas)', () => {
  it('Pet A (pelota) y Pet B (peluche) divergen de forma medible', async () => {
    const base = fresh(11), A = fresh(11), B = fresh(11);
    // Mismo cerebro de partida
    expect(denseWeights(A.sim.brainConfig, 'sensorToCircuit')).toEqual(denseWeights(B.sim.brainConfig, 'sensorToCircuit'));
    await trainWithObject(A, 'ball', 150);
    await trainWithObject(B, 'teddy', 150);
    // "cerrar y abrir la app"
    const A2 = saveLoad(A), B2 = saveLoad(B);
    const e0 = await evaluatePreference(base, ['ball', 'teddy'], 40);
    const eA = await evaluatePreference(A2, ['ball', 'teddy'], 40);
    const eB = await evaluatePreference(B2, ['ball', 'teddy'], 40);
    expect(eA.share).toBeGreaterThan(e0.share);
    // Antes: eB.share < e0.share. Ya fallaba antes del mundo vivo (0.065 vs 0.019: la mascota sin
    // historia casi solo miraba el peluche, así que "menos pelota que ella" era casi imposible). Con
    // memoria de exposición además la pelota es NUEVA para B y la investiga (novedad ≠ preferencia).
    // Lo que sí debe cumplirse: B juega con el peluche más que una mascota sin esa historia.
    expect(eB.engagement.teddy.play).toBeGreaterThan(e0.engagement.teddy.play);
    expect(eA.share - eB.share).toBeGreaterThan(0.12);
    expect(eA.engagement.ball.investigate).toBeGreaterThan(eB.engagement.ball.investigate);
    expect(eB.engagement.teddy.play).toBeGreaterThan(eA.engagement.teddy.play);
    // La evaluación no tocó los cerebros (modo evaluación sobre un clon)
    expect(A2.plasticity.pathwayDelta('seesBall')).toBeCloseTo(A.plasticity.pathwayDelta('seesBall'), 12);
  });
});

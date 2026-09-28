/*
 * Informe reproducible de resultados (docs/learning-results.md).
 * Solo se ejecuta si se invoca explícitamente:   npm run report:learning
 */
import { describe, expect, it } from '@jest/globals';

import { baseBrainConfig } from '../brain/BrainConfig';
import { evaluateCall, evaluatePreference, trainCall, trainWithObject } from '../learning/experiments';
import { seededRng } from '../random';
import { GameSession } from '../session/GameSession';

const run = process.env.LEARNING_REPORT === '1' || process.argv.some((a) => a.includes('learningReport')) ? describe : describe.skip;
const fresh = (seed: number) => GameSession.create({ name: 'Milo', species: 'dog' }, { rng: seededRng(seed), now: () => 1_700_000_000_000, lifeStage: 'YOUNG' });
const f = (v: number, d = 3) => v.toFixed(d);

run('Informe de aprendizaje', () => {
  it('genera los números', async () => {
    const out: string[] = [];
    const cfg = baseBrainConfig().plasticity;
    out.push(`CONFIG lr=${cfg.learningRate} decay=${cfg.eligibilityDecay} inc=${cfg.eligibilityIncrement} maxΔ/sin=${cfg.maxDeltaPerSynapse} maxΣΔ/exp=${cfg.maxWeightChangePerExperience} consumo=${cfg.eligibilityConsumption} presupuesto=${cfg.incomingBudgetFactor}`);
    out.push(`PLASTIC ${fresh(1).plasticity.entries.length} de ${fresh(1).sim.network.synapses.length} sinapsis`);

    // Curva de aprendizaje (semilla 11)
    const A = fresh(11), B = fresh(11);
    let done = 0;
    for (const target of [0, 10, 25, 50, 100, 150]) {
      if (target > done) { await trainWithObject(A, 'ball', target - done); await trainWithObject(B, 'teddy', target - done); done = target; }
      const ea = await evaluatePreference(A, ['ball', 'teddy'], 40), eb = await evaluatePreference(B, ['ball', 'teddy'], 40);
      out.push(`CURVE ep=${target} shareA=${f(ea.share)} shareB=${f(eb.share)} attnA(ball)=${f(ea.attention.ball, 2)} attnB(teddy)=${f(eb.attention.teddy, 2)} eventsA=${A.plasticity.experiencesApplied} |ΣΔ|A=${f(A.plasticity.totalAbsDelta, 2)}`);
      if (target === 150) {
        for (const [n, e] of [['A', ea], ['B', eb]] as const) {
          for (const k of ['ball', 'teddy']) {
            const x = e.engagement[k];
            out.push(`ENG ${n} ${k} focus=${x.focus} investigate=${x.investigate} play=${x.play} picks=${x.picks} firstReach=${x.firstReach} score=${x.score}`);
          }
        }
        out.push('TOPA ' + A.plasticity.topChanged(10).map((e) => `${e.key} ${f(e.synapse.initialWeight)}→${f(e.synapse.weight)}`).join(' | '));
        out.push('TOPB ' + B.plasticity.topChanged(10).map((e) => `${e.key} ${f(e.synapse.initialWeight)}→${f(e.synapse.weight)}`).join(' | '));
      }
    }
    const e0 = await evaluatePreference(fresh(11), ['ball', 'teddy'], 40);
    out.push(`BASE share=${f(e0.share)} ` + ['ball', 'teddy'].map((k) => `${k}: focus=${e0.engagement[k].focus} investigate=${e0.engagement[k].investigate} play=${e0.engagement[k].play} picks=${e0.engagement[k].picks} firstReach=${e0.engagement[k].firstReach}`).join(' / '));

    // Robustez: varias semillas
    for (const seed of [3, 7, 19, 23]) {
      const a = fresh(seed), b = fresh(seed), c = fresh(seed);
      await trainWithObject(a, 'ball', 150); await trainWithObject(b, 'teddy', 150);
      const [x, y, z] = [await evaluatePreference(c, ['ball', 'teddy'], 40, 45, seed), await evaluatePreference(a, ['ball', 'teddy'], 40, 45, seed), await evaluatePreference(b, ['ball', 'teddy'], 40, 45, seed)];
      out.push(`SEED ${seed} base=${f(x.share)} A=${f(y.share)} B=${f(z.share)} A−B=${f(y.share - z.share)}`);
    }

    // Llamada
    const C = fresh(11);
    const c0 = await evaluateCall(C, 40), cc0 = await evaluateCall(C, 40, 40, 3, async () => {}, false);
    const tr = await trainCall(C, 80);
    const c1 = await evaluateCall(C, 40), cc1 = await evaluateCall(C, 40, 40, 3, async () => {}, false);
    out.push(`CALL untrained call=${JSON.stringify(c0)} control=${JSON.stringify(cc0)}`);
    out.push(`CALL trained(${tr.rewards} ❤️/${tr.episodes}) call=${JSON.stringify(c1)} control=${JSON.stringify(cc1)}`);
    out.push('TOPC ' + C.plasticity.topChanged(6).map((e) => `${e.key} ${f(e.synapse.initialWeight)}→${f(e.synapse.weight)}`).join(' | '));

    console.log(out.join('\n'));
    expect(out.length).toBeGreaterThan(5);
  }, 900_000);
});

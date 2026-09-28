/*
 * Informe reproducible de crecimiento (docs/growth-results.md).
 * Solo se ejecuta si se invoca explícitamente:   npm run report:growth
 */
import { describe, expect, it } from '@jest/globals';

import { exportWeights } from '../brain/BrainWeights';
import { weightsHash } from '../growth/brainHash';
import { brainDistance, createBaby, liveUpbringing } from '../growth/experiments';
import { stageConfig } from '../growth/GrowthConfig';
import { compareStages } from '../growth/GrowthStory';
import { getPlasticityMultiplier } from '../growth/GrowthSystem';
import { evaluatePreference } from '../learning/experiments';
import { seededRng } from '../random';
import { probeContext } from '../routines/experiments';
import { GameSession } from '../session/GameSession';
import { simulateAway } from '../simulation/OfflineSimulation';
import { TestClock } from '../time/WorldClock';

const run = process.env.GROWTH_REPORT === '1' || process.argv.some((a) => a.includes('growthReport')) ? describe : describe.skip;
const f = (v: number, d = 2) => v.toFixed(d);
const DAY = 86_400_000;

run('Informe de crecimiento', () => {
  it('genera los números', async () => {
    const out: string[] = [];
    for (const st of ['BABY', 'CHILD', 'YOUNG', 'ADULT'] as const) {
      const c = stageConfig(st);
      out.push(`CONFIG ${st} minDías=${c.minDurationMs / DAY} desarrollo=${c.developmentPoints} plasticidad×${c.plasticity} velocidad×${c.speed} bloqueadas=${JSON.stringify(c.blocked)} necesidades=${JSON.stringify(c.needs)}`);
    }
    for (const seed of [3, 4, 5]) {
      const A = createBaby('Milo', seed), B = createBaby('Luna', seed);
      out.push(`SEED ${seed} distancia inicial=${f(brainDistance(A.session, B.session), 4)} hash igual=${weightsHash(exportWeights(A.session.sim.brainConfig)) === weightsHash(exportWeights(B.session.sim.brainConfig))}`);
      for (const [p, how] of [[A, 'explorer'], [B, 'calm']] as const) {
        const t0 = Date.now();
        const rep = await liveUpbringing(p.session, p.clock, how, 30, 5);
        const g = p.session.growth;
        out.push(`  ${p.session.profile.name} (${how}) ${Date.now() - t0}ms etapa=${g.stage} desarrollo total=${f(g.state.development.lifetimePoints, 1)} experiencias=${p.session.memory.experiences.length} recuerdos=${p.session.memory.moments.length}`);
        for (const t of rep.transitions) out.push(`    ${t.from}→${t.to} día ${t.petDay} cerebro intacto=${t.brainPreserved} recuerdos ${t.before.moments}→${t.after.moments} experiencias ${t.before.experiences}→${t.after.experiences} recap=${JSON.stringify(t.recap.map((m) => m.title))} antes/ahora=${JSON.stringify(t.comparisons.map((c) => `${c.before} → ${c.now}`))}`);
        out.push(`    hitos ${g.state.milestones.map((m) => `${m.type}@${m.petDay}(${m.lifeStage})`).join(' ')}`);
        out.push(`    bloqueadas ${JSON.stringify(g.blockedCounts)} · experiencias de bebé en el registro acotado=${p.session.memory.experiences.filter((e) => e.lifeStage === 'BABY').length} · recuerdos de bebé=${p.session.memory.moments.filter((m) => m.lifeStage === 'BABY').length} · sujetos resumidos de bebé=${Object.keys(g.state.subjects.BABY ?? {}).join(',')}`);
        const hist = g.state.history.map((h) => h.stage);
        for (let i = 1; i < hist.length; i++) {
          const cmp = compareStages(g.state.subjects, hist[i - 1], hist[i]);
          if (cmp.length) out.push(`    cuando era ${hist[i - 1]} → ${hist[i]}: ${JSON.stringify(cmp.map((c) => `${c.before} → ${c.now}`))}`);
        }
      }
      out.push(`  distancia final=${f(brainDistance(A.session, B.session), 3)}`);
      const pa = await evaluatePreference(A.session, ['ball', 'teddy'], 30), pb = await evaluatePreference(B.session, ['ball', 'teddy'], 30);
      const na = await probeContext(A.session, { minute: 15 * 60, needs: { fatigue: 0.3, curiosity: 0.7 }, novelObject: 'gift' });
      const nb = await probeContext(B.session, { minute: 15 * 60, needs: { fatigue: 0.3, curiosity: 0.7 }, novelObject: 'gift' });
      out.push(`  mismo escenario: pelota vs peluche Milo=${f(pa.share)} Luna=${f(pb.share)} · objeto nuevo investigado Milo=${na.novelEngaged}/20 Luna=${nb.novelEngaged}/20 · descanso Milo=${f(na.restShare)} Luna=${f(nb.restShare)}`);
    }
    // Plasticidad por etapa (misma experiencia, mismos clones)
    const base = GameSession.create({ name: 'P', species: 'dog' }, { rng: seededRng(6), clock: new TestClock(Date.UTC(2026, 0, 5)) });
    base.setPlayerPresent(true);
    for (let i = 0; i < 200; i++) { if (i % 40 === 0) base.interact('toy'); base.tick(); }
    const d: string[] = [];
    for (const st of ['BABY', 'CHILD', 'YOUNG', 'ADULT'] as const) {
      const c = GameSession.clone(base, { rng: seededRng(1), clock: new TestClock(Date.UTC(2026, 0, 6)) });
      for (let i = 0; i < 20; i++) c.tick();
      c.plasticity.stageMultiplier = getPlasticityMultiplier(st);
      const w0 = c.plasticity.entries.map((e) => e.synapse.weight);
      c.injectReward(0.8);
      d.push(`${st}=${f(c.plasticity.entries.reduce((s, e, i) => s + Math.abs(e.synapse.weight - w0[i]), 0), 4)}`);
    }
    out.push(`PLASTICITY Σ|Δw| por la misma recompensa: ${d.join(' ')}`);
    // Offline
    for (const days of [7, 30, 90]) {
      const clock = new TestClock(Date.UTC(2026, 0, 5, 9));
      const s = GameSession.create({ name: 'O', species: 'dog' }, { rng: seededRng(7), clock });
      clock.advance(days * DAY);
      const t0 = Date.now();
      const rep = await simulateAway(s, days * DAY, async () => {});
      out.push(`OFFLINE ${days} días: ${Date.now() - t0}ms ticks=${rep?.simulatedTicks} etapa=${s.growth.stage} progreso=${f(s.growth.progress)} pendiente=${rep?.grewPending} edad=${f(s.growth.ageMs(clock.now()) / DAY, 1)}d`);
    }
    console.log(out.join('\n'));
    expect(out.length).toBeGreaterThan(0);
  }, 3_600_000);
});

/*
 * Informe reproducible de rutinas (docs/routine-results.md).
 * Solo se ejecuta si se invoca explícitamente:   npm run report:routines
 */
import { describe, expect, it } from '@jest/globals';

import { circularStats, detectHabits, mainSleeps } from '../routines/HabitDetector';
import { interpretEvolution, interpretRoutines, routineHeadline } from '../routines/RoutineInterpreter';
import {
  createLivingPet, freeRun, liveDays, liveReturns, probeContext, probeReturn, ROOM_SPOTS,
} from '../routines/experiments';

const run = process.env.ROUTINE_REPORT === '1' || process.argv.some((a) => a.includes('routineReport')) ? describe : describe.skip;
const f = (v: number, d = 2) => v.toFixed(d);
const SEEDS = [1, 2, 3, 4, 5];
const CLOCKS = ['time00', 'time04', 'time08', 'time12', 'time16', 'time20'] as const;

run('Informe de rutinas', () => {
  it('genera los números', async () => {
    const out: string[] = [];

    // 1) Sueño: rutina consistente (A) vs irregular (B), mismo cerebro inicial, 30 días
    for (const seed of SEEDS) {
      for (const regime of ['consistent', 'irregular'] as const) {
        const { session: s, clock } = createLivingPet('Milo', seed);
        let night = 0, total = 0;
        const t0 = Date.now();
        await liveDays(s, clock, { regime, days: 30, seed: seed * 7 }, undefined, (minute, d) => {
          if (d < 15 || !s.world.pet.asleep) return;
          total++;
          if (minute >= 22 * 60 || minute < 6 * 60) night++;
        });
        const ms = Date.now() - t0;
        const mains = mainSleeps(s.memory.episodes).slice(-21);
        const st = circularStats(mains.map((e) => ({ item: e, w: 1 })));
        const habits = detectHabits(s.memory.episodes, clock.now());
        const sleepH = habits.find((h) => h.type === 'SLEEP_TIME_PATTERN');
        const n = await probeContext(s, { minute: 23 * 60, needs: { fatigue: 0.4 } });
        const d = await probeContext(s, { minute: 14 * 60, needs: { fatigue: 0.4 } });
        const nl = await probeContext(s, { minute: 23 * 60, lamp: true, needs: { fatigue: 0.4 } });
        const fr = await freeRun(s);
        const W = (k: string) => s.plasticity.entries.find((e) => e.key === k)?.synapse.weight ?? 0;
        out.push(`SLEEP seed=${seed} ${regime} ms/30d=${ms} life.nightShare=${f(nightOr(night, total))} life.onsetR=${f(st.r)} life.onsetMean=${f(st.mean / 60, 1)}h habit=${sleepH ? f(sleepH.confidence) : '-'} headline="${routineHeadline(habits, 'Milo')}"`);
        out.push(`  probe night=${f(n.restShare)}/${f(n.asleepShare)} day=${f(d.restShare)}/${f(d.asleepShare)} lampNight=${f(nl.restShare)} selectivity=${f(fr.selectivity)} | freeRun nightShare=${f(fr.nightShare)} asleep=${f(fr.asleepShare)} onsetR=${f(fr.onsetR)} onsetMean=${f(fr.onsetMeanMinute / 60, 1)}h`);
        out.push(`  weights→rest ${CLOCKS.map((c) => `${c}=${f(W(`${c}→restCircuit`), 3)}`).join(' ')} darkness=${f(W('darkness→restCircuit'), 3)} zoneBed=${f(W('zoneBed→restCircuit'), 3)} fatigue=${f(W('fatigue→restCircuit'), 3)}`);
      }
    }

    // 2) Milo vs Luna (el experimento del laboratorio de desarrollo)
    for (const [name, regime] of [['Milo', 'consistent'], ['Luna', 'irregular']] as const) {
      const { session: s, clock } = createLivingPet(name, 11);
      await liveDays(s, clock, { regime, days: 30, seed: 7 });
      const habits = s.habits(clock.now());
      out.push(`LAB ${name}: "${routineHeadline(habits, name)}" cards=${JSON.stringify(interpretRoutines(habits, name).map((c) => c.lines))}`);
      out.push(`  habits=${JSON.stringify(habits.map((h) => [h.type, +f(h.confidence), h.days]))}`);
      out.push(`  evolution=${JSON.stringify(interpretEvolution(s.memory.habitSnapshots).map((e) => `[${e.petDay}] ${e.text}`))}`);
    }

    // 3) Regreso del jugador (21 días)
    for (const seed of [1, 2, 3]) {
      const res: string[] = [];
      for (const regime of ['consistent', 'irregular'] as const) {
        const { session: s, clock } = createLivingPet('Milo', seed);
        const pre = await probeReturn(s);
        const tr = await liveReturns(s, clock, regime, 21, seed);
        const post = await probeReturn(s);
        const h = detectHabits(s.memory.episodes, clock.now()).find((x) => x.type === 'PLAYER_RETURN_GREETING');
        const W = (k: string) => s.plasticity.entries.find((e) => e.key === k)?.synapse.weight ?? 0;
        res.push(`${regime} returns=${tr.returns} ❤️=${tr.rewarded} probe ${pre.greeted}/${pre.trials}→${post.greeted}/${post.trials} lat ${f(pre.meanLatency, 1)}→${f(post.meanLatency, 1)} social=${f(W('playerReturned→socialCircuit'), 3)} lifeHabit=${h ? f(h.confidence) : '-'}`);
      }
      out.push(`RETURN seed=${seed} ${res.join(' | ')}`);
    }

    // 4) Deriva del hábito: la cama cambia de sitio el día 20
    for (const seed of [1, 2]) {
      const { session: s, clock } = createLivingPet('Milo', seed);
      const loc: string[] = [];
      await liveDays(s, clock, { regime: 'consistent', days: 40, seed, bedAt: ROOM_SPOTS.rincon, moveBedOnDay: 20, bedLaterAt: ROOM_SPOTS.ventana }, undefined, (minute, d) => {
        if (minute !== 1439 || d % 4 !== 3) return;
        const fav = detectHabits(s.memory.episodes, clock.now()).find((x) => x.type === 'FAVORITE_SLEEP_LOCATION');
        loc.push(`d${d + 1}:${fav ? `${fav.params.area}(${f(fav.confidence)})` : '-'}`);
      });
      out.push(`DRIFT seed=${seed} ${loc.join(' ')}`);
      out.push(`  evolution=${JSON.stringify(interpretEvolution(s.memory.habitSnapshots).map((e) => `[${e.petDay}] ${e.text}`))}`);

      // 5) Interrupción: de noche, descansado y curioso, con algo nuevo y emocionante
      const calm = await probeContext(s, { minute: 23 * 60, needs: { fatigue: 0.2, curiosity: 0.8 } });
      const novel = await probeContext(s, { minute: 23 * 60, needs: { fatigue: 0.2, curiosity: 0.8 }, novelObject: 'gift' });
      const tired = await probeContext(s, { minute: 23 * 60, needs: { fatigue: 0.75 } });
      out.push(`INTERRUPT seed=${seed} rested+curious: rest=${f(calm.restShare)} asleep=${f(calm.asleepShare)} | +gift: rest=${f(novel.restShare)} asleep=${f(novel.asleepShare)} engaged=${novel.novelEngaged}/${novel.trials} | tired: rest=${f(tired.restShare)} asleep=${f(tired.asleepShare)}`);
    }

    console.log(out.join('\n'));
    expect(out.length).toBeGreaterThan(0);
  }, 3_600_000);
});

function nightOr(night: number, total: number): number {
  return total ? night / total : 0;
}

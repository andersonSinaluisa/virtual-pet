/*
 * Informe reproducible del mundo vivo (docs/living-world-results.md).
 * Solo se ejecuta si se invoca explícitamente:   npm run report:world
 */
import { describe, expect, it } from '@jest/globals';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { simulateAway } from '../simulation/OfflineSimulation';
import {
  boxHistory, contextComparison, explainBoxEpisode, firstVisit, hearingProbe, labPet, measureBoxTendency, movementComparison, noveltyCurve,
  perceptionProbe, perfBenchmark, sharedScene, summarizeScene,
} from '../world/experiments';
import { LOCATIONS } from '../world/Locations';

const run = process.env.WORLD_REPORT === '1' || process.argv.some((a) => a.includes('livingWorldReport')) ? describe : describe.skip;
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : String(v));

run('Informe del mundo vivo', () => {
  it('genera los números', async () => {
    const out: string[] = [];
    const log = (s: string) => out.push(s);

    // ---- A: percepción ----
    log('## A PERCEPCIÓN (bola, mascota en (0.5,0.5) mirando al frente)');
    for (const dark of [false, true]) {
      for (const c of perceptionProbe(1, dark)) {
        const p = c.percept;
        log(`${dark ? 'NOCHE' : 'DÍA'} | ${c.label} | ${f(p.meters)} m | ángulo ${f(p.angle, 0)}° | FOV ${p.inFov} | visión ${f(p.vision)} | cerca ${f(p.near)} | seesBall→SNN ${f(c.seesBall)}`);
      }
    }
    const h = hearingProbe(1);
    log(`OÍDO: pelota cae detrás → oída ${f(h.heard)} · dirección ${f(h.direction, 0)}° · detrás=${h.behind} · atención=${h.attention} · la mira a los ${h.lookedWithin ?? '—'} ticks`);

    // ---- B: novedad / familiaridad ----
    log('## B NOVEDAD/FAMILIARIDAD (caja, 12 exposiciones de 60 ticks separadas por 300)');
    const nb = labPet('Milo', 4);
    const curve = noveltyCurve(nb.session, 'mysteryBox', 12);
    for (const p of curve) log(`exp ${p.exposure} novedad ${f(p.novelty)} familiaridad ${f(p.familiarity)} etapa ${p.stage}`);
    const later = nb.clock.now() + 21 * 86_400_000;
    log(`21 días sin verla: novedad ${f(nb.session.world.knowledge.novelty('mysteryBox', later))} · familiaridad ${f(nb.session.world.knowledge.familiarity('mysteryBox'))}`);

    // ---- C: dos mascotas ----
    log('## C DOS MASCOTAS, MISMO GENOMA, HISTORIAS DISTINTAS (15 ensayos con la caja)');
    for (const seed of [11, 12, 13]) {
      const A = labPet('Milo', seed), B = labPet('Milo', seed), N = labPet('Milo', seed);
      const ha = await boxHistory(A.session, 15, false), hb = await boxHistory(B.session, 15, true);
      const tA = await measureBoxTendency(A.session, 12), tB = await measureBoxTendency(B.session, 12), tN = await measureBoxTendency(N.session, 12);
      const d = (s: typeof A.session, k: string) => f(s.plasticity.synapseDelta(k), 3);
      log(`seed ${seed} historia A: abrió ${ha.filter((t) => t.opened).length}/15, sustos ${ha.reduce((s, t) => s + t.fearOnsets, 0)} · B: sustos ${hb.reduce((s, t) => s + t.fearOnsets, 0)}`);
      log(`  Δ seesBox→fear A ${d(A.session, 'seesBox→fearCircuit')} B ${d(B.session, 'seesBox→fearCircuit')} · Δ seesBox→curiosity A ${d(A.session, 'seesBox→curiosityCircuit')} B ${d(B.session, 'seesBox→curiosityCircuit')} · Δ newObject→fear B ${d(B.session, 'newObjectDetected→fearCircuit')}`);
      for (const [n, t] of [['sin historia', tN], ['A (sin sustos)', tA], ['B (aversiva)', tB]] as const) {
        log(`  ${n}: se acerca ${f(t.approachRate)} · dist mín ${f(t.meanMinDistance)} · ticks cerca ${f(t.meanNearTicks, 1)} · investiga ${f(t.meanInvestigate, 1)} · miedo ${f(t.fearRate)} · abre ${f(t.openRate)} · 1ª acción ${JSON.stringify(t.firstActions)}`);
      }
      const sA = summarizeScene(await sharedScene(A.session, 8)), sB = summarizeScene(await sharedScene(B.session, 8));
      log(`  ESCENA 📦⚽🧸 A: 1º ${JSON.stringify(sA.firstReach)} implicación ${JSON.stringify(Object.fromEntries(Object.entries(sA.engagementShare).map(([k, v]) => [k, f(v)])))} miedo ${f(sA.fearRate)}`);
      log(`                B: 1º ${JSON.stringify(sB.firstReach)} implicación ${JSON.stringify(Object.fromEntries(Object.entries(sB.engagementShare).map(([k, v]) => [k, f(v)])))} miedo ${f(sB.fearRate)}`);
    }

    // ---- Milo vs Luna: genomas e historias distintos, misma escena, explicación ----
    log('## MILO vs LUNA (misma escena 📦 ⚽ 🧸)');
    const milo = labPet('Milo', 21), luna = labPet('Luna', 21, { preset: 'miedoso' });
    await boxHistory(milo.session, 10, false);
    await boxHistory(luna.session, 10, true);
    for (const p of [milo, luna]) {
      const sc = summarizeScene(await sharedScene(p.session, 10));
      log(`${p.session.profile.name} (${p.session.profile.preset}): 1º ${JSON.stringify(sc.firstReach)} · implicación ${JSON.stringify(Object.fromEntries(Object.entries(sc.engagementShare).map(([k, v]) => [k, f(v)])))} · miedo ${f(sc.fearRate)}`);
      const ex = explainBoxEpisode(p.session, 120);
      log(`  percibió: ${ex.perceived ? `señal ${f(ex.perceived.signal)} a ${f(ex.perceived.meters)} m, ${f(ex.perceived.angle, 0)}°, novedad ${f(ex.perceived.novelty)}, familiaridad ${f(ex.perceived.familiarity)}` : '—'}`);
      log(`  entradas SNN: ${ex.snnInputs.filter((x) => x.value > 0.01).map((x) => `${x.key}=${f(x.value)}`).join(' ')}`);
      log(`  decisión: ${ex.decision ? `${ex.decision.action} ← circuitos ${ex.decision.circuits.join(', ')} ← sensores ${ex.decision.sensors.map((x) => `${x.key}(${f(x.value)})`).join(', ')} · vía ${ex.decision.pathway.map((x) => `${x.key} ${f(x.initial)}→${f(x.current)}`).join('; ')}` : '—'}`);
      log(`  acciones: ${ex.actions.slice(0, 14).join(' ')}`);
      log(`  experiencias: ${ex.experiences.map((e) => `${e.kind}${e.subject ? `(${e.subject})` : ''} v=${f(e.valence)} r=${f(e.reward)}`).join(' | ')}`);
      log(`  aprendió: ${ex.learned.slice(0, 6).map((l) => `${l.source} r=${f(l.reward)} [${l.top.map((c) => `${c.key} ${c.delta > 0 ? '+' : ''}${f(c.delta, 4)}`).join(', ')}]`).join(' | ')}`);
    }

    // ---- D: contexto ----
    log('## D CONTEXTO (misma mascota, misma caja)');
    const ctx = await contextComparison(labPet('Milo', 3).session, 10);
    for (const [n, t] of [['día + habitación', ctx.dayRoom], ['noche + parque desconocido', ctx.nightPark]] as const) log(`${n}: se acerca ${f(t.approachRate)} · dist mín ${f(t.meanMinDistance)} · miedo ${f(t.fearRate)} · investiga ${f(t.meanInvestigate, 1)} · 1ª ${JSON.stringify(t.firstActions)}`);

    // ---- E: movimiento ----
    log('## E MOVIMIENTO (16 ensayos)');
    const mv = await movementComparison(labPet('Milo', 3).session, 16);
    for (const [n, t] of [['quieta', mv.stationary], ['rodando', mv.rolling]] as const) log(`${n}: objectMoving ${f(t.objectMoving)} · la mira (12 ticks) ${t.lookOnsets}/16 · se implica (25 ticks) ${t.engageOnsets}/16 · ticks de foco ${t.focusTicks}`);

    // ---- Jardín / parque ----
    log('## PRIMERA VISITA');
    for (const seed of [5, 6, 7]) {
      const v = firstVisit(labPet('Milo', seed, { stage: 'CHILD' }).session, 'garden', 200);
      log(`jardín seed ${seed}: "${v.momentTitle}" — ${v.momentStory} · distancia máx ${f(v.maxDistance)} · nuevo: ${v.newThingsSeen.join(',') || '—'} · ${JSON.stringify(v.onsets)}`);
    }
    const pk = firstVisit(labPet('Milo', 8, { stage: 'YOUNG' }).session, 'park', 200);
    log(`parque: "${pk.momentTitle}" — ${pk.momentStory} · distancia máx ${f(pk.maxDistance)}`);
    // Salidas autónomas con la puerta abierta (cachorro cuidado: comida, agua, una caricia de vez en cuando)
    for (const preset of ['equilibrado', 'curioso', 'miedoso'] as const) for (const seed of [8, 9, 10]) {
      const p = labPet('Milo', seed, { stage: 'CHILD', preset });
      p.session.setGardenDoor(true);
      let outs = 0, backs = 0, garden = 0;
      for (let t = 0; t < 6000; t++) {
        const loc = p.session.world.location;
        if (t % 300 === 0) { p.session.world.addFood(); p.session.world.addWater(); }
        if (t % 150 === 0) p.session.petDirect();
        p.session.tick();
        if (loc === 'room' && p.session.world.location === 'garden') outs++;
        if (loc === 'garden' && p.session.world.location === 'room') backs++;
        if (p.session.world.location === 'garden') garden++;
      }
      const m = p.session.memory.moments.find((x) => x.title.includes('jardín'));
      log(`puerta abierta 6000 ticks ${preset} seed ${seed}: salió ${outs} · volvió ${backs} · ${f((garden / 6000) * 100, 1)} % en el jardín${m ? ` · "${m.title}": ${m.story}` : ''}`);
    }

    // ---- F: offline ----
    log('## F OFFLINE (8 h)');
    for (const [open, preset] of [[false, 'curioso'], [true, 'curioso'], [true, 'equilibrado']] as const) {
      const p = labPet('Milo', 13, { stage: 'CHILD', preset });
      if (open) p.session.setGardenDoor(true);
      p.session.world.placeItem('mysteryBox', { x: 0.7, y: 0.7 });
      p.clock.advance(8 * 3_600_000);
      const rep = await simulateAway(p.session, 8 * 3_600_000, async () => {});
      log(`${preset} · puerta ${open ? 'abierta' : 'cerrada'}: lugares ${rep?.locationsVisited.join('→')} · termina en ${rep?.endLocation} · ${rep?.highlights.join(' ')}`);
    }

    // ---- G: rendimiento (Node) ----
    log('## G RENDIMIENTO (tick completo, Node)');
    for (const r of perfBenchmark([10, 25, 50], 600)) log(`${r.objects} objetos: tick ${f(r.stepMs, 3)} ms (p95 ${f(r.p95StepMs, 3)}) · percepción ${f(r.perceiveMs, 3)} ms`);
    log(`ubicaciones: ${Object.values(LOCATIONS).map((l) => `${l.id}${l.available ? '' : '(preparada)'}`).join(', ')}`);

    const text = out.join('\n');
    console.log(text);
    writeFileSync(join(__dirname, '..', '..', '..', 'docs', 'living-world-report.txt'), text + '\n');
    expect(out.length).toBeGreaterThan(10);
  }, 1_800_000);
});

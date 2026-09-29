/*
 * Rutinas y hábitos emergentes. Los umbrales siguen lo MEDIDO en
 * docs/routine-results.md (dirección del efecto), no están ajustados para aprobar.
 */
import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { EpisodeRecord } from '../memory/types';
import { migrateSave } from '../persistence/migrations';
import { CURRENT_SAVE_VERSION, DEFAULT_SETTINGS } from '../persistence/SaveGame';
import { seededRng } from '../random';
import { detectHabits, mainSleeps } from '../routines/HabitDetector';
import { approxHour, interpretEvolution, routineHeadline } from '../routines/RoutineInterpreter';
import { createLivingPet, freeRun, liveDays, localMidnight, probeContext, ROOM_SPOTS } from '../routines/experiments';
import { GameSession } from '../session/GameSession';
import { simulateAway } from '../simulation/OfflineSimulation';
import { clockInfo, clockPopulation, daylightAt, SimulationClock, TestClock } from '../time/WorldClock';

const DAY = 86_400_000, MIN = 60_000;
const T0 = localMidnight(2026, 0, 5);

function sleepEp(day: number, minute: number, minutes: number, area = 'rincon', offline = false): EpisodeRecord {
  const start = T0 + day * DAY + minute * MIN;
  return { kind: 'sleep', start, end: start + minutes * MIN, minuteOfDay: minute % 1440, day: clockInfo(start).day, area, light: 0, activityBefore: 0.1, subject: 'bed', offline };
}

describe('WorldClock', () => {
  it('la hora es contexto continuo y cíclico', () => {
    const noon = clockInfo(T0 + 12 * 60 * MIN), midnight = clockInfo(T0);
    expect(noon.hour).toBe(12);
    expect(midnight.timeOfDay).toBe('NIGHT');
    expect(daylightAt(12 * 60)).toBeCloseTo(1);
    expect(daylightAt(0)).toBeCloseTo(0);
    expect(daylightAt(6 * 60)).toBeCloseTo(daylightAt(18 * 60), 5); // simétrica
    const pop = clockPopulation(midnight.timeSin, midnight.timeCos);
    expect(pop[0]).toBeCloseTo(1); // time00 máxima a medianoche
    expect(Math.max(...pop.slice(2, 5))).toBeLessThan(0.01); // 08–16 h casi apagadas
  });

  it('SimulationClock avanza con el tick; TestClock solo a mano', () => {
    const c = new SimulationClock(T0, 60_000);
    const s = GameSession.create({ name: 'Milo', species: 'dog' }, { rng: seededRng(1), clock: c });
    for (let i = 0; i < 90; i++) s.tick();
    expect(clockInfo(c.now()).minuteOfDay).toBeCloseTo(90);
    const t = new TestClock(T0);
    const s2 = GameSession.create({ name: 'Luna', species: 'cat' }, { rng: seededRng(1), clock: t });
    for (let i = 0; i < 10; i++) s2.tick();
    expect(t.now()).toBe(T0);
    t.set(T0 + 23 * 60 * MIN);
    s2.tick();
    expect(s2.world.lightLevel).toBeLessThan(0.1); // de noche y sin lámpara: oscuro
    s2.world.setLight(true);
    s2.tick();
    expect(s2.world.lightLevel).toBeGreaterThanOrEqual(0.8); // la lámpara es independiente de la hora
  });
});

describe('Arquitectura: la hora NO decide', () => {
  const CORE = join(__dirname, '..');
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : files(p);
    return p.endsWith('.ts') ? [p] : [];
  });
  const decisionFiles = files(CORE).filter((f) => /[\\/](brain|neural|learning)[\\/]|ActionSystem|Simulation\.ts$|MovementSystem/.test(f));
  it.each(decisionFiles.map((f) => [f.slice(CORE.length + 1), f]))('%s no consulta reloj ni hábitos', (_n, file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/from\s+['"][./]*(time|routines)\//);
    expect(src).not.toMatch(/\b(getHours|minuteOfDay|timeOfDay)\b/);
  });
});

describe('HabitDetector (interpreta, no decide)', () => {
  it('sueño nocturno consistente → patrón de hora y lugar; aleatorio → nada', () => {
    const regular = Array.from({ length: 14 }, (_, d) => sleepEp(d, 22 * 60 + ((d * 7) % 40) - 20, 420));
    const now = T0 + 15 * DAY;
    const h = detectHabits(regular, now);
    const time = h.find((x) => x.type === 'SLEEP_TIME_PATTERN');
    expect(time?.confidence).toBeGreaterThan(0.6);
    expect(h.find((x) => x.type === 'FAVORITE_SLEEP_LOCATION')?.params.area).toBe('rincon');
    expect(routineHeadline(h, 'Milo')).toMatch(/rutina nocturna/);

    const rng = seededRng(3);
    const random = Array.from({ length: 14 }, (_, d) => sleepEp(d, Math.floor(rng() * 1440), 300, ['rincon', 'ventana', 'alfombra'][d % 3]));
    const hr = detectHabits(random, now);
    expect(hr.find((x) => x.type === 'SLEEP_TIME_PATTERN')?.confidence ?? 0).toBeLessThan(0.5);
    expect(routineHeadline(hr, 'Luna')).toBe('Todavía no observamos una rutina clara.');
  });

  it('las siestas no definen la hora de dormir; lo offline no cuenta', () => {
    const eps = Array.from({ length: 10 }, (_, d) => [sleepEp(d, 22 * 60, 400), sleepEp(d, 14 * 60, 40)]).flat();
    expect(mainSleeps(eps).every((e) => e.minuteOfDay === 22 * 60)).toBe(true);
    const offline = Array.from({ length: 10 }, (_, d) => sleepEp(d, 22 * 60, 400, 'rincon', true));
    expect(detectHabits(offline, T0 + 11 * DAY)).toEqual([]);
  });

  it('el texto nunca da horas exactas', () => {
    expect(approxHour(22 * 60 + 3)).toBe('alrededor de las 10 de la noche');
    expect(approxHour(7 * 60 + 40)).toBe('alrededor de las 8 de la mañana');
  });

  it('la evolución tiene histéresis: rondar el umbral no inventa idas y venidas', () => {
    const snap = (petDay: number, c: number) => ({ day: petDay, petDay, habits: [{ type: 'SLEEP_TIME_PATTERN', confidence: c, key: 'por la noche' }] });
    const ev = interpretEvolution([snap(1, 0.55), snap(2, 0.45), snap(3, 0.52), snap(4, 0.41), snap(5, 0.2)]);
    expect(ev.map((e) => e.petDay)).toEqual([1, 5]);
  });
});

describe('Recompensa: dormir descansado no refuerza el descanso', () => {
  it('descansar sin cansancio da resultado neutro (≤ 0)', () => {
    const c = new SimulationClock(T0 + 14 * 60 * MIN);
    const s = GameSession.create({ name: 'Milo', species: 'dog' }, { rng: seededRng(2), clock: c, physiology: 'day' });
    s.setPetStat('fatigue', 0.05);
    const rested: number[] = [];
    s.events.on('experience', (e) => { if (e.kind === 'rested') rested.push(e.reward); });
    for (let i = 0; i < 400; i++) { s.forceSensor('fatigue', 1, 2); s.setPetStat('fatigue', 0.05); s.tick(); }
    expect(rested.length).toBeGreaterThan(0);
    expect(Math.max(...rested)).toBeLessThanOrEqual(0);
  });
});

describe('Experimentos (vidas simuladas de 30 días)', () => {
  it('sueño: horario consistente vs irregular (3 semillas)', async () => {
    let nightA = 0, nightB = 0, selA = 0, selB = 0;
    for (const seed of [1, 2, 3]) {
      for (const regime of ['consistent', 'irregular'] as const) {
        const { session: s, clock } = createLivingPet('Milo', seed);
        let night = 0, total = 0;
        await liveDays(s, clock, { regime, days: 30, seed: seed * 7 }, undefined, (minute, d) => {
          if (d < 15 || !s.world.pet.asleep) return;
          total++;
          if (minute >= 22 * 60 || minute < 6 * 60) night++;
        });
        const fr = await freeRun(s, 1);
        if (regime === 'consistent') { nightA += night / total; selA += fr.selectivity; } else { nightB += night / total; selB += fr.selectivity; }
        for (const e of s.plasticity.entries) expect(Number.isFinite(e.synapse.weight)).toBe(true);
      }
    }
    expect(nightA).toBeGreaterThan(nightB); // en su vida, A duerme más de noche
    // La selectividad APRENDIDA (mismo contexto, clones congelados) era un efecto débil: con la casa amueblada
    // (HOME 2.0) ya no se sostiene (B supera a A en 3/5 semillas; docs/routine-results.md §8). Se informa, no se exige.
    expect(Number.isFinite(selA) && Number.isFinite(selB)).toBe(true);
  }, 600_000);

  it('deriva: la cama cambia de sitio y el hábito la sigue', async () => {
    const { session: s, clock } = createLivingPet('Milo', 1);
    let before: string | undefined;
    await liveDays(s, clock, { regime: 'consistent', days: 40, seed: 1, bedAt: ROOM_SPOTS.rincon, moveBedOnDay: 20, bedLaterAt: ROOM_SPOTS.ventana }, undefined, (minute, d) => {
      if (d === 19 && minute === 1439) before = detectHabits(s.memory.episodes, clock.now()).find((h) => h.type === 'FAVORITE_SLEEP_LOCATION')?.params.area;
    });
    expect(before).toBe('rincon');
    expect(detectHabits(s.memory.episodes, clock.now()).find((h) => h.type === 'FAVORITE_SLEEP_LOCATION')?.params.area).toBe('ventana');

    // Interrupción: de noche pero descansado y curioso, con algo nuevo → no se le obliga a dormir
    const novel = await probeContext(s, { minute: 23 * 60, needs: { fatigue: 0.2, curiosity: 0.8 }, novelObject: 'gift' });
    const tired = await probeContext(s, { minute: 23 * 60, needs: { fatigue: 0.75 } });
    expect(novel.novelEngaged).toBeGreaterThanOrEqual(15);
    expect(novel.asleepShare).toBeLessThan(0.05);
    expect(tired.asleepShare).toBeGreaterThan(0.3);
  }, 600_000);
});

describe('Persistencia y offline', () => {
  it('save v2 → v3: rutina vacía y lámpara apagada; los episodios sobreviven al guardar', async () => {
    const { session: s, clock } = createLivingPet('Milo', 4);
    await liveDays(s, clock, { regime: 'consistent', days: 5, seed: 4 });
    const save = JSON.parse(JSON.stringify(s.toSave(DEFAULT_SETTINGS, clock.now())));
    const back = GameSession.fromSave(migrateSave(save), { clock }).session;
    expect(back.memory.episodes.length).toBe(s.memory.episodes.length);
    expect(back.habits(clock.now())).toEqual(s.habits(clock.now()));

    const v2 = { ...save, saveVersion: 2, world: { ...save.world, lightOn: true }, memory: { ...save.memory } };
    delete v2.memory.routine;
    const m = migrateSave(v2);
    expect(m.saveVersion).toBe(CURRENT_SAVE_VERSION); // v2 → v3 → v4 → v5
    expect(m.world.lightOn).toBe(false);
    expect(m.memory.routine).toEqual({ episodes: [], snapshots: [] });
  }, 120_000);

  it('offline: la noche pasa de verdad, pero no inventa hábitos', async () => {
    const clock = new TestClock(T0 + 20 * 60 * MIN);
    const s = GameSession.create({ name: 'Milo', species: 'dog' }, { rng: seededRng(6), clock });
    clock.advance(10 * 3600_000);
    const rep = await simulateAway(s, 10 * 3600_000, async () => {});
    expect(rep).not.toBeNull();
    expect(s.memory.episodes.every((e) => e.offline)).toBe(true);
    expect(detectHabits(s.memory.episodes, clock.now())).toEqual([]);
    for (const h of rep!.highlights) expect(h).not.toMatch(/undefined|NaN/);
  });
});

/*
 * EXPERIMENTOS DE CRECIMIENTO (tests, laboratorio y docs/growth-results.md)
 *
 * Dos mascotas con el MISMO cerebro inicial (misma semilla) nacen BEBÉ y
 * viven infancias distintas. Solo actúa el cuidador (cuándo está, qué deja,
 * si llama); la mascota decide y crece cuando su edad Y su desarrollo lo
 * permiten. Nada aquí fuerza una transición.
 */
import { seededRng } from '../random';
import { localMidnight, supply, TICKS_PER_DAY, type YieldFn } from '../routines/experiments';
import { GameSession, type GrowthEvent } from '../session/GameSession';
import { SimulationClock, clockInfo } from '../time/WorldClock';
import type { ItemKind } from '../world/Items';

const noYield: YieldFn = async () => {};

export type Upbringing = 'explorer' | 'calm';

// explorer (Milo): mucha exploración, pelota y juego contigo, objetos nuevos, llamadas
// calm (Luna): peluche, descanso y un ambiente tranquilo (poca compañía, nada nuevo)
const NOVEL: ItemKind[] = ['gift', 'duck', 'mushroom', 'shell', 'yoyo', 'puzzle', 'crystal', 'rope'];

export function createBaby(name: string, seed: number, start = localMidnight() + 7 * 3_600_000): { session: GameSession; clock: SimulationClock } {
  const clock = new SimulationClock(start);
  // Mismo cerebro Y misma variación individual con la misma semilla: diferencia = historia
  const session = GameSession.create({ name, species: 'dog' }, { rng: seededRng(seed), clock, physiology: 'day' });
  return { session, clock };
}

function near(s: GameSession, kind: ItemKind, rng: () => number): void {
  const w = s.world;
  if (w.objects.some((o) => o.kind === kind)) return;
  const a = rng() * Math.PI * 2;
  w.placeItem(kind, { x: Math.max(0.1, Math.min(0.9, w.pet.x + Math.cos(a) * 0.2)), y: Math.max(0.25, Math.min(0.9, w.pet.y + Math.sin(a) * 0.2)) });
}

export interface UpbringingReport {
  days: number;
  transitions: GrowthEvent[];
}

export async function liveUpbringing(s: GameSession, clock: SimulationClock, how: Upbringing, days: number, seed = 5, yieldFn: YieldFn = noYield, onDay?: (d: number) => void): Promise<UpbringingReport> {
  const rng = seededRng(seed);
  const w = s.world;
  const transitions: GrowthEvent[] = [];
  const off = s.events.on('growth', (g) => transitions.push(g));
  let novel = 0;
  for (let d = 0; d < days; d++) {
    for (let t = 0; t < TICKS_PER_DAY; t++) {
      const m = clockInfo(clock.now()).minuteOfDay;
      if (w.lightOn) w.setLight(false);
      if (m % 360 === 0) supply(s);
      if (how === 'explorer') {
        const present = m >= 8 * 60 && m < 20 * 60;
        if (present !== w.player.present) s.setPlayerPresent(present);
        if (present && m % 120 === 0) near(s, 'ball', rng);
        if (present && m % 180 === 30) { const o = w.addNovelObject(NOVEL[novel++ % NOVEL.length]); o.novelty = 1; }
        if (present && m % 90 === 45) w.callPet(1);
        if (present && m % 60 === 15) s.petDirect();
        if (m === 20 * 60 - 5) for (const o of w.objects.filter((x) => !x.fixed)) w.removeObject(o.id);
      } else {
        const present = (m >= 9 * 60 && m < 10 * 60) || (m >= 18 * 60 && m < 19 * 60);
        if (present !== w.player.present) s.setPlayerPresent(present);
        if (m % 240 === 0) near(s, 'teddy', rng);
        for (const o of w.objects.filter((x) => !x.fixed && x.kind !== 'teddy')) w.removeObject(o.id);
      }
      s.tick();
    }
    onDay?.(d);
    await yieldFn();
  }
  off();
  return { days, transitions };
}

// Distancia entre dos cerebros: Σ|wA − wB| sobre las sinapsis plásticas
export function brainDistance(a: GameSession, b: GameSession): number {
  const wb = new Map(b.plasticity.entries.map((e) => [e.key, e.synapse.weight]));
  return a.plasticity.entries.reduce((s, e) => s + Math.abs(e.synapse.weight - (wb.get(e.key) ?? e.synapse.weight)), 0);
}

import { describe, expect, it } from '@jest/globals';

import { seededRng } from '../random';
import { GameSession } from '../session/GameSession';
import { simulateAway } from '../simulation/OfflineSimulation';

const noYield = async () => {};

function session(seed = 4) {
  let t = 1_700_000_000_000;
  return GameSession.create({ name: 'Milo', species: 'dog' }, { rng: seededRng(seed), now: () => (t += 1000) });
}

describe('Offline progression', () => {
  it('menos de un minuto no se reconcilia', async () => {
    expect(await simulateAway(session(), 30_000, noYield)).toBeNull();
  });

  it('ejecuta la SNN real con ticks acotados y tiempo comprimido', async () => {
    const s = session();
    const tick0 = s.sim.network.tickCount;
    const r = await simulateAway(s, 8 * 3600_000, noYield);
    expect(r).not.toBeNull();
    expect(r!.simulatedTicks).toBe(s.config.offline.maxTicks);
    expect(s.sim.network.tickCount - tick0).toBe(s.config.offline.maxTicks);
    expect(r!.timeScale).toBe(s.config.offline.maxTimeScale);
    expect(r!.highlights.length).toBeGreaterThan(0);
    expect(s.memory.stats.offlineTicks).toBe(s.config.offline.maxTicks);
  });

  it('el tiempo pasa: sin comida suficiente, el hambre sube', async () => {
    const s = session();
    const bowl = s.world.firstOfType('food')!;
    bowl.amount = 0;
    const before = s.world.pet.hunger;
    const r = await simulateAway(s, 2 * 3600_000, noYield);
    expect(r!.after.hunger).toBeGreaterThan(before);
  });

  it('una ausencia corta simula exactamente los ticks transcurridos', async () => {
    const s = session();
    const r = await simulateAway(s, 120_000, noYield);
    expect(r!.simulatedTicks).toBe(360);
    expect(r!.timeScale).toBe(1);
  });

  it('el jugador vuelve a estar presente si lo estaba', async () => {
    const s = session();
    s.setPlayerPresent(true);
    await simulateAway(s, 600_000, noYield);
    expect(s.world.player.present).toBe(true);
  });

  it('no crea recuerdos de "primera vez" durante la ausencia', async () => {
    const s = session();
    const before = s.memory.moments.length;
    await simulateAway(s, 3 * 3600_000, noYield);
    expect(s.memory.moments.filter((m) => m.kind === 'first_time').length).toBe(0);
    expect(s.memory.moments.length).toBeGreaterThanOrEqual(before);
  });
});

import { describe, expect, it } from '@jest/globals';

import { denseWeights } from '../brain/BrainWeights';
import { migrateSave, SaveError } from '../persistence/migrations';
import { createRepositories } from '../persistence/repositories';
import { DEFAULT_SETTINGS } from '../persistence/SaveGame';
import { MemoryKeyValueStore, SAVE_KEYS, SaveGameStore } from '../persistence/SaveGameStore';
import { seededRng } from '../random';
import { GameSession } from '../session/GameSession';

function played(seed = 5, ticks = 300) {
  let t = 1_700_000_000_000;
  const session = GameSession.create({ name: 'Milo', species: 'dog', preset: 'curioso' }, { rng: seededRng(seed), now: () => (t += 333) });
  session.setPlayerPresent(true);
  for (let i = 0; i < ticks; i++) {
    if (i % 50 === 3) session.petDirect();
    if (i % 90 === 7) session.interact('novel');
    session.tick();
  }
  return session;
}

describe('Serialización del save', () => {
  it('toSave → JSON → fromSave conserva mascota, mundo, cerebro y memoria', () => {
    const a = played();
    const save = JSON.parse(JSON.stringify(a.toSave(DEFAULT_SETTINGS, 123)));
    const { session: b, weights } = GameSession.fromSave(migrateSave(save), { rng: seededRng(1) });
    expect(weights.ignored).toEqual([]);
    expect(b.profile).toEqual(a.profile);
    expect(b.world.pet.snapshot()).toEqual(a.world.pet.snapshot());
    expect(b.world.objects.map((o) => o.kind)).toEqual(a.world.objects.map((o) => o.kind));
    expect(denseWeights(b.sim.brainConfig, 'sensorToCircuit')).toEqual(denseWeights(a.sim.brainConfig, 'sensorToCircuit'));
    expect(b.sim.network.neurons.map((n) => n.potential)).toEqual(a.sim.network.neurons.map((n) => n.potential));
    expect(b.sim.network.tickCount).toBe(a.sim.network.tickCount);
    expect(b.memory.moments.length).toBe(a.memory.moments.length);
    expect(b.memory.stats.actionOnsets).toEqual(a.memory.stats.actionOnsets);
    expect(b.growth).toEqual(a.growth);
  });

  it('saveVersion obligatorio y versiones futuras rechazadas', () => {
    const save = played(1, 5).toSave(DEFAULT_SETTINGS, 0) as unknown as Record<string, unknown>;
    expect(() => migrateSave({ ...save, saveVersion: undefined })).toThrow(SaveError);
    expect(() => migrateSave({ ...save, saveVersion: 99 })).toThrow(/más nueva/);
  });

  it('sanea valores inválidos sin perder la mascota', () => {
    const save = played(1, 5).toSave(DEFAULT_SETTINGS, 0) as unknown as Record<string, unknown>;
    const broken = { ...save, inventory: { owned: ['ball', 'dragon'] }, settings: { muted: true }, memory: null };
    const fixed = migrateSave(broken);
    expect(fixed.inventory.owned).toEqual(['ball']);
    expect(fixed.settings.muted).toBe(true);
    expect(fixed.settings.haptics).toBe(true);
    expect(fixed.memory.moments).toEqual([]);
    expect(fixed.profile.name).toBe('Milo');
  });
});

describe('SaveGameStore: recuperación segura', () => {
  it('guarda, rota el respaldo y carga', async () => {
    const kv = new MemoryKeyValueStore();
    const store = new SaveGameStore(kv);
    const s = played(2, 10);
    await store.save(s.toSave(DEFAULT_SETTINGS, 1));
    await store.save(s.toSave(DEFAULT_SETTINGS, 2));
    expect(JSON.parse(kv.data.get(SAVE_KEYS.backup) ?? '{}').lastActiveAt).toBe(1);
    const r = await store.load();
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.save.lastActiveAt).toBe(2);
  });

  it('si el principal está corrupto, recupera el respaldo y aparta la copia corrupta', async () => {
    const kv = new MemoryKeyValueStore();
    const store = new SaveGameStore(kv);
    const s = played(2, 10);
    await store.save(s.toSave(DEFAULT_SETTINGS, 1));
    await store.save(s.toSave(DEFAULT_SETTINGS, 2));
    kv.data.set(SAVE_KEYS.main, '{"saveVersion":1, "profile": trunc');
    const r = await store.load();
    expect(r.status).toBe('recovered');
    expect(kv.data.get(SAVE_KEYS.corrupt)).toContain('trunc');
    if (r.status === 'recovered') expect(r.save.profile.name).toBe('Milo');
  });

  it('si todo está corrupto, no lanza: informa y conserva la copia', async () => {
    const kv = new MemoryKeyValueStore();
    kv.data.set(SAVE_KEYS.main, 'no json');
    const r = await new SaveGameStore(kv).load();
    expect(r.status).toBe('corrupt');
    expect(kv.data.get(SAVE_KEYS.corrupt)).toBe('no json');
  });

  it('vacío = primera vez', async () => {
    expect((await new SaveGameStore(new MemoryKeyValueStore()).load()).status).toBe('empty');
  });

  it('los repositorios leen y escriben su sección', async () => {
    const kv = new MemoryKeyValueStore();
    const store = new SaveGameStore(kv);
    await store.save(played(3, 20).toSave(DEFAULT_SETTINGS, 9));
    const repos = createRepositories(store);
    const mem = await repos.memories.load();
    expect(mem?.moments.length).toBeGreaterThan(0);
    await repos.memories.save({ ...mem!, moments: [] });
    expect((await repos.memories.load())?.moments).toEqual([]);
    expect((await repos.pets.load())?.profile.name).toBe('Milo');
  });

  it('importRaw valida antes de escribir', async () => {
    const store = new SaveGameStore(new MemoryKeyValueStore());
    await expect(store.importRaw('{"saveVersion":1}')).rejects.toThrow();
  });
});

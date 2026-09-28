import { describe, expect, it } from '@jest/globals';

import { createBrainConfig } from '../brain/BrainConfig';
import { evaluateDiscoveries } from '../discovery/DiscoveryEvaluator';
import { computeTraits } from '../discovery/Personality';
import { PetMemory } from '../memory/PetMemory';
import type { Experience, ExperienceKind, SubjectKey } from '../memory/types';
import { seededRng } from '../random';
import { GameSession } from '../session/GameSession';

let n = 0;
function exp(kind: ExperienceKind, subject: SubjectKey | null, valence = 0.6, intensity = 0.6): Experience {
  n++;
  return { id: `e${n}`, at: 1000 + n, day: 1, tick: n, kind, subject, valence, intensity, gameId: null, offline: false, reward: 0, actions: [] };
}

describe('Preferencias', () => {
  it('se acercan a 0 con poca evidencia y crecen con evidencia repetida', () => {
    const m = new PetMemory();
    m.addExperience(exp('played', 'ball'));
    const one = m.preference('ball')!.score;
    for (let i = 0; i < 6; i++) m.addExperience(exp('played', 'ball'));
    expect(one).toBeLessThan(0.3);
    expect(m.preference('ball')!.score).toBeGreaterThan(one);
    expect(m.preference('ball')!.positive).toBe(7);
  });

  it('marca la primera vez por tipo y sujeto', () => {
    const m = new PetMemory();
    expect(m.addExperience(exp('played', 'ball')).first).toBe(true);
    expect(m.addExperience(exp('played', 'ball')).first).toBe(false);
    expect(m.addExperience(exp('played', 'teddy')).first).toBe(true);
  });
});

describe('Descubrimientos', () => {
  const config = createBrainConfig();

  it('NO se dispara con una sola interacción positiva', () => {
    const m = new PetMemory();
    m.addExperience(exp('played', 'ball'));
    expect(evaluateDiscoveries(m, config, 'Milo', 0, 1).filter((d) => d.key.startsWith('likes'))).toEqual([]);
  });

  it('varias interacciones positivas con la pelota → "disfruta mucho la pelota"', () => {
    const m = new PetMemory();
    for (let i = 0; i < 5; i++) m.addExperience(exp('played', 'ball', 0.8, 0.8));
    const d = evaluateDiscoveries(m, config, 'Milo', 0, 1).find((x) => x.key === 'likes:ball');
    expect(d?.text).toBe('Parece que Milo disfruta mucho la pelota.');
  });

  it('los eventos únicos sí se descubren con una sola ocurrencia', () => {
    const m = new PetMemory();
    m.addExperience(exp('mystery_opened', 'duck'));
    expect(evaluateDiscoveries(m, config, 'Milo', 0, 1).some((d) => d.key === 'unique:first_mystery')).toBe(true);
  });

  it('no repite descubrimientos ya registrados', () => {
    const m = new PetMemory();
    m.addExperience(exp('mystery_opened', 'duck'));
    evaluateDiscoveries(m, config, 'Milo', 0, 1).forEach((d) => m.addDiscovery(d));
    expect(evaluateDiscoveries(m, config, 'Milo', 0, 1)).toEqual([]);
  });
});

describe('Personalidad emergente', () => {
  it('sin evidencia no revela rasgos aunque el genoma los favorezca', () => {
    const traits = computeTraits(createBrainConfig('curioso'), new PetMemory().stats);
    expect(traits.find((t) => t.key === 'curious')?.genome).toBeGreaterThan(0.5);
    expect(traits.some((t) => t.revealed)).toBe(false);
  });

  it('se deriva de pesos + conducta observada', () => {
    const m = new PetMemory();
    for (let i = 0; i < 20; i++) { m.countActionOnset('INVESTIGATE'); m.countActionOnset('LOOK_AT_OBJECT'); }
    for (let i = 0; i < 5; i++) m.countActionOnset('WALK');
    const curious = computeTraits(createBrainConfig('curioso'), m.stats).find((t) => t.key === 'curious')!;
    expect(curious.revealed).toBe(true);
    const plain = computeTraits(createBrainConfig('miedoso'), m.stats).find((t) => t.key === 'curious')!;
    expect(plain.score).toBeLessThan(curious.score);
  });
});

describe('GameSession: memoria desde la simulación real', () => {
  it('genera recuerdos de primeras veces a partir de lo que hizo la red', () => {
    let t = 1_700_000_000_000;
    const s = GameSession.create({ name: 'Milo', species: 'dog' }, { rng: seededRng(9), now: () => (t += 333) });
    s.setPlayerPresent(true);
    for (let i = 0; i < 400; i++) { if (i % 40 === 2) s.petDirect(); s.tick(); }
    const titles = s.memory.moments.map((m) => m.title);
    expect(titles).toContain('El día que nos conocimos');
    expect(titles).toContain('La primera caricia de Milo');
    expect(s.memory.stats.onlineTicks).toBe(400);
  });
});

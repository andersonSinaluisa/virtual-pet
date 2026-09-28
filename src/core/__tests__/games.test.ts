import { describe, expect, it } from '@jest/globals';

import type { ChoiceView, ComeHereView, FetchView, MysteryView } from '../games';
import { GAMES } from '../games/catalog';
import { seededRng } from '../random';
import { GameSession } from '../session/GameSession';

function session(seed = 21) {
  let t = 1_700_000_000_000;
  const s = GameSession.create({ name: 'Milo', species: 'dog' }, { rng: seededRng(seed), now: () => (t += 333) });
  s.setPlayerPresent(true);
  return s;
}

describe('Catálogo', () => {
  it('define los 12 minijuegos y 4 implementados', () => {
    expect(GAMES).toHaveLength(12);
    expect(GAMES.filter((g) => g.implemented).map((g) => g.id)).toEqual(['fetch', 'mystery-box', 'choice', 'come-here']);
  });
});

describe('Trae la pelota', () => {
  it('lanzar solo da velocidad a la pelota; la mascota no se mueve por el juego', () => {
    const s = session();
    s.startGame('fetch');
    const v = s.gameView() as FetchView;
    const pet = { x: s.world.pet.x, y: s.world.pet.y };
    s.gameInput({ type: 'throw', vx: 0, vy: -0.1 });
    expect(s.world.pet.x).toBe(pet.x);
    expect(s.world.getObject(v.ballId)!.vy).toBeCloseTo(-0.1);
    expect((s.gameView() as FetchView).throws).toBe(1);
  });

  it('se puede jugar muchos ticks sin errores y limpia sus objetos al terminar', () => {
    const s = session(3);
    s.startGame('fetch');
    for (let i = 0; i < 600; i++) {
      const v = s.gameView() as FetchView;
      if (i % 30 === 0 && v.canThrow) s.gameInput({ type: 'throw', vx: (i % 60 ? 0.06 : -0.06), vy: -0.08 });
      if (i % 45 === 20) s.gameInput({ type: 'call' });
      s.tick();
    }
    const summary = s.endGame();
    expect(summary?.gameId).toBe('fetch');
    expect(s.world.objects.some((o) => o.tag === 'game')).toBe(false);
  });
});

describe('Caja misteriosa', () => {
  it('coloca una caja nueva; se abre solo si la mascota la investiga', () => {
    const s = session(8);
    s.startGame('mystery-box');
    const v0 = s.gameView() as MysteryView;
    expect(s.world.getObject(v0.boxId)?.kind).toBe('mysteryBox');
    expect(v0.progress).toBe(0);
    let v = v0;
    for (let i = 0; i < 900 && v.phase !== 'opened'; i++) { s.tick(); v = s.gameView() as MysteryView; }
    if (v.phase === 'opened') {
      expect(v.revealed).not.toBeNull();
      expect(s.inventory.owned).toContain(v.revealed!);
    } else {
      // La red decidió no abrirla: también es válido (no hay respuesta programada)
      expect(v.progress).toBeLessThan(1);
    }
    s.endGame();
    expect(s.world.objects.some((o) => o.kind === 'mysteryBox')).toBe(false);
  });
});

describe('¿Cuál prefieres?', () => {
  it('no fuerza elección y registra la preferencia solo si una opción destaca', () => {
    const s = session(12);
    s.startGame('choice');
    expect((s.gameView() as ChoiceView).options.length).toBe(3);
    s.gameInput({ type: 'begin' });
    let v = s.gameView() as ChoiceView;
    expect(v.phase).toBe('observing');
    for (let i = 0; i < 120 && v.phase === 'observing'; i++) { s.tick(); v = s.gameView() as ChoiceView; }
    expect(v.phase).toBe('result');
    const made = s.memory.experiences.filter((e) => e.kind === 'choice_made');
    expect(made.length).toBe(v.chosen ? 1 : 0);
    s.endGame();
  });

  it('exige al menos dos opciones', () => {
    const s = session();
    s.startGame('choice');
    const [a, b] = (s.gameView() as ChoiceView).options;
    s.gameInput({ type: 'toggle_item', kind: a.kind });
    s.gameInput({ type: 'toggle_item', kind: b.kind });
    expect((s.gameView() as ChoiceView).options.filter((o) => o.selected).length).toBe(2);
  });
});

describe('Ven aquí', () => {
  it('llamar crea el estímulo; la caricia solo funciona si está cerca', () => {
    const s = session(5);
    s.startGame('come-here');
    s.world.pet.x = 0.1; s.world.pet.y = 0.1; // lejos del jugador
    s.gameInput({ type: 'pet' });
    expect(s.world.player.touchTicks).toBe(0);
    s.gameInput({ type: 'call' });
    expect(s.world.player.calling).toBe(1);
    let v = s.gameView() as ComeHereView;
    expect(v.calls).toBe(1);
    for (let i = 0; i < 40 && (v.phase === 'called' || v.phase === 'coming'); i++) { s.tick(); v = s.gameView() as ComeHereView; }
    expect(['arrived', 'ignored', 'coming', 'called']).toContain(v.phase);
    s.endGame();
  });
});

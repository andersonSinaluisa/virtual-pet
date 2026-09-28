/*
 * Prueba de humo del render sin GPU: construye todas las especies y corre la
 * escena con un renderer falso. Detecta errores de la migración (APIs de
 * three r18x, DOM residual) sin necesidad de un dispositivo.
 */
import { describe, expect, it } from '@jest/globals';
import type * as THREE from 'three';

import type { Action } from '@/core/brain/Actions';
import { ACTION_LIST } from '@/core/brain/Actions';
import { SPECIES } from '@/core/persistence/SaveGame';
import { seededRng } from '@/core/random';
import { GameSession } from '@/core/session/GameSession';

import { Pet3D } from '../Pet3D';
import { PetScene } from '../PetScene';

const fakeRenderer = { setSize: () => {}, render: () => {}, dispose: () => {} } as unknown as THREE.WebGLRenderer;

describe('render3d', () => {
  it.each(SPECIES)('construye y anima la especie %s', (species) => {
    const pet = new Pet3D({ species });
    expect(Object.keys(pet.rig)).toEqual(expect.arrayContaining(['Motion', 'BodyPivot', 'HeadPivot', 'TailPivot', 'LeftEarPivot']));
    for (let i = 0; i < 30; i++) pet.animator.update(1 / 60, i % 2);
  });

  it('la escena sigue a la simulación real con todas las acciones sin errores ni NaN', () => {
    const s = GameSession.create({ name: 'Milo', species: 'dog' }, { rng: seededRng(2) });
    s.setPlayerPresent(true);
    let forced: Action[] = [];
    const scene = new PetScene(fakeRenderer, { world: s.world, active: () => [...s.sim.last.active, ...forced] }, { species: 'dog', debug: true });
    scene.resize(390, 420);
    s.interact('novel');
    for (let i = 0; i < 400; i++) {
      if (i % 3 === 0) s.tick();
      forced = [ACTION_LIST[i % ACTION_LIST.length]];
      scene.update(1 / 60);
      scene.render();
    }
    expect(Number.isFinite(scene.camera.position.x)).toBe(true);
    const hit = scene.pick(0, 0);
    expect(hit).not.toBeNull();
    const p = scene.floorPoint(0, -0.5);
    expect(p && p.y > 0.5).toBe(true);
    scene.setSpecies('bunny');
    scene.update(1 / 60);
  });
});

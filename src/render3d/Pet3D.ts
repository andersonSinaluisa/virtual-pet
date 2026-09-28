/*
 * PET 3D: modelo + animador + efectos, listo para meter en una escena.
 */
import * as THREE from 'three';

import type { SpeciesKey } from '@/core/persistence/SaveGame';

import { PetAnimator } from './PetAnimator';
import { resolveAppearance, type PetAppearance } from './PetAppearance';
import { PetFX } from './PetFX';
import { PetModel } from './PetModel';

export class Pet3D {
  readonly appearance: PetAppearance;
  readonly model: PetModel;
  readonly animator: PetAnimator;
  readonly object3D: THREE.Group;
  readonly fx: PetFX;
  private readonly headWorld = new THREE.Vector3();

  constructor(appearance: Partial<PetAppearance>) {
    this.appearance = resolveAppearance(appearance);
    this.model = new PetModel(this.appearance);
    this.animator = new PetAnimator(this.model);
    this.object3D = this.model.root;
    this.fx = new PetFX(this.object3D);
  }

  get rig(): Record<string, THREE.Group> {
    return this.model.pivots;
  }

  update(dt: number, speed: number, camera: THREE.Camera): void {
    this.animator.update(dt, speed);
    this.model.head.getWorldPosition(this.headWorld);
    this.fx.update(dt, this.headWorld, this.object3D, camera);
  }

  // Punto donde se lleva un objeto recogido (entre las patas delanteras)
  carryWorldPosition(target: THREE.Vector3): THREE.Vector3 { return this.model.carry.getWorldPosition(target); }
  headWorldPosition(target: THREE.Vector3): THREE.Vector3 { return this.model.head.getWorldPosition(target); }

  dispose(): void {
    this.model.dispose();
  }
}

export const PetFactory = {
  create(species: SpeciesKey): Pet3D { return new Pet3D({ species }); },
};

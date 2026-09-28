/*
 * Fuente de escena para vistas previas SIN simulación (onboarding): un mundo
 * quieto con la mascota en el centro. Las acciones mostradas son puramente
 * visuales (saludar al tocarla); no hay cerebro todavía, así que no se
 * presenta como conducta de la SNN.
 */
import type { Action } from '@/core/brain/Actions';
import { createSimConfig } from '@/core/simulation/SimConfig';
import { World } from '@/core/simulation/World';
import type { SceneSource } from '@/render3d/PetScene';

export interface PreviewSource extends SceneSource {
  greet(): void;
}

export function createPreviewSource(): PreviewSource {
  const world = new World(createSimConfig());
  world.pet.x = 0.5;
  world.pet.y = 0.62;
  world.objects = world.objects.filter((o) => o.fixed); // sin juguetes sueltos
  let greetUntil = 0;
  return {
    world,
    active: (): readonly Action[] => (Date.now() < greetUntil ? ['GREET', 'SMILE'] : ['SMILE']),
    greet() { greetUntil = Date.now() + 1800; },
  };
}

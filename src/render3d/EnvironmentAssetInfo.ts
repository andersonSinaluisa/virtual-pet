/*
 * DATOS DE LOS ASSETS DE ESCENARIO (sin `require`: se usa también en tests de Node)
 * Procedencia y licencias verificadas: docs/environment-assets.md
 */
import { ENVIRONMENT_LAYOUTS } from '@/core/world/EnvironmentLayouts';
import type { LocationId } from '@/core/world/Locations';

export type EnvPack = 'quaternius-house' | 'kenney-nature';

export interface PackInfo {
  name: string;
  creator: string;
  license: string;
  source: string;
  metersPerUnit: number; // medido con scripts/inspect-glb.mjs
}

export const ENV_PACKS: Record<EnvPack, PackInfo> = {
  'quaternius-house': {
    name: 'Ultimate House Interior Pack', creator: 'Quaternius', license: 'CC0 1.0',
    source: 'https://quaternius.com/packs/ultimatehomeinterior.html', metersPerUnit: 0.48, // una puerta mide 4.19 u ≈ 2 m
  },
  'kenney-nature': {
    name: 'Nature Kit 2.1', creator: 'Kenney', license: 'CC0 1.0',
    source: 'https://kenney.nl/assets/nature-kit', metersPerUnit: 1.25, // 1 baldosa
  },
};

// Casa "de juguete": un poco más pequeña que la real para que la mascota (estilizada, grande) sea protagonista
export const PROP_SCALE = 0.8;

export const packOf = (assetId: string): EnvPack => (assetId.startsWith('home/') ? 'quaternius-house' : 'kenney-nature');
export const metersScale = (assetId: string): number => ENV_PACKS[packOf(assetId)].metersPerUnit * PROP_SCALE;

// Pivote: por defecto base-centro; la puerta gira sobre su bisagra (su origen original está en el borde)
export const PIVOT_AS_IS: ReadonlySet<string> = new Set(['home/door']);

// Assets que usa un lugar (para precargar solo lo necesario)
export function assetsFor(loc: LocationId): string[] {
  return [...new Set((ENVIRONMENT_LAYOUTS[loc]?.props ?? []).map((p) => p.asset))];
}

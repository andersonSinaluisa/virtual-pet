/*
 * ETAPAS DE VIDA (lógica sin texto). Los nombres visibles dependen de la
 * especie y viven aparte: la lógica nunca compara cadenas mostradas.
 * SENIOR queda reservado para el futuro (no implementado).
 */
import type { SpeciesKey } from '../persistence/SaveGame';

export const LIFE_STAGES = ['BABY', 'CHILD', 'YOUNG', 'ADULT'] as const;
export type LifeStage = (typeof LIFE_STAGES)[number];

export const stageIndex = (s: LifeStage): number => LIFE_STAGES.indexOf(s);
export const nextStage = (s: LifeStage): LifeStage | null => LIFE_STAGES[stageIndex(s) + 1] ?? null;
export const isLifeStage = (v: unknown): v is LifeStage => typeof v === 'string' && (LIFE_STAGES as readonly string[]).includes(v);

const CHILD_LABEL: Record<SpeciesKey, string> = { dog: 'Cachorro', cat: 'Gatito', bear: 'Osezno', bunny: 'Gazapo' };

export function stageLabel(stage: LifeStage, species: SpeciesKey): string {
  switch (stage) {
    case 'BABY': return 'Bebé';
    case 'CHILD': return CHILD_LABEL[species] ?? 'Pequeño';
    case 'YOUNG': return 'Joven';
    case 'ADULT': return 'Adulto';
  }
}

export const STAGE_EMOJI: Record<LifeStage, string> = { BABY: '🍼', CHILD: '🐾', YOUNG: '🌿', ADULT: '🌳' };

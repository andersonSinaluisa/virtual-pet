/*
 * PET APPEARANCE CONFIG (portado de js/pet3d/PetAppearance.js)
 * ------------------------------------------------------------
 * Todo lo que distingue a una especie es DATOS. El mismo PetModel,
 * PetAnimator y PetExpressions sirven para todas. La apariencia no toca el
 * cerebro: un perro puede tener cualquier personalidad (pesos en BrainConfig).
 */
import type { SpeciesKey } from '@/core/persistence/SaveGame';

export type EarType = 'rose' | 'floppy' | 'triangle' | 'round' | 'long';
export type MuzzleType = 'mask' | 'small' | 'bear' | 'bunny';
export type TailType = 'curl' | 'long' | 'stub' | 'pom';

export interface PetAppearance {
  species: SpeciesKey;
  name: string;
  bodyColor: string;
  secondaryColor: string;
  bellyColor: string;
  innerEarColor: string;
  maskColor: string | null;
  muzzleColor: string;
  noseColor: string;
  collarColor: string | null;
  headScale: [number, number, number];
  bodyWidth: number;
  earType: EarType;
  earScale: number;
  muzzle: MuzzleType;
  muzzleScale: number;
  tailType: TailType;
  tailScale: number;
  eyeSize: number;
  eyeSpacing: number;
  limbScale: number;
  footScale: number;
  whiskers: boolean;
  tongueOut: boolean;
  fur: boolean;
}

export const PET_APPEARANCE_DEFAULTS: PetAppearance = {
  species: 'dog',
  name: 'Perro',
  bodyColor: '#D9AC74',
  secondaryColor: '#6B3F24',
  bellyColor: '#F3DDBC',
  innerEarColor: '#E8C49A',
  maskColor: null,
  muzzleColor: '#F3DDBC',
  noseColor: '#141014',
  collarColor: '#6B3F24',
  headScale: [1.0, 1.0, 1.0],
  bodyWidth: 1.0,
  earType: 'rose',
  earScale: 1.0,
  muzzle: 'mask',
  muzzleScale: 1.0,
  tailType: 'curl',
  tailScale: 1.0,
  eyeSize: 1.0,
  eyeSpacing: 1.0,
  limbScale: 1.0,
  footScale: 1.0,
  whiskers: false,
  tongueOut: false,
  fur: true,
};

export const PET_SPECIES: Record<SpeciesKey, Partial<PetAppearance>> = {
  dog: {
    species: 'dog', name: 'Perro',
    bodyColor: '#D29A5C', secondaryColor: '#5E331C', maskColor: '#5E331C', collarColor: '#5E331C', innerEarColor: '#DDAE78',
    earType: 'rose', muzzle: 'mask', tailType: 'curl', tongueOut: true,
  },
  cat: {
    species: 'cat', name: 'Gato',
    bodyColor: '#B7B3C4', secondaryColor: '#7C778F', bellyColor: '#F3EFF7', muzzleColor: '#F3EFF7', innerEarColor: '#F4B3C3',
    noseColor: '#E27C95', collarColor: '#E35D8C', earType: 'triangle', muzzle: 'small', tailType: 'long', whiskers: true, eyeSize: 1.05,
  },
  bear: {
    species: 'bear', name: 'Oso',
    bodyColor: '#A7744E', secondaryColor: '#7A5236', bellyColor: '#E6C69E', muzzleColor: '#E6C69E', innerEarColor: '#E6C69E',
    collarColor: '#3E6FC4', bodyWidth: 1.1, earType: 'round', muzzle: 'bear', tailType: 'stub',
  },
  bunny: {
    species: 'bunny', name: 'Conejo',
    bodyColor: '#F2EEF3', secondaryColor: '#DCD5E2', bellyColor: '#FFFFFF', muzzleColor: '#FFFFFF', innerEarColor: '#F6A7BA',
    noseColor: '#EE8AA3', collarColor: '#7FC8E8', earType: 'long', muzzle: 'bunny', tailType: 'pom', footScale: 1.25,
  },
};

export function resolveAppearance(opts: Partial<PetAppearance> = {}): PetAppearance {
  const species = (opts.species && PET_SPECIES[opts.species]) || {};
  return { ...PET_APPEARANCE_DEFAULTS, ...species, ...opts };
}

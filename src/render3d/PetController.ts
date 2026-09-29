/*
 * PET CONTROLLER: acciones YA decididas por la SNN → canales del animador
 * -----------------------------------------------------------------------
 *   SNN → spikes → ActionSystem (acciones activas) → PetController → PetAnimator → Three.js
 *
 * Aquí no se decide nada: solo se traduce qué acciones están activas (y el
 * estado físico que produjeron) a animaciones. Si dos acciones activas piden
 * expresiones distintas, se mezclan: un conflicto neuronal también se ve en la cara.
 * (Portado sin cambios de lógica de js/pet3d/PetController.js)
 */
import type * as THREE from 'three';

import type { Action } from '@/core/brain/Actions';
import type { SpeciesKey } from '@/core/persistence/SaveGame';
import type { Pet } from '@/core/simulation/Pet';

import type { Pet3D } from './Pet3D';
import type { ExpressionName } from './PetExpressions';
import type { Arms, Locomotion, Special, Tail } from './PetAnimator';
import type { FxName } from './PetFX';

// v8: lo que la VOZ pide a la cara (lo produce el puente de audio; aquí no se decide nada)
export interface VoiceCue {
  intent: string | null;
  until: number; // Date.now() hasta el que dura la reacción a un one-shot
  purr: number; // nivel del ronroneo (gato: ojos entornados, se deja acariciar)
  pant: number; // jadeo (perro: lengua fuera)
  teethPurr: number; // ronroneo dental (conejo: orejas relajadas)
}

export interface ControllerInput {
  active: readonly Action[];
  pet: Pet;
  touching: boolean;
  lookTarget: THREE.Vector3 | null;
  renderSpeed: number;
  species?: SpeciesKey;
  voice?: VoiceCue | null;
}

export class PetController {
  constructor(private pet: Pet3D | null) {}

  setPet(pet: Pet3D): void {
    this.pet = pet;
  }

  update({ active, pet, touching, lookTarget, renderSpeed, species, voice }: ControllerInput): void {
    if (!this.pet) return;
    const A = new Set(active), anim = this.pet.animator;
    const talking = !!voice && voice.until > Date.now() && !pet.asleep;
    const purring = !!voice && voice.purr > 0.15 && !pet.asleep;
    const panting = !!voice && voice.pant > 0.1 && !pet.asleep;
    const moving = (pet.speed || 0) > 0.12 || renderSpeed > 0.25;
    const running = (pet.speed || 0) > 1.4;

    // LOCOMOTION
    let loco: Locomotion = 'idle';
    if (pet.asleep) loco = 'sleep';
    else if (pet.hidden) loco = 'crouch';
    else if (moving) loco = running ? 'run' : 'walk';
    else if (A.has('REST') || A.has('SLEEP')) loco = 'rest';
    anim.setLocomotion(loco);

    // EXPRESSION (se mezclan todas las que apliquen)
    const ex: ExpressionName[] = [];
    if (pet.asleep) ex.push('sleeping');
    if (A.has('GET_SCARED')) ex.push('surprised');
    if (A.has('CRY')) ex.push('crying');
    if (A.has('EAT')) ex.push('eating');
    if (A.has('DRINK')) ex.push('drinking');
    if (A.has('MAKE_SOUND') || talking) ex.push('talking');
    if (purring) ex.push('sleeping', 'happy'); // ojos entornados de gusto (mezcla, no dormido)
    if (A.has('PLAY') || A.has('DANCE') || panting) ex.push('openHappy');
    else if (A.has('SMILE') || A.has('GREET') || touching) ex.push('happy');
    if (A.has('INVESTIGATE') || A.has('LOOK_AT_OBJECT')) ex.push('curious');
    if (A.has('ASK_ATTENTION') && !ex.length) ex.push('sad');
    if (A.has('HIDE') && !ex.length) ex.push('sad');
    anim.setExpression(ex.length ? ex : ['neutral']);

    // ARMS
    let arms: Arms = 'none';
    if (pet.carrying !== null) arms = 'hold';
    else if (A.has('PICK_UP_OBJECT')) arms = 'reach';
    else if (A.has('GREET')) arms = 'wave';
    else if (A.has('DANCE')) arms = 'dance';
    else if (A.has('ASK_ATTENTION')) arms = 'raise';
    else if (A.has('CRY')) arms = 'cover';
    anim.setArms(arms);

    // TAIL
    let tail: Tail = 'idle';
    if (pet.asleep) tail = 'sleeping';
    else if (A.has('GET_SCARED') || A.has('HIDE')) tail = 'scared';
    else if (A.has('CRY')) tail = 'down';
    else if (A.has('PLAY') || A.has('DANCE') || A.has('GREET') || touching) tail = 'fastWag';
    else if (A.has('APPROACH') || A.has('FOLLOW_PLAYER') || A.has('SMILE')) tail = 'wag';
    else if (A.has('EXPLORE') || A.has('INVESTIGATE') || A.has('ASK_ATTENTION')) tail = 'slowWag';
    anim.setTail(tail);

    // SPECIAL (varios a la vez)
    const sp: Special[] = [];
    if (A.has('PLAY') && !moving) sp.push('jump');
    if (A.has('GET_SCARED')) sp.push('tremble', 'jump');
    if (A.has('DANCE')) sp.push('dance');
    if (A.has('INVESTIGATE')) sp.push('sniff');
    if (A.has('EXPLORE') && !lookTarget) sp.push('lookAround');
    if (A.has('EAT') && !moving) sp.push('munch');
    if (A.has('DRINK') && !moving) sp.push('lap');
    if (A.has('MAKE_SOUND')) sp.push('bark');
    if (A.has('LOOK_AT_OBJECT') || A.has('APPROACH')) sp.push('alert');
    // v8: la voz también se ve (breve): cabeza y orejas al vocalizar; cuerpo al ser acariciado
    if (talking) sp.push('vocal');
    if (purring) sp.push('purr');
    if (species === 'bunny' && (touching || (voice?.teethPurr ?? 0) > 0.05)) sp.push('relaxEars');
    if (species === 'bear' && touching && !pet.asleep) sp.push('wiggle');
    anim.setSpecial(sp);

    // HEAD
    anim.lookAt(lookTarget);
    anim.setHeadTilt(A.has('ASK_ATTENTION') ? 0.28 : A.has('INVESTIGATE') ? -0.22 : 0);

    // Efectos
    const fx: FxName[] = [];
    if (pet.asleep) fx.push('zzz');
    if (A.has('GET_SCARED')) fx.push('exclaim');
    if (A.has('ASK_ATTENTION') || (A.has('INVESTIGATE') && !A.has('GET_SCARED'))) fx.push('question');
    if (touching) fx.push('hearts');
    if (A.has('DANCE')) fx.push('notes');
    if (A.has('MAKE_SOUND')) fx.push('sound');
    this.pet.fx.set(fx);
  }
}

/*
 * NARRATOR: presentación en palabras del estado REAL
 * --------------------------------------------------
 * Traduce acciones activas, foco perceptivo y necesidades a frases para la
 * UI (bocadillo de pensamiento, ánimo, etiqueta de conducta). Es solo una
 * interpretación de lo que ya decidió la red; no decide nada.
 */
import type { Action } from '../brain/Actions';
import { behaviorLine } from '../games/MiniGame';
import type { PetStats } from '../simulation/SimConfig';
import type { World } from '../simulation/World';

const THOUGHTS: [Action, (focus: string | null, name: string) => string][] = [
  ['GET_SCARED', () => '¡¿Qué fue eso?!'],
  ['HIDE', () => 'Mejor me escondo un ratito…'],
  ['CRY', () => 'Me siento un poco triste…'],
  ['SLEEP', () => 'Zzz…'],
  ['EAT', () => 'Mmm… ¡comida!'],
  ['DRINK', () => 'Qué rica el agua fresquita.'],
  ['PICK_UP_OBJECT', (f) => (f ? `¡Me llevo ${f}!` : '¡Esto es mío!')],
  ['PLAY', (f) => (f ? `¡Qué divertido es jugar con ${f}!` : '¡A jugar!')],
  ['DANCE', () => '¡Qué alegría!'],
  ['INVESTIGATE', (f) => (f ? `¿Qué será ${f}? Huele distinto…` : '¿Qué hay por aquí?')],
  ['LOOK_AT_OBJECT', (f) => (f ? `¿Y eso? ${capital(f)} me llama la atención…` : '¿Qué es eso?')],
  ['ASK_ATTENTION', () => '¿Jugamos un ratito?'],
  ['GREET', () => '¡Hola! ¡Estás aquí!'],
  ['APPROACH', () => 'Ya voy contigo…'],
  ['FOLLOW_PLAYER', () => '¡Espérame!'],
  ['MOVE_AWAY', () => 'Necesito un poco de espacio.'],
  ['REST', () => 'Un descansito…'],
  ['EXPLORE', () => 'Voy a ver qué hay por ahí.'],
  ['RUN', () => '¡Wiii!'],
  ['WALK', () => 'Un paseíto…'],
  ['SMILE', () => 'Qué a gusto estoy.'],
  ['MAKE_SOUND', () => '¡Guau, guau!'],
];

function capital(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function needActionThought(world: World, kind: 'water' | 'food'): string {
  const pet = world.pet;
  const src = kind === 'water' ? world.firstOfType('water') : world.nearest(world.foodSources());
  if (!src || src.amount <= 0) return kind === 'water' ? 'Mi bebedero está vacío… ¿me pones agua?' : 'Mi plato está vacío… ¿me das de comer?';
  if (world.distance(pet, src) > 0.12) return kind === 'water' ? 'Tengo sed… voy a por agua.' : 'Tengo hambre… voy a comer.';
  return kind === 'water' ? 'Qué rica el agua fresquita.' : 'Mmm… ¡comida!';
}

export function thoughtFor(active: readonly Action[], world: World, name: string): string {
  const focus = world.getObject(world.focusObjectId);
  const carried = world.getObject(world.pet.carrying);
  const label = (carried ?? focus)?.label ?? null;
  const A = new Set(active);
  if (A.has('SLEEP') && !world.pet.asleep) return world.location === 'room' ? 'Tengo sueño… ¿dónde está mi camita?' : 'Tengo sueño… quiero volver a mi camita.';
  // v7: un sonido que no ve (detrás, fuera) también da que pensar
  const t = world.attentionTarget;
  if (!focus && t?.type === 'sound' && (A.has('LOOK_AT_OBJECT') || A.has('INVESTIGATE'))) return '¿Qué ha sido eso?';
  if (A.has('WALK') && world.location !== 'room' && active.length === 1) return world.location === 'park' ? '¡Cuánto espacio!' : 'Qué bien huele aquí fuera.';
  // v8: comer/beber se narra según lo que pasa DE VERDAD (en camino, recipiente vacío, o comiendo/bebiendo)
  if (A.has('DRINK') && !A.has('GET_SCARED') && !A.has('HIDE') && !A.has('CRY')) return needActionThought(world, 'water');
  if (A.has('EAT') && !A.has('GET_SCARED') && !A.has('HIDE') && !A.has('CRY')) return needActionThought(world, 'food');
  for (const [action, fn] of THOUGHTS) if (A.has(action)) return fn(label, name);
  return needThought(world.pet.snapshot());
}

function needThought(s: PetStats): string {
  if (s.hunger > 0.7) return 'Tengo hambre…';
  if (s.thirst > 0.7) return 'Qué sed…';
  if (s.fatigue > 0.7) return 'Estoy cansadito…';
  if (s.affection < 0.3) return 'Te echo de menos…';
  if (s.boredom > 0.65) return 'Me aburro un poquito…';
  return 'Todo está tranquilo.';
}

export function moodLabel(s: PetStats): string {
  const primary = s.fear > 0.4 ? 'Asustado' : s.fatigue > 0.7 ? 'Cansado' : s.hunger > 0.7 ? 'Hambriento'
    : s.thirst > 0.7 ? 'Sediento' : s.affection < 0.3 ? 'Solito' : 'Contento';
  const secondary = s.curiosity > 0.35 ? 'curioso' : s.energy > 0.7 ? 'con energía' : s.boredom > 0.6 ? 'aburrido' : 'tranquilo';
  return `${primary} y ${secondary}`;
}

export function moodEmoji(s: PetStats): string {
  if (s.fear > 0.4) return '😟';
  if (s.fatigue > 0.7) return '😴';
  if (s.hunger > 0.7 || s.thirst > 0.7) return '🥺';
  if (s.affection < 0.3) return '🥹';
  return '😊';
}

export function behaviorLabel(active: readonly Action[]): string {
  return capital(behaviorLine(active));
}

// 0..5 puntos para las píldoras de estado
export function dots(v: number): number {
  return Math.max(0, Math.min(5, Math.round(v * 5)));
}

export function timeOfDayLabel(date: Date): { label: string; icon: 'sun' | 'sunset' | 'moon' | 'sunrise' } {
  const h = date.getHours();
  if (h >= 6 && h < 12) return { label: 'Mañana fresca', icon: 'sunrise' };
  if (h >= 12 && h < 17) return { label: 'Mediodía soleado', icon: 'sun' };
  if (h >= 17 && h < 21) return { label: 'Tarde dorada', icon: 'sunset' };
  return { label: 'Noche tranquila', icon: 'moon' };
}

/*
 * CATÁLOGO DE OBJETOS
 * -------------------
 * Datos FÍSICOS de cada objeto que puede existir en el mundo. `kind` es la
 * clave visual (el renderer elige el modelo 3D) y la clave de memoria
 * ("le encanta la pelota").
 *
 * v7 (mundo vivo): cada objeto declara
 *   size         radio aproximado (unidades de habitación)
 *   movable      se puede desplazar (arrastrar, empujar, rodar)
 *   interactive  admite interacción física de la mascota
 *   sensory      propiedades sensoriales: lo llamativo que es a la vista
 *                (`visual`), si hace ruido al moverse/caer (`sound`), si su
 *                imagen se mueve con quien lo mira (`reflective`, espejo)
 *   affordances  posibilidades FÍSICAS (canCarry, canHide...). Una
 *                affordance dice "esto es posible", nunca "la mascota quiere".
 *
 * La NOVEDAD ya no es una propiedad del tipo (antes `novelty: 1` para los
 * objetos "raros"): sale de la memoria de exposición de CADA mascota
 * (ExplorationMemory). Colocar cualquier objeto produce la misma señal
 * transitoria de "algo apareció".
 */
export const ITEM_KINDS = [
  'bed', 'bowl', 'water', 'tent',
  'ball', 'teddy',
  'cactus', 'gift', 'duck', 'mushroom', 'yoyo', 'crystal', 'shell', 'puzzle', 'rope',
  'mysteryBox', 'treat',
  // v7: mundo vivo (objetos exploratorios y entidades ambientales)
  'mirror', 'leaf', 'feather', 'butterfly',
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export type ObjectType = 'bed' | 'food' | 'water' | 'hideout' | 'toy' | 'novel' | 'treat' | 'ambient';

export const AFFORDANCES = [
  'canPush', 'canCarry', 'canPlay', 'canRoll', 'canRest', 'canSleep', 'canInspect', 'canEnter', 'canHide', 'canEat', 'canDrink',
] as const;
export type Affordance = (typeof AFFORDANCES)[number];

export interface SensoryProperties {
  visual: number; // 0..1 lo llamativo que es (color, brillo, contraste)
  sound: number; // 0..1 intensidad del sonido que hace al caer/rodar/abrirse
  reflective?: boolean; // su imagen se mueve cuando el observador se mueve (espejo)
}

export interface ItemDef {
  kind: ItemKind;
  type: ObjectType;
  label: string; // "la pelota"
  name: string; // "Pelota roja"
  emoji: string;
  interest: number; // = sensory.visual (compatibilidad: saliencia física del objeto)
  pickable: boolean; // = affordances incluye canCarry
  inventory: boolean; // se puede colocar desde la mochila
  size: number;
  movable: boolean;
  interactive: boolean;
  sensory: SensoryProperties;
  affordances: readonly Affordance[];
  friction?: number; // rozamiento propio al rodar (se combina con el del suelo)
  lifetimeTicks?: number; // entidades ambientales: desaparecen solas (hoja, mariposa)
}

type Def = Omit<ItemDef, 'kind' | 'interest' | 'pickable'>;
const d = (kind: ItemKind, def: Def): ItemDef => ({ kind, ...def, interest: def.sensory.visual, pickable: def.affordances.includes('canCarry') });

const TOY: readonly Affordance[] = ['canPush', 'canCarry', 'canPlay', 'canInspect'];
const TRINKET: readonly Affordance[] = ['canCarry', 'canInspect', 'canPlay'];

export const ITEMS: Readonly<Record<ItemKind, ItemDef>> = {
  bed: d('bed', { type: 'bed', label: 'la camita', name: 'Camita', emoji: '🛏️', inventory: false, size: 0.12, movable: true, interactive: true, sensory: { visual: 0, sound: 0 }, affordances: ['canRest', 'canSleep'] }),
  bowl: d('bowl', { type: 'food', label: 'el plato', name: 'Plato de comida', emoji: '🥣', inventory: false, size: 0.06, movable: true, interactive: true, sensory: { visual: 0, sound: 0.2 }, affordances: ['canEat'] }),
  water: d('water', { type: 'water', label: 'el agua', name: 'Bebedero', emoji: '💧', inventory: false, size: 0.06, movable: true, interactive: true, sensory: { visual: 0, sound: 0.1 }, affordances: ['canDrink'] }),
  tent: d('tent', { type: 'hideout', label: 'la tienda escondite', name: 'Tienda escondite', emoji: '⛺', inventory: false, size: 0.12, movable: false, interactive: true, sensory: { visual: 0.1, sound: 0 }, affordances: ['canHide', 'canEnter', 'canRest'] }),
  ball: d('ball', { type: 'toy', label: 'la pelota', name: 'Pelota roja', emoji: '⚽', inventory: true, size: 0.03, movable: true, interactive: true, sensory: { visual: 0.3, sound: 0.35 }, affordances: [...TOY, 'canRoll'], friction: 0.85 }),
  teddy: d('teddy', { type: 'toy', label: 'el peluche', name: 'Osito', emoji: '🧸', inventory: true, size: 0.04, movable: true, interactive: true, sensory: { visual: 0.4, sound: 0.05 }, affordances: TOY, friction: 0.6 }),
  cactus: d('cactus', { type: 'novel', label: 'el cactus', name: 'Cactus', emoji: '🌵', inventory: true, size: 0.04, movable: true, interactive: true, sensory: { visual: 0.9, sound: 0.1 }, affordances: TRINKET }),
  gift: d('gift', { type: 'novel', label: 'el regalo', name: 'Regalo', emoji: '🎁', inventory: true, size: 0.04, movable: true, interactive: true, sensory: { visual: 0.9, sound: 0.15 }, affordances: TRINKET }),
  duck: d('duck', { type: 'novel', label: 'el patito', name: 'Patito suave', emoji: '🦆', inventory: true, size: 0.03, movable: true, interactive: true, sensory: { visual: 0.9, sound: 0.2 }, affordances: TRINKET }),
  mushroom: d('mushroom', { type: 'novel', label: 'la seta', name: 'Seta', emoji: '🍄', inventory: true, size: 0.03, movable: true, interactive: true, sensory: { visual: 0.9, sound: 0.05 }, affordances: TRINKET }),
  yoyo: d('yoyo', { type: 'novel', label: 'el yoyó', name: 'Yoyó', emoji: '🪀', inventory: true, size: 0.03, movable: true, interactive: true, sensory: { visual: 0.9, sound: 0.2 }, affordances: [...TRINKET, 'canRoll'], friction: 0.85 }),
  crystal: d('crystal', { type: 'novel', label: 'la bola de cristal', name: 'Bola de cristal', emoji: '🔮', inventory: true, size: 0.03, movable: true, interactive: true, sensory: { visual: 0.9, sound: 0.3 }, affordances: [...TRINKET, 'canRoll'], friction: 0.9 }),
  shell: d('shell', { type: 'novel', label: 'la concha', name: 'Concha', emoji: '🐚', inventory: true, size: 0.03, movable: true, interactive: true, sensory: { visual: 0.9, sound: 0.1 }, affordances: TRINKET }),
  puzzle: d('puzzle', { type: 'novel', label: 'la pieza de puzle', name: 'Pieza de puzle', emoji: '🧩', inventory: true, size: 0.03, movable: true, interactive: true, sensory: { visual: 0.9, sound: 0.05 }, affordances: TRINKET }),
  rope: d('rope', { type: 'novel', label: 'la cuerda', name: 'Cuerda de nudos', emoji: '🪢', inventory: true, size: 0.04, movable: true, interactive: true, sensory: { visual: 0.9, sound: 0.05 }, affordances: TRINKET }),
  // La caja: se puede inspeccionar, abrir (a base de investigarla), meterse dentro y esconderse
  mysteryBox: d('mysteryBox', { type: 'novel', label: 'la caja misteriosa', name: 'Caja misteriosa', emoji: '📦', inventory: true, size: 0.07, movable: true, interactive: true, sensory: { visual: 0.9, sound: 0.25 }, affordances: ['canInspect', 'canEnter', 'canHide', 'canPush'] }),
  treat: d('treat', { type: 'treat', label: 'la galletita', name: 'Galletita', emoji: '🍪', inventory: false, size: 0.02, movable: false, interactive: true, sensory: { visual: 0.5, sound: 0 }, affordances: ['canEat'] }),
  // v7: estímulo visual inusual cuya imagen se mueve con el observador (NO "se reconoce")
  mirror: d('mirror', { type: 'novel', label: 'el espejo', name: 'Espejo', emoji: '🪞', inventory: true, size: 0.07, movable: true, interactive: true, sensory: { visual: 0.7, sound: 0.2, reflective: true }, affordances: ['canInspect'] }),
  leaf: d('leaf', { type: 'ambient', label: 'la hoja', name: 'Hoja', emoji: '🍂', inventory: false, size: 0.02, movable: true, interactive: true, sensory: { visual: 0.35, sound: 0.08 }, affordances: ['canCarry', 'canInspect', 'canPlay', 'canPush'], friction: 0.7, lifetimeTicks: 1800 }),
  feather: d('feather', { type: 'ambient', label: 'la pluma', name: 'Pluma', emoji: '🪶', inventory: false, size: 0.02, movable: true, interactive: true, sensory: { visual: 0.45, sound: 0.02 }, affordances: ['canCarry', 'canInspect', 'canPlay'], friction: 0.75, lifetimeTicks: 1500 }),
  butterfly: d('butterfly', { type: 'ambient', label: 'la mariposa', name: 'Mariposa', emoji: '🦋', inventory: false, size: 0.02, movable: true, interactive: false, sensory: { visual: 0.6, sound: 0 }, affordances: ['canInspect'], lifetimeTicks: 240 }),
};

// Objetos que puede traer "Objeto nuevo" y la caja misteriosa (el mismo conjunto que el prototipo, + cuerda)
export const NOVEL_KINDS: readonly ItemKind[] = ['cactus', 'gift', 'duck', 'mushroom', 'yoyo', 'crystal', 'shell', 'puzzle', 'rope'];

export function isItemKind(v: unknown): v is ItemKind {
  return typeof v === 'string' && (ITEM_KINDS as readonly string[]).includes(v);
}

export function affords(kind: ItemKind, a: Affordance): boolean {
  return ITEMS[kind].affordances.includes(a);
}

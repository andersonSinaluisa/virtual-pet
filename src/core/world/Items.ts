/*
 * CATÁLOGO DE OBJETOS
 * -------------------
 * Datos de cada objeto que puede existir en el mundo. `kind` es la clave
 * visual (el renderer la usa para elegir el modelo 3D) y la clave de
 * preferencias/recuerdos ("le encanta la pelota").
 *
 * Mismos valores de interés que el prototipo: pelota 0.3, peluche 0.4,
 * objetos nuevos 0.9 con novedad 1.
 */
export const ITEM_KINDS = [
  'bed', 'bowl', 'water', 'tent',
  'ball', 'teddy',
  'cactus', 'gift', 'duck', 'mushroom', 'yoyo', 'crystal', 'shell', 'puzzle', 'rope',
  'mysteryBox', 'treat',
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export type ObjectType = 'bed' | 'food' | 'water' | 'hideout' | 'toy' | 'novel' | 'treat';

export interface ItemDef {
  kind: ItemKind;
  type: ObjectType;
  label: string; // "la pelota"
  name: string; // "Pelota roja"
  emoji: string;
  interest: number;
  pickable: boolean;
  novelty?: number;
  inventory: boolean; // se puede colocar desde la mochila
}

export const ITEMS: Readonly<Record<ItemKind, ItemDef>> = {
  bed: { kind: 'bed', type: 'bed', label: 'la camita', name: 'Camita', emoji: '🛏️', interest: 0, pickable: false, inventory: false },
  bowl: { kind: 'bowl', type: 'food', label: 'el plato', name: 'Plato de comida', emoji: '🥣', interest: 0, pickable: false, inventory: false },
  water: { kind: 'water', type: 'water', label: 'el agua', name: 'Bebedero', emoji: '💧', interest: 0, pickable: false, inventory: false },
  tent: { kind: 'tent', type: 'hideout', label: 'la tienda escondite', name: 'Tienda escondite', emoji: '⛺', interest: 0.1, pickable: false, inventory: false },
  ball: { kind: 'ball', type: 'toy', label: 'la pelota', name: 'Pelota roja', emoji: '⚽', interest: 0.3, pickable: true, inventory: true },
  teddy: { kind: 'teddy', type: 'toy', label: 'el peluche', name: 'Osito', emoji: '🧸', interest: 0.4, pickable: true, inventory: true },
  cactus: { kind: 'cactus', type: 'novel', label: 'el cactus', name: 'Cactus', emoji: '🌵', interest: 0.9, pickable: true, novelty: 1, inventory: true },
  gift: { kind: 'gift', type: 'novel', label: 'el regalo', name: 'Regalo', emoji: '🎁', interest: 0.9, pickable: true, novelty: 1, inventory: true },
  duck: { kind: 'duck', type: 'novel', label: 'el patito', name: 'Patito suave', emoji: '🦆', interest: 0.9, pickable: true, novelty: 1, inventory: true },
  mushroom: { kind: 'mushroom', type: 'novel', label: 'la seta', name: 'Seta', emoji: '🍄', interest: 0.9, pickable: true, novelty: 1, inventory: true },
  yoyo: { kind: 'yoyo', type: 'novel', label: 'el yoyó', name: 'Yoyó', emoji: '🪀', interest: 0.9, pickable: true, novelty: 1, inventory: true },
  crystal: { kind: 'crystal', type: 'novel', label: 'la bola de cristal', name: 'Bola de cristal', emoji: '🔮', interest: 0.9, pickable: true, novelty: 1, inventory: true },
  shell: { kind: 'shell', type: 'novel', label: 'la concha', name: 'Concha', emoji: '🐚', interest: 0.9, pickable: true, novelty: 1, inventory: true },
  puzzle: { kind: 'puzzle', type: 'novel', label: 'la pieza de puzle', name: 'Pieza de puzle', emoji: '🧩', interest: 0.9, pickable: true, novelty: 1, inventory: true },
  rope: { kind: 'rope', type: 'novel', label: 'la cuerda', name: 'Cuerda de nudos', emoji: '🪢', interest: 0.9, pickable: true, novelty: 1, inventory: true },
  mysteryBox: { kind: 'mysteryBox', type: 'novel', label: 'la caja misteriosa', name: 'Caja misteriosa', emoji: '📦', interest: 0.9, pickable: false, novelty: 1, inventory: false },
  treat: { kind: 'treat', type: 'treat', label: 'la galletita', name: 'Galletita', emoji: '🍪', interest: 0.5, pickable: false, inventory: false },
};

// Objetos que puede traer "Objeto nuevo" (el mismo conjunto que el prototipo, + cuerda)
export const NOVEL_KINDS: readonly ItemKind[] = ['cactus', 'gift', 'duck', 'mushroom', 'yoyo', 'crystal', 'shell', 'puzzle', 'rope'];

export function isItemKind(v: unknown): v is ItemKind {
  return typeof v === 'string' && (ITEM_KINDS as readonly string[]).includes(v);
}

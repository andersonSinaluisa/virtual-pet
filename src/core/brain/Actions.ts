/*
 * CATÁLOGO DE ACCIONES
 * --------------------
 * Enum centralizado de las 22 acciones. Cada acción tiene su propia neurona
 * de salida (ver Brain). Aquí solo hay metadatos para la aplicación:
 * categoría, texto y cuántos ticks se mantiene físicamente una acción
 * después de un spike (`hold`). Un nuevo spike renueva el hold, así que la
 * FRECUENCIA de disparo sostiene el comportamiento.
 */
export const ACTION_CATEGORIES = [
  { key: 'needs', label: 'Necesidades', actions: ['EAT', 'DRINK', 'SLEEP', 'REST'] },
  { key: 'activity', label: 'Actividad', actions: ['PLAY', 'EXPLORE', 'WALK', 'RUN'] },
  { key: 'social', label: 'Social', actions: ['ASK_ATTENTION', 'APPROACH', 'MOVE_AWAY', 'GREET', 'FOLLOW_PLAYER'] },
  { key: 'expression', label: 'Expresión', actions: ['SMILE', 'CRY', 'MAKE_SOUND', 'DANCE'] },
  { key: 'curiosity', label: 'Curiosidad', actions: ['LOOK_AT_OBJECT', 'INVESTIGATE', 'PICK_UP_OBJECT'] },
  { key: 'reaction', label: 'Reacciones', actions: ['GET_SCARED', 'HIDE'] },
] as const;

export type ActionCategoryKey = (typeof ACTION_CATEGORIES)[number]['key'];
export type Action = (typeof ACTION_CATEGORIES)[number]['actions'][number];

// Orden canónico = orden de las neuronas de salida.
export const ACTION_LIST: readonly Action[] = ACTION_CATEGORIES.flatMap((c) => c.actions);

export const Actions = Object.freeze(Object.fromEntries(ACTION_LIST.map((a) => [a, a])) as { readonly [K in Action]: K });

export interface ActionInfo {
  label: string;
  phrase: string;
  hold: number;
}

export const ACTION_INFO: Readonly<Record<Action, ActionInfo>> = {
  EAT: { label: 'COMER', phrase: 'come', hold: 8 },
  DRINK: { label: 'BEBER', phrase: 'bebe agua', hold: 8 },
  SLEEP: { label: 'DORMIR', phrase: 'duerme', hold: 10 },
  REST: { label: 'DESCANSAR', phrase: 'se sienta a descansar', hold: 6 },
  PLAY: { label: 'JUGAR', phrase: 'juega con un juguete', hold: 6 },
  EXPLORE: { label: 'EXPLORAR', phrase: 'explora mirando alrededor', hold: 8 },
  WALK: { label: 'CAMINAR', phrase: 'camina', hold: 6 },
  RUN: { label: 'CORRER', phrase: 'corre', hold: 4 },
  ASK_ATTENTION: { label: 'PEDIR ATENCIÓN', phrase: 'te pide atención', hold: 6 },
  APPROACH: { label: 'ACERCARSE', phrase: 'se acerca a ti', hold: 6 },
  MOVE_AWAY: { label: 'ALEJARSE', phrase: 'se aleja', hold: 6 },
  GREET: { label: 'SALUDAR', phrase: 'te saluda', hold: 5 },
  FOLLOW_PLAYER: { label: 'SEGUIRTE', phrase: 'te sigue', hold: 6 },
  SMILE: { label: 'SONREÍR', phrase: 'sonríe', hold: 5 },
  CRY: { label: 'LLORAR', phrase: 'llora', hold: 6 },
  MAKE_SOUND: { label: 'HACER SONIDO', phrase: 'hace ruiditos', hold: 4 },
  DANCE: { label: 'BAILAR', phrase: 'baila', hold: 6 },
  LOOK_AT_OBJECT: { label: 'MIRAR OBJETO', phrase: 'mira un objeto', hold: 5 },
  INVESTIGATE: { label: 'INVESTIGAR', phrase: 'investiga el objeto', hold: 7 },
  PICK_UP_OBJECT: { label: 'RECOGER OBJETO', phrase: 'recoge el objeto', hold: 6 },
  GET_SCARED: { label: 'ASUSTARSE', phrase: 'se asusta', hold: 4 },
  HIDE: { label: 'ESCONDERSE', phrase: 'se esconde', hold: 8 },
};

export function isAction(v: unknown): v is Action {
  return typeof v === 'string' && (ACTION_LIST as readonly string[]).includes(v);
}

// "corre hacia ti, te saluda y sonríe"
export function describeBehavior(actions: readonly Action[]): string {
  const phrases = actions.map((a) => ACTION_INFO[a].phrase);
  if (phrases.length <= 1) return phrases[0] ?? '';
  return phrases.slice(0, -1).join(', ') + ' y ' + phrases[phrases.length - 1];
}

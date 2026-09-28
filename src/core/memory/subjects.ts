import { ITEMS, isItemKind } from '../world/Items';
import type { SubjectKey } from './types';

// Artículo + nombre: "la pelota", "los ruidos fuertes"
export function subjectLabel(s: SubjectKey | null): string {
  if (!s) return 'algo';
  if (s === 'player') return 'ti';
  if (s === 'loudSound') return 'los ruidos fuertes';
  if (s === 'darkness') return 'la oscuridad';
  return isItemKind(s) ? ITEMS[s].label : s;
}

// Nombre propio para títulos: "Pelota roja"
export function subjectName(s: SubjectKey | null): string {
  if (!s) return 'Algo';
  if (s === 'player') return 'Tú';
  if (s === 'loudSound') return 'Ruidos fuertes';
  if (s === 'darkness') return 'Oscuridad';
  return isItemKind(s) ? ITEMS[s].name : s;
}

export function subjectEmoji(s: SubjectKey | null): string {
  if (!s) return '✨';
  if (s === 'player') return '💛';
  if (s === 'loudSound') return '🔊';
  if (s === 'darkness') return '🌙';
  return isItemKind(s) ? ITEMS[s].emoji : '✨';
}

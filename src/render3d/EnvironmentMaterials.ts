/*
 * MATERIALES DE ESCENARIO — un solo lenguaje visual para dos packs.
 *
 * Quaternius trae colores oscuros y metalness 0.4 (sin mapa de entorno se ven
 * apagados); Kenney, pasteles fríos. Aquí se sustituyen EN TIEMPO DE CARGA por
 * una paleta cálida y suave coherente con la mascota (plush, Stitch): mate
 * (roughness alta, metalness 0) y colores por NOMBRE de material. Los GLB
 * originales no se modifican. Los materiales se comparten (caché por clave):
 * menos cambios de estado y menos memoria.
 */
import * as THREE from 'three';

// Nombre de material (en minúsculas, sin prefijos) → color de la paleta cozy
const PALETTE: Record<string, string> = {
  // Quaternius · interior
  couch_blue: '#E6A9B8', couch_beige: '#F2DECB', couch_beigedark: '#E3C6AE',
  wood: '#DDA982', wood_light: '#EBC6A0', wood_dark: '#B98560', brown: '#BF9270',
  white: '#FBF3EA', black: '#6E5C62', lightmetal: '#DCD5CF', metal: '#BDB2AA', gold: '#EDC77A',
  darkgreen: '#7DBB86', plant_green: '#9ACD7C', lightorange: '#F4B58A', darkred: '#DE8E93', marble: '#F3E9DE',
  glass: '#EAF5FF',
  // Kenney · naturaleza
  leafsgreen: '#8FCE7E', leafsdark: '#72B876', woodbark: '#BB8C66', woodbarkdark: '#9E7355', wooddark: '#CB9C75', woodinner: '#F4DAB6',
  grass: '#A3D883', dirt: '#E8CBA2', dirtdark: '#D4B088', stone: '#DDD7D1', stonedark: '#C1B9B2',
  colorred: '#F48FA0', coloryellow: '#FFD36E', colorpurple: '#BBA4F4', colorblue: '#9CC8F2', colororange: '#F7B27A', colorwhite: '#FFF9F2',
  _defaultmat: '#F5EFE7',
};

const cache = new Map<string, THREE.MeshStandardMaterial>();

function key(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '_').replace(/\.\d+$/, '');
}

// Material cozy compartido para un material original (conserva el nombre para los vínculos semánticos)
export function cozyMaterial(original: THREE.Material): THREE.MeshStandardMaterial {
  const k = key(original.name || '');
  const hit = cache.get(k);
  if (hit) return hit;
  const src = original as THREE.MeshStandardMaterial;
  const hex = PALETTE[k];
  const color = hex ? new THREE.Color(hex) : softened(src.color ?? new THREE.Color('#dddddd'));
  const glass = k === 'glass';
  const m = new THREE.MeshStandardMaterial({
    name: original.name, color, roughness: glass ? 0.2 : 0.85, metalness: 0,
    transparent: false, side: src.side ?? THREE.FrontSide,
  });
  m.userData.cozy = true;
  cache.set(k, m);
  return m;
}

// Sin entrada en la paleta: el color original, algo más claro y menos saturado (tono pastel)
function softened(c: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, Math.min(0.55, hsl.s * 0.8), Math.min(0.85, 0.35 + hsl.l * 0.7));
}

export const isCozyShared = (m: THREE.Material): boolean => !!m.userData.cozy && cache.get(key(m.name || '')) === m;

// Material propio (no compartido) para lo que cambia por instancia: fundido por oclusión, lámparas encendidas
export function ownMaterial(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const c = m.clone();
  c.userData = { own: true };
  return c;
}

export function disposeCozyCache(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}

export const COZY_PALETTE_KEYS = Object.keys(PALETTE);

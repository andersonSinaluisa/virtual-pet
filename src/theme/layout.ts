/*
 * Espaciado, radios y sombras (DESIGN.md "Layout & Spacing", "Shapes",
 * "Elevation & Depth"). Las sombras usan boxShadow de RN (New Architecture),
 * que acepta la misma sintaxis que CSS.
 */
import type { ViewStyle } from 'react-native';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  gutter: 16,
  margin: 20, // margen lateral de pantalla
} as const;

export const radius = {
  sm: 8,
  md: 16, // DEFAULT (1rem)
  lg: 24, // rounded-3xl de las tarjetas Stitch
  xl: 32, // rounded-lg del DESIGN (2rem)
  xxl: 48,
  full: 9999,
} as const;

export const shadows = {
  // Nivel 1: HUD / cristal
  glass: { boxShadow: '0 8px 32px -4px rgba(184,140,118,0.12)' },
  // Nivel 2: tarjetas "marshmallow"
  card: { boxShadow: '0 12px 28px -6px rgba(160,120,100,0.14), 0 4px 10px -2px rgba(160,120,100,0.06)' },
  // Nivel 3: modales y bocadillos
  float: { boxShadow: '0 20px 40px -8px rgba(148,105,84,0.18), 0 6px 14px -3px rgba(148,105,84,0.08)' },
  stage: { boxShadow: '0 16px 40px -12px rgba(148,105,84,0.18)' },
  bubble: { boxShadow: '0 8px 24px -4px rgba(184,140,118,0.22)' },
  primaryButton: { boxShadow: '0 8px 16px -2px rgba(255,158,121,0.35)' },
  soft: { boxShadow: '0 1px 8px rgba(0,0,0,0.04)' },
  none: {},
} satisfies Record<string, ViewStyle>;

// Pulsación "marshmallow": escala al 97 %
export const PRESS_SCALE = 0.97;

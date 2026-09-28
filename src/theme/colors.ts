/*
 * Colores del design system "Milo & Friends" (Stitch → milo_friends/DESIGN.md
 * y tailwind.config de cada pantalla). Único lugar con hexadecimales de UI.
 *
 * El diseño solo define tema claro: la app fija userInterfaceStyle "light".
 */
export const palette = {
  // Material 3 (tailwind.config de Stitch)
  surface: '#fef9f2',
  surfaceDim: '#ded9d3',
  surfaceBright: '#fef9f2',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f8f3ec',
  surfaceContainer: '#f2ede6',
  surfaceContainerHigh: '#ece7e1',
  surfaceContainerHighest: '#e6e2db',
  onSurface: '#1d1c18',
  onSurfaceVariant: '#54433d',
  inverseSurface: '#32302c',
  inverseOnSurface: '#f5f0e9',
  outline: '#87736c',
  outlineVariant: '#dac1b9',

  primary: '#94492a',
  onPrimary: '#ffffff',
  primaryContainer: '#ff9e79',
  onPrimaryContainer: '#783316',
  inversePrimary: '#ffb59a',
  primaryFixed: '#ffdbce',
  primaryFixedDim: '#ffb59a',
  onPrimaryFixed: '#380d00',
  onPrimaryFixedVariant: '#763216',

  secondary: '#006c52',
  onSecondary: '#ffffff',
  secondaryContainer: '#96f1cf',
  onSecondaryContainer: '#007056',
  secondaryFixed: '#99f4d2',
  secondaryFixedDim: '#7dd8b7',
  onSecondaryFixedVariant: '#00513d',

  tertiary: '#625595',
  onTertiary: '#ffffff',
  tertiaryContainer: '#bcadf4',
  onTertiaryContainer: '#4b3e7d',
  tertiaryFixed: '#e7deff',
  tertiaryFixedDim: '#ccbeff',
  onTertiaryFixedVariant: '#4a3d7c',

  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',

  // Acentos del DESIGN.md
  butter: '#FDE047',
  sky: '#93C5FD',
  rose: '#F472B6',
  mint: '#7ED9B8',
  lavender: '#C4B5FD',
  vanilla: '#FAF5EE',
  cream: '#FFFDF9',
  espresso: '#4A3E3D',
  cocoa: '#7C6E6B',
  almond: '#F0E5D8',
  peachBorder: '#FFD3C4',
} as const;

// Alias semánticos: los componentes usan estos, no la paleta cruda
export const colors = {
  ...palette,
  background: palette.surface,
  text: palette.onSurface,
  textMuted: palette.onSurfaceVariant,
  textSubtle: palette.outline,
  card: palette.surfaceContainerLowest,
  cardMuted: palette.surfaceContainerLow,
  divider: 'rgba(240,229,216,0.8)',
  scrim: 'rgba(29,28,24,0.32)',
  glass: 'rgba(255,253,249,0.72)',
  glassBorder: 'rgba(255,255,255,0.6)',
} as const;

// Colores con transparencia (equivalente a los "/40", "/60" de Tailwind)
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export type Accent = 'primary' | 'secondary' | 'tertiary' | 'rose' | 'sky' | 'butter';

// Fondo tenue + color de glifo por acento (tarjetas, iconos de juego, rasgos)
export const accents: Record<Accent, { bg: string; fg: string; strong: string }> = {
  primary: { bg: palette.primaryFixed, fg: palette.primary, strong: palette.primaryContainer },
  secondary: { bg: alpha(palette.secondaryContainer, 0.6), fg: palette.secondary, strong: palette.secondaryFixedDim },
  tertiary: { bg: alpha(palette.tertiaryContainer, 0.4), fg: palette.tertiary, strong: palette.tertiaryContainer },
  rose: { bg: '#FDE2EF', fg: '#B0336F', strong: palette.rose },
  sky: { bg: '#E3EEFE', fg: '#2F5E9E', strong: palette.sky },
  butter: { bg: '#FEF6C7', fg: '#8A6D00', strong: palette.butter },
};

/*
 * Superficies del DESIGN.md:
 *  - Card: "marshmallow" (nivel 2), blanca, radio 24, sombra cálida.
 *  - GlassPanel: HUD translúcido (nivel 1).
 *  - Chip: cápsula de estado con punto opcional (Emotional Toast Tags).
 *  - Pips: medidor de 5 puntos (Energía, Curiosidad, Conexión).
 *  - SectionTitle: título de sección con icono y acción opcional.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { alpha, colors, radius, shadows, spacing } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export function Card({ children, style, tone = 'white' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'white' | 'muted' | 'warm' }) {
  const bg = tone === 'muted' ? colors.surfaceContainerLow : tone === 'warm' ? colors.primaryFixed : colors.card;
  return <View style={[styles.card, { backgroundColor: bg }, tone === 'white' ? shadows.card : null, style]}>{children}</View>;
}

export function GlassPanel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.glass, style]}>{children}</View>;
}

interface ChipProps {
  label: string;
  icon?: IconName;
  dot?: string;
  bg?: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}

export function Chip({ label, icon, dot, bg = alpha(colors.surfaceContainerLowest, 0.85), color = colors.textMuted, style, small }: ChipProps) {
  return (
    <View style={[styles.chip, small ? styles.chipSm : null, { backgroundColor: bg }, style]}>
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      {icon ? <Icon name={icon} size={small ? 13 : 16} color={color} /> : null}
      <Text variant={small ? 'labelXs' : 'labelSm'} color={color} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function Pips({ value, color, total = 5 }: { value: number; color: string; total?: number }) {
  return (
    <View style={styles.pips} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: value }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.pip, { backgroundColor: i < value ? color : colors.surfaceContainerHighest }]} />
      ))}
    </View>
  );
}

export function SectionTitle({ title, icon, right, style }: { title: string; icon?: IconName; right?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionLeft}>
        {icon ? <Icon name={icon} size={20} color={colors.primary} /> : null}
        <Text variant="headlineMd" style={{ flexShrink: 1 }}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

// Círculo de icono con fondo tenue (tarjetas de juego, rasgos, recuerdos)
export function IconBadge({ icon, bg, color, size = 48 }: { icon: IconName; bg: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2.6, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.5} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: 'rgba(240,229,216,0.8)' },
  glass: { backgroundColor: colors.glass, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, ...shadows.glass },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, alignSelf: 'flex-start' },
  chipSm: { paddingHorizontal: 10, paddingVertical: 4, gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pips: { flexDirection: 'row', gap: 4 },
  pip: { width: 10, height: 10, borderRadius: 5 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
});

/*
 * Botones del DESIGN.md:
 *  - PrimaryButton: píldora melocotón (#FF9E79) con texto espresso y sombra tintada.
 *  - SecondaryButton: burbuja blanca con borde melocotón.
 *  - StrongButton: píldora terracota (#94492a) con texto blanco ("Lanzar ahora").
 *  - SoftButton: píldora de superficie ("Abrir caja", "Esperar y observar").
 *  - IconButton: círculo de cristal 48–56 px (HUD de cuidados).
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { alpha, colors, radius, shadows, spacing } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Squishable } from './Squishable';
import { Text } from './Text';

interface BaseProps {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg';
  accessibilityHint?: string;
}

function ButtonBase({ label, onPress, icon, iconRight, disabled, style, size = 'md', bg, fg, extra, accessibilityHint }: BaseProps & { bg: string; fg: string; extra?: ViewStyle }) {
  const lg = size === 'lg';
  return (
    <Squishable onPress={onPress} disabled={disabled} accessibilityLabel={label} accessibilityHint={accessibilityHint}
      style={[styles.base, lg ? styles.lg : styles.md, { backgroundColor: bg }, extra, style]}>
      {icon ? <Icon name={icon} size={lg ? 22 : 18} color={fg} /> : null}
      <Text variant={lg ? 'headlineSm' : 'labelMd'} color={fg} numberOfLines={2} align="center" style={styles.label}>{label}</Text>
      {iconRight ? <Icon name={iconRight} size={lg ? 22 : 18} color={fg} /> : null}
    </Squishable>
  );
}

export function PrimaryButton(p: BaseProps) {
  return <ButtonBase {...p} bg={colors.primaryContainer} fg={colors.onPrimaryContainer} extra={shadows.primaryButton} />;
}

export function StrongButton(p: BaseProps) {
  return <ButtonBase {...p} bg={colors.primary} fg={colors.onPrimary} extra={shadows.card} />;
}

export function SecondaryButton(p: BaseProps) {
  return <ButtonBase {...p} bg="rgba(255,255,255,0.85)" fg={colors.text} extra={{ borderWidth: 1.5, borderColor: colors.peachBorder }} />;
}

export function SoftButton(p: BaseProps & { tone?: 'neutral' | 'mint' | 'lavender' }) {
  const tone = p.tone ?? 'neutral';
  const bg = tone === 'mint' ? colors.secondaryContainer : tone === 'lavender' ? alpha(colors.tertiaryContainer, 0.45) : colors.surfaceContainerHigh;
  const fg = tone === 'mint' ? colors.onSecondaryContainer : tone === 'lavender' ? colors.onTertiaryContainer : colors.text;
  return <ButtonBase {...p} bg={bg} fg={fg} />;
}

interface IconButtonProps {
  icon: IconName;
  onPress?: () => void;
  label: string;
  size?: number;
  bg?: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function IconButton({ icon, onPress, label, size = 48, bg = colors.glass, color = colors.primary, style, children }: IconButtonProps) {
  return (
    <Squishable onPress={onPress} accessibilityLabel={label} style={[styles.icon, { width: size, height: size, backgroundColor: bg }, style]}>
      <Icon name={icon} size={size * 0.46} color={color} />
      {children}
    </Squishable>
  );
}

export function Row({ children, gap = spacing.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.full },
  md: { paddingHorizontal: 18, paddingVertical: 10, minHeight: 44 },
  lg: { paddingHorizontal: 28, paddingVertical: 16, minHeight: 58 },
  label: { flexShrink: 1 },
  icon: { borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.glassBorder, ...shadows.glass },
});

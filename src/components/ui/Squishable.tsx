/*
 * Pulsación "marshmallow" (DESIGN.md → Tactile Squish): al tocar, escala al
 * 97 % con un muelle suave. Base de todos los botones y tarjetas pulsables.
 *
 * Las propiedades de LAYOUT (flex, tamaño, márgenes, posición) van al
 * Pressable exterior para que el componente ocupe su hueco en el padre; el
 * aspecto (fondo, radio, padding...) va a la vista animada interior, que
 * rellena el Pressable.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { PRESS_SCALE } from '@/theme';

interface Props extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  scaleTo?: number;
}

const SPRING = { damping: 14, stiffness: 320, mass: 0.6 };

const OUTER_KEYS = new Set<keyof ViewStyle>([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf',
  'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight', 'aspectRatio',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
  'position', 'top', 'left', 'right', 'bottom', 'zIndex',
]);

function splitStyle(style: StyleProp<ViewStyle>): { outer: ViewStyle; inner: ViewStyle } {
  const flat = StyleSheet.flatten(style) ?? {};
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) (OUTER_KEYS.has(k as keyof ViewStyle) ? outer : inner)[k] = v;
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

export function Squishable({ style, children, scaleTo = PRESS_SCALE, onPressIn, onPressOut, disabled, ...rest }: Props) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const { outer, inner } = splitStyle(style);
  return (
    <Pressable
      {...rest}
      style={outer}
      disabled={disabled}
      onPressIn={(e) => { scale.set(withSpring(scaleTo, SPRING)); onPressIn?.(e); }}
      onPressOut={(e) => { scale.set(withSpring(1, SPRING)); onPressOut?.(e); }}
      accessibilityRole={rest.accessibilityRole ?? 'button'}
      accessibilityState={{ disabled: !!disabled, ...rest.accessibilityState }}
    >
      <Animated.View style={[styles.fill, inner, animated, disabled ? styles.disabled : null]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flexGrow: 1 },
  disabled: { opacity: 0.5 },
});

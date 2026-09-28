/*
 * Resplandores atmosféricos de Stitch ("Dynamic Atmospheric Glow"):
 * manchas difusas melocotón/menta detrás del contenido. En RN se aproximan
 * con degradados radiales suaves (sin blur costoso en tiempo real).
 */
import { StyleSheet, View } from 'react-native';

import { alpha, colors } from '@/theme';

interface Spot {
  color: string;
  size: number;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  opacity?: number;
}

export function Glow({ spots }: { spots: Spot[] }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {spots.map((s, i) => (
        <View
          key={i}
          style={{
            position: 'absolute', width: s.size, height: s.size, borderRadius: s.size / 2,
            top: s.top, left: s.left, right: s.right, bottom: s.bottom,
            experimental_backgroundImage: `radial-gradient(circle, ${alpha(s.color, s.opacity ?? 0.45)} 0%, ${alpha(s.color, 0)} 70%)`,
          }}
        />
      ))}
    </View>
  );
}

export const DEFAULT_GLOW: Spot[] = [
  { color: colors.primaryFixed, size: 380, top: -120, left: -60, opacity: 0.6 },
  { color: colors.secondaryFixed, size: 320, top: 360, right: -140, opacity: 0.4 },
];

/*
 * Cabecera común de Stitch: emblema + sobretítulo ("MILO COMPANION") +
 * título de sección + botón de perfil. Respeta el safe area (notch/Dynamic
 * Island) y se ve sobre la superficie con un blur simulado.
 */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alpha, colors, shadows, spacing } from '@/theme';

import { IconButton } from './Buttons';
import { Text } from './Text';

interface Props {
  title: string;
  overline?: string;
  right?: ReactNode;
  left?: ReactNode;
  showProfile?: boolean;
  /** Sin fondo ni sombra: para flotar sobre la escena 3D a pantalla completa */
  floating?: boolean;
}

export function AppHeader({ title, overline = 'Milo Companion', right, left, showProfile = true, floating = false }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, floating ? styles.floating : null, { paddingTop: insets.top + 6 }]}>
      <View style={styles.row}>
        {left ?? <Image source={require('@/assets/images/brand/emblem-face.png')} style={styles.emblem} contentFit="cover" accessibilityIgnoresInvertColors />}
        <View style={styles.titles}>
          <Text variant="labelSm" color={colors.primary} uppercase numberOfLines={1}>{overline}</Text>
          <Text variant="headlineSm" numberOfLines={1}>{title}</Text>
        </View>
        {right}
        {showProfile ? (
          <IconButton icon="person" label="Ajustes" size={36} bg={colors.primary} color={colors.onPrimary} onPress={() => router.push('/settings')} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: alpha(colors.surface, 0.94), paddingBottom: 10, paddingHorizontal: spacing.margin, zIndex: 10, ...shadows.soft },
  floating: { backgroundColor: 'transparent', boxShadow: 'none', elevation: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  emblem: { width: 34, height: 34, borderRadius: 10 },
  titles: { flex: 1 },
});

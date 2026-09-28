/*
 * Cabecera de minijuego: cerrar y el nombre del juego. Nada más.
 */
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/Buttons';
import { Text } from '@/components/ui/Text';
import { alpha, colors, shadows, spacing } from '@/theme';

export function SessionHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 4 }]}>
      <IconButton icon="close" label="Salir del juego" size={44} bg={colors.surfaceContainerHigh} color={colors.text} onPress={onClose} />
      <Text variant="headlineMd" numberOfLines={1} style={styles.title}>{title}</Text>
      <View style={{ width: 44 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: 8, backgroundColor: alpha(colors.surface, 0.95), ...shadows.soft, zIndex: 5 },
  title: { flex: 1, textAlign: 'center' },
});

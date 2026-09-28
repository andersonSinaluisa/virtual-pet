/*
 * Si la escena 3D no puede crearse (GPU sin soporte, error de Three.js), se
 * muestra la ilustración de Stitch. La simulación y el guardado siguen
 * funcionando: el error queda aislado en la capa de render.
 */
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

export function SceneFallback({ reason }: { reason?: string }) {
  return (
    <View style={styles.root}>
      <Image source={require('@/assets/images/pets/milo-portrait.jpg')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={styles.badge}>
        <Text style={styles.text}>Vista 3D no disponible en este dispositivo</Text>
        {__DEV__ && reason ? <Text style={styles.reason} numberOfLines={2}>{reason}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surfaceContainerLow, justifyContent: 'flex-end', alignItems: 'center' },
  badge: { margin: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.glass },
  text: { ...typography.labelSm, color: colors.textMuted },
  reason: { ...typography.bodyXs, color: colors.error },
});

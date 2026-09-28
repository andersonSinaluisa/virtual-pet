/*
 * Tarjeta de descubrimiento (design system Stitch: nivel 3, flotante):
 *
 *   ✨ Descubriste algo                 ❤️ (aprendizaje)
 *   Milo parece disfrutar mucho…        Milo está empezando a entender tu llamada.
 *   [Guardar recuerdo]
 *
 * Solo aparece cuando el DiscoveryEvaluator encontró evidencia suficiente.
 */
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, SoftButton } from '@/components/ui/Buttons';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { discoveryStore } from '@/state/stores';
import { colors, radius, shadows, spacing } from '@/theme';

export function DiscoveryHost() {
  const pending = useStore(discoveryStore);
  const insets = useSafeAreaInsets();
  if (!pending) return null;
  const d = pending.discovery;
  const learning = d.key.startsWith('learned:');
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 96 }]}>
      <Animated.View entering={FadeInDown.springify().damping(16)} exiting={FadeOutDown.duration(180)} style={styles.card} accessibilityLiveRegion="polite">
        <Text style={styles.icon}>{learning ? '❤️' : '✨'}</Text>
        {!learning ? <Text variant="labelMd" color={colors.primary} uppercase align="center">Descubriste algo</Text> : null}
        <Text variant="headlineSm" align="center">{learning ? d.text : d.title}</Text>
        {!learning ? <Text variant="bodyMd" color={colors.textMuted} align="center">{d.text}</Text> : null}
        <View style={styles.row}>
          <SoftButton label="Cerrar" onPress={() => SessionController.dismissDiscovery()} style={styles.flex} />
          <PrimaryButton label="Guardar recuerdo" icon="heart" onPress={() => SessionController.saveDiscoveryMemory()} style={styles.flex} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: spacing.margin, right: spacing.margin, zIndex: 90 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm, alignItems: 'stretch', ...shadows.float },
  icon: { fontSize: 36, textAlign: 'center' },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1 },
});

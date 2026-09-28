/*
 * Avisos efímeros (descubrimientos, recuerdos). Cápsulas translúcidas con
 * punto de color, como las "Emotional Toast Tags" del DESIGN.md.
 */
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '@/state/createStore';
import { toastStore } from '@/state/stores';
import { colors, radius, shadows, spacing } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

export function ToastHost() {
  const toasts = useStore(toastStore);
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={[styles.host, { top: insets.top + 62 }]}>
      {toasts.map((t) => (
        <Animated.View key={t.id} entering={FadeInUp.springify().damping(16)} exiting={FadeOutUp.duration(200)} style={styles.toast} accessibilityLiveRegion="polite">
          <View style={[styles.icon, { backgroundColor: t.kind === 'discovery' ? colors.tertiaryFixed : t.kind === 'moment' ? colors.primaryFixed : colors.surfaceContainerHigh }]}>
            <Icon name={t.kind === 'discovery' ? 'sparkle' : t.kind === 'moment' ? 'book' : 'tips'} size={16} color={t.kind === 'discovery' ? colors.tertiary : colors.primary} />
          </View>
          <View style={styles.texts}>
            <Text variant="labelSm" color={colors.primary} uppercase>{t.title}</Text>
            <Text variant="bodySm" numberOfLines={2}>{t.text}</Text>
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: spacing.margin, right: spacing.margin, gap: spacing.sm, zIndex: 100 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, paddingRight: 16, borderRadius: radius.lg, backgroundColor: 'rgba(255,253,249,0.97)', ...shadows.float },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1 },
});

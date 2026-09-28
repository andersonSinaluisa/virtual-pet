/*
 * ❤️ RECOMPENSAR — solo aparece cuando tiene sentido: justo después de que la
 * mascota se acerque, investigue, recoja, juegue, te siga o te salude
 * (snapshot.rewardable). Pulsarlo envía la señal de aprendizaje y después la
 * caricia, el háptico y el sonido.
 */
import { StyleSheet } from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';

import { Squishable } from '@/components/ui/Squishable';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { petStore } from '@/state/stores';
import { colors, radius, shadows } from '@/theme';

export function RewardButton({ style }: { style?: object }) {
  const rewardable = useStore(petStore, (p) => p?.rewardable ?? null);
  if (!rewardable) return null;
  return (
    <Animated.View entering={ZoomIn.springify().damping(14)} exiting={ZoomOut.duration(150)} style={style}>
      <Squishable onPress={() => SessionController.rewardPlayer()} accessibilityLabel="Recompensar lo que acaba de hacer" style={styles.btn}>
        <Text variant="labelLg" color={colors.onPrimaryContainer}>❤️ Recompensar</Text>
      </Squishable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.full, backgroundColor: colors.primaryContainer, ...shadows.primaryButton },
});

/*
 * "MIENTRAS NO ESTABAS…" — resultado de la simulación offline real
 * (OfflineSimulation): tiempo fuera, lo que su red decidió hacer y cómo
 * cambiaron sus necesidades.
 */
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { PrimaryButton } from '@/components/ui/Buttons';
import { Icon } from '@/components/ui/Icon';
import { PetAvatar } from '@/components/ui/PetAvatar';
import { Text } from '@/components/ui/Text';
import { useStore } from '@/state/createStore';
import { awayStore, petStore } from '@/state/stores';
import { colors, radius, shadows, spacing } from '@/theme';

function duration(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return r ? `${h} h ${r} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'día' : 'días'}`;
}


export default function Away() {
  const report = useStore(awayStore);
  const pet = useStore(petStore);
  const close = () => { awayStore.set(null); router.back(); };
  if (!report || !pet) return null;

  return (
    <View style={styles.scrim}>
      <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.card}>
        <PetAvatar species={pet.species} size={88} style={styles.avatar} />
        <Text variant="labelSm" color={colors.primary} uppercase align="center">Estuviste fuera {duration(report.elapsedMs)}</Text>
        <Text variant="headlineLg" align="center">Mientras no estabas…</Text>
        <View style={styles.list}>
          {report.highlights.map((h) => (
            <View key={h} style={styles.item}>
              <Icon name="paw" size={16} color={colors.primary} />
              <Text variant="bodyMd" style={{ flex: 1 }}>{h}</Text>
            </View>
          ))}
        </View>
        <PrimaryButton size="lg" label={`¡Hola de nuevo, ${pet.name}!`} icon="wave" onPress={close} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', padding: spacing.margin, backgroundColor: colors.scrim },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, paddingTop: 56, gap: spacing.md, ...shadows.float },
  avatar: { position: 'absolute', top: -44, alignSelf: 'center' },
  list: { gap: spacing.sm },
  item: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
});

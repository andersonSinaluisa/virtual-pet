/*
 * Tres medidores con emoji (Energía, Curiosidad, Cariño), compactos para
 * que el Mundo quepa sin scroll. Datos reales del core.
 */
import { StyleSheet, View } from 'react-native';

import { dots } from '@/core/explain/Narrator';
import type { PetSnapshot } from '@/core/session/GameSession';
import { Card, Pips } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { colors, radius, spacing } from '@/theme';

function Meter({ emoji, label, value, color }: { emoji: string; label: string; value: number; color: string }) {
  return (
    <View style={styles.meter} accessibilityLabel={`${label}: ${dots(value)} de 5`}>
      <Text variant="labelSm" color={colors.textMuted} numberOfLines={1}>{emoji} {label}</Text>
      <Pips value={dots(value)} color={color} />
    </View>
  );
}

export function StatusCard({ pet }: { pet: PetSnapshot }) {
  return (
    <Card style={styles.card}>
      <View style={styles.meters}>
        <Meter emoji="⚡" label="Energía" value={pet.stats.energy} color={colors.primaryContainer} />
        <Meter emoji="🔍" label="Curiosidad" value={pet.stats.curiosity} color={colors.secondaryFixedDim} />
        <Meter emoji="💛" label="Cariño" value={pet.stats.affection} color={colors.tertiaryContainer} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, padding: spacing.sm },
  meters: { flexDirection: 'row', gap: spacing.sm },
  meter: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, paddingVertical: 8 },
});

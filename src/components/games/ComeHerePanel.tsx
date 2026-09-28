/*
 * VEN AQUÍ (versión simple): llámalo; si llega a tu lado, dale mimos.
 * El botón genera PLAYER_CALL; la caricia solo funciona si está cerca.
 */
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ComeHereView } from '@/core/games';
import type { SpeciesKey } from '@/core/persistence/SaveGame';
import { PetStage } from '@/components/scene/PetStage';
import { PrimaryButton, SoftButton } from '@/components/ui/Buttons';
import { Text } from '@/components/ui/Text';
import { ThoughtBubble } from '@/components/ui/ThoughtBubble';
import { SessionController } from '@/services/SessionController';
import { alpha, colors, spacing } from '@/theme';

export function ComeHerePanel({ view, petName, species }: { view: ComeHereView; petName: string; species: SpeciesKey }) {
  const insets = useSafeAreaInsets();
  const paws = Math.min(5, view.responses);
  return (
    <View style={styles.root}>
      <PetStage species={species} mode="home" style={StyleSheet.absoluteFill}>
        <View pointerEvents="none" style={styles.overlay}>
          <ThoughtBubble text={view.narration.title} tail="center" />
        </View>
      </PetStage>
      <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Text variant="headlineSm" align="center" accessibilityLabel={`Vino ${view.responses} veces`}>
          {'🐾'.repeat(paws)}<Text variant="headlineSm" color={colors.outlineVariant}>{'🐾'.repeat(5 - paws).replace(/🐾/g, '·')}</Text>
        </Text>
        {view.canPet ? (
          <PrimaryButton size="lg" label="💛 ¡Dale mimos!" onPress={() => SessionController.gameInput({ type: 'pet' })} />
        ) : (
          <PrimaryButton size="lg" label={`📣 ¡${petName}, ven!`} onPress={() => SessionController.gameInput({ type: 'call' })} />
        )}
        <SoftButton label="🍪 Galletita" tone="mint" onPress={() => SessionController.gameInput({ type: 'treat' })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { padding: spacing.md },
  panel: { paddingHorizontal: spacing.margin, paddingTop: spacing.md, gap: spacing.md, backgroundColor: alpha(colors.surface, 0.97) },
});

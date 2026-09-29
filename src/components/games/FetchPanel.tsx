/*
 * TRAE LA PELOTA (Stitch: trae_la_pelota_jugando_con_milo, versión simple)
 * Escena grande: arrastra la pelota y suéltala. Debajo, qué está pasando y
 * dos acciones claras. La mascota decide: el juego solo cambia el mundo.
 */
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FetchView } from '@/core/games';
import type { SpeciesKey } from '@/core/persistence/SaveGame';
import { RewardButton } from '@/components/learning/RewardButton';
import { PetStage } from '@/components/scene/PetStage';
import { PrimaryButton, SoftButton } from '@/components/ui/Buttons';
import { Squishable } from '@/components/ui/Squishable';
import { Chip } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { ThoughtBubble } from '@/components/ui/ThoughtBubble';
import { SessionController } from '@/services/SessionController';
import { alpha, colors, radius, spacing } from '@/theme';

export function FetchPanel({ view, petName, species }: { view: FetchView; petName: string; species: SpeciesKey }) {
  const insets = useSafeAreaInsets();
  const quickThrow = () => {
    if (!view.canThrow || view.ballId === null) return;
    const a = (Math.random() - 0.5) * 0.9;
    SessionController.throwObject(view.ballId, Math.sin(a) * 0.1, -Math.cos(a) * 0.1);
  };
  return (
    <View style={styles.root}>
      {/* El mundo ocupa toda la pantalla; lo de abajo (botones y panel) va ENCIMA, sin taparse entre sí */}
      <PetStage species={species} mode="fetch" style={StyleSheet.absoluteFill}>
        <View pointerEvents="box-none" style={styles.overlay}>
          <ThoughtBubble text={view.narration.title} tail="center" />
          {__DEV__ ? <Chip small label={`SNN ${Math.round(view.spikesPerSecond)} Hz`} bg={alpha(colors.secondaryContainer, 0.8)} color={colors.onSecondaryContainer} style={styles.dev} /> : null}
        </View>
      </PetStage>

      {/* Hueco transparente: los gestos (arrastrar la pelota) llegan a la escena de detrás */}
      <View style={styles.flex} pointerEvents="box-none" />
      <View pointerEvents="box-none" style={styles.actions}>
        <RewardButton style={{ alignSelf: 'center' }} />
        {view.canThrow ? (
          <Squishable onPress={quickThrow} accessibilityLabel="Lanzar la pelota" style={styles.throw}>
            <Text variant="labelLg" color="#fff">⚽ ¡Lanzar!</Text>
          </Squishable>
        ) : null}
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Text variant="labelLg" align="center" color={colors.textMuted}>
          {view.canThrow ? '👆 Arrastra la pelota y suéltala' : `⚽ Te la trajo ${view.returns} ${view.returns === 1 ? 'vez' : 'veces'}`}
        </Text>
        <View style={styles.row}>
          <PrimaryButton size="lg" label={`📣 ¡${petName}, ven!`} onPress={() => SessionController.gameInput({ type: 'call' })} style={styles.flex} />
          <SoftButton size="lg" label="🍪" tone="mint" accessibilityHint="Dar una galletita" onPress={() => SessionController.gameInput({ type: 'treat' })} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { padding: spacing.md, gap: spacing.sm },
  actions: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.md },
  dev: { alignSelf: 'flex-end' },
  throw: {
    alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 14, borderRadius: radius.full,
    backgroundColor: colors.error, // si el degradado no se dibuja, el botón sigue viéndose
    experimental_backgroundImage: `linear-gradient(135deg, #ef4444 0%, ${colors.error} 100%)`, boxShadow: '0 8px 18px rgba(186,26,26,0.35)',
  },
  panel: { paddingHorizontal: spacing.margin, paddingTop: spacing.md, gap: spacing.md, backgroundColor: alpha(colors.surface, 0.97) },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});

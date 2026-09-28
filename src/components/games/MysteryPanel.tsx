/*
 * CAJA MISTERIOSA (Stitch: caja_misteriosa_curiosidad_adorable, versión simple)
 * La caja en la escena, qué siente (curiosidad vs. miedo, de sus circuitos
 * reales, mostrado con emojis) y dos opciones: animarlo o esperar.
 */
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MysteryView } from '@/core/games';
import type { SpeciesKey } from '@/core/persistence/SaveGame';
import { ITEMS } from '@/core/world/Items';
import { PetStage } from '@/components/scene/PetStage';
import { PrimaryButton, SoftButton } from '@/components/ui/Buttons';
import { Card } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { ThoughtBubble } from '@/components/ui/ThoughtBubble';
import { SessionController } from '@/services/SessionController';
import { pushToast } from '@/state/stores';
import { alpha, colors, radius, spacing } from '@/theme';

function Feeling({ emoji, label, value, color }: { emoji: string; label: string; value: number; color: string }) {
  return (
    <View style={styles.feeling}>
      <Text style={styles.feelEmoji}>{emoji}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="labelSm" color={colors.textMuted}>{label}</Text>
        <View style={styles.bar}><View style={[styles.fill, { width: `${Math.round(Math.min(1, value * 2) * 100)}%`, backgroundColor: color }]} /></View>
      </View>
    </View>
  );
}

export function MysteryPanel({ view, petName, species }: { view: MysteryView; petName: string; species: SpeciesKey }) {
  const insets = useSafeAreaInsets();
  const opened = view.phase === 'opened' && view.revealed;
  return (
    <View style={styles.root}>
      <PetStage species={species} mode="home" style={StyleSheet.absoluteFill}>
        <View pointerEvents="none" style={styles.overlay}>
          <ThoughtBubble text={view.narration.title} tail="center" />
          <View style={{ flex: 1 }} />
          {!opened ? (
            <View style={styles.progress}>
              <Text variant="labelSm">📦</Text>
              <View style={styles.bar}><View style={[styles.fill, { width: `${Math.round(view.progress * 100)}%`, backgroundColor: colors.secondaryFixedDim }]} /></View>
            </View>
          ) : null}
        </View>
      </PetStage>

      <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.sm }]}>
        {opened && view.revealed ? (
          <>
            <Card tone="warm" style={styles.opened}>
              <Text style={styles.big}>{ITEMS[view.revealed].emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text variant="headlineSm">¡Había {ITEMS[view.revealed].label}!</Text>
                <Text variant="bodySm" color={colors.textMuted}>Ya está en tu mochila 🎒</Text>
              </View>
            </Card>
            <PrimaryButton size="lg" label="🏠 Volver a casa" onPress={() => router.back()} />
          </>
        ) : (
          <>
            <View style={styles.feelings}>
              <Feeling emoji="🔍" label="Curiosidad" value={view.curiosity} color={colors.secondaryFixedDim} />
              <Feeling emoji="😨" label="Miedo" value={view.caution} color={colors.rose} />
            </View>
            <View style={styles.row}>
              <PrimaryButton size="lg" label="🤫 Animarlo" style={styles.flex} onPress={() => SessionController.gameInput({ type: 'encourage' })} />
              <SoftButton size="lg" label="👀 Esperar" style={styles.flex} onPress={() => { SessionController.gameInput({ type: 'keep_distance' }); pushToast({ kind: 'info', title: 'Esperando', text: `${petName} decide sin prisas.` }); }} />
            </View>
            <Text variant="bodySm" color={colors.textSubtle} align="center">Si se acerca o no, ¡las dos cosas están bien! 💛</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { flex: 1, padding: spacing.md },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.full, backgroundColor: alpha(colors.surfaceContainerLowest, 0.85) },
  panel: { paddingHorizontal: spacing.margin, paddingTop: spacing.md, gap: spacing.md, backgroundColor: alpha(colors.surface, 0.97) },
  feelings: { flexDirection: 'row', gap: spacing.md },
  feeling: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  feelEmoji: { fontSize: 26 },
  bar: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surfaceContainerHighest, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  opened: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  big: { fontSize: 48 },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});

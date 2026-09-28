/*
 * ¿CUÁL PREFIERES? (Stitch: cu_l_prefieres_preferencias_de_milo, versión simple)
 * Elige qué juguetes poner, pulsa el botón y mira a cuál le hace más caso.
 * La atención se mide de verdad (foco, mirada, olfatear, recogerlo).
 */
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChoiceView } from '@/core/games';
import type { SpeciesKey } from '@/core/persistence/SaveGame';
import { ITEMS } from '@/core/world/Items';
import { PetStage } from '@/components/scene/PetStage';
import { Icon } from '@/components/ui/Icon';
import { PrimaryButton, SoftButton } from '@/components/ui/Buttons';
import { Squishable } from '@/components/ui/Squishable';
import { Text } from '@/components/ui/Text';
import { ThoughtBubble } from '@/components/ui/ThoughtBubble';
import { SessionController } from '@/services/SessionController';
import { alpha, colors, radius, shadows, spacing } from '@/theme';

export function ChoicePanel({ view, petName, species }: { view: ChoiceView; petName: string; species: SpeciesKey }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <PetStage species={species} mode="home" style={StyleSheet.absoluteFill}>
        <View pointerEvents="none" style={styles.overlay}>
          <ThoughtBubble text={view.narration.title} tail="center" />
        </View>
      </PetStage>

      <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.sm }]}>
        <View style={styles.options}>
          {view.options.map((o) => {
            const chosen = view.chosen === o.kind;
            return (
              <Squishable key={o.kind} disabled={view.phase !== 'setup'} onPress={() => SessionController.gameInput({ type: 'toggle_item', kind: o.kind })}
                accessibilityRole="checkbox" accessibilityState={{ checked: o.selected }} accessibilityLabel={ITEMS[o.kind].name}
                style={[styles.option, !o.selected ? styles.optionOff : null, chosen ? styles.optionChosen : null]}>
                {o.selected && view.phase === 'setup' ? <View style={styles.check}><Icon name="check" size={14} color="#fff" /></View> : null}
                <Text style={styles.emoji}>{ITEMS[o.kind].emoji}</Text>
                <Text variant="labelMd" align="center" numberOfLines={1}>{ITEMS[o.kind].name}</Text>
                {view.phase !== 'setup' ? (
                  <View style={styles.share}><View style={[styles.shareFill, { width: `${Math.round(o.share * 100)}%` }]} /></View>
                ) : null}
                {chosen ? <Text style={styles.crown}>👑</Text> : null}
              </Squishable>
            );
          })}
        </View>
        {view.phase === 'setup' ? (
          <PrimaryButton size="lg" label={`✨ ¿Cuál elegirá ${petName}?`} onPress={() => SessionController.gameInput({ type: 'begin' })} />
        ) : view.phase === 'observing' ? (
          <SoftButton size="lg" label={`👀 Mirando… ${view.secondsLeft}`} disabled />
        ) : (
          <PrimaryButton size="lg" label="🏠 Volver a casa" onPress={() => router.back()} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { padding: spacing.md },
  panel: { paddingHorizontal: spacing.margin, paddingTop: spacing.md, gap: spacing.md, backgroundColor: alpha(colors.surface, 0.97) },
  options: { flexDirection: 'row', gap: spacing.sm },
  option: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing.md, paddingHorizontal: 6, borderRadius: radius.xl, backgroundColor: colors.card, ...shadows.card },
  optionOff: { opacity: 0.45 },
  optionChosen: { borderWidth: 3, borderColor: colors.mint },
  check: { position: 'absolute', top: -8, left: -4, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  emoji: { fontSize: 38 },
  crown: { position: 'absolute', top: -14, fontSize: 24 },
  share: { alignSelf: 'stretch', height: 6, marginHorizontal: 10, borderRadius: 3, backgroundColor: colors.surfaceContainerHigh, overflow: 'hidden' },
  shareFill: { height: '100%', backgroundColor: colors.primaryContainer },
});

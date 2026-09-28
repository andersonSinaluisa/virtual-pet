/*
 * Barra de cuidados y estímulos del Mundo: fuera de la mochila para que se
 * vea en directo cómo reacciona la mascota. Solo cambian el MUNDO; lo que
 * haga con ello lo decide su red.
 */
import { StyleSheet, View } from 'react-native';

import type { WorldInteraction } from '@/core/session/GameSession';
import { Squishable } from '@/components/ui/Squishable';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { petStore } from '@/state/stores';
import { colors, radius, shadows } from '@/theme';

const ITEMS: { kind: WorldInteraction; emoji: string; label: string }[] = [
  { kind: 'food', emoji: '🥣', label: 'Comida' },
  { kind: 'water', emoji: '💧', label: 'Agua' },
  { kind: 'treat', emoji: '🍪', label: 'Galleta' },
  { kind: 'call', emoji: '📣', label: 'Llamar' },
  { kind: 'light', emoji: '💡', label: 'Luz' },
  { kind: 'noise', emoji: '🔔', label: 'Ruido' },
];

export function CareBar() {
  const lightOn = useStore(petStore, (p) => p?.lightOn ?? true);
  return (
    <View style={styles.bar} accessibilityRole="toolbar">
      {ITEMS.map((it) => {
        const emoji = it.kind === 'light' ? (lightOn ? '🌙' : '💡') : it.emoji;
        const label = it.kind === 'light' ? (lightOn ? 'Apagar' : 'Encender') : it.label;
        return (
          <Squishable key={it.kind} accessibilityLabel={label} onPress={() => SessionController.interact(it.kind)} style={styles.btn}>
            <Text style={styles.emoji}>{emoji}</Text>
            <Text variant="labelXs" color={colors.textMuted} numberOfLines={1}>{label}</Text>
          </Squishable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: 6, padding: 6, borderRadius: radius.xl, backgroundColor: colors.card, ...shadows.card },
  btn: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.surfaceContainerLow },
  emoji: { fontSize: 22 },
});

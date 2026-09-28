/*
 * GameCard simplificada (para niños): emoji grande, título, una frase y un
 * solo botón. Sin métricas ni etiquetas técnicas.
 */
import { StyleSheet, View } from 'react-native';

import type { GameInfo } from '@/core/games/catalog';
import { PrimaryButton } from '@/components/ui/Buttons';
import { Squishable } from '@/components/ui/Squishable';
import { Text } from '@/components/ui/Text';
import { accents, colors, radius, shadows, spacing } from '@/theme';

export function GameCard({ game, petName, onPlay }: { game: GameInfo; petName: string; onPlay: () => void }) {
  return (
    <Squishable onPress={onPlay} scaleTo={0.98} accessibilityLabel={`Jugar a ${game.title}`} style={styles.card}>
      <View style={[styles.emojiBox, { backgroundColor: accents[game.accent].bg }]}>
        <Text style={styles.emoji}>{game.emoji}</Text>
      </View>
      <View style={styles.body}>
        <Text variant="headlineSm">{game.title}</Text>
        <Text variant="bodyMd" color={colors.textMuted}>{game.short.replaceAll('{name}', petName)}</Text>
        <PrimaryButton label="¡Jugar!" icon="play" onPress={onPlay} style={styles.btn} />
      </View>
    </Squishable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.md, borderRadius: radius.xl, backgroundColor: colors.card, ...shadows.card },
  emojiBox: { width: 80, height: 80, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 44 },
  body: { flex: 1, gap: 6 },
  btn: { alignSelf: 'flex-start' },
});

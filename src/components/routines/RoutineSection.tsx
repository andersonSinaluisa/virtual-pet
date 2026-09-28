/*
 * HÁBITOS Y RUTINAS (diario) + CÓMO HA CAMBIADO
 * Solo describe lo observado: los hábitos salen del HabitDetector (episodios
 * reales) y la evolución, de las instantáneas diarias guardadas. Nada aquí
 * influye en lo que hace la mascota.
 */
import { StyleSheet, View } from 'react-native';

import { interpretEvolution, interpretRoutines, routineHeadline } from '@/core/routines/RoutineInterpreter';
import type { GameSession } from '@/core/session/GameSession';
import { Card } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { colors, radius, spacing } from '@/theme';

const MAX_EVOLUTION = 5;

export function RoutineSection({ session, name }: { session: GameSession; name: string }) {
  const habits = session.habits();
  const cards = interpretRoutines(habits, name);
  const headline = routineHeadline(habits, name);
  const evolution = interpretEvolution(session.memory.habitSnapshots).slice(-MAX_EVOLUTION).reverse();

  return (
    <View style={styles.root}>
      <Text variant="headlineMd">🕰️ Hábitos y rutinas</Text>
      <Text variant="bodySm" color={colors.textMuted}>{headline}</Text>
      {cards.map((c) => (
        <Card key={c.id} style={styles.card}>
          <Text style={styles.emoji}>{c.emoji}</Text>
          <View style={styles.body}>
            <Text variant="headlineSm">{c.title}</Text>
            {c.lines.map((l) => <Text key={l} variant="bodySm" color={colors.textMuted}>{l}</Text>)}
            <Text variant="labelSm" color={colors.secondary}>Visto en {c.days} días</Text>
          </View>
        </Card>
      ))}

      {evolution.length ? (
        <View style={styles.timeline}>
          <Text variant="labelLg">Cómo ha cambiado</Text>
          {evolution.map((e, i) => (
            <View key={`${e.petDay}-${i}`} style={styles.step}>
              <View style={styles.dot} />
              <Text variant="bodySm" style={styles.body}><Text variant="labelSm" color={colors.primary}>Día {e.petDay}  </Text>{e.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  card: { flexDirection: 'row', gap: spacing.md },
  emoji: { fontSize: 28 },
  body: { flex: 1, gap: 2 },
  timeline: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerLow },
  step: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: colors.tertiaryContainer },
});

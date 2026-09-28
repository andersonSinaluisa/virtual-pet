/*
 * BRAIN VIEW — SIMPLE (para niños)
 *
 *   👀 Notó…   ← sensores que excitaron al circuito principal
 *   💛 Sintió… ← circuito interno que llevó a la acción
 *   🐾 Decidió… ← neurona de acción que disparó
 *
 * Sale de explainAction(), que reconstruye la cadena desde la traza REAL de
 * spikes. Los números (neuronas, pesos) están en el modo Experto.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { actionPhrase, circuitEmotion, explainAction, sensorPhrase } from '@/core/explain/CausalChain';
import type { GameSession } from '@/core/session/GameSession';
import { Card } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { colors, radius, spacing } from '@/theme';

function Step({ emoji, label, text, bg }: { emoji: string; label: string; text: string; bg: string }) {
  return (
    <Card style={styles.step}>
      <View style={[styles.emojiBox, { backgroundColor: bg }]}><Text style={styles.emoji}>{emoji}</Text></View>
      <View style={{ flex: 1 }}>
        <Text variant="labelMd" color={colors.textMuted}>{label}</Text>
        <Text variant="headlineSm">{text}</Text>
      </View>
    </Card>
  );
}

const Arrow = (): ReactNode => <Text style={styles.arrow} accessibilityElementsHidden>⬇️</Text>;

export function BrainSimple({ session }: { session: GameSession }) {
  const chain = explainAction(session.sim.brain, session.sim.trace);
  const name = session.profile.name;
  if (!chain) {
    return (
      <Card tone="muted" style={styles.empty}>
        <Text style={styles.emoji}>😌</Text>
        <Text variant="bodyLg" align="center" color={colors.textMuted}>{name} está tranquilo, pensando en sus cosas.</Text>
      </Card>
    );
  }
  const sensor = chain.sensors[0];
  const main = chain.circuits[0];
  const noticed = sensor ? sensorPhrase(sensor.key) : 'Algo dentro de él';
  const felt = main ? circuitEmotion(main.key) : 'Ganas de hacer algo';
  const did = actionPhrase(chain.action);

  return (
    <View style={styles.flow}>
      <Step emoji="👀" label="Notó" text={noticed} bg={colors.primaryFixed} />
      <Arrow />
      <Step emoji="💛" label="Sintió" text={felt} bg={colors.tertiaryFixed} />
      <Arrow />
      <Step emoji="🐾" label="Decidió" text={did} bg={colors.secondaryContainer} />
      <View style={styles.why}>
        <Text variant="bodyLg">
          🧠 Nadie le dio una orden: su cerebro juntó lo que notó y lo que sentía, y {name} decidió solito.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flow: { gap: spacing.xs, alignItems: 'stretch' },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emojiBox: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 30 },
  arrow: { alignSelf: 'center', fontSize: 18 },
  why: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.xl, backgroundColor: colors.surfaceContainerLow },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
});

/*
 * CRECIMIENTO (perfil): etapas vividas y por vivir, hitos REALES y
 * "cuando era…" derivado del historial. Sin números ni XP: el progreso de la
 * etapa actual solo se insinúa con una frase.
 */
import { StyleSheet, View } from 'react-native';

import { milestoneText, MILESTONE_EMOJI, compareStages } from '@/core/growth/GrowthStory';
import { LIFE_STAGES, STAGE_EMOJI, stageIndex, stageLabel } from '@/core/growth/LifeStage';
import type { GameSession } from '@/core/session/GameSession';
import { Text } from '@/components/ui/Text';
import { colors, radius, spacing } from '@/theme';

const MAX_MILESTONES = 8;

function growingHint(progress: number, name: string): string {
  if (progress >= 1) return `${name} está a punto de dar un estirón.`;
  if (progress >= 0.5) return `${name} está creciendo.`;
  return `${name} acaba de empezar esta etapa.`;
}

export function GrowthSection({ session }: { session: GameSession }) {
  const { species, name } = session.profile;
  const stage = session.growth.stage;
  const idx = stageIndex(stage);
  const milestones = [...session.growth.state.milestones].sort((a, b) => a.at - b.at).slice(-MAX_MILESTONES);
  const prev = idx > 0 ? LIFE_STAGES[idx - 1] : null;
  const changes = prev ? compareStages(session.growth.state.subjects, prev, stage) : [];

  return (
    <View style={styles.root}>
      <Text variant="headlineMd">🌱 Crecimiento</Text>
      <View style={styles.chain}>
        {LIFE_STAGES.map((s, i) => (
          <View key={s} style={[styles.stage, i === idx ? styles.current : i > idx ? styles.future : null]}>
            <Text style={styles.emoji}>{i <= idx ? STAGE_EMOJI[s] : '·'}</Text>
            <Text variant="labelSm" color={i === idx ? colors.primary : colors.textMuted}>{i <= idx ? stageLabel(s, species) : '¿?'}</Text>
          </View>
        ))}
      </View>
      <Text variant="bodySm" color={colors.textMuted}>{growingHint(session.growth.progress, name)}</Text>

      {milestones.map((m, i) => (
        <View key={`${m.type}-${m.at}-${i}`} style={styles.milestone}>
          <Text variant="labelSm" color={colors.primary} style={styles.day}>Día {m.petDay}</Text>
          <Text variant="bodySm" style={styles.flex}>{MILESTONE_EMOJI[m.type]} {milestoneText(m, name, species)}</Text>
        </View>
      ))}

      {prev && changes.length ? (
        <View style={styles.compare}>
          <Text variant="labelLg">Cuando {name} era {stageLabel(prev, species).toLowerCase()}…</Text>
          {changes.map((c) => (
            <View key={c.subject} style={styles.pair}>
              <Text variant="bodySm" color={colors.textMuted}>{c.before}</Text>
              <Text variant="bodySm">{c.now}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  chain: { flexDirection: 'row', gap: 6 },
  stage: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerLow },
  current: { backgroundColor: colors.primaryFixed },
  future: { opacity: 0.5 },
  emoji: { fontSize: 22 },
  milestone: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  day: { width: 52 },
  flex: { flex: 1 },
  compare: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerLow },
  pair: { gap: 2 },
});

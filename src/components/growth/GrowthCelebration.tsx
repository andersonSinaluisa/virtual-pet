/*
 * "🌱 MILO ESTÁ CRECIENDO" — la transición de etapa como momento especial
 * (nunca "LEVEL UP"). Usa recuerdos REALES (GrowthEvent.recap) y los cambios
 * derivados del historial (comparisons). Espera a que se cierre
 * "Mientras no estabas" para no pisar el resumen de la ausencia.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GROWTH_CONFIG } from '@/core/growth/GrowthConfig';
import { STAGE_EMOJI, stageLabel } from '@/core/growth/LifeStage';
import { PrimaryButton } from '@/components/ui/Buttons';
import { PetAvatar } from '@/components/ui/PetAvatar';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { awayStore, growthStore, petStore } from '@/state/stores';
import { alpha, colors, radius, shadows, spacing } from '@/theme';

const MOMENT_EMOJI: Record<string, string> = { heart: '💛', ball: '⚽', sparkle: '✨', moon: '🌙', star: '⭐', box: '📦', camera: '📸', paw: '🐾' };

export function GrowthCelebration() {
  const g = useStore(growthStore);
  const away = useStore(awayStore);
  const pet = useStore(petStore);
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const from = g ? GROWTH_CONFIG.stages[g.from].visual.scale : 1;
  const to = g ? GROWTH_CONFIG.stages[g.to].visual.scale : 1;
  useEffect(() => {
    if (!g || away) return;
    scale.set(from / to);
    scale.set(withDelay(600, withSpring(1, { damping: 9, stiffness: 60 })));
  }, [g, away, from, to, scale]);
  const grow = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  if (!g || away || !pet) return null;
  const name = pet.name;
  return (
    <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut.duration(250)} style={[styles.backdrop, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.card} accessibilityLiveRegion="polite">
        <Text variant="labelMd" color={colors.secondary} uppercase align="center">🌱 {name} está creciendo</Text>
        <View style={styles.stages}>
          <Text style={styles.stageEmoji}>{STAGE_EMOJI[g.from]}</Text>
          <Text variant="labelLg" color={colors.textMuted}>{stageLabel(g.from, pet.species)}</Text>
          <Text variant="labelLg">→</Text>
          <Text variant="labelLg" color={colors.primary}>{stageLabel(g.to, pet.species)}</Text>
          <Text style={styles.stageEmoji}>{STAGE_EMOJI[g.to]}</Text>
        </View>
        <Animated.View style={[styles.avatar, grow]}>
          <PetAvatar species={pet.species} size={120} />
        </Animated.View>
        <Text variant="bodyMd" color={colors.textMuted} align="center">Parece que fue ayer cuando {name} llegó a casa.</Text>

        {g.recap.length ? (
          <View style={styles.block}>
            <Text variant="headlineSm">¿Recuerdas?</Text>
            {g.recap.map((m) => (
              <Text key={m.id} variant="bodySm">{MOMENT_EMOJI[m.icon] ?? '✨'} {m.title}</Text>
            ))}
          </View>
        ) : null}

        {g.comparisons.map((c) => (
          <View key={c.subject} style={styles.compare}>
            <Text variant="labelSm" color={colors.textSubtle} uppercase>Antes</Text>
            <Text variant="bodySm">{c.before}</Text>
            <Text variant="labelSm" color={colors.secondary} uppercase>Ahora</Text>
            <Text variant="bodySm">{c.now}</Text>
          </View>
        ))}

        <Text variant="bodySm" color={colors.textMuted} align="center">{name} ha cambiado mucho desde que llegó, y sigue siendo {name}.</Text>
        <PrimaryButton label="¡Qué grande!" icon="heart" onPress={() => SessionController.dismissGrowth()} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 95, justifyContent: 'center', paddingHorizontal: spacing.margin, backgroundColor: alpha(colors.background, 0.92) },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm, ...shadows.float },
  stages: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' },
  stageEmoji: { fontSize: 22 },
  avatar: { alignSelf: 'center', marginVertical: spacing.sm },
  block: { gap: 4, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerLow },
  compare: { gap: 2, padding: spacing.md, borderRadius: radius.lg, backgroundColor: alpha(colors.secondaryContainer, 0.35) },
});

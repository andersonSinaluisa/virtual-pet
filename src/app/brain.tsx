/*
 * BRAIN VIEW (Stitch: brain_view_mente_de_milo)
 * Dos niveles sobre los MISMOS datos reales de la SNN:
 *   "Flujo cognitivo" (simple) y "Red neuronal SNN" (técnico).
 * Se refresca con cada snapshot (≤ 4 Hz), no en cada frame.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrainSimple } from '@/components/brain/BrainSimple';
import { BrainTechnical } from '@/components/brain/BrainTechnical';
import { CarePanel } from '@/components/home/InventorySheet';
import { AppHeader } from '@/components/ui/AppHeader';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { IconButton, StrongButton } from '@/components/ui/Buttons';
import { Icon } from '@/components/ui/Icon';
import { PetAvatar } from '@/components/ui/PetAvatar';
import { Squishable } from '@/components/ui/Squishable';
import { Chip } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { petStore } from '@/state/stores';
import { alpha, colors, radius, shadows, spacing } from '@/theme';

export default function BrainView() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'simple' | 'tech'>(params.mode === 'tech' ? 'tech' : 'simple');
  const [sheet, setSheet] = useState(false);
  const pet = useStore(petStore);
  const insets = useSafeAreaInsets();
  const session = SessionController.current;
  if (!pet || !session) return null;
  const focus = session.world.getObject(session.world.focusObjectId);

  return (
    <View style={styles.root}>
      <AppHeader title={pet.name}
        left={<IconButton icon="arrowBack" label="Volver" size={36} bg={colors.surfaceContainerHigh} color={colors.text} onPress={() => router.back()} />} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View>
            <PetAvatar species={pet.species} size={104} rounded={false} />
            <Chip label="Vivo" dot={colors.secondary} small bg={alpha(colors.surfaceContainerLowest, 0.95)} color={colors.secondary} style={styles.alive} />
          </View>
          <View style={styles.thought}>
            <View style={styles.thoughtHead}>
              <Icon name="psychologyAlt" size={18} color={colors.primary} />
              <Text variant="labelSm" color={colors.primary} uppercase style={{ flex: 1 }}>Está pensando</Text>
              <View style={styles.pulse} />
            </View>
            <Text variant="bodyLg">“{pet.thought}”</Text>
            <View style={styles.observing}>
              <Icon name={focus ? 'eye' : 'spa'} size={15} color={colors.secondary} />
              <Text variant="labelSm" color={colors.text} style={{ flex: 1 }}>{focus ? `Observando ${focus.label}` : pet.behavior}</Text>
            </View>
          </View>
        </View>

        <View style={styles.segment} accessibilityRole="tablist">
          {([['simple', 'Simple', 'heart'], ['tech', 'Experto', 'brain']] as const).map(([k, label, icon]) => (
            <Squishable key={k} accessibilityRole="tab" accessibilityState={{ selected: mode === k }} onPress={() => setMode(k)} style={[styles.segBtn, mode === k ? styles.segOn : null]}>
              <Icon name={icon} size={18} color={mode === k ? colors.primary : colors.textMuted} />
              <Text variant="labelMd" color={mode === k ? colors.primary : colors.textMuted}>{label}</Text>
            </Squishable>
          ))}
        </View>

        {mode === 'simple' ? (
          <>
            <Text variant="headlineSm">¿Cómo decidió {pet.name}? ✨</Text>
            <BrainSimple session={session} />
          </>
        ) : (
          <BrainTechnical session={session} />
        )}

        <StrongButton size="lg" icon="sparkle" label={`Darle una sorpresa a ${pet.name}`} onPress={() => setSheet(true)} />
      </ScrollView>
      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Una sorpresa" subtitle="Cambia algo y mira qué decide.">
        <CarePanel />
        <StrongButton label="Aparece un objeto nuevo" icon="box" onPress={() => { SessionController.interact('novel'); setSheet(false); }} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.margin, gap: spacing.md },
  hero: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.md, borderRadius: radius.xl, ...shadows.card,
    experimental_backgroundImage: `linear-gradient(120deg, ${alpha(colors.secondaryContainer, 0.6)} 0%, ${colors.primaryFixed} 100%)`,
  },
  alive: { position: 'absolute', bottom: 6, right: 6 },
  thought: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: 6 },
  thoughtHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  observing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  segment: { flexDirection: 'row', padding: 6, gap: 6, borderRadius: radius.full, backgroundColor: colors.surfaceContainerHigh },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: radius.full },
  segOn: { backgroundColor: colors.card, ...shadows.soft },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});

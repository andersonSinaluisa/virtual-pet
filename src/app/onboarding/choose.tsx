/*
 * ELEGIR MASCOTA (sin pantalla Stitch: construida con el design system)
 * Vista previa 3D real de cada especie. La especie solo cambia la
 * apariencia: el cerebro es el mismo genoma (la personalidad emerge después).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPECIES, type SpeciesKey } from '@/core/persistence/SaveGame';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PetCanvas } from '@/components/scene/PetCanvas';
import { createPreviewSource } from '@/components/scene/previewSource';
import { SceneFallback } from '@/components/scene/SceneFallback';
import { IconButton, PrimaryButton } from '@/components/ui/Buttons';
import { DEFAULT_GLOW, Glow } from '@/components/ui/Glow';
import { Squishable } from '@/components/ui/Squishable';
import { Text } from '@/components/ui/Text';
import { haptic } from '@/services/haptics';
import { colors, radius, shadows, spacing } from '@/theme';

const LABELS: Record<SpeciesKey, { name: string; emoji: string; blurb: string }> = {
  dog: { name: 'Perrito', emoji: '🐶', blurb: 'Orejitas dobladas y cola en espiral.' },
  cat: { name: 'Gatito', emoji: '🐱', blurb: 'Bigotes suaves y cola larga.' },
  bear: { name: 'Osito', emoji: '🐻', blurb: 'Redondito y abrazable.' },
  bunny: { name: 'Conejito', emoji: '🐰', blurb: 'Orejas largas y pompón.' },
};

export default function ChoosePet() {
  const insets = useSafeAreaInsets();
  const [species, setSpecies] = useState<SpeciesKey>('dog');
  const [preview] = useState(createPreviewSource);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
      <Glow spots={DEFAULT_GLOW} />
      <View style={styles.header}>
        <IconButton icon="arrowBack" label="Volver" size={40} bg={colors.surfaceContainerHigh} color={colors.text} onPress={() => router.back()} />
        <Text variant="labelMd" color={colors.primary} uppercase>Paso 1 de 2</Text>
        <View style={{ width: 40 }} />
      </View>
      <Text variant="headlineLg" align="center">¿Quién te acompañará?</Text>
      <Text variant="bodyMd" color={colors.textMuted} align="center" style={styles.sub}>
        Solo eliges su aspecto. Su personalidad la irás descubriendo juntos.
      </Text>

      <View style={styles.stage}>
        <ErrorBoundary fallback={(e) => <SceneFallback reason={e.message} />}>
          <PetCanvas species={species} mode="preview" framing="close" source={preview} style={StyleSheet.absoluteFill} />
        </ErrorBoundary>
        <Squishable style={StyleSheet.absoluteFill} onPress={() => { preview.greet(); haptic('pet'); }} accessibilityLabel="Saludar">
          <View />
        </Squishable>
      </View>

      <View style={styles.options} accessibilityRole="radiogroup">
        {SPECIES.map((s) => {
          const on = s === species;
          return (
            <Squishable key={s} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={LABELS[s].name}
              onPress={() => { setSpecies(s); haptic('select'); preview.greet(); }}
              style={[styles.option, on ? styles.optionOn : null]}>
              <Text style={styles.emoji}>{LABELS[s].emoji}</Text>
              <Text variant="labelSm" color={on ? colors.onPrimaryContainer : colors.textMuted}>{LABELS[s].name}</Text>
            </Squishable>
          );
        })}
      </View>
      <Text variant="bodySm" color={colors.textMuted} align="center">{LABELS[species].blurb}</Text>
      <PrimaryButton size="lg" label="¡Es este!" iconRight="arrowForward" style={styles.cta}
        onPress={() => router.push({ pathname: '/onboarding/name', params: { species } })} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.margin, gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sub: { paddingHorizontal: spacing.md },
  stage: { flex: 1, minHeight: 260, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surfaceContainerLow, marginVertical: spacing.sm, ...shadows.stage },
  options: { flexDirection: 'row', gap: spacing.sm },
  option: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 2, borderColor: 'transparent', ...shadows.card },
  optionOn: { backgroundColor: colors.primaryFixed, borderColor: colors.primaryContainer },
  emoji: { fontSize: 28 },
  cta: { alignSelf: 'stretch', marginTop: spacing.sm },
});

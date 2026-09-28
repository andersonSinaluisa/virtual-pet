/*
 * NOMBRAR A LA MASCOTA (sin pantalla Stitch: input "pill" del DESIGN.md con
 * halo melocotón al enfocar). Al confirmar se crea la GameSession real.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
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
import { SessionController } from '@/services/SessionController';
import { colors, fonts, radius, shadows, spacing } from '@/theme';

const SUGGESTIONS = ['Milo', 'Luna', 'Coco', 'Nube', 'Toby'];

export default function NamePet() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ species?: string }>();
  const species: SpeciesKey = SPECIES.includes(params.species as SpeciesKey) ? (params.species as SpeciesKey) : 'dog';
  const [name, setName] = useState('Milo');
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview] = useState(createPreviewSource);
  const clean = name.trim();

  const adopt = async () => {
    if (!clean || busy) return;
    setBusy(true);
    try {
      await SessionController.adopt({ name: clean, species });
      router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Glow spots={DEFAULT_GLOW} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.header}>
          <IconButton icon="arrowBack" label="Volver" size={40} bg={colors.surfaceContainerHigh} color={colors.text} onPress={() => router.back()} />
          <Text variant="labelMd" color={colors.primary} uppercase>Paso 2 de 2</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text variant="headlineLg" align="center">¿Cómo se llamará?</Text>
        <View style={styles.stage}>
          <ErrorBoundary fallback={(e) => <SceneFallback reason={e.message} />}>
            <PetCanvas species={species} mode="preview" framing="close" source={preview} style={StyleSheet.absoluteFill} />
          </ErrorBoundary>
        </View>
        <TextInput
          value={name}
          onChangeText={(t) => { setName(t.slice(0, 16)); preview.greet(); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Su nombre"
          placeholderTextColor={colors.textSubtle}
          style={[styles.input, focused ? styles.inputFocus : null]}
          maxLength={16}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={adopt}
          accessibilityLabel="Nombre de tu mascota"
        />
        <View style={styles.suggestions}>
          {SUGGESTIONS.map((s) => (
            <Squishable key={s} onPress={() => { setName(s); preview.greet(); }} style={[styles.suggestion, s === clean ? styles.suggestionOn : null]}>
              <Text variant="labelMd" color={s === clean ? colors.onPrimaryContainer : colors.textMuted}>{s}</Text>
            </Squishable>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <PrimaryButton size="lg" label={clean ? `Empezar con ${clean}` : 'Escribe un nombre'} iconRight="paw" disabled={!clean || busy} onPress={adopt} style={styles.cta} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: spacing.margin, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stage: { height: 260, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surfaceContainerLow, ...shadows.stage },
  input: {
    fontFamily: fonts.heading, fontSize: 22, color: colors.text, textAlign: 'center',
    backgroundColor: colors.vanilla, borderRadius: radius.full, paddingHorizontal: 20, paddingVertical: 14,
    borderWidth: 1.5, borderColor: colors.almond,
  },
  inputFocus: { borderColor: colors.primaryContainer, boxShadow: '0 0 0 3px rgba(255,158,121,0.25)' },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  suggestion: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surfaceContainerHigh },
  suggestionOn: { backgroundColor: colors.primaryContainer },
  cta: { alignSelf: 'stretch' },
});

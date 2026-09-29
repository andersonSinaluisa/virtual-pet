/*
 * PRIMER ENCUENTRO (Stitch: primer_encuentro)
 * Sobretítulo en píldora, titular, texto, tarjeta con la mascota que responde
 * al tacto, píldora "Tócalo para saludar", botón principal y nota de confianza.
 */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui/Buttons';
import { DEFAULT_GLOW, Glow } from '@/components/ui/Glow';
import { Icon } from '@/components/ui/Icon';
import { Squishable } from '@/components/ui/Squishable';
import { Text } from '@/components/ui/Text';
import { PetVoiceBridge } from '@/services/audio/PetVoiceBridge';
import { haptic } from '@/services/haptics';
import { useStore } from '@/state/createStore';
import { sessionStore } from '@/state/stores';
import { colors, radius, shadows, spacing } from '@/theme';

export default function FirstEncounter() {
  const insets = useSafeAreaInsets();
  const notice = useStore(sessionStore, (s) => s.notice);
  const [greeted, setGreeted] = useState(0);
  const bounce = useSharedValue(1);
  const tilt = useSharedValue(0);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: bounce.value }, { rotate: `${tilt.value}deg` }] }));

  const greet = () => {
    bounce.set(withSequence(withSpring(1.04, { damping: 6 }), withSpring(1, { damping: 10 })));
    tilt.set(withSequence(withTiming(-3, { duration: 120 }), withTiming(3, { duration: 160 }), withTiming(0, { duration: 140 })));
    haptic('pet');
    PetVoiceBridge.preview('dog');
    setGreeted((n) => n + 1);
  };

  return (
    <View style={styles.root}>
      <Glow spots={[...DEFAULT_GLOW, { color: colors.tertiaryFixed, size: 300, bottom: 80, left: -120, opacity: 0.35 }]} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.overline}>
          <View style={styles.dot} />
          <Text variant="labelMd" color={colors.primary} uppercase>Primer encuentro</Text>
        </View>
        <Text variant="displayLg" align="center" style={styles.title}>Milo todavía no te conoce.</Text>
        <Text variant="bodyLg" color={colors.textMuted} align="center">
          Cada caricia y palabra moldeará su confianza y su forma de ver el mundo.
        </Text>

        <Squishable onPress={greet} accessibilityLabel="Saludar a Milo" scaleTo={0.98} style={styles.cardWrap}>
          <Animated.View style={[styles.card, cardStyle]}>
            <Image source={require('@/assets/images/pets/milo-portrait.jpg')} style={styles.image} contentFit="cover" transition={300} />
            {greeted > 0 ? (
              <Animated.View key={greeted} entering={ZoomIn.springify()} style={styles.heart}>
                <Text style={styles.heartText}>💛</Text>
              </Animated.View>
            ) : null}
          </Animated.View>
        </Squishable>

        <View style={styles.hint}>
          <Icon name="heart" size={22} color={colors.primary} />
          <Text variant="labelLg">{greeted ? '¡Te ha sentido! Sigue así 🐾' : 'Tócalo para saludar con cariño 👋'}</Text>
        </View>

        {notice ? <Text variant="bodySm" color={colors.error} align="center">{notice}</Text> : null}

        <View style={styles.spacer} />
        <PrimaryButton size="lg" label="Continuar nuestro viaje juntos" iconRight="arrowForward" onPress={() => router.push('/onboarding/choose')} style={styles.cta} />
        <View style={styles.safe}>
          <Icon name="shield" size={16} color={colors.textSubtle} />
          <Text variant="labelMd" color={colors.textSubtle}>Un espacio seguro y libre de prisas</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: spacing.margin + 4, gap: spacing.md },
  overline: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 6, borderRadius: radius.full, backgroundColor: 'rgba(242,237,230,0.8)' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primaryContainer },
  title: { marginTop: spacing.sm },
  cardWrap: { marginTop: spacing.lg, width: '72%', maxWidth: 320, aspectRatio: 1 },
  card: { flex: 1, borderRadius: radius.xl, overflow: 'hidden', ...shadows.float },
  image: { flex: 1 },
  heart: { position: 'absolute', top: 14, right: 14 },
  heartText: { fontSize: 36 },
  hint: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 14,
    borderRadius: radius.full, backgroundColor: colors.card, ...shadows.card,
  },
  spacer: { flex: 1, minHeight: spacing.lg },
  cta: { alignSelf: 'stretch' },
  safe: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

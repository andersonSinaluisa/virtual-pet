/*
 * MUNDO / HOME (Stitch: home_habitaci_n_de_milo)
 *
 *   Sin scroll: cabecera · HUD (nombre, ánimo, momento del día)
 *   escenario 3D (ocupa el espacio libre) con pensamiento y pelota
 *   barra de cuidados/estímulos (fuera de la mochila: se ve la reacción)
 *   medidores · Mochila / ¿Qué piensa? · pestañas
 *
 * Mientras la pantalla está abierta: ticks → SNN → acciones → PetAnimator.
 * La mascota decide sola; los botones solo cambian el mundo.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { timeOfDayLabel } from '@/core/explain/Narrator';
import { CareBar } from '@/components/home/CareBar';
import { RewardButton } from '@/components/learning/RewardButton';
import { InventorySheet } from '@/components/home/InventorySheet';
import { StatusCard } from '@/components/home/StatusCard';
import { PetStage } from '@/components/scene/PetStage';
import { AppHeader } from '@/components/ui/AppHeader';
import { PrimaryButton, SecondaryButton } from '@/components/ui/Buttons';
import { DEFAULT_GLOW, Glow } from '@/components/ui/Glow';
import { Icon } from '@/components/ui/Icon';
import { Squishable } from '@/components/ui/Squishable';
import { Chip } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { ThoughtBubble } from '@/components/ui/ThoughtBubble';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { awayStore, petStore, pushToast, sessionStore } from '@/state/stores';
import { alpha, colors, radius, shadows, spacing } from '@/theme';

const TIME_EMOJI: Record<string, string> = { sun: '☀️ Día', sunset: '🌇 Tarde', sunrise: '🌅 Mañana', moon: '🌙 Noche' };

export default function Home() {
  const pet = useStore(petStore);
  const away = useStore(awayStore);
  const notice = useStore(sessionStore, (s) => s.notice);
  const persistent = useStore(sessionStore, (s) => s.persistent);
  const [sheet, setSheet] = useState(false);
  const insets = useSafeAreaInsets();

  const { capture } = useLocalSearchParams<{ capture?: string }>();

  useEffect(() => { if (away) router.push('/away'); }, [away]);

  // "Capturar" desde Recuerdos: la captura necesita la escena 3D visible
  useEffect(() => {
    if (capture !== '1') return;
    const t = setTimeout(() => {
      void SessionController.captureMoment().then((m) => {
        if (m) pushToast({ kind: 'moment', title: 'Instantánea guardada', text: m.title });
      });
      router.setParams({ capture: undefined });
    }, 900);
    return () => clearTimeout(t);
  }, [capture]);

  if (!pet) return <View style={styles.root} />;
  // Hora del MUNDO (reloj inyectado), no la del render
  const m = pet.minuteOfDay;
  const time = timeOfDayLabel(new Date(2000, 0, 1, Math.floor(m / 60), m % 60));
  const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  // Sin scroll: todo cabe entre la cabecera y la barra de pestañas; el escenario ocupa el resto
  const bottom = Math.max(insets.bottom, 10) + 72 + spacing.sm;

  return (
    <View style={styles.root}>
      <Glow spots={DEFAULT_GLOW} />
      <AppHeader title="Mundo" />
      <View style={[styles.content, { paddingBottom: bottom }]}>
        {notice || !persistent ? (
          <Squishable onPress={() => SessionController.clearNotice()} style={styles.notice}>
            <Icon name="shield" size={16} color={colors.primary} />
            <Text variant="bodySm" numberOfLines={2} style={{ flex: 1 }}>{notice ?? 'El almacenamiento no está disponible: esta partida no se guardará.'}</Text>
          </Squishable>
        ) : null}

        <View style={styles.hud}>
          <Chip label={`${pet.name} · ${pet.stageLabel}`} icon="paw" color={colors.text} style={shadows.soft} />
          <Chip label={`${pet.moodEmoji} ${pet.mood.split(' y ')[0]}`} color={colors.secondary} style={shadows.soft} />
          <Chip label={`${TIME_EMOJI[time.icon]} · ${hhmm}`} bg={alpha(colors.primaryFixed, 0.7)} color={colors.onPrimaryFixed} style={shadows.soft} />
        </View>

        <View style={styles.stage}>
          <PetStage key={SessionController.current?.profile.id} species={pet.species} mode="home" style={StyleSheet.absoluteFill}>
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              <View pointerEvents="none" style={styles.bubble}>
                <ThoughtBubble text={pet.thought} style={{ alignSelf: "flex-start" }} />
              </View>
              <Squishable onPress={() => SessionController.placeItem('ball')} accessibilityLabel="Darle la pelota roja" style={styles.ball}>
                <Icon name="ball" size={24} color={colors.surfaceBright} />
              </Squishable>
              <RewardButton style={styles.reward} />
              <View pointerEvents="none" style={styles.status}>
                <Text variant="labelSm" color={colors.textMuted} numberOfLines={1}>👆 Tócalo para darle mimos</Text>
              </View>
            </View>
          </PetStage>
        </View>

        <CareBar />
        <StatusCard pet={pet} />

        <View style={styles.actions}>
          <SecondaryButton label="🎒 Mochila" onPress={() => setSheet(true)} style={styles.flex} />
          <PrimaryButton label="💭 ¿Qué piensa?" onPress={() => router.push('/brain')} style={styles.flex} />
        </View>
      </View>
      <InventorySheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: spacing.margin, paddingTop: spacing.sm, gap: spacing.sm },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primaryFixed },
  hud: { flexDirection: 'row', gap: spacing.xs + 2, flexWrap: 'wrap' },
  stage: {
    flex: 1, minHeight: 220, borderRadius: radius.lg + 8, overflow: 'hidden', backgroundColor: colors.surfaceContainerLow, ...shadows.stage,
    experimental_backgroundImage: `linear-gradient(180deg, ${colors.surfaceContainerLowest} 0%, ${colors.surfaceContainerLow} 50%, ${colors.surfaceContainerHigh} 100%)`,
  },
  bubble: { position: 'absolute', top: 12, left: 12, right: 12, alignItems: 'flex-start' },
  ball: {
    position: 'absolute', left: 14, bottom: 14, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    experimental_backgroundImage: `linear-gradient(45deg, ${colors.error} 0%, ${colors.primaryContainer} 60%, ${colors.surfaceBright} 100%)`,
    boxShadow: '0 6px 14px rgba(186,26,26,0.35)',
  },
  status: { position: 'absolute', right: 14, bottom: 22, maxWidth: '62%', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, backgroundColor: alpha(colors.surfaceContainerLowest, 0.9) },
  reward: { position: 'absolute', alignSelf: 'center', bottom: 64 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});

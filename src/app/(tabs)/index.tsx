/*
 * MUNDO / HOME (Stitch: home_habitaci_n_de_milo)
 *
 *   El escenario 3D ocupa TODA la pantalla. Encima flotan:
 *   arriba   → cabecera · aviso · HUD (nombre, ánimo, momento del día) · pensamiento
 *   abajo    → pelota / pista / recompensar · barra de cuidados · medidores ·
 *              Mochila / ¿Qué piensa? · pestañas
 *   La escena se encuadra en la franja libre entre ambos bloques (viewInsets).
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
  // Alto (dp) de los bloques flotantes: la cámara encuadra la franja libre entre ellos
  const [topH, setTopH] = useState(0);
  const [bottomH, setBottomH] = useState(0);
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
  // La barra de pestañas flota sobre la pantalla: el bloque inferior se apoya encima
  const bottom = Math.max(insets.bottom, 10) + 72 + spacing.sm;

  return (
    <View style={styles.root}>
      <PetStage
        key={SessionController.current?.profile.id}
        species={pet.species}
        mode="home"
        style={StyleSheet.absoluteFill}
        viewInsets={{ top: topH, bottom: bottomH }}
      >
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {/* ---------- Arriba ---------- */}
          <View pointerEvents="box-none" style={styles.top} onLayout={(e) => setTopH(e.nativeEvent.layout.height)}>
            <AppHeader title="Mundo" floating />
            <View pointerEvents="box-none" style={styles.topContent}>
              {notice || !persistent ? (
                <Squishable onPress={() => SessionController.clearNotice()} style={styles.notice}>
                  <Icon name="shield" size={16} color={colors.primary} />
                  <Text variant="bodySm" numberOfLines={2} style={{ flex: 1 }}>{notice ?? 'El almacenamiento no está disponible: esta partida no se guardará.'}</Text>
                </Squishable>
              ) : null}
              <View pointerEvents="box-none" style={styles.hud}>
                <Chip label={`${pet.name} · ${pet.stageLabel}`} icon="paw" color={colors.text} style={shadows.soft} />
                <Chip label={`${pet.moodEmoji} ${pet.mood.split(' y ')[0]}`} color={colors.secondary} style={shadows.soft} />
                <Chip label={`${TIME_EMOJI[time.icon]} · ${hhmm}`} bg={alpha(colors.primaryFixed, 0.7)} color={colors.onPrimaryFixed} style={shadows.soft} />
                {/* v7: dónde está y acceso a los lugares de su vida */}
                <Squishable onPress={() => router.push('/world')} accessibilityLabel={`Lugares. Ahora en ${pet.locationLabel}`}>
                  <Chip label={`${pet.locationEmoji} ${pet.locationLabel}`} icon="location" bg={alpha(colors.secondaryContainer, 0.85)} color={colors.onSecondaryContainer} style={shadows.soft} />
                </Squishable>
              </View>
            </View>
          </View>
          <View pointerEvents="none" style={[styles.bubble, { top: topH + spacing.xs }]}>
            <ThoughtBubble text={pet.thought} style={{ alignSelf: 'flex-start' }} />
          </View>

          {/* ---------- Abajo ---------- */}
          <View pointerEvents="box-none" style={[styles.bottom, { paddingBottom: bottom }]} onLayout={(e) => setBottomH(e.nativeEvent.layout.height)}>
            <View pointerEvents="box-none" style={styles.floorRow}>
              <Squishable onPress={() => SessionController.placeItem('ball')} accessibilityLabel="Darle la pelota roja" style={styles.ball}>
                <Icon name="ball" size={24} color={colors.surfaceBright} />
              </Squishable>
              <View pointerEvents="none" style={styles.status}>
                <Text variant="labelSm" color={colors.textMuted} numberOfLines={1}>👆 Tócalo para darle mimos</Text>
              </View>
            </View>
            <CareBar />
            <StatusCard pet={pet} />
            <View style={styles.actions}>
              <SecondaryButton label="🎒 Mochila" onPress={() => setSheet(true)} style={styles.flex} />
              <PrimaryButton label="💭 ¿Qué piensa?" onPress={() => router.push('/brain')} style={styles.flex} />
            </View>
          </View>
          <RewardButton style={[styles.reward, { bottom: bottomH + spacing.sm }]} />
        </View>
      </PetStage>
      <InventorySheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: {
    position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: spacing.sm,
    // Velo suave para que el texto se lea sobre la habitación
    experimental_backgroundImage: `linear-gradient(180deg, ${alpha(colors.surface, 0.92)} 0%, ${alpha(colors.surface, 0.6)} 70%, ${alpha(colors.surface, 0)} 100%)`,
  },
  topContent: { paddingHorizontal: spacing.margin, gap: spacing.sm },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primaryFixed },
  hud: { flexDirection: 'row', gap: spacing.xs + 2, flexWrap: 'wrap' },
  bubble: { position: 'absolute', left: spacing.margin, right: spacing.margin, alignItems: 'flex-start' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.margin, gap: spacing.sm },
  floorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ball: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    experimental_backgroundImage: `linear-gradient(45deg, ${colors.error} 0%, ${colors.primaryContainer} 60%, ${colors.surfaceBright} 100%)`,
    boxShadow: '0 6px 14px rgba(186,26,26,0.35)',
  },
  status: { maxWidth: '62%', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, backgroundColor: alpha(colors.surfaceContainerLowest, 0.9) },
  reward: { position: 'absolute', alignSelf: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});

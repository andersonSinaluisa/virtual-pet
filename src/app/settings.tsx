/*
 * Ajustes (modal): audio, hápticos, calidad 3D y reinicio. En desarrollo,
 * acceso a las herramientas de investigación de la SNN.
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, SecondaryButton, SoftButton } from '@/components/ui/Buttons';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Card } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { petStore, settingsStore } from '@/state/stores';
import { colors, spacing } from '@/theme';

function Row({ icon, label, hint, children }: { icon: IconName; label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Icon name={icon} size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text variant="labelLg">{label}</Text>
        {hint ? <Text variant="bodyXs" color={colors.textMuted}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 10) / 10;
  return (
    <View style={styles.stepper}>
      <IconButton icon="remove" label="Bajar" size={34} bg={colors.surfaceContainerHigh} color={colors.text} onPress={() => onChange(clamp(value - 0.1))} />
      <Text variant="labelMd" style={styles.stepVal}>{Math.round(value * 100)}%</Text>
      <IconButton icon="add" label="Subir" size={34} bg={colors.surfaceContainerHigh} color={colors.text} onPress={() => onChange(clamp(value + 0.1))} />
    </View>
  );
}

export default function Settings() {
  const s = useStore(settingsStore);
  const name = useStore(petStore, (p) => p?.name ?? 'tu mascota');
  const insets = useSafeAreaInsets();
  const set = SessionController.updateSettings.bind(SessionController);
  const sw = { trackColor: { true: colors.primaryContainer, false: colors.surfaceContainerHighest }, thumbColor: colors.card };

  const reset = () => Alert.alert(
    `¿Despedirte de ${name}?`,
    'Se borrará su cerebro, sus recuerdos y todo lo vivido. No se puede deshacer.',
    [{ text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: () => { router.dismissAll(); void SessionController.resetAll(); } }],
  );

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.top}>
          <Text variant="headlineLg">Ajustes</Text>
          <IconButton icon="close" label="Cerrar" size={40} bg={colors.surfaceContainerHigh} color={colors.text} onPress={() => router.back()} />
        </View>
        <Card style={styles.card}>
          <Row icon={s.muted ? 'volumeOff' : 'volume'} label="Sonido"><Switch value={!s.muted} onValueChange={(v) => set({ muted: !v })} {...sw} /></Row>
          <Row icon="music" label="Ambiente y música"><Stepper value={s.musicVolume} onChange={(v) => set({ musicVolume: v })} /></Row>
          <Row icon="volumeLow" label="Efectos y mascota"><Stepper value={s.effectsVolume} onChange={(v) => set({ effectsVolume: v })} /></Row>
          <Row icon="touch" label="Vibración" hint="Solo en caricias, objetos y descubrimientos"><Switch value={s.haptics} onValueChange={(v) => set({ haptics: v })} {...sw} /></Row>
        </Card>
        <Card style={styles.card}>
          <Row icon="paw" label="Pelaje detallado" hint="Más bonito, más exigente para el móvil"><Switch value={s.fur} onValueChange={(v) => set({ fur: v })} {...sw} /></Row>
          <Row icon="light" label="Sombras suaves"><Switch value={s.shadows} onValueChange={(v) => set({ shadows: v })} {...sw} /></Row>
          <Text variant="bodyXs" color={colors.textSubtle}>Los cambios de calidad se aplican al volver a abrir la escena.</Text>
        </Card>
        {__DEV__ ? <SoftButton label="Herramientas de desarrollo" icon="dev" tone="lavender" onPress={() => router.push('/dev')} /> : null}
        <SecondaryButton label={`Empezar de nuevo`} icon="trash" onPress={reset} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.margin, gap: spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepVal: { width: 44, textAlign: 'center' },
});

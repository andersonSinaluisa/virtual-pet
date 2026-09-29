/*
 * Ajustes (modal): audio, hápticos, calidad 3D y reinicio. En desarrollo,
 * acceso a las herramientas de investigación de la SNN.
 * v8: volumen por categoría (general, mascota, ambiente, música, interfaz; se
 * guardan en el save) y créditos de los sonidos con licencia CC-BY.
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { attributionLines } from '@/core/audio/petAudioManifest';
import { IconButton, SecondaryButton, SoftButton } from '@/components/ui/Buttons';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Card } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { petStore, settingsStore } from '@/state/stores';
import { ENV_PACKS } from '@/render3d/EnvironmentAssetInfo';
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
          <Row icon="volume" label="General"><Stepper value={s.masterVolume} onChange={(v) => set({ masterVolume: v })} /></Row>
          <Row icon="paw" label={`Voz de ${name}`} hint="Sus sonidos y sus pasos"><Stepper value={s.petVolume} onChange={(v) => set({ petVolume: v })} /></Row>
          <Row icon="spa" label="Ambiente"><Stepper value={s.ambientVolume} onChange={(v) => set({ ambientVolume: v })} /></Row>
          <Row icon="music" label="Música"><Stepper value={s.musicVolume} onChange={(v) => set({ musicVolume: v })} /></Row>
          <Row icon="volumeLow" label="Interfaz"><Stepper value={s.uiVolume} onChange={(v) => set({ uiVolume: v })} /></Row>
          <Row icon="touch" label="Vibración" hint="Caricias, ronroneo, objetos y descubrimientos"><Switch value={s.haptics} onValueChange={(v) => set({ haptics: v })} {...sw} /></Row>
        </Card>
        <Card style={styles.card}>
          <Row icon="paw" label="Pelaje detallado" hint="Más bonito, más exigente para el móvil"><Switch value={s.fur} onValueChange={(v) => set({ fur: v })} {...sw} /></Row>
          <Row icon="light" label="Sombras suaves"><Switch value={s.shadows} onValueChange={(v) => set({ shadows: v })} {...sw} /></Row>
          <Row icon="spa" label="Detalle de los escenarios" hint="Plantas que se mueven, hierba y luces. No cambia el juego">
            <View style={styles.seg}>
              {(['low', 'medium', 'high'] as const).map((q) => (
                <SoftButton key={q} label={q === 'low' ? 'Bajo' : q === 'medium' ? 'Medio' : 'Alto'} tone={(s.graphicsQuality ?? 'medium') === q ? 'lavender' : undefined} onPress={() => set({ graphicsQuality: q })} />
              ))}
            </View>
          </Row>
          <Text variant="bodyXs" color={colors.textSubtle}>El pelaje y las sombras se aplican al volver a abrir la escena; el detalle de los escenarios, al momento.</Text>
        </Card>
        <Card style={styles.card}>
          <Text variant="labelLg">Créditos de sonido</Text>
          <Text variant="bodyXs" color={colors.textMuted}>Las voces de las mascotas son grabaciones reales de animales. La mayoría son de dominio público (CC0): Freesound, Kenney y Benjamin Burnes. Estas requieren atribución:</Text>
          {attributionLines().map((l) => <Text key={l} variant="bodyXs" color={colors.textSubtle}>{l}</Text>)}
        </Card>
        <Card style={styles.card}>
          <Text variant="labelLg">Créditos de escenarios</Text>
          <Text variant="bodyXs" color={colors.textMuted}>Los muebles y la naturaleza son modelos de dominio público (CC0). No exigen atribución, pero se la damos con gusto:</Text>
          {ENV_CREDITS.map((l) => <Text key={l} variant="bodyXs" color={colors.textSubtle}>{l}</Text>)}
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
  seg: { flexDirection: 'row', gap: 4 },
});

const ENV_CREDITS = Object.values(ENV_PACKS).map((p) => `${p.name} · ${p.creator} · ${p.license} · ${p.source}`);

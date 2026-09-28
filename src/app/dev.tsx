/*
 * HERRAMIENTAS DE DESARROLLO (solo __DEV__) para investigar la SNN:
 * velocidad, pausa, paso, inspector de neuronas, forzar sensor, crear
 * objetos, fijar el estado, borrar memoria, exportar/importar el save.
 */
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createBrainConfig } from '@/core/brain/BrainConfig';
import { PET_STATS } from '@/core/simulation/SimConfig';
import { ITEMS, NOVEL_KINDS, type ItemKind } from '@/core/world/Items';
import { IconButton, SoftButton, StrongButton } from '@/components/ui/Buttons';
import { Squishable } from '@/components/ui/Squishable';
import { Card } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { SessionController } from '@/services/SessionController';
import { useStore } from '@/state/createStore';
import { devStore, petStore, pushToast } from '@/state/stores';
import { colors, fonts, radius, spacing } from '@/theme';

const SENSORS = createBrainConfig().sensors;
const SPAWN: ItemKind[] = ['ball', 'teddy', ...NOVEL_KINDS, 'mysteryBox', 'treat'];

function Pill({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Squishable onPress={onPress} style={[styles.pill, on ? styles.pillOn : null]}>
      <Text variant="labelSm" color={on ? colors.onPrimaryContainer : colors.text}>{label}</Text>
    </Squishable>
  );
}

export default function DevTools() {
  const insets = useSafeAreaInsets();
  const dev = useStore(devStore);
  const pet = useStore(petStore);
  const [json, setJson] = useState('');
  const session = SessionController.current;
  if (!__DEV__) return <Redirect href="/" />;
  if (!session || !pet) return null;

  const exportSave = async () => {
    const raw = await SessionController.exportSave();
    if (raw) await Share.share({ message: raw, title: `milo-save-${Date.now()}.json` });
  };
  const importSave = async () => {
    try {
      await SessionController.importSave(json.trim());
      setJson('');
      pushToast({ kind: 'info', title: 'Save importado', text: 'La mascota se cargó correctamente.' });
    } catch (e) {
      Alert.alert('Save inválido', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Text variant="headlineLg">Laboratorio SNN</Text>
          <IconButton icon="close" label="Cerrar" size={40} bg={colors.surfaceContainerHigh} color={colors.text} onPress={() => router.back()} />
        </View>

        <Card style={styles.card}>
          <Text variant="labelMd" color={colors.primary} uppercase>Simulación · tick {pet.tick}</Text>
          <View style={styles.wrap}>
            <SoftButton label={dev.running ? 'Pausar cerebro' : 'Reanudar'} icon={dev.running ? 'pause' : 'play'} tone="lavender" onPress={() => SessionController.setRunning(!dev.running)} />
            <SoftButton label="Paso" icon="step" onPress={() => SessionController.step()} />
          </View>
          <View style={styles.wrap}>{session.config.simulation.speeds.map((s) => <Pill key={s} label={`${s}×`} on={dev.speed === s} onPress={() => SessionController.setSpeed(s)} />)}</View>
          <View style={styles.rowBetween}>
            <Text variant="labelMd">Anillo del objeto percibido (reabrir escena)</Text>
            <Switch value={dev.debugScene} onValueChange={(v) => devStore.set((d) => ({ ...d, debugScene: v }))} />
          </View>
          <SoftButton label="Inspector de neuronas" icon="brain" onPress={() => router.push({ pathname: '/brain', params: { mode: 'tech' } })} />
        </Card>

        <Card style={styles.card}>
          <Text variant="labelMd" color={colors.primary} uppercase>Forzar sensor (15 ticks)</Text>
          {SENSORS.map((s) => (
            <View key={s.key} style={styles.rowBetween}>
              <Text variant="labelSm" style={{ flex: 1 }}>{s.label} <Text variant="labelXs" color={colors.textSubtle}>{s.key}</Text></Text>
              {[0, 0.5, 1].map((v) => <Pill key={v} label={String(v)} onPress={() => session.forceSensor(s.key, v, 15)} />)}
            </View>
          ))}
        </Card>

        <Card style={styles.card}>
          <Text variant="labelMd" color={colors.primary} uppercase>Crear objeto</Text>
          <View style={styles.wrap}>
            {SPAWN.map((k) => <Pill key={k} label={`${ITEMS[k].emoji} ${ITEMS[k].name}`} onPress={() => session.world.placeItem(k)} />)}
          </View>
        </Card>

        <Card style={styles.card}>
          <Text variant="labelMd" color={colors.primary} uppercase>Estado de la mascota</Text>
          {PET_STATS.map((k) => (
            <View key={k} style={styles.rowBetween}>
              <Text variant="labelSm" style={{ width: 90 }}>{k}</Text>
              <Text variant="labelSm" style={{ width: 44 }}>{pet.stats[k].toFixed(2)}</Text>
              {[0, 0.25, 0.5, 0.75, 1].map((v) => <Pill key={v} label={String(v)} onPress={() => session.setPetStat(k, v)} />)}
            </View>
          ))}
        </Card>

        <Card style={styles.card}>
          <Text variant="labelMd" color={colors.primary} uppercase>Datos</Text>
          <SoftButton label="Borrar memoria" icon="trash" onPress={() => Alert.alert('¿Borrar memoria?', 'Experiencias, recuerdos y descubrimientos. El cerebro no cambia.', [
            { text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: () => { session.clearMemory(); void SessionController.save(); } }])} />
          <SoftButton label="Exportar save" icon="share" onPress={exportSave} />
          <TextInput value={json} onChangeText={setJson} placeholder="Pega aquí un save JSON" placeholderTextColor={colors.textSubtle} multiline style={styles.input} />
          <StrongButton label="Importar save" icon="download" disabled={!json.trim()} onPress={importSave} />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.margin, gap: spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surfaceContainerHigh },
  pillOn: { backgroundColor: colors.primaryContainer },
  input: { minHeight: 90, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.vanilla, fontFamily: fonts.body, fontSize: 12, color: colors.text, textAlignVertical: 'top' },
});
